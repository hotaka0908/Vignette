"use client";

import Image from "next/image";
import MuxPlayer from "@mux/mux-player-react";
import { PlayIcon } from "lucide-react";

import { THUMBNAIL_FALLBACK } from "../../constants";

interface VideoPlayerProps {
  playbackId?: string | null | undefined;
  thumbnailUrl?: string | null | undefined;
  sourceUrl?: string | null | undefined;
  autoPlay?: boolean;
  onPlay?: () => void;
};

export const VideoPlayerSkeleton = () => {
  return <div className="aspect-video bg-black rounded-xl" />
};

export const VideoPlayer = ({
  playbackId,
  thumbnailUrl,
  sourceUrl,
  autoPlay,
  onPlay,
}: VideoPlayerProps) => {
  if (sourceUrl) {
    return (
      <video
        src={sourceUrl}
        poster={thumbnailUrl || THUMBNAIL_FALLBACK}
        controls
        autoPlay={autoPlay}
        className="size-full bg-black object-contain"
        onPlay={onPlay}
      />
    );
  }

  if (!playbackId) {
    return (
      <button
        type="button"
        onClick={onPlay}
        className="relative flex size-full items-center justify-center overflow-hidden bg-black text-white"
        aria-label="Play demo video"
      >
        <Image
          src={thumbnailUrl || THUMBNAIL_FALLBACK}
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-75"
        />
        <span className="relative flex size-16 items-center justify-center rounded-full bg-black/70">
          <PlayIcon className="ml-1 size-8 fill-white" />
        </span>
      </button>
    );
  }

  return (
    <MuxPlayer
      playbackId={playbackId || ""}
      poster={thumbnailUrl || THUMBNAIL_FALLBACK}
      playerInitTime={0}
      autoPlay={autoPlay}
      thumbnailTime={0}
      className="w-full h-full object-contain"
      accentColor="#FF2056"
      onPlay={onPlay}
    />
  );
};
