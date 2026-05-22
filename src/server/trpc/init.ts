import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { and, eq } from "drizzle-orm";
import superjson from "superjson";
import { buildClearSessionCookie, getSessionFromCookies, type SessionPayload } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { userTenants, users } from "@/server/db/schema";
import {
  effectivePermissions,
  type TenantCtx,
  type TenantPermissions,
  type TenantRole,
} from "@/server/lib/tenant-context";
import { logger } from "@/server/lib/logger";

export type TrpcContext = {
  session: SessionPayload | null;
  tenant: TenantCtx | null;
  resHeaders: Headers;
};

export async function createContext(opts: FetchCreateContextFnOptions): Promise<TrpcContext> {
  const resHeaders = opts.resHeaders;
  const session = await getSessionFromCookies();

  if (!session) return { session: null, tenant: null, resHeaders };

  // Valida que o user ainda existe (cobre cookie antigo após reset de DB).
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) {
    logger.info({ userId: session.userId }, "[ctx] orphan session — clearing cookie");
    resHeaders.append("Set-Cookie", buildClearSessionCookie());
    return { session: null, tenant: null, resHeaders };
  }

  if (!session.tenantId) return { session, tenant: null, resHeaders };

  const link = await db
    .select({ role: userTenants.role, permissions: userTenants.permissions })
    .from(userTenants)
    .where(and(eq(userTenants.userId, session.userId), eq(userTenants.tenantId, session.tenantId)))
    .limit(1);
  if (!link[0]) return { session, tenant: null, resHeaders };

  const role = link[0].role as TenantRole;
  const overrides = (link[0].permissions ?? {}) as Partial<TenantPermissions>;
  const permissions = effectivePermissions(role, overrides);
  return {
    session,
    tenant: { userId: session.userId, tenantId: session.tenantId, role, permissions },
    resHeaders,
  };
}

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const middleware = t.middleware;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const tenantReadProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (!ctx.tenant) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant required" });
  return next({ ctx: { ...ctx, session: ctx.session, tenant: ctx.tenant } });
});

export const tenantWriteProcedure = tenantReadProcedure.use(({ ctx, next }) => {
  if (ctx.tenant.role === "operator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Operator cannot write" });
  }
  return next({ ctx });
});

/** Garante que o usuário tem permissão para gerenciar usuários. */
export const tenantOwnerProcedure = tenantReadProcedure.use(({ ctx, next }) => {
  if (!ctx.tenant.permissions.manage_users) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o dono gerencia usuários." });
  }
  return next({ ctx });
});
