import { z } from "zod";
import { cookies } from "next/headers";
import { TRPCError } from "@trpc/server";

import { isDatabaseConfigured } from "@/db";
import { createTRPCRouter, baseProcedure } from "@/trpc/init";
import {
  CREATOR_SESSION_COOKIE,
  creatorCookieOptions,
  ensureCreatorForSession,
  getCreatorBySessionId,
  isValidInviteCode,
} from "@/lib/creator-session";

export const creatorsRouter = createTRPCRouter({
  current: baseProcedure.query(async ({ ctx }) => {
    return getCreatorBySessionId(ctx.creatorSessionId);
  }),
  startSession: baseProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(80),
        inviteCode: z.string().trim().min(1).max(80),
      }),
    )
    .mutation(async ({ input }) => {
      if (!isValidInviteCode(input.inviteCode)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid invite code",
        });
      }

      if (!isDatabaseConfigured) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "DATABASE_URL is required before creators can upload videos",
        });
      }

      const sessionId = crypto.randomUUID();
      const creator = await ensureCreatorForSession({
        sessionId,
        name: input.name,
      });

      const cookieStore = await cookies();
      cookieStore.set(CREATOR_SESSION_COOKIE, sessionId, creatorCookieOptions);

      return creator;
    }),
  clearSession: baseProcedure.mutation(async () => {
    const cookieStore = await cookies();
    cookieStore.delete(CREATOR_SESSION_COOKIE);
    return true;
  }),
});
