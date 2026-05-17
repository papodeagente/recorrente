import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { buildSessionCookie, signSessionToken } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { tenantSettings, tenants, userTenants } from "@/server/db/schema";
import { protectedProcedure, router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

const slugRule = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífen.");

async function setActiveTenant(
  resHeaders: Headers,
  userId: string,
  tenantId: string | null,
): Promise<void> {
  const token = await signSessionToken({ userId, tenantId });
  resHeaders.append("Set-Cookie", buildSessionCookie(token));
}

export const tenantRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        businessName: tenants.businessName,
        businessType: tenants.businessType,
        status: tenants.status,
        role: userTenants.role,
      })
      .from(userTenants)
      .innerJoin(tenants, eq(userTenants.tenantId, tenants.id))
      .where(eq(userTenants.userId, ctx.session.userId));
  }),

  create: protectedProcedure
    .input(
      z.object({
        slug: slugRule,
        businessName: z.string().min(1).max(120),
        businessType: z.string().min(1).max(60),
        lgpdDataControllerEmail: z.string().email(),
        timezone: z.string().default("America/Sao_Paulo"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const dupe = await db.select().from(tenants).where(eq(tenants.slug, input.slug)).limit(1);
      if (dupe[0]) throw new TRPCError({ code: "CONFLICT", message: "Slug já em uso." });

      const tenant = await db.transaction(async (tx) => {
        const [t] = await tx
          .insert(tenants)
          .values({
            slug: input.slug,
            businessName: input.businessName,
            businessType: input.businessType,
            ownerUserId: ctx.session.userId,
            lgpdDataControllerEmail: input.lgpdDataControllerEmail,
            timezone: input.timezone,
            status: "setup",
          })
          .returning();
        await tx.insert(userTenants).values({
          userId: ctx.session.userId,
          tenantId: t.id,
          role: "owner",
        });
        await tx.insert(tenantSettings).values({ tenantId: t.id });
        return t;
      });

      await setActiveTenant(ctx.resHeaders, ctx.session.userId, tenant.id);
      return tenant;
    }),

  switch: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [link] = await db
        .select()
        .from(userTenants)
        .where(
          and(eq(userTenants.userId, ctx.session.userId), eq(userTenants.tenantId, input.tenantId)),
        )
        .limit(1);
      if (!link) throw new TRPCError({ code: "FORBIDDEN" });
      await setActiveTenant(ctx.resHeaders, ctx.session.userId, input.tenantId);
      return { ok: true };
    }),

  current: tenantReadProcedure.query(async ({ ctx }) => {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, ctx.tenant.tenantId))
      .limit(1);
    return tenant ?? null;
  }),

  connectZapi: tenantWriteProcedure
    .input(
      z.object({
        zapiInstanceId: z.string().min(1),
        zapiInstanceToken: z.string().min(1),
        zapiClientToken: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(tenants)
        .set({
          zapiInstanceId: input.zapiInstanceId,
          zapiInstanceToken: input.zapiInstanceToken,
          zapiClientToken: input.zapiClientToken,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, ctx.tenant.tenantId))
        .returning();
      return updated;
    }),
});
