"use client";

import { CreatorGate } from "@/modules/creators/ui/components/creator-gate";

export const UploadView = () => {
  return (
    <CreatorGate title="Upload to Vignette" description="Join as a creator to publish videos into the shared feed.">
      <div className="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-4xl flex-col px-2 py-4 sm:px-4">
        <iframe
          src="/vignette/index.html"
          title="Vignette uploader"
          className="h-full w-full flex-1 rounded-lg border bg-background"
        />
      </div>
    </CreatorGate>
  );
};
