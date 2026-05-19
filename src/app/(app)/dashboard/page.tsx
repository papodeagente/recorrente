"use client";

import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";
import { useMe } from "@/lib/useMe";

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function relTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24);
  return `${dd}d`;
}

export default function DashboardPage() {
  const { data: tenant } = trpc.tenant.current.useQuery();
  const { data: kpis } = trpc.dashboard.kpis.useQuery();
  const { data: msgs } = trpc.dashboard.recentMessages.useQuery();
  const { data: attention } = trpc.dashboard.attention.useQuery();
  const { can } = useMe();

  const greeting = `Olá. Seu negócio hoje${tenant?.name ? ` — ${tenant.name}` : ""}`;

  const cards = [
    can("view_revenue") && { label: "Vendido hoje", value: brl(kpis?.vendidoHojeCents ?? 0), hint: `${kpis?.vendasHojeCount ?? 0} venda(s)` },
    can("view_revenue") && { label: "Recebido hoje", value: brl(kpis?.recebidoHojeCents ?? 0) },
    can("view_revenue") && { label: "A receber hoje", value: brl(kpis?.aReceberHojeCents ?? 0) },
    can("view_revenue") && {
      label: "Em atraso",
      value: brl(kpis?.atrasadoCents ?? 0),
      hint: `${kpis?.atrasadoCount ?? 0} pessoa(s)`,
      bad: (kpis?.atrasadoCents ?? 0) > 0,
    },
    can("view_expenses") && { label: "A pagar hoje", value: brl(kpis?.aPagarHojeCents ?? 0), hint: `${kpis?.aPagarHojeCount ?? 0} conta(s)` },
    { label: "Pendências IA", value: String(kpis?.pendenciasIaCount ?? 0), hint: "aguardando confirmar" },
  ].filter(Boolean) as Array<{ label: string; value: string; hint?: string; bad?: boolean }>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
        <p className="text-sm text-zinc-500">
          Mande texto, áudio ou foto pelo WhatsApp — o BOLSO organiza o resto.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className={c.bad ? "border-red-200 bg-red-50" : ""}>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">{c.label}</div>
            <div className={`text-lg md:text-xl font-semibold mt-1 ${c.bad ? "text-red-700" : ""}`}>{c.value}</div>
            {c.hint && <div className="text-[11px] text-zinc-500 mt-0.5">{c.hint}</div>}
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <header className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Últimos registros pelo WhatsApp</h2>
            <Link href="/ia" className="text-xs text-emerald-700">ver todos →</Link>
          </header>
          {(msgs?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">
              Nenhuma mensagem ainda. Envie um áudio dizendo &quot;vendi um corte para João por 50 reais no Pix&quot;.
            </p>
          ) : (
            <ul className="space-y-2">
              {msgs?.map((m) => (
                <li key={m.id} className="text-sm border-l-2 border-emerald-200 pl-3">
                  <div className="text-xs text-zinc-500">
                    {m.direction === "inbound" ? "📥" : "📤"} {m.messageType} · {relTime(m.receivedAt)} · {m.processingStatus}
                  </div>
                  <div className="line-clamp-2">{m.transcription || m.rawContent || m.aiResponse || "(sem texto)"}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold mb-3">Precisa de atenção</h2>
          {!attention || (attention.overdueReceivables.length === 0 && attention.payableSoon.length === 0 && attention.pendingAi.length === 0) ? (
            <p className="text-sm text-zinc-500">Tudo em dia. 🙂</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {attention.overdueReceivables.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>{r.contactName ?? "(sem nome)"} deve</span>
                  <span className="font-medium text-red-700">{brl(Number(r.amount))}</span>
                </li>
              ))}
              {attention.payableSoon.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.supplier ?? p.description}</span>
                  <span className="font-medium">{brl(Number(p.amount))}</span>
                </li>
              ))}
              {attention.pendingAi.map((e) => (
                <li key={e.id}>
                  <Link href="/pendentes" className="text-emerald-700">
                    ⏳ IA aguardando confirmação ({e.intent})
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold mb-2">Atalhos</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/vendas?new=1" className="rounded-full bg-emerald-600 text-white px-4 py-2">+ Nova venda manual</Link>
          <Link href="/financeiro?tab=despesas&new=1" className="rounded-full border border-zinc-300 px-4 py-2">+ Despesa</Link>
          <Link href="/clientes?new=1" className="rounded-full border border-zinc-300 px-4 py-2">+ Cliente</Link>
          <Link href="/produtos?new=1" className="rounded-full border border-zinc-300 px-4 py-2">+ Produto</Link>
        </div>
        <p className="text-xs text-zinc-500 mt-3">
          Mas o mais rápido é mandar uma mensagem no WhatsApp 💬
        </p>
      </Card>
    </div>
  );
}
