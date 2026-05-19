import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db/client";
import { auditLogs, userTenants, users } from "@/server/db/schema";
import { router, tenantOwnerProcedure } from "@/server/trpc/init";

const roleEnum = z.enum(["owner", "manager", "operator"]);
const permsSchema = z
  .object({
    view_revenue: z.boolean().optional(),
    view_profit: z.boolean().optional(),
    view_expenses: z.boolean().optional(),
    view_reports: z.boolean().optional(),
    manage_users: z.boolean().optional(),
  })
  .optional();

export const usersRouter = router({
  list: tenantOwnerProcedure.query(async ({ ctx }) => {
    return db
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        role: userTenants.role,
        permissions: userTenants.permissions,
        createdAt: userTenants.createdAt,
      })
      .from(userTenants)
      .innerJoin(users, eq(users.id, userTenants.userId))
      .where(eq(userTenants.tenantId, ctx.tenant.tenantId))
      .orderBy(userTenants.createdAt);
  }),

  /**
   * Adiciona um membro ao tenant.
   * - Se o e-mail já existir como user, só cria o user_tenant link.
   * - Se não existir, cria o user com a senha temporária informada.
   * (MVP — não envia e-mail; o owner avisa o membro fora da plataforma.)
   */
  addMember: tenantOwnerProcedure
    .input(
      z.object({
        email: z.string().email().toLowerCase(),
        name: z.string().min(1).max(120).optional(),
        role: roleEnum.default("operator"),
        permissions: permsSchema,
        tempPassword: z.string().min(8).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.role === "owner") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Negócio tem só 1 dono. Use 'manager' ou 'operator'.",
        });
      }
      let [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

      if (!user) {
        if (!input.tempPassword) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Usuário novo — informe uma senha temporária (mínimo 8).",
          });
        }
        const passwordHash = await hashPassword(input.tempPassword);
        [user] = await db
          .insert(users)
          .values({ email: input.email, name: input.name, passwordHash })
          .returning();
      }

      const [link] = await db
        .select()
        .from(userTenants)
        .where(
          and(eq(userTenants.userId, user.id), eq(userTenants.tenantId, ctx.tenant.tenantId)),
        )
        .limit(1);
      if (link) {
        throw new TRPCError({ code: "CONFLICT", message: "Usuário já faz parte deste negócio." });
      }

      await db.insert(userTenants).values({
        userId: user.id,
        tenantId: ctx.tenant.tenantId,
        role: input.role,
        permissions: (input.permissions ?? {}) as never,
      });
      await db.insert(auditLogs).values({
        tenantId: ctx.tenant.tenantId,
        userId: ctx.session.userId,
        actorType: "user",
        action: "create",
        entityType: "user_tenant",
        entityId: user.id,
        newValue: { role: input.role, email: input.email } as never,
      });
      return { userId: user.id, email: user.email, role: input.role };
    }),

  updateMember: tenantOwnerProcedure
    .input(z.object({ userId: z.string(), role: roleEnum.optional(), permissions: permsSchema }))
    .mutation(async ({ ctx, input }) => {
      const [link] = await db
        .select()
        .from(userTenants)
        .where(
          and(
            eq(userTenants.userId, input.userId),
            eq(userTenants.tenantId, ctx.tenant.tenantId),
          ),
        )
        .limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND" });
      if (link.role === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Não dá pra mudar o dono." });
      }
      const next: Partial<typeof userTenants.$inferInsert> = {};
      if (input.role) next.role = input.role;
      if (input.permissions) next.permissions = input.permissions as never;
      await db
        .update(userTenants)
        .set(next)
        .where(
          and(
            eq(userTenants.userId, input.userId),
            eq(userTenants.tenantId, ctx.tenant.tenantId),
          ),
        );
      await db.insert(auditLogs).values({
        tenantId: ctx.tenant.tenantId,
        userId: ctx.session.userId,
        actorType: "user",
        action: "update",
        entityType: "user_tenant",
        entityId: input.userId,
        newValue: next as never,
      });
      return { ok: true };
    }),

  removeMember: tenantOwnerProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [link] = await db
        .select()
        .from(userTenants)
        .where(
          and(
            eq(userTenants.userId, input.userId),
            eq(userTenants.tenantId, ctx.tenant.tenantId),
          ),
        )
        .limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND" });
      if (link.role === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Não dá pra remover o dono." });
      }
      await db
        .delete(userTenants)
        .where(
          and(
            eq(userTenants.userId, input.userId),
            eq(userTenants.tenantId, ctx.tenant.tenantId),
          ),
        );
      await db.insert(auditLogs).values({
        tenantId: ctx.tenant.tenantId,
        userId: ctx.session.userId,
        actorType: "user",
        action: "delete",
        entityType: "user_tenant",
        entityId: input.userId,
      });
      return { ok: true };
    }),
});
