import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { buildSessionCookie, signSessionToken } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  businessSettings,
  categories,
  products,
  tenants,
  userTenants,
} from "@/server/db/schema";
import { defaultCategoriesFor, suggestedProductsFor, type SegmentKey } from "@/server/lib/segments";
import {
  protectedProcedure,
  router,
  tenantReadProcedure,
  tenantWriteProcedure,
} from "@/server/trpc/init";

const slugRule = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífen.");

const segmentRule = z.enum([
  "delivery",
  "alimentacao",
  "barbearia",
  "beleza",
  "estetica",
  "loja",
  "servico",
  "outro",
]);

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
        name: tenants.name,
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
        name: z.string().min(1).max(120),
        businessType: segmentRule,
        lgpdDataControllerEmail: z.string().email(),
        timezone: z.string().default("America/Sao_Paulo"),
        seedProducts: z.boolean().default(true),
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
            name: input.name,
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
        await tx.insert(businessSettings).values({ tenantId: t.id });

        const cats = defaultCategoriesFor(input.businessType as SegmentKey);
        const catRows = [
          ...cats.income.map((name, i) => ({
            tenantId: t.id,
            kind: "income",
            name,
            isDefault: true,
            sortOrder: i,
          })),
          ...cats.expense.map((name, i) => ({
            tenantId: t.id,
            kind: "expense",
            name,
            isDefault: true,
            sortOrder: i,
          })),
        ];
        if (catRows.length > 0) await tx.insert(categories).values(catRows);

        if (input.seedProducts) {
          const suggested = suggestedProductsFor(input.businessType as SegmentKey);
          if (suggested.length > 0) {
            await tx.insert(products).values(
              suggested.map((p, i) => ({
                tenantId: t.id,
                name: p.name,
                type: p.type,
                defaultPriceCents: p.defaultPriceCents,
                aliases: p.aliases,
                sortOrder: i,
              })),
            );
          }
        }
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
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenant.tenantId)).limit(1);
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
