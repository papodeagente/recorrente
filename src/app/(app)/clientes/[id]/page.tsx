"use client";

import { use } from "react";
import { Card } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

function brl(c: number): string {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ClienteDetalhePage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const { data: contact } = trpc.contacts.byId.useQuery({ id });
  const { data: salesList } = trpc.sales.list.useQuery({ contactId: id, limit: 50 });

  if (!contact) return <p className="text-sm text-zinc-500">Carregando…</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{contact.name || "(sem nome)"}</h1>
        <p className="text-sm text-zinc-500">{contact.phone}{contact.email ? ` · ${contact.email}` : ""}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><div className="text-xs text-zinc-500">Total comprado</div><div className="text-xl font-semibold">{brl(contact.totalSpentCents)}</div></Card>
        <Card><div className="text-xs text-zinc-500">Em aberto</div><div className="text-xl font-semibold text-red-700">{brl(contact.totalDueCents)}</div></Card>
        <Card><div className="text-xs text-zinc-500">Última compra</div><div className="text-sm font-semibold">{contact.lastPurchaseAt ? new Date(contact.lastPurchaseAt).toLocaleDateString("pt-BR") : "—"}</div></Card>
        <Card><div className="text-xs text-zinc-500">LGPD opt-out</div><div className="text-sm font-semibold">{contact.lgpdOptedOutAt ? "Sim" : "Não"}</div></Card>
      </div>

      {contact.notes && (
        <Card><h2 className="text-sm font-semibold mb-1">Notas</h2><p className="text-sm whitespace-pre-wrap">{contact.notes}</p></Card>
      )}

      <Card>
        <h2 className="font-semibold mb-3">Vendas</h2>
        {(salesList?.length ?? 0) === 0 ? (
          <p className="text-sm text-zinc-500">Sem vendas ainda.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {salesList?.map((s) => (
              <li key={s.id} className="py-2 flex justify-between text-sm">
                <span>{new Date(s.saleDate).toLocaleDateString("pt-BR")} · {s.paymentStatus}</span>
                <span className="font-medium">{brl(Number(s.totalAmountCents))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
