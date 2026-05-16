import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { serviceCatalog } from "@/server/db/schema";
import { tenantDb } from "@/server/lib/tenant-context";
import { router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

const serviceInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  priceCents: z.number().int().nonnegative().default(0),
  durationMinutes: z.number().int().positive().default(30),
  recurrenceDays: z.number().int().positive().default(30),
  recoveryAfterDays: z.number().int().positive().default(45),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const servicesRouter = router({
  list: tenantReadProcedure.query(async ({ ctx }) => {
    return tenantDb(ctx.tenant.tenantId).raw
      .select()
      .from(serviceCatalog)
      .where(eq(serviceCatalog.tenantId, ctx.tenant.tenantId))
      .orderBy(asc(serviceCatalog.sortOrder), asc(serviceCatalog.name));
  }),

  create: tenantWriteProcedure
    .input(serviceInput)
    .mutation(async ({ ctx, input }) => {
      const [row] = await tenantDb(ctx.tenant.tenantId).insert(serviceCatalog, input);
      return row;
    }),

  update: tenantWriteProcedure
    .input(serviceInput.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [row] = await tenantDb(ctx.tenant.tenantId).update(
        serviceCatalog,
        { ...rest, updatedAt: new Date() },
        eq(serviceCatalog.id, id),
      );
      return row;
    }),

  remove: tenantWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const n = await tenantDb(ctx.tenant.tenantId).delete(serviceCatalog, eq(serviceCatalog.id, input.id));
      return { removed: n };
    }),
});

// Silencia warning de import não-usado se Drizzle não usar `and` em todos os entry points.
void and;
