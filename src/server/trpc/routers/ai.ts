import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { aiActions, aiExtractions, whatsappMessages } from "@/server/db/schema";
import { execute } from "@/server/lib/ai/executor";
import { logger } from "@/server/lib/logger";
import { tenantDb } from "@/server/lib/tenant-context";
import { router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

export const aiRouter = router({
  pendingList: tenantReadProcedure.query(async ({ ctx }) => {
    return tenantDb(ctx.tenant.tenantId).raw
      .select({
        id: aiExtractions.id,
        intent: aiExtractions.intent,
        confidence: aiExtractions.confidence,
        extractedJson: aiExtractions.extractedJson,
        sourceType: aiExtractions.sourceType,
        createdAt: aiExtractions.createdAt,
        messageId: aiExtractions.messageId,
      })
      .from(aiExtractions)
      .where(
        and(
          eq(aiExtractions.tenantId, ctx.tenant.tenantId),
          eq(aiExtractions.status, "pending"),
        ),
      )
      .orderBy(desc(aiExtractions.createdAt))
      .limit(100);
  }),

  byId: tenantReadProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return tenantDb(ctx.tenant.tenantId).findFirst(aiExtractions, eq(aiExtractions.id, input.id));
    }),

  confirm: tenantWriteProcedure
    .input(z.object({ id: z.string(), overrideJson: z.record(z.string(), z.unknown()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const t = tenantDb(ctx.tenant.tenantId);
      const e = await t.findFirst(aiExtractions, eq(aiExtractions.id, input.id));
      if (!e) throw new TRPCError({ code: "NOT_FOUND" });
      if (e.status !== "pending") {
        return { ok: false, message: `extraction ${e.status}`, status: e.status };
      }
      const payload = (input.overrideJson ?? e.extractedJson) as never;
      const result = await execute(payload as unknown as Parameters<typeof execute>[0], {
        tenantId: ctx.tenant.tenantId,
        extractionId: e.id,
        contactIdHint: null,
      });
      await db
        .update(aiExtractions)
        .set({
          status: result.ok ? "executed" : "error",
          reviewedByUserId: ctx.session.userId,
          reviewedAt: new Date(),
          extractedJson: payload,
          updatedAt: new Date(),
        })
        .where(eq(aiExtractions.id, e.id));
      logger.info(
        { tenantId: ctx.tenant.tenantId, extractionId: e.id, ok: result.ok },
        "[ai] manual confirm",
      );
      return { ok: result.ok, message: result.message };
    }),

  reject: tenantWriteProcedure
    .input(z.object({ id: z.string(), reason: z.string().max(200).optional() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await tenantDb(ctx.tenant.tenantId).update(
        aiExtractions,
        {
          status: "rejected",
          reviewedByUserId: ctx.session.userId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        },
        eq(aiExtractions.id, input.id),
      );
      return row;
    }),

  messages: tenantReadProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const where = input?.status
        ? and(
            eq(whatsappMessages.tenantId, ctx.tenant.tenantId),
            eq(whatsappMessages.processingStatus, input.status),
          )
        : eq(whatsappMessages.tenantId, ctx.tenant.tenantId);
      return tenantDb(ctx.tenant.tenantId).raw
        .select()
        .from(whatsappMessages)
        .where(where)
        .orderBy(desc(whatsappMessages.receivedAt))
        .limit(input?.limit ?? 50);
    }),

  actionsForExtraction: tenantReadProcedure
    .input(z.object({ extractionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return tenantDb(ctx.tenant.tenantId).raw
        .select()
        .from(aiActions)
        .where(
          and(
            eq(aiActions.tenantId, ctx.tenant.tenantId),
            eq(aiActions.extractionId, input.extractionId),
          ),
        )
        .orderBy(aiActions.createdAt);
    }),
});
