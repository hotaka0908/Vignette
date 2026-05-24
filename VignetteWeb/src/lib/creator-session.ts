import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db, isDatabaseConfigured } from "@/db";
import { users } from "@/db/schema";

export const CREATOR_SESSION_COOKIE = "crosstube_creator_session";

export const creatorCookieOptions = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 30,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export const getCreatorClerkId = (sessionId: string) => `creator:${sessionId}`;

export const getConfiguredInviteCode = () =>
  process.env.CROSSTUBE_INVITE_CODE || "CROSSTUBE2026";

export const isValidInviteCode = (inviteCode: string) =>
  inviteCode.trim() === getConfiguredInviteCode();

export const getCreatorBySessionId = async (sessionId?: string | null) => {
  if (!sessionId) return null;
  if (!isDatabaseConfigured) return null;

  const [creator] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, getCreatorClerkId(sessionId)))
    .limit(1);

  return creator ?? null;
};

export const ensureCreatorForSession = async ({
  sessionId,
  name,
}: {
  sessionId: string;
  name: string;
}) => {
  if (!isDatabaseConfigured) {
    throw new Error("DATABASE_URL is not configured");
  }

  const displayName = name.trim() || "Vignette Creator";
  const clerkId = getCreatorClerkId(sessionId);

  const [creator] = await db
    .insert(users)
    .values({
      clerkId,
      name: displayName,
      imageUrl: "/user-placeholder.svg",
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        name: displayName,
        updatedAt: new Date(),
      },
    })
    .returning();

  return creator;
};

export const getCreatorSessionIdFromCookies = async () => {
  const cookieStore = await cookies();
  return cookieStore.get(CREATOR_SESSION_COOKIE)?.value ?? null;
};
