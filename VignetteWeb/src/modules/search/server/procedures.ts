import { z } from "zod";
import { eq, and, or, lt, desc, ilike, getTableColumns } from "drizzle-orm";

import { db, isDatabaseConfigured } from "@/db";
import { getCachedValue, setCachedValue } from "@/lib/cache";
import { rankVideosWithManagedAgent } from "@/lib/gemini";
import { syncFirebaseStorageVideosForRequest } from "@/lib/firebase-video-sync";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { users, videoReactions, videos, videoViews } from "@/db/schema";

const SEARCH_CACHE_TTL_SECONDS = 60;
const MANAGED_AGENT_BACKGROUND_TIMEOUT_MS = Number(
  process.env.GEMINI_MANAGED_AGENT_BACKGROUND_TIMEOUT_MS || "60000",
);

type SearchPage = {
  items: Array<
    typeof videos.$inferSelect & {
      user: typeof users.$inferSelect;
      viewCount: number;
      likeCount: number;
      dislikeCount: number;
    }
  >;
  nextCursor: {
    id: string;
    updatedAt: Date;
  } | null;
};

const serializeSearchPage = (page: SearchPage) => ({
  items: page.items.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    user: {
      ...item.user,
      createdAt: item.user.createdAt.toISOString(),
      updatedAt: item.user.updatedAt.toISOString(),
    },
  })),
  nextCursor: page.nextCursor
    ? {
        ...page.nextCursor,
        updatedAt: page.nextCursor.updatedAt.toISOString(),
      }
    : null,
});

type SerializedSearchPage = ReturnType<typeof serializeSearchPage>;

const deserializeSearchPage = (page: SerializedSearchPage): SearchPage => ({
  items: page.items.map((item) => ({
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    user: {
      ...item.user,
      createdAt: new Date(item.user.createdAt),
      updatedAt: new Date(item.user.updatedAt),
    },
  })),
  nextCursor: page.nextCursor
    ? {
        ...page.nextCursor,
        updatedAt: new Date(page.nextCursor.updatedAt),
      }
    : null,
});

const buildSearchCacheKey = ({
  query,
  categoryId,
  cursor,
  limit,
  useManagedAgent,
}: {
  query?: string | null;
  categoryId?: string | null;
  cursor?: { id: string; updatedAt: Date } | null;
  limit: number;
  useManagedAgent?: boolean;
}) =>
  [
    "crosstube",
    "search",
    "v3",
    query?.trim().toLowerCase() || "all",
    categoryId || "all",
    limit,
    useManagedAgent ? "agent" : "db",
    cursor ? `${cursor.updatedAt.toISOString()}:${cursor.id}` : "first",
  ].join(":");

const scheduleManagedAgentRanking = ({
  query,
  data,
  cacheKey,
  limit,
}: {
  query: string;
  data: SearchPage["items"];
  cacheKey: string;
  limit: number;
}) => {
  void (async () => {
    try {
      const ranking = await rankVideosWithManagedAgent({
        query,
        timeoutMs: MANAGED_AGENT_BACKGROUND_TIMEOUT_MS,
        candidates: data.map((video) => ({
          id: video.id,
          title: video.title,
          creatorName: video.user.name,
          description: video.description,
          summary: video.aiSummary,
          tags: video.aiTags,
          topics: video.aiTopics,
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          updatedAt: video.updatedAt.toISOString(),
        })),
      });

      if (ranking.rankedIds.length === 0) return;

      const byId = new Map(data.map((video) => [video.id, video]));
      const rankedIds = new Set(ranking.rankedIds);
      const rankedItems = ranking.rankedIds
        .map((id) => byId.get(id))
        .filter((video): video is SearchPage["items"][number] => Boolean(video));
      const unrankedItems = data.filter((video) => !rankedIds.has(video.id));
      const rankedPage: SearchPage = {
        items: [...rankedItems, ...unrankedItems].slice(0, limit).map((video) => ({
          ...video,
          managedAgentNotes: {
            ...(
              video.managedAgentNotes &&
              typeof video.managedAgentNotes === "object" &&
              !Array.isArray(video.managedAgentNotes)
                ? video.managedAgentNotes
                : {}
            ),
            searchAgent: {
              agentId: ranking.agentId,
              ...ranking.notes,
            },
          },
        })),
        nextCursor: null,
      };

      await setCachedValue(
        cacheKey,
        serializeSearchPage(rankedPage),
        SEARCH_CACHE_TTL_SECONDS,
      );
    } catch {
      // The managed agent is an async ranking layer; fast DB search remains available.
    }
  })();
};

