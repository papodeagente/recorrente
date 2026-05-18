import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { categories } from "@/server/db/schema";
import { tenantDb } from "@/server/lib/tenant-context";
import { router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

export const categoriesRouter = router({
  list: tenantReadProcedure
    .input(z.object({ kind: z.enum(["income", "expense"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = input?.kind
        ? and(eq(categories.tenantId, ctx.tenant.tenantId), eq(categories.kind, input.kind))
        : eq(categories.tenantId, ctx.tenant.tenantId);
      return tenantDb(ctx.tenant.tenantId).raw
        .select()
        .from(categories)
        .where(where)
        .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name));
    }),

  create: tenantWriteProcedure
    .input(z.object({ kind: z.enum(["income", "expense"]), name: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await tenantDb(ctx.tenant.tenantId).insert(categories, input);
      return row;
    }),

  remove: tenantWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const n = await tenantDb(ctx.tenant.tenantId).delete(categories, eq(categories.id, input.id));
      return { removed: n };
    }),
});
