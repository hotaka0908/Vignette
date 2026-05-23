import { z } from "zod";
import { UTApi } from "uploadthing/server";
import { and, desc, eq, getTableColumns, inArray, isNotNull, lt, or } from "drizzle-orm";

import { db, isDatabaseConfigured } from "@/db";
import { getMux } from "@/lib/mux";
import { TRPCError } from "@trpc/server";
import { getWorkflow } from "@/lib/workflow";
import {
  buildSearchDocument,
  createGeminiEmbedding,
  generateGeminiText,
  generateGeminiVideoMetadata,
} from "@/lib/gemini";
import { getCreatorBySessionId } from "@/lib/creator-session";
import { syncFirebaseStorageVideosForRequest } from "@/lib/firebase-video-sync";
import { baseProcedure, createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  categories,
  subscriptions,
  users,
  videoReactions,
  videos,
  videoUpdateSchema,
  videoViews,
} from "@/db/schema";

const TITLE_SYSTEM_PROMPT = `Generate a concise, search-friendly title for a CrossTube video.
- Use the video's transcript or existing notes.
- Keep it clear and specific.
- Use 3-8 words when possible.
- Return only the title.`;

const DESCRIPTION_SYSTEM_PROMPT = `Generate a short public video description for CrossTube.
- Summarize the most useful or interesting points.
- Keep it under 500 characters.
- Do not include markdown headings.
- Return only the description.`;

const buildVideoContext = async (video: typeof videos.$inferSelect) => {
  let transcript = "";

  if (video.muxPlaybackId && video.muxTrackId) {
    try {
      const trackUrl = `https://stream.mux.com/${video.muxPlaybackId}/text/${video.muxTrackId}.txt`;
      const response = await fetch(trackUrl);

      if (response.ok) {
        transcript = await response.text();
      }
    } catch {
      transcript = "";
    }
  }

  return [
    `Current title: ${video.title}`,
    `Current description: ${video.description || "None"}`,
    `Transcript: ${transcript || "No transcript is available yet."}`,
  ].join("\n\n");
};

const emptyVideoPage = {
  items: [],
  nextCursor: null,
};

