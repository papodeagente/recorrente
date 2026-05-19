import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, users } from "@/server/db/schema";
import { db } from "@/server/db/client";
import { tenantDb } from "@/server/lib/tenant-context";
import { router, tenantReadProcedure } from "@/server/trpc/init";

export const auditRouter = router({
  list: tenantReadProcedure
    .input(
      z
        .object({
          entityType: z.string().optional(),
          actorType: z.enum(["user", "ai", "system"]).optional(),
          daysBack: z.number().int().min(1).max(90).default(14),
          limit: z.number().int().min(1).max(500).default(100),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - (input?.daysBack ?? 14));
      const filters = [
        eq(auditLogs.tenantId, ctx.tenant.tenantId),
        gte(auditLogs.createdAt, since),
      ];
      if (input?.entityType) filters.push(eq(auditLogs.entityType, input.entityType));
      if (input?.actorType) filters.push(eq(auditLogs.actorType, input.actorType));
      return db
        .select({
          id: auditLogs.id,
          actorType: auditLogs.actorType,
          userName: users.name,
          userEmail: users.email,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          oldValue: auditLogs.oldValue,
          newValue: auditLogs.newValue,
          reason: auditLogs.reason,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .where(and(...filters))
        .orderBy(desc(auditLogs.createdAt))
        .limit(input?.limit ?? 100);
    }),

  // ref voor type usage:
  _suppress: tenantReadProcedure.query(async ({ ctx }) => {
    void tenantDb(ctx.tenant.tenantId);
    return null;
  }),
});
