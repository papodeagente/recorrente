"use client";

import Link from "next/link";
import { use } from "react";
import { Button, Card } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

function brl(c: number): string {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, string> = {
  registered: "Registrada",
  awaiting_payment: "Aguardando pagamento",
  partially_paid: "Parcialmente paga",
  paid: "Paga",
  cancelled: "Cancelada",
};

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "📱 WhatsApp",
  manual: "✋ Manual",
  import: "📥 Importada",
  system: "⚙️ Sistema",
};

export default function VendaDetalhePage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const { data, refetch } = trpc.sales.byId.useQuery({ id });
  const cancel = trpc.sales.cancel.useMutation({ onSuccess: () => refetch() });

  if (!data) return <p className="text-sm text-zinc-500">Carregando…</p>;
  const { sale, items, contact, payments, receivables } = data;
  const isCancelled = sale.saleStatus === "cancelled";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/vendas" className="text-emerald-700">← Vendas</Link>
        <span className="text-zinc-300">/</span>
        <span className="text-zinc-500">Detalhe</span>
      </div>

      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{contact?.name || "(sem cliente)"}</h1>
          <p className="text-sm text-zinc-500">
            {new Date(sale.saleDate).toLocaleString("pt-BR")} · {SOURCE_LABELS[sale.source] ?? sale.source} · {STATUS_LABELS[sale.saleStatus] ?? sale.saleStatus}
          </p>
        </div>
        {!isCancelled && (
          <Button
            variant="ghost"
            onClick={() => {
              const reason = window.prompt("Motivo do cancelamento (opcional)") ?? "";
              cancel.mutate({ id: sale.id, reason: reason || undefined });
            }}
          >
            Cancelar venda
          </Button>
        )}
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Card><div className="text-[10px] uppercase text-zinc-500">Total</div><div className="text-xl font-semibold mt-1">{brl(sale.totalAmountCents)}</div></Card>
        <Card><div className="text-[10px] uppercase text-zinc-500">Pago</div><div className="text-xl font-semibold mt-1 text-emerald-700">{brl(sale.paidAmountCents)}</div></Card>
        <Card><div className="text-[10px] uppercase text-zinc-500">Em aberto</div><div className={`text-xl font-semibold mt-1 ${sale.pendingAmountCents > 0 ? "text-red-700" : ""}`}>{brl(sale.pendingAmountCents)}</div></Card>
      </div>

      <Card>
        <h2 className="font-semibold mb-3">Itens</h2>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">Sem itens.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-100">
                <th className="pb-2">Descrição</th>
                <th className="pb-2 text-right">Qtd</th>
                <th className="pb-2 text-right">Unit.</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-zinc-50">
                  <td className="py-2">{it.description}</td>
                  <td className="py-2 text-right">{Number(it.quantity)}</td>
                  <td className="py-2 text-right">{brl(it.unitPriceCents)}</td>
                  <td className="py-2 text-right font-medium">{brl(it.totalPriceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">Pagamentos</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="py-2 flex justify-between">
                <span>{new Date(p.paidAt).toLocaleString("pt-BR")} · {p.paymentMethod ?? "—"}</span>
                <span className="font-medium text-emerald-700">{brl(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {receivables.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-3">A receber</h2>
          <ul className="divide-y divide-zinc-100 text-sm">
            {receivables.map((r) => (
              <li key={r.id} className="py-2 flex justify-between">
                <span>
                  {r.description}{r.dueDate ? ` · vence ${new Date(r.dueDate).toLocaleDateString("pt-BR")}` : ""} · {r.status}
                </span>
                <span className="font-medium text-red-700">{brl(r.amountPendingCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sale.notes && (
        <Card>
          <h2 className="font-semibold mb-1">Observação</h2>
          <p className="text-sm whitespace-pre-wrap">{sale.notes}</p>
        </Card>
      )}

      {isCancelled && sale.cancelledReason && (
        <Card className="border-red-200 bg-red-50">
          <h2 className="font-semibold mb-1 text-red-700">Cancelada</h2>
          <p className="text-sm">Motivo: {sale.cancelledReason}</p>
        </Card>
      )}
    </div>
  );
}
