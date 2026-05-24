import { HydrateClient } from "@/trpc/server";

import { StudioView } from "@/modules/studio/ui/views/studio-view";

export const dynamic = 'force-dynamic'

const Page = async () => {
  return ( 
    <HydrateClient>
      <StudioView />
    </HydrateClient>
  );
};
 
export default Page;
