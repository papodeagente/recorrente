import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { customers } from "@/server/db/schema";
import { tenantDb } from "@/server/lib/tenant-context";
import { router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

const phoneE164 = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Telefone deve estar em E.164 (ex.: +5511999990000).");

const customerCreate = z.object({
  phone: phoneE164,
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  notes: z.string().max(1000).optional(),
});

export const customersRouter = router({
  list: tenantReadProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const t = tenantDb(ctx.tenant.tenantId);
      const search = input?.search?.trim();
      if (!search) {
        return t.raw
          .select()
          .from(customers)
          .where(eq(customers.tenantId, ctx.tenant.tenantId))
          .orderBy(desc(customers.lastVisitAt), desc(customers.createdAt))
          .limit(200);
      }
      return t.raw
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, ctx.tenant.tenantId),
            or(ilike(customers.name, `%${search}%`), ilike(customers.phone, `%${search}%`)),
          ),
        )
        .limit(50);
    }),

  byId: tenantReadProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    return tenantDb(ctx.tenant.tenantId).findFirst(customers, eq(customers.id, input.id));
  }),

  create: tenantWriteProcedure.input(customerCreate).mutation(async ({ ctx, input }) => {
    const t = tenantDb(ctx.tenant.tenantId);
    const dupe = await t.findFirst(customers, eq(customers.phone, input.phone));
    if (dupe) throw new TRPCError({ code: "CONFLICT", message: "Telefone já cadastrado." });
    const [row] = await t.insert(customers, {
      phone: input.phone,
      name: input.name,
      email: input.email,
      notes: input.notes,
      firstContactAt: new Date(),
    });
    return row;
  }),

  update: tenantWriteProcedure
    .input(customerCreate.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [row] = await tenantDb(ctx.tenant.tenantId).update(
        customers,
        { ...rest, updatedAt: new Date() },
        eq(customers.id, id),
      );
      return row;
    }),
});
