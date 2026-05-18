/**
 * business-hours — avalia se NOW está dentro do expediente do tenant.
 *
 * Formato persistido em tenant_settings.business_hours (jsonb):
 *   { mon: { open: "09:00", close: "18:00" } | null, tue: ..., ... }
 *
 * Considera o timezone do tenant (default America/Sao_Paulo).
 * Janela aberta interpretada como [open, close). Após close, fora.
 */

import { toZonedTime } from "date-fns-tz";

export type DayHours = { open: string; close: string } | null;
export type BusinessHours = Partial<Record<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat", DayHours>>;

const DAY_BY_INDEX = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number.parseInt(x, 10));
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

export function isWithinBusinessHours(
  hours: BusinessHours | null | undefined,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!hours) return true; // sem config => sempre aberto (conservador? não — usuário deve configurar)
  const local = toZonedTime(now, timezone || "America/Sao_Paulo");
  const day = DAY_BY_INDEX[local.getDay()];
  const slot = hours[day];
  if (!slot) return false;
  const cur = local.getHours() * 60 + local.getMinutes();
  return cur >= parseMinutes(slot.open) && cur < parseMinutes(slot.close);
}
