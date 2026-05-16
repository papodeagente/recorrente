import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { and, eq } from "drizzle-orm";
import superjson from "superjson";
import { db } from "@/server/db/client";
import { userTenants } from "@/server/db/schema";
import { getSessionFromCookies, type SessionPayload } from "@/server/auth/session";
import type { TenantCtx } from "@/server/lib/tenant-context";

export type TrpcContext = {
  session: SessionPayload | null;
  tenant: TenantCtx | null;
};

export async function createContext(_opts?: FetchCreateContextFnOptions): Promise<TrpcContext> {
  void _opts;
  const session = await getSessionFromCookies();
  if (!session?.tenantId) {
    return { session, tenant: null };
  }
  const link = await db
    .select({ role: userTenants.role })
    .from(userTenants)
    .where(and(eq(userTenants.userId, session.userId), eq(userTenants.tenantId, session.tenantId)))
    .limit(1);
  if (!link[0]) {
    return { session, tenant: null };
  }
  const role = link[0].role as TenantCtx["role"];
  return { session, tenant: { userId: session.userId, tenantId: session.tenantId, role } };
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
