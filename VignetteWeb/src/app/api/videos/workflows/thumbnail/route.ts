import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { serve } from "@upstash/workflow/nextjs";

import { db } from "@/db";
import { videos } from "@/db/schema";
import {
  deleteGeneratedThumbnail,
  generateAndSaveVideoThumbnail,
} from "@/lib/video-thumbnails";

export const runtime = "nodejs";
export const maxDuration = 120;

const thumbnailWorkflowSchema = z.object({
  userId: z.string().uuid(),
  videoId: z.string().uuid(),
  prompt: z.string().min(10),
});

type ThumbnailWorkflowPayload = z.infer<typeof thumbnailWorkflowSchema>;

export const { POST } = serve<ThumbnailWorkflowPayload>(
  async (context) => {
    const payload = context.requestPayload;

    const video = await context.run("load video", async () => {
      const [existingVideo] = await db
        .select()
        .from(videos)
        .where(and(
          eq(videos.id, payload.videoId),
          eq(videos.userId, payload.userId),
        ));

      if (!existingVideo) {
        throw new Error("Video not found for thumbnail workflow");
      }

      return existingVideo;
    });

    const generatedThumbnail = await context.run("generate and save thumbnail", async () => {
      return generateAndSaveVideoThumbnail({
        videoId: video.id,
        title: video.title,
        description: video.description,
        sourceKey: video.sourceKey,
        creatorDirection: payload.prompt,
      });
    });

    await context.run("update video thumbnail", async () => {
      await deleteGeneratedThumbnail(video.thumbnailKey);

      await db
        .update(videos)
        .set({
          thumbnailUrl: generatedThumbnail.thumbnailUrl,
          thumbnailKey: generatedThumbnail.thumbnailKey,
          previewUrl: generatedThumbnail.thumbnailUrl,
          previewKey: generatedThumbnail.thumbnailKey,
          updatedAt: new Date(),
        })
        .where(and(
          eq(videos.id, payload.videoId),
          eq(videos.userId, payload.userId),
        ));
    });

    return {
      videoId: payload.videoId,
      thumbnailUrl: generatedThumbnail.thumbnailUrl,
    };
  },
  {
    schema: thumbnailWorkflowSchema,
  },
);
