import { CreatorGate } from "@/modules/creators/ui/components/creator-gate";

import { FormSection } from "../sections/form-section";

interface PageProps {
  videoId: string;
};

export const VideoView = ({ videoId }: PageProps) => {
  return (
    <CreatorGate title="Open your creator studio" description="Join with the creator session that owns this upload.">
      <div className="px-4 pt-2.5 max-w-screen-lg">
        <FormSection videoId={videoId} />
      </div>
    </CreatorGate>
  );
};
