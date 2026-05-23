import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";

import { UTApi, UTFile } from "uploadthing/server";

import { generateGeminiImage } from "@/lib/gemini";

const GENERATED_THUMBNAIL_DIR = path.join(
  process.cwd(),
  "public",
  "generated-thumbnails",
);

export const LOCAL_THUMBNAIL_KEY_PREFIX = "local:generated-thumbnails/";

const imageExtensionFromMime = (mimeType?: string) => {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
};

const hasUploadThingToken = () =>
  Boolean(process.env.UPLOADTHING_TOKEN || process.env.UPLOADTHING_SECRET);

export const deleteGeneratedThumbnail = async (thumbnailKey?: string | null) => {
  if (!thumbnailKey) return;

  if (thumbnailKey.startsWith(LOCAL_THUMBNAIL_KEY_PREFIX)) {
    const fileName = thumbnailKey.slice(LOCAL_THUMBNAIL_KEY_PREFIX.length);
    await unlink(path.join(GENERATED_THUMBNAIL_DIR, path.basename(fileName))).catch(() => undefined);
    return;
  }

  if (!hasUploadThingToken()) return;

  await new UTApi().deleteFiles(thumbnailKey).catch(() => undefined);
};

export const saveGeneratedThumbnail = async ({
  videoId,
  data,
  mimeType,
}: {
  videoId: string;
  data: string;
  mimeType: string;
}) => {
  const extension = imageExtensionFromMime(mimeType);
  const fileName = `${videoId}-${randomUUID()}.${extension}`;
  const bytes = Uint8Array.from(Buffer.from(data, "base64"));

  if (hasUploadThingToken()) {
    try {
      const uploaded = await new UTApi().uploadFiles(
        new UTFile([bytes], fileName, { type: mimeType }),
      );

      if (uploaded.data) {
        return {
          thumbnailUrl: uploaded.data.ufsUrl || uploaded.data.url,
          thumbnailKey: uploaded.data.key,
        };
      }
    } catch {
      // Keep local development and demos usable when UploadThing is unavailable.
    }
  }

  await mkdir(GENERATED_THUMBNAIL_DIR, { recursive: true });
  await writeFile(path.join(GENERATED_THUMBNAIL_DIR, fileName), bytes);

  return {
    thumbnailUrl: `/generated-thumbnails/${fileName}`,
    thumbnailKey: `${LOCAL_THUMBNAIL_KEY_PREFIX}${fileName}`,
  };
};

export const buildVideoThumbnailPrompt = ({
  title,
  description,
  sourceKey,
  creatorDirection,
}: {
  title: string;
  description?: string | null;
  sourceKey?: string | null;
  creatorDirection?: string | null;
}) =>
  [
    "Create a polished 16:9 YouTube-style thumbnail for a CrossTube video.",
    "Make it sharp, high contrast, mobile-readable, and suitable for a creator platform.",
    "Use a cinematic composition with one clear focal subject and enough negative space for UI overlays.",
    "Do not include readable text, logos, copyrighted characters, or brand marks.",
    `Video title: ${title}`,
    `Video description: ${description || "No description yet."}`,
    sourceKey ? `Storage/source reference: ${sourceKey}` : null,
    creatorDirection ? `Creator direction: ${creatorDirection}` : null,
  ].filter(Boolean).join("\n");

export const generateAndSaveVideoThumbnail = async ({
  videoId,
  title,
  description,
  sourceKey,
  creatorDirection,
}: {
  videoId: string;
  title: string;
  description?: string | null;
  sourceKey?: string | null;
  creatorDirection?: string | null;
}) => {
  const image = await generateGeminiImage({
    prompt: buildVideoThumbnailPrompt({
      title,
      description,
      sourceKey,
      creatorDirection,
    }),
    aspectRatio: "16:9",
  });

  return saveGeneratedThumbnail({
    videoId,
    data: image.data,
    mimeType: image.mimeType,
  });
};
