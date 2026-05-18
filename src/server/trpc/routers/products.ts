import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { products } from "@/server/db/schema";
import { tenantDb } from "@/server/lib/tenant-context";
import { router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

const input = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["product", "service"]).default("product"),
  defaultPriceCents: z.number().int().nonnegative().default(0),
  costPriceCents: z.number().int().nonnegative().optional(),
  categoryId: z.string().nullable().optional(),
  aliases: z.array(z.string()).max(20).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const productsRouter = router({
  list: tenantReadProcedure.query(async ({ ctx }) => {
    return tenantDb(ctx.tenant.tenantId).raw
      .select()
      .from(products)
      .where(eq(products.tenantId, ctx.tenant.tenantId))
      .orderBy(asc(products.sortOrder), asc(products.name));
  }),

  create: tenantWriteProcedure.input(input).mutation(async ({ ctx, input }) => {
    const [row] = await tenantDb(ctx.tenant.tenantId).insert(products, {
      ...input,
      aliases: input.aliases ?? [],
    });
    return row;
  }),

  update: tenantWriteProcedure
    .input(input.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [row] = await tenantDb(ctx.tenant.tenantId).update(
        products,
        { ...rest, updatedAt: new Date() },
        eq(products.id, id),
      );
      return row;
    }),

  remove: tenantWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const n = await tenantDb(ctx.tenant.tenantId).delete(products, eq(products.id, input.id));
      return { removed: n };
    }),
});