export const videosRouter = createTRPCRouter({
  getManySubscribed: protectedProcedure
    .input(
      z.object({
        cursor: z.object({
          id: z.string().uuid(),
          updatedAt: z.date(),
        })
        .nullish(),
        limit: z.number().min(1).max(100),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { id: userId } = ctx.user;
      const { cursor, limit, } = input;

      const viewerSubscriptions = db.$with("viewer_subscriptions").as(
        db
          .select({
            userId: subscriptions.creatorId,
          })
          .from(subscriptions)
          .where(eq(subscriptions.viewerId, userId))
      );

      const data = await db
        .with(viewerSubscriptions)
        .select({
          ...getTableColumns(videos),
          user: users,
          viewCount: db.$count(videoViews, eq(videoViews.videoId, videos.id)),
          likeCount: db.$count(videoReactions, and(
            eq(videoReactions.videoId, videos.id),
            eq(videoReactions.type, "like"),
          )),
          dislikeCount: db.$count(videoReactions, and(
            eq(videoReactions.videoId, videos.id),
            eq(videoReactions.type, "dislike"),
          )),
        })
        .from(videos)
        .innerJoin(users, eq(videos.userId, users.id))
        .innerJoin(
          viewerSubscriptions,
          eq(viewerSubscriptions.userId, users.id)
        )
        .where(and(
          eq(videos.visibility, "public"),
          cursor
            ? or(
                lt(videos.updatedAt, cursor.updatedAt),
                  and(
                    eq(videos.updatedAt, cursor.updatedAt),
                    lt(videos.id, cursor.id)
                  )
                )
            : undefined,
        )).orderBy(desc(videos.updatedAt), desc(videos.id))
        // Add 1 to the limit to check if there is more data
        .limit(limit + 1)

      const hasMore = data.length > limit;
      // Remove the last item if there is more data
      const items = hasMore ? data.slice(0, -1) : data;
      // Set the next cursor to the last item if there is more data
      const lastItem = items[items.length - 1];
      const nextCursor = hasMore 
        ? {
          id: lastItem.id,
          updatedAt: lastItem.updatedAt,
        }
        : null;

      return {
        items,
        nextCursor,
      };
    }),
  getManyTrending: baseProcedure
    .input(
      z.object({
        cursor: z.object({
          id: z.string().uuid(),
          viewCount: z.number(),
        })
        .nullish(),
        limit: z.number().min(1).max(100),
      }),
    )
    .query(async ({ input }) => {
      if (!isDatabaseConfigured) {
        return emptyVideoPage;
      }

      await syncFirebaseStorageVideosForRequest();

      const { cursor, limit } = input;

      const viewCountSubquery = db.$count(
        videoViews,
        eq(videoViews.videoId, videos.id),
      );

      const data = await db
        .select({
          ...getTableColumns(videos),
          user: users,
          viewCount: viewCountSubquery,
          likeCount: db.$count(videoReactions, and(
            eq(videoReactions.videoId, videos.id),
            eq(videoReactions.type, "like"),
          )),
          dislikeCount: db.$count(videoReactions, and(
            eq(videoReactions.videoId, videos.id),
            eq(videoReactions.type, "dislike"),
          )),
        })
        .from(videos)
        .innerJoin(users, eq(videos.userId, users.id))
        .where(and(
          eq(videos.visibility, "public"),
          cursor
            ? or(
                lt(viewCountSubquery, cursor.viewCount),
                  and(
                    eq(viewCountSubquery, cursor.viewCount),
                    lt(videos.id, cursor.id)
                  )
                )
            : undefined,
        )).orderBy(desc(viewCountSubquery), desc(videos.id))
        // Add 1 to the limit to check if there is more data
        .limit(limit + 1)

      const hasMore = data.length > limit;
      // Remove the last item if there is more data
      const items = hasMore ? data.slice(0, -1) : data;
      // Set the next cursor to the last item if there is more data
      const lastItem = items[items.length - 1];
      const nextCursor = hasMore 
        ? {
          id: lastItem.id,
          viewCount: lastItem.viewCount,
        }
        : null;

      return {
        items,
        nextCursor,
      };
    }),
  getMany: baseProcedure
    .input(
      z.object({
        categoryId: z.string().uuid().nullish(),
        userId: z.string().uuid().nullish(),
        cursor: z.object({
          id: z.string().uuid(),
          updatedAt: z.date(),
        })
        .nullish(),
        limit: z.number().min(1).max(100),
      }),
    )
    .query(async ({ input }) => {
      if (!isDatabaseConfigured) {
        return emptyVideoPage;
      }

      await syncFirebaseStorageVideosForRequest();

      const { cursor, limit, categoryId, userId } = input;

      const data = await db
        .select({
          ...getTableColumns(videos),
          user: users,
          viewCount: db.$count(videoViews, eq(videoViews.videoId, videos.id)),
          likeCount: db.$count(videoReactions, and(
            eq(videoReactions.videoId, videos.id),
            eq(videoReactions.type, "like"),
          )),
          dislikeCount: db.$count(videoReactions, and(
            eq(videoReactions.videoId, videos.id),
            eq(videoReactions.type, "dislike"),
          )),
        })
        .from(videos)
        .innerJoin(users, eq(videos.userId, users.id))
        .where(and(
          eq(videos.visibility, "public"),
          userId ? eq(videos.userId, userId) : undefined,
          categoryId ? eq(videos.categoryId, categoryId) : undefined,
          cursor
            ? or(
                lt(videos.updatedAt, cursor.updatedAt),
                  and(
                    eq(videos.updatedAt, cursor.updatedAt),
                    lt(videos.id, cursor.id)
                  )
                )
            : undefined,
        )).orderBy(desc(videos.updatedAt), desc(videos.id))
        // Add 1 to the limit to check if there is more data
        .limit(limit + 1)

      const hasMore = data.length > limit;
      // Remove the last item if there is more data
      const items = hasMore ? data.slice(0, -1) : data;
      // Set the next cursor to the last item if there is more data
      const lastItem = items[items.length - 1];
      const nextCursor = hasMore 
        ? {
          id: lastItem.id,
          updatedAt: lastItem.updatedAt,
        }
        : null;

      return {
        items,
        nextCursor,
      };
    }),
  getOne: baseProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      if (!isDatabaseConfigured) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Video database is not configured",
        });
      }

      await syncFirebaseStorageVideosForRequest();

      const viewer = await getCreatorBySessionId(ctx.creatorSessionId);
      const userId = viewer?.id;

      const viewerReactions = db.$with("viewer_reactions").as(
        db
          .select({
            videoId: videoReactions.videoId,
            type: videoReactions.type,
          })
          .from(videoReactions)
          .where(inArray(videoReactions.userId, userId ? [userId] : []))
      );

      const viewerSubscriptions = db.$with("viewer_subscriptions").as(
        db
          .select()
          .from(subscriptions)
          .where(inArray(subscriptions.viewerId, userId ? [userId] : []))
      );

      const [existingVideo] = await db
        .with(viewerReactions, viewerSubscriptions)
        .select({
          ...getTableColumns(videos),
          user: {
            ...getTableColumns(users),
            subscriberCount: db.$count(subscriptions, eq(subscriptions.creatorId, users.id)),
            viewerSubscribed: isNotNull(viewerSubscriptions.viewerId).mapWith(Boolean),
          },
          viewCount: db.$count(videoViews, eq(videoViews.videoId, videos.id)),
          likeCount: db.$count(
            videoReactions,
            and(
              eq(videoReactions.videoId, videos.id),
              eq(videoReactions.type, "like"),
            ),
          ),
          dislikeCount: db.$count(
            videoReactions,
            and(
              eq(videoReactions.videoId, videos.id),
              eq(videoReactions.type, "dislike"),
            ),
          ),
          viewerReaction: viewerReactions.type,
        })
        .from(videos)
        .innerJoin(users, eq(videos.userId, users.id))
        .leftJoin(viewerReactions, eq(viewerReactions.videoId, videos.id))
        .leftJoin(viewerSubscriptions, eq(viewerSubscriptions.creatorId, users.id))
        .where(eq(videos.id, input.id))

      if (!existingVideo) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return existingVideo;
    }),
  generateDescription: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;

      const [video] = await db
        .select()
        .from(videos)
        .where(and(
          eq(videos.id, input.id),
          eq(videos.userId, userId),
        ));

      if (!video) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const description = await generateGeminiText({
        systemPrompt: DESCRIPTION_SYSTEM_PROMPT,
        userPrompt: await buildVideoContext(video),
      });

      const [updatedVideo] = await db
        .update(videos)
        .set({
          description,
          updatedAt: new Date(),
        })
        .where(and(
          eq(videos.id, input.id),
          eq(videos.userId, userId),
        ))
        .returning();

      return updatedVideo;
    }),
  generateTitle: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;

      const [video] = await db
        .select()
        .from(videos)
        .where(and(
          eq(videos.id, input.id),
          eq(videos.userId, userId),
        ));

      if (!video) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const title = await generateGeminiText({
        systemPrompt: TITLE_SYSTEM_PROMPT,
        userPrompt: await buildVideoContext(video),
      });

      const [updatedVideo] = await db
        .update(videos)
        .set({
          title,
          updatedAt: new Date(),
        })
        .where(and(
          eq(videos.id, input.id),
          eq(videos.userId, userId),
        ))
        .returning();

      return updatedVideo;
    }),
  generateThumbnail: protectedProcedure
    .input(z.object({ id: z.string().uuid(), prompt: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;

      const [existingVideo] = await db
        .select({ id: videos.id })
        .from(videos)
        .where(and(
          eq(videos.id, input.id),
          eq(videos.userId, userId),
        ));

      if (!existingVideo) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const workflowBaseUrl = process.env.UPSTASH_WORKFLOW_URL || process.env.NEXT_PUBLIC_APP_URL;

      if (!workflowBaseUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "UPSTASH_WORKFLOW_URL or NEXT_PUBLIC_APP_URL is required",
        });
      }

      try {
        const { workflowRunId } = await getWorkflow().trigger({
          url: new URL("/api/videos/workflows/thumbnail", workflowBaseUrl).toString(),
          body: { userId, videoId: input.id, prompt: input.prompt },
          label: `thumbnail:${input.id}`,
        });

        return { workflowRunId };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error
            ? error.message
            : "Failed to start thumbnail workflow",
        });
      }
    }),
  revalidate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;

      const [existingVideo] = await db
        .select()
        .from(videos)
        .where(and(
          eq(videos.id, input.id),
          eq(videos.userId, userId),
        ));

      if (!existingVideo) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (!existingVideo.muxUploadId) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      const upload = await getMux().video.uploads.retrieve(
        existingVideo.muxUploadId
      );

      if (!upload || !upload.asset_id) {
        throw new TRPCError({ code: "BAD_REQUEST" })
      }

      const asset = await getMux().video.assets.retrieve(
        upload.asset_id
      );

      if (!asset) {
        throw new TRPCError({ code: "BAD_REQUEST" })
      }

      const playbackId = asset.playback_ids?.[0].id;
      const duration = asset.duration ? Math.round(asset.duration * 1000) : 0;

      // TODO: Potentially find a way to revalidate trackId and trackStatus as well

      const [updatedVideo] = await db
        .update(videos)
        .set({
          muxStatus: asset.status,
          muxPlaybackId: playbackId,
          muxAssetId: asset.id,
          duration,
        })
        .where(and(
          eq(videos.id, input.id),
          eq(videos.userId, userId),
        ))
        .returning();

      return updatedVideo;
    }),
  restoreThumbnail: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const { id: userId } = ctx.user;

    const [existingVideo] = await db
      .select()
      .from(videos)
      .where(and(
        eq(videos.id, input.id),
        eq(videos.userId, userId),
      ));

    if (!existingVideo) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (existingVideo.thumbnailKey) {
      const utapi = new UTApi();

      await utapi.deleteFiles(existingVideo.thumbnailKey);
      await db.
        update(videos)
        .set({ thumbnailKey: null, thumbnailUrl: null })
        .where(and(
          eq(videos.id, input.id),
          eq(videos.userId, userId)
        ));
    }

    if (!existingVideo.muxPlaybackId) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }

    const utapi = new UTApi();
    
    const tempThumbnailUrl = `https://image.mux.com/${existingVideo.muxPlaybackId}/thumbnail.jpg`;
    const uploadedThumbnail = await utapi.uploadFilesFromUrl(tempThumbnailUrl);

    if (!uploadedThumbnail.data) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    }

    const { key: thumbnailKey, url: thumbnailUrl } = uploadedThumbnail.data;

    const [updatedVideo] = await db
      .update(videos)
      .set({ thumbnailUrl, thumbnailKey })
      .where(and(
        eq(videos.id, input.id),
        eq(videos.userId, userId)
      ))
      .returning();

    return updatedVideo;
  }),
  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;

      const [removedVideo] = await db
        .delete(videos)
        .where(and(
          eq(videos.id, input.id),
          eq(videos.userId, userId)
        ))
        .returning();

      if (!removedVideo) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return removedVideo;
    }),
  update: protectedProcedure
    .input(videoUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const { id: userId } = ctx.user;

      if (!input.id) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      const [updatedVideo] = await db
        .update(videos)
        .set({
          title: input.title,
          description: input.description,
          categoryId: input.categoryId,
          visibility: input.visibility,
          updatedAt: new Date(),
        })
        .where(and(
          eq(videos.id, input.id),
          eq(videos.userId, userId)
        ))
        .returning();

      if (!updatedVideo) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return updatedVideo;
    }),
  generateMetadata: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id: userId, name: creatorName } = ctx.user;

      const [video] = await db
        .select()
        .from(videos)
        .where(and(eq(videos.id, input.id), eq(videos.userId, userId)));

      if (!video) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const allCategories = await db.select().from(categories);
      const context = await buildVideoContext(video);

      const metadata = await generateGeminiVideoMetadata({
        context,
        categoryNames: allCategories.map((category) => category.name),
      });

      const matchedCategory = allCategories.find(
        (category) =>
          category.name.toLowerCase() === metadata.category.trim().toLowerCase(),
      );

      const searchDocument = buildSearchDocument({
        title: metadata.title,
        creatorName,
        description: metadata.description,
        summary: metadata.summary,
        tags: metadata.tags,
        topics: metadata.topics,
        transcript: context,
      });

      let embedding: number[] | undefined;
      try {
        embedding = await createGeminiEmbedding(
          `title: ${metadata.title} | text: ${searchDocument}`,
        );
      } catch {
        embedding = undefined;
      }

      const [updatedVideo] = await db
        .update(videos)
        .set({
          title: metadata.title,
          description: metadata.description,
          aiSummary: metadata.summary,
          aiTags: metadata.tags,
          aiTopics: metadata.topics,
          aiLanguage: metadata.language,
          aiSafetyLabel: metadata.safety.label,
          aiSafetyReason: metadata.safety.reason,
          categoryId: matchedCategory?.id ?? video.categoryId,
          searchDocument,
          embedding: embedding ?? video.embedding,
          updatedAt: new Date(),
        })
        .where(and(eq(videos.id, input.id), eq(videos.userId, userId)))
        .returning();

      return updatedVideo;
    }),
  create: protectedProcedure.mutation(async ({ ctx }) => {
    const { id: userId } = ctx.user;

    let upload;

    try {
      upload = await getMux().video.uploads.create({
        new_asset_settings: {
          passthrough: userId,
          playback_policy: ["public"],
          input: [
            {
              generated_subtitles: [
                {
                  language_code: "en",
                  name: "English",
                },
              ],
            },
          ],
        },
        cors_origin: "*", // TODO: In production, set to your url
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Mux credentials are not set") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: error.message,
        });
      }

      throw error;
    }

    const [video] = await db
      .insert(videos)
      .values({
        userId,
        title: "Untitled",
        visibility: "public",
        muxStatus: "waiting",
        muxUploadId: upload.id,
      })
      .returning();

    return {
      video: video,
      url: upload.url,
    };
  }),
});
