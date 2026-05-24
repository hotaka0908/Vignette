import { CreatorGate } from "@/modules/creators/ui/components/creator-gate";

import { VideosSection } from "../sections/videos-section";

export const StudioView = () => {
  return ( 
    <CreatorGate title="Open your creator studio" description="Join with an invite code to manage videos from this browser.">
      <div className="flex flex-col gap-y-6 pt-2.5">
        <div className="px-4">
          <h1 className="text-2xl font-bold">Creator content</h1>
          <p className="text-xs text-muted-foreground">
            Manage your Vignette uploads and publishing status
          </p>
        </div>
        <VideosSection />
      </div>
    </CreatorGate>
  );
}