export const searchRouter = createTRPCRouter({
  getMany: baseProcedure
    .input(
      z.object({
        query: z.string().nullish(),
        categoryId: z.string().uuid().nullish(),
        useManagedAgent: z.boolean().optional(),
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
        return {
          items: [],
          nextCursor: null,
        };
      }

      const { cursor, limit, query, categoryId, } = input;
      const firebaseSync = await syncFirebaseStorageVideosForRequest();
      const shouldBypassCache = firebaseSync.inserted > 0 || firebaseSync.updated > 0;
      const normalizedQuery = query?.trim();
      const canUseManagedAgent = Boolean(normalizedQuery && !cursor && input.useManagedAgent !== false);
      const managedAgentCacheKey = canUseManagedAgent
        ? buildSearchCacheKey({
            query: normalizedQuery,
            categoryId,
            cursor,
            limit,
            useManagedAgent: true,
          })
        : null;

      if (managedAgentCacheKey) {
        const cachedAgentResult = await getCachedValue<SerializedSearchPage>(managedAgentCacheKey);

        if (cachedAgentResult && !shouldBypassCache) {
          return deserializeSearchPage(cachedAgentResult);
        }
      }

      const cacheKey = buildSearchCacheKey({
        query: normalizedQuery,
        categoryId,
        cursor,
        limit,
        useManagedAgent: input.useManagedAgent,
      });
      const cached = await getCachedValue<SerializedSearchPage>(cacheKey);

      if (cached && !shouldBypassCache) {
        return deserializeSearchPage(cached);
      }

      const shouldUseManagedAgent = Boolean(input.useManagedAgent === true && normalizedQuery && !cursor);
      const candidateLimit = shouldUseManagedAgent
        ? Math.min(Math.max(limit * 4, 24), 60)
        : limit + 1;
      const searchFilter = normalizedQuery
        ? or(
          ilike(videos.title, `%${normalizedQuery}%`),
          ilike(videos.description, `%${normalizedQuery}%`),
          ilike(videos.aiSummary, `%${normalizedQuery}%`),
          ilike(videos.searchDocument, `%${normalizedQuery}%`),
          ilike(users.name, `%${normalizedQuery}%`),
        )
        : undefined;

      let data = await db
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
          searchFilter,
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
        .limit(candidateLimit)

      let rankedByManagedAgent = false;

      if (normalizedQuery && shouldUseManagedAgent) {
        try {
          const ranking = await rankVideosWithManagedAgent({
            query: normalizedQuery,
            candidates: data.map((video) => ({
              id: video.id,
              title: video.title,
              creatorName: video.user.name,
              description: video.description,
              summary: video.aiSummary,
              tags: video.aiTags,
              topics: video.aiTopics,
              viewCount: video.viewCount,
              likeCount: video.likeCount,
              updatedAt: video.updatedAt.toISOString(),
            })),
          });

          if (ranking.rankedIds.length > 0) {
            const byId = new Map(data.map((video) => [video.id, video]));
            const rankedIds = new Set(ranking.rankedIds);
            const rankedItems = ranking.rankedIds
              .map((id) => byId.get(id))
              .filter((video): video is (typeof data)[number] => Boolean(video));
            const unrankedItems = data.filter((video) => !rankedIds.has(video.id));

            data = [...rankedItems, ...unrankedItems].map((video) => ({
              ...video,
              managedAgentNotes: {
                ...(
                  video.managedAgentNotes &&
                  typeof video.managedAgentNotes === "object" &&
                  !Array.isArray(video.managedAgentNotes)
                    ? video.managedAgentNotes
                    : {}
                ),
                searchAgent: {
                  agentId: ranking.agentId,
                  ...ranking.notes,
                },
              },
            }));
            rankedByManagedAgent = true;
          }
        } catch (error) {
          console.warn("Gemini managed search agent failed; using database order.", error);
        }
      }

      const hasMore = !rankedByManagedAgent && data.length > limit;
      // Remove the last item if there is more data
      const items = hasMore ? data.slice(0, -1) : data.slice(0, limit);
      // Set the next cursor to the last item if there is more data
      const lastItem = items[items.length - 1];
      const nextCursor = hasMore 
        ? {
          id: lastItem.id,
          updatedAt: lastItem.updatedAt,
        }
        : null;

      const page = {
        items,
        nextCursor,
      };

      await setCachedValue(cacheKey, serializeSearchPage(page), SEARCH_CACHE_TTL_SECONDS);

      if (managedAgentCacheKey && !rankedByManagedAgent && normalizedQuery) {
        scheduleManagedAgentRanking({
          query: normalizedQuery,
          data,
          cacheKey: managedAgentCacheKey,
          limit,
        });
      }

      return page;
    }),
});
