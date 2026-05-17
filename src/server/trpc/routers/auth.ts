import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  signSessionToken,
} from "@/server/auth/session";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { protectedProcedure, publicProcedure, router } from "@/server/trpc/init";

const credentials = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(120),
});

export const authRouter = router({
  signup: publicProcedure
    .input(credentials.extend({ name: z.string().min(1).max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: "E-mail já cadastrado." });
      const passwordHash = await hashPassword(input.password);
      const [user] = await db
        .insert(users)
        .values({ email: input.email, name: input.name, passwordHash })
        .returning();
      const token = await signSessionToken({ userId: user.id, tenantId: null });
      ctx.resHeaders.append("Set-Cookie", buildSessionCookie(token));
      return { userId: user.id };
    }),

  login: publicProcedure.input(credentials).mutation(async ({ ctx, input }) => {
    const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas." });
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas." });
    const token = await signSessionToken({ userId: user.id, tenantId: null });
    ctx.resHeaders.append("Set-Cookie", buildSessionCookie(token));
    return { userId: user.id };
  }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    ctx.resHeaders.append("Set-Cookie", buildClearSessionCookie());
    return { ok: true };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, ctx.session.userId))
      .limit(1);
    return user ?? null;
  }),
});
