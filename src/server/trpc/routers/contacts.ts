import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { contacts } from "@/server/db/schema";
import { tenantDb } from "@/server/lib/tenant-context";
import { router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

const phoneE164 = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Telefone E.164 obrigatório (ex.: +5511999990000)");

const create = z.object({
  phone: phoneE164,
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  address: z.string().max(300).optional(),
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string()).max(20).optional(),
});

export const contactsRouter = router({
  list: tenantReadProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const t = tenantDb(ctx.tenant.tenantId);
      const search = input?.search?.trim();
      if (!search) {
        return t.raw
          .select()
          .from(contacts)
          .where(eq(contacts.tenantId, ctx.tenant.tenantId))
          .orderBy(desc(contacts.lastPurchaseAt), desc(contacts.createdAt))
          .limit(200);
      }
      return t.raw
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, ctx.tenant.tenantId),
            or(ilike(contacts.name, `%${search}%`), ilike(contacts.phone, `%${search}%`)),
          ),
        )
        .limit(50);
    }),

  byId: tenantReadProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return tenantDb(ctx.tenant.tenantId).findFirst(contacts, eq(contacts.id, input.id));
    }),

  create: tenantWriteProcedure.input(create).mutation(async ({ ctx, input }) => {
    const t = tenantDb(ctx.tenant.tenantId);
    const dupe = await t.findFirst(contacts, eq(contacts.phone, input.phone));
    if (dupe) throw new TRPCError({ code: "CONFLICT", message: "Telefone já cadastrado." });
    const [row] = await t.insert(contacts, {
      phone: input.phone,
      name: input.name,
      email: input.email,
      address: input.address,
      notes: input.notes,
      tags: input.tags ?? [],
      firstContactAt: new Date(),
      origin: "manual",
    });
    return row;
  }),

  update: tenantWriteProcedure
    .input(create.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [row] = await tenantDb(ctx.tenant.tenantId).update(
        contacts,
        { ...rest, updatedAt: new Date() },
        eq(contacts.id, id),
      );
      return row;
    }),
});
