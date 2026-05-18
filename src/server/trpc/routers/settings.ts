import { eq } from "drizzle-orm";
import { z } from "zod";
import { businessSettings } from "@/server/db/schema";
import { tenantDb } from "@/server/lib/tenant-context";
import { router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

const dayHours = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});

const businessHoursSchema = z.object({
  mon: dayHours.nullable(),
  tue: dayHours.nullable(),
  wed: dayHours.nullable(),
  thu: dayHours.nullable(),
  fri: dayHours.nullable(),
  sat: dayHours.nullable(),
  sun: dayHours.nullable(),
});

const updateInput = z.object({
  aiPersonaName: z.string().min(1).max(60).optional(),
  aiTone: z.enum(["amigavel", "profissional", "descolado"]).optional(),
  aiAutoConfirmBelowCents: z.number().int().nonnegative().optional(),
  aiAlwaysConfirmAboveCents: z.number().int().nonnegative().optional(),
  aiAlwaysConfirmNewCustomer: z.boolean().optional(),
  aiAlwaysConfirmReceiptImage: z.boolean().optional(),
  aiAllowAudioAutoCreate: z.boolean().optional(),
  aiCustomVocabulary: z.record(z.string(), z.string()).optional(),
  businessHours: businessHoursSchema.optional(),
  dailySummaryEnabled: z.boolean().optional(),
  dailySummaryAtHour: z.number().int().min(0).max(23).optional(),
});

export const settingsRouter = router({
  get: tenantReadProcedure.query(async ({ ctx }) => {
    return tenantDb(ctx.tenant.tenantId).findFirst(
      businessSettings,
      eq(businessSettings.tenantId, ctx.tenant.tenantId),
    );
  }),

  update: tenantWriteProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const [row] = await tenantDb(ctx.tenant.tenantId).update(
      businessSettings,
      { ...input, updatedAt: new Date() },
      eq(businessSettings.tenantId, ctx.tenant.tenantId),
    );
    return row;
  }),
});
