"use client";

import { useEffect, useState } from "react";

export const useVideoDuration = (sourceUrl?: string | null) => {
  const [durationMs, setDurationMs] = useState<number | null>(null);

  useEffect(() => {
    if (!sourceUrl) {
      setDurationMs(null);
      return;
    }

    let cancelled = false;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = sourceUrl;

    const handleLoaded = () => {
      if (cancelled) return;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDurationMs(Math.round(video.duration * 1000));
      }
    };

    video.addEventListener("loadedmetadata", handleLoaded);

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeAttribute("src");
      video.load();
    };
  }, [sourceUrl]);

  return durationMs;
};
