/**
 * tenant-context — invariante de isolamento multi-tenant.
 *
 * Seção 4 do prompt fundacional. Toda procedure tRPC de escopo de tenant
 * resolve o tenant aqui. Toda query Drizzle de tabela com `tenant_id` deve
 * passar por `tenantDb(tenantId)` — nunca chamar `db` direto.
 *
 * Nota de tipos: usamos `unknown` no retorno do select/findFirst para evitar
 * inferência complexa do Drizzle. O callsite normalmente já conhece a tabela
 * e pode fazer `as Customer[]` se quiser tipo. A alternativa (typed query
 * builder) explodiria os tipos genéricos com pouco ganho prático.
 */

import { TRPCError } from "@trpc/server";
import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgTable, PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/server/db/client";

export type TenantRole = "owner" | "manager" | "operator";

export type TenantPermissions = {
  view_revenue: boolean;
  view_profit: boolean;
  view_expenses: boolean;
  view_reports: boolean;
  manage_users: boolean;
};

export const DEFAULT_PERMISSIONS: Record<TenantRole, TenantPermissions> = {
  owner: {
    view_revenue: true,
    view_profit: true,
    view_expenses: true,
    view_reports: true,
    manage_users: true,
  },
  manager: {
    view_revenue: true,
    view_profit: true,
    view_expenses: true,
    view_reports: true,
    manage_users: false,
  },
  operator: {
    view_revenue: false,
    view_profit: false,
    view_expenses: false,
    view_reports: false,
    manage_users: false,
  },
};

export function effectivePermissions(
  role: TenantRole,
  overrides: Partial<TenantPermissions> | null | undefined,
): TenantPermissions {
  // Owner ignora overrides — sempre vê tudo.
  if (role === "owner") return DEFAULT_PERMISSIONS.owner;
  return { ...DEFAULT_PERMISSIONS[role], ...(overrides ?? {}) };
}

export type TenantCtx = {
  userId: string;
  tenantId: string;
  role: TenantRole;
  permissions: TenantPermissions;
};

export function getTenantId(ctx: { tenant: TenantCtx | null }): string {
  if (!ctx.tenant) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant context required for this operation.",
    });
  }
  return ctx.tenant.tenantId;
}

export function assertSameTenant<T extends { tenantId: string } | null>(
  record: T,
  tenantId: string,
): asserts record is NonNullable<T> {
  if (!record) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Record not found in tenant scope." });
  }
  if (record.tenantId !== tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cross-tenant access denied.",
    });
  }
}

type TenantTable = AnyPgTable & { tenantId: PgColumn };

/**
 * Wrapper que injeta `where tenant_id = ?` em SELECT/UPDATE/DELETE/INSERT.
 * Use SEMPRE este wrapper em vez de `db` direto para tabelas com tenant_id.
 */
export function tenantDb(tenantId: string) {
  if (!tenantId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "tenantDb requires tenantId" });
  }
  return {
    /** SELECT * FROM table WHERE tenant_id = ? [AND ...extra] */
    async select<T extends TenantTable>(table: T, extra?: SQL): Promise<Array<T["$inferSelect"]>> {
      const cond = extra ? and(eq(table.tenantId, tenantId), extra) : eq(table.tenantId, tenantId);
      return (await db.select().from(table as never).where(cond)) as Array<T["$inferSelect"]>;
    },

    async findFirst<T extends TenantTable>(table: T, extra: SQL): Promise<T["$inferSelect"] | null> {
      const rows = (await db
        .select()
        .from(table as never)
        .where(and(eq(table.tenantId, tenantId), extra))
        .limit(1)) as Array<T["$inferSelect"]>;
      return rows[0] ?? null;
    },

    /** INSERT — força `tenant_id = tenantId` mesmo que o chamador tente sobrescrever. */
    async insert<T extends TenantTable>(
      table: T,
      values: Omit<T["$inferInsert"], "tenantId"> | Array<Omit<T["$inferInsert"], "tenantId">>,
    ): Promise<Array<T["$inferSelect"]>> {
      const arr = Array.isArray(values) ? values : [values];
      const withTenant = arr.map((v) => ({ ...v, tenantId })) as Array<T["$inferInsert"]>;
      return (await db.insert(table).values(withTenant).returning()) as Array<T["$inferSelect"]>;
    },

    async update<T extends TenantTable>(
      table: T,
      setValues: Partial<T["$inferInsert"]>,
      where: SQL,
    ): Promise<Array<T["$inferSelect"]>> {
      return (await db
        .update(table)
        .set(setValues)
        .where(and(eq(table.tenantId, tenantId), where))
        .returning()) as Array<T["$inferSelect"]>;
    },

    async delete<T extends TenantTable>(table: T, where: SQL): Promise<number> {
      const res = await db.delete(table).where(and(eq(table.tenantId, tenantId), where));
      return res.rowCount ?? 0;
    },

    /**
     * Escape hatch quando precisar de query crua (JOIN, agregação etc.).
     * **Você** é responsável por incluir `where tenant_id = ?`.
     * Documente o motivo sempre que usar.
     */
    raw: db,
  };
}

export type TenantDb = ReturnType<typeof tenantDb>;
