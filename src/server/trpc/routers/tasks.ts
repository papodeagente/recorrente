import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { tasks } from "@/server/db/schema";
import { tenantDb } from "@/server/lib/tenant-context";
import { router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

const input = z.object({
  contactId: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  dueAt: z.date().nullable().optional(),
  taskType: z.string().nullable().optional(),
});

export const tasksRouter = router({
  list: tenantReadProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = input?.status
        ? and(eq(tasks.tenantId, ctx.tenant.tenantId), eq(tasks.status, input.status))
        : eq(tasks.tenantId, ctx.tenant.tenantId);
      return tenantDb(ctx.tenant.tenantId).raw
        .select()
        .from(tasks)
        .where(where)
        .orderBy(tasks.dueAt, desc(tasks.createdAt))
        .limit(200);
    }),

  create: tenantWriteProcedure.input(input).mutation(async ({ ctx, input }) => {
    const [row] = await tenantDb(ctx.tenant.tenantId).insert(tasks, input);
    return row;
  }),

  complete: tenantWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const t = tenantDb(ctx.tenant.tenantId);
      const task = await t.findFirst(tasks, eq(tasks.id, input.id));
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      const [row] = await t.update(
        tasks,
        { status: "done", completedAt: new Date(), updatedAt: new Date() },
        eq(tasks.id, input.id),
      );
      return row;
    }),

  cancel: tenantWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await tenantDb(ctx.tenant.tenantId).update(
        tasks,
        { status: "cancelled", updatedAt: new Date() },
        eq(tasks.id, input.id),
      );
      return row;
    }),
});
