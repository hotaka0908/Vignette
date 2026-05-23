"use client";

import Image from "next/image"

import { formatDuration } from "@/lib/utils";
import { useVideoDuration } from "@/hooks/use-video-duration";

import { THUMBNAIL_FALLBACK } from "../../constants";
import { Skeleton } from "@/components/ui/skeleton";

interface VideoThumbnailProps {
  title: string;
  duration: number;
  imageUrl?: string | null;
  previewUrl?: string | null;
  sourceUrl?: string | null;
  muxPlaybackId?: string | null;
}

export const VideoThumbnailSkeleton = () => {
  return (
    <div className="relative w-full overflow-hidden rounded-xl aspect-video">
      <Skeleton className="size-full" />
    </div>
  );
};

export const VideoThumbnail = ({
  title,
  imageUrl,
  previewUrl,
  duration,
  sourceUrl,
  muxPlaybackId,
}: VideoThumbnailProps) => {
  const clientDuration = useVideoDuration(sourceUrl);
  const displayDuration = clientDuration ?? duration;
  const hasImageThumbnail = Boolean(imageUrl || previewUrl);
  const muxFirstFrameUrl = muxPlaybackId
    ? `https://image.mux.com/${muxPlaybackId}/thumbnail.jpg?time=0`
    : null;

  return (
    <div className="relative group">
      {/* Thumbnail wrapper */}
      <div className="relative w-full overflow-hidden rounded-xl aspect-video">
        {sourceUrl ? (
          <video
            src={sourceUrl}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full bg-black object-cover"
          />
        ) : muxFirstFrameUrl ? (
          <Image
            unoptimized
            src={muxFirstFrameUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="h-full w-full bg-black object-cover"
          />
        ) : hasImageThumbnail ? (
          <>
            <Image
              src={imageUrl || THUMBNAIL_FALLBACK}
              alt={title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="h-full w-full object-cover group-hover:opacity-0"
            />
            <Image
              unoptimized={!!previewUrl}
              src={previewUrl || imageUrl || THUMBNAIL_FALLBACK}
              alt={title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="h-full w-full object-cover opacity-0 group-hover:opacity-100"
            />
          </>
        ) : (
          <Image
            src={THUMBNAIL_FALLBACK}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {/* Video duration box */}
      <div className="absolute bottom-2 right-2 px-1 py-0.5 rounded bg-black/80 text-white text-xs font-medium">
        {formatDuration(displayDuration)}
      </div>
    </div>
  );
};
