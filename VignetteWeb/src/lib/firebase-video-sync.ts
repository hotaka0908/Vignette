import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, isDatabaseConfigured } from "@/db";
import { categories, users, videos } from "@/db/schema";
import { isFirebaseConfigured, listFirebaseVideos } from "@/lib/firebase";
import { generateAndSaveVideoThumbnail } from "@/lib/video-thumbnails";

export const FIREBASE_CREATOR_ID = "00000000-0000-4000-8000-000000000901";
const FIREBASE_CATEGORY_NAME = "Firebase Storage";

const deterministicUuid = (input: string) => {
  const hash = createHash("sha1").update(input).digest("hex").slice(0, 32);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
};

const titleFromPath = (path: string) => {
  const fileName = path.split("/").pop() || path;
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Firebase Video";
};

export interface FirebaseVideoSyncResult {
  found: number;
  inserted: number;
  updated: number;
  thumbnailGenerated: number;
  thumbnailFailed: number;
  skipped: boolean;
}

export const syncFirebaseStorageVideos = async ({
  prefix = process.env.FIREBASE_STORAGE_VIDEO_PREFIX || "",
  generateThumbnails = process.env.FIREBASE_AUTO_GENERATE_THUMBNAILS !== "false",
  log = false,
}: {
  prefix?: string;
  generateThumbnails?: boolean;
  log?: boolean;
} = {}): Promise<FirebaseVideoSyncResult> => {
  const result: FirebaseVideoSyncResult = {
    found: 0,
    inserted: 0,
    updated: 0,
    thumbnailGenerated: 0,
    thumbnailFailed: 0,
    skipped: false,
  };

  if (!isDatabaseConfigured || !isFirebaseConfigured) {
    return { ...result, skipped: true };
  }

  if (log) console.log("Listing Firebase Storage videos...");
  const items = await listFirebaseVideos(prefix);
  result.found = items.length;

  if (items.length === 0) {
    if (log) console.log("No Firebase Storage videos found.");
    return result;
  }

  await db
    .insert(categories)
    .values({
      name: FIREBASE_CATEGORY_NAME,
      description: "Videos synced from Firebase Storage",
    })
    .onConflictDoNothing({ target: categories.name });

  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.name, FIREBASE_CATEGORY_NAME));

  await db
    .insert(users)
    .values({
      id: FIREBASE_CREATOR_ID,
      clerkId: "firebase:storage",
      name: "Firebase Storage",
      imageUrl: "/user-placeholder.svg",
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: "Firebase Storage",
        imageUrl: "/user-placeholder.svg",
        updatedAt: new Date(),
      },
    });

  const now = new Date();

  for (const item of items) {
    const id = deterministicUuid(`firebase:${item.fullPath}`);
    const [existingVideo] = await db
      .select({
        id: videos.id,
        sourceUrl: videos.sourceUrl,
        sourceKey: videos.sourceKey,
        thumbnailUrl: videos.thumbnailUrl,
        thumbnailKey: videos.thumbnailKey,
        updatedAt: videos.updatedAt,
      })
      .from(videos)
      .where(eq(videos.id, id));

    const firebaseUpdatedAt = item.updatedAt ? new Date(item.updatedAt) : null;
    const updatedAt = firebaseUpdatedAt ?? existingVideo?.updatedAt ?? now;
    const title = titleFromPath(item.fullPath);
    const description = [
      "Synced from Firebase Storage.",
      `Path: ${item.fullPath}`,
      item.contentType ? `Content type: ${item.contentType}` : null,
    ].filter(Boolean).join("\n");
    const sourceKey = `firebase:${item.fullPath}`;
    const managedAgentNotes = {
      storage: "firebase",
      bucket: item.bucket,
      fullPath: item.fullPath,
      size: item.size,
    };

    if (!existingVideo) {
      await db
        .insert(videos)
        .values({
          id,
          title,
          description,
          muxStatus: null,
          muxAssetId: null,
          muxUploadId: null,
          muxPlaybackId: null,
          muxTrackId: null,
          muxTrackStatus: null,
          thumbnailUrl: null,
          thumbnailKey: null,
          previewUrl: null,
          previewKey: null,
          sourceUrl: item.downloadUrl,
          sourceKey,
          duration: 0,
          visibility: "public" as const,
          userId: FIREBASE_CREATOR_ID,
          categoryId: category?.id ?? null,
          createdAt: updatedAt,
          updatedAt,
          managedAgentNotes,
        });

      result.inserted += 1;
    } else {
      const changed =
        existingVideo.sourceUrl !== item.downloadUrl ||
        existingVideo.sourceKey !== sourceKey ||
        (firebaseUpdatedAt ? existingVideo.updatedAt.getTime() !== firebaseUpdatedAt.getTime() : false);

      if (changed) {
        await db
          .update(videos)
          .set({
            title,
            description,
            sourceUrl: item.downloadUrl,
            sourceKey,
            categoryId: category?.id ?? null,
            managedAgentNotes,
            visibility: "public",
            updatedAt,
          })
          .where(eq(videos.id, id));

        result.updated += 1;
      }
    }

    if (!generateThumbnails || existingVideo?.thumbnailUrl) continue;

    try {
      if (log) console.log(`Generating thumbnail for ${title}...`);
      const generatedThumbnail = await generateAndSaveVideoThumbnail({
        videoId: id,
        title,
        description,
        sourceKey,
        creatorDirection: "Automatically generated for a Firebase Storage video imported into CrossTube.",
      });

      await db
        .update(videos)
        .set({
          thumbnailUrl: generatedThumbnail.thumbnailUrl,
          thumbnailKey: generatedThumbnail.thumbnailKey,
          previewUrl: generatedThumbnail.thumbnailUrl,
          previewKey: generatedThumbnail.thumbnailKey,
          updatedAt: new Date(),
        })
        .where(eq(videos.id, id));

      result.thumbnailGenerated += 1;
    } catch (error) {
      result.thumbnailFailed += 1;
      if (log) {
        console.warn(
          `Thumbnail generation skipped for ${title}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return result;
};

export const syncFirebaseStorageVideosForRequest = async () => {
  if (process.env.FIREBASE_AUTO_SYNC_ON_REQUEST === "false") {
    return {
      found: 0,
      inserted: 0,
      updated: 0,
      thumbnailGenerated: 0,
      thumbnailFailed: 0,
      skipped: true,
    } satisfies FirebaseVideoSyncResult;
  }

  try {
    return await syncFirebaseStorageVideos({
      generateThumbnails: false,
      log: false,
    });
  } catch (error) {
    console.warn(
      "Firebase Storage request sync skipped:",
      error instanceof Error ? error.message : error,
    );
    return {
      found: 0,
      inserted: 0,
      updated: 0,
      thumbnailGenerated: 0,
      thumbnailFailed: 0,
      skipped: true,
    } satisfies FirebaseVideoSyncResult;
  }
};
