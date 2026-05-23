import { redirect } from "next/navigation";

import { getCreatorBySessionId, getCreatorSessionIdFromCookies } from "@/lib/creator-session";

export const GET = async () => {
  const sessionId = await getCreatorSessionIdFromCookies();
  const creator = await getCreatorBySessionId(sessionId);

  if (!creator) {
    return redirect("/upload");
  }

  return redirect(`/users/${creator.id}`);
};
