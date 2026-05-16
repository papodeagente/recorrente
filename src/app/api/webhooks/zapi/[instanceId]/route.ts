import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { tenants } from "@/server/db/schema";
import { logger } from "@/server/lib/logger";
import { verifyWebhookToken } from "@/server/lib/zapi";
import { getQueue, QUEUES } from "@/server/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { instanceId: string } };

export async function POST(req: Request, { params }: Params) {
  const { instanceId } = params;
  if (!instanceId) {
    return NextResponse.json({ error: "missing instance" }, { status: 400 });
  }

  const [tenant] = await db
    .select({
      id: tenants.id,
      clientToken: tenants.zapiClientToken,
      status: tenants.status,
    })
    .from(tenants)
    .where(eq(tenants.zapiInstanceId, instanceId))
    .limit(1);

  if (!tenant) {
    logger.warn({ instanceId }, "[webhook] unknown z-api instance");
    return NextResponse.json({ error: "unknown instance" }, { status: 404 });
  }

  const received = req.headers.get("Client-Token") ?? req.headers.get("client-token");
  if (!verifyWebhookToken(received, tenant.clientToken)) {
    logger.warn({ tenantId: tenant.id, instanceId }, "[webhook] invalid token");
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  if (tenant.status !== "active") {
    logger.info({ tenantId: tenant.id, status: tenant.status }, "[webhook] tenant not active, dropping");
    return NextResponse.json({ ok: true, dropped: true });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  await getQueue(QUEUES.whatsappInbound).add(
    "inbound",
    { tenantId: tenant.id, instanceId, payload, receivedAt: new Date().toISOString() },
    { jobId: `${tenant.id}:${(payload as { messageId?: string }).messageId ?? Date.now()}` },
  );

  return NextResponse.json({ ok: true });
}
