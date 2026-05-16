import { eq } from "drizzle-orm";
import { z } from "zod";
import { tenantSettings } from "@/server/db/schema";
import { tenantDb } from "@/server/lib/tenant-context";
import { router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

const businessHoursDay = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});

const businessHoursSchema = z.object({
  mon: businessHoursDay.nullable(),
  tue: businessHoursDay.nullable(),
  wed: businessHoursDay.nullable(),
  thu: businessHoursDay.nullable(),
  fri: businessHoursDay.nullable(),
  sat: businessHoursDay.nullable(),
  sun: businessHoursDay.nullable(),
});

const updateInput = z.object({
  agentPersonaName: z.string().min(1).max(60).optional(),
  agentTone: z.enum(["amigavel", "profissional", "descolado"]).optional(),
  businessHours: businessHoursSchema.optional(),
  recoveryMessageTemplate: z.string().max(2000).nullable().optional(),
  referralRewardText: z.string().max(500).nullable().optional(),
  referralEnabled: z.boolean().optional(),
  autoPauseOnHumanReplyHours: z.number().int().min(0).max(168).optional(),
});

export const settingsRouter = router({
  get: tenantReadProcedure.query(async ({ ctx }) => {
    const t = tenantDb(ctx.tenant.tenantId);
    const [row] = await t.raw
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, ctx.tenant.tenantId))
      .limit(1);
    return row ?? null;
  }),

  update: tenantWriteProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const [row] = await tenantDb(ctx.tenant.tenantId).update(
      tenantSettings,
      { ...input, updatedAt: new Date() },
      eq(tenantSettings.tenantId, ctx.tenant.tenantId),
    );
    return row;
  }),
});
