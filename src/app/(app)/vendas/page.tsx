"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

type ItemForm = { description: string; quantity: number; unitPriceCents: number; productId: string | null };

function brl(c: number): string {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function VendasPage() {
  const { data: list, refetch } = trpc.sales.list.useQuery();
  const { data: contacts } = trpc.contacts.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();
  const create = trpc.sales.create.useMutation({
    onSuccess: () => {
      refetch();
      setShow(false);
      resetForm();
    },
  });
  const cancel = trpc.sales.cancel.useMutation({ onSuccess: () => refetch() });

  const [show, setShow] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemForm[]>([
    { description: "", quantity: 1, unitPriceCents: 0, productId: null },
  ]);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paidAmountCents, setPaidAmountCents] = useState(0);
  const [notes, setNotes] = useState("");

  function resetForm() {
    setItems([{ description: "", quantity: 1, unitPriceCents: 0, productId: null }]);
    setPaidAmountCents(0);
    setNotes("");
    setContactId(null);
  }

  const total = items.reduce((a, it) => a + it.unitPriceCents * it.quantity, 0);

  function EmptyState() {
    return (
      <Card className="text-center py-10">
        <div className="text-3xl mb-2">🧾</div>
        <p className="text-sm text-zinc-600 mb-3">Nenhuma venda registrada ainda.</p>
        <p className="text-xs text-zinc-500">
          Envie um áudio no WhatsApp: <em>&quot;vendi um corte para João por 50 no Pix&quot;</em><br/>
          ou cadastre acima.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vendas</h1>
          <p className="text-sm text-zinc-500">Manual ou via WhatsApp — tudo cai aqui.</p>
        </div>
        <Button onClick={() => setShow((s) => !s)}>{show ? "Fechar" : "+ Nova venda"}</Button>
      </header>

      {show && (
        <Card>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (items.length === 0 || items.every((i) => !i.description)) return;
              await create.mutateAsync({
                contactId,
                items: items
                  .filter((i) => i.description)
                  .map((i) => ({
                    description: i.description,
                    quantity: i.quantity,
                    unitPriceCents: i.unitPriceCents,
                    totalPriceCents: i.unitPriceCents * i.quantity,
                    productId: i.productId,
                  })),
                paidAmountCents,
                paymentMethod,
                discountCents: 0,
                saleDate: new Date(),
                notes: notes || undefined,
              });
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Cliente">
                <select
                  value={contactId ?? ""}
                  onChange={(e) => setContactId(e.target.value || null)}
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                >
                  <option value="">— sem cliente —</option>
                  {contacts?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.phone}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pagamento">
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                >
                  <option value="cash">Dinheiro</option>
                  <option value="pix">Pix</option>
                  <option value="card_debit">Cartão débito</option>
                  <option value="card_credit">Cartão crédito</option>
                  <option value="transfer">Transferência</option>
                  <option value="boleto">Boleto</option>
                </select>
              </Field>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-zinc-700">Itens</div>
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <select
                    className="col-span-4 h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm"
                    value={it.productId ?? ""}
                    onChange={(e) => {
                      const pid = e.target.value || null;
                      const p = products?.find((pp) => pp.id === pid);
                      const next = [...items];
                      next[idx] = {
                        ...it,
                        productId: pid,
                        description: p?.name ?? it.description,
                        unitPriceCents: p?.defaultPriceCents ?? it.unitPriceCents,
                      };
                      setItems(next);
                    }}
                  >
                    <option value="">— produto —</option>
                    {products?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="col-span-4 h-10 rounded-md border border-zinc-300 px-2 text-sm"
                    placeholder="Descrição"
                    value={it.description}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...it, description: e.target.value };
                      setItems(next);
                    }}
                  />
                  <input
                    className="col-span-2 h-10 rounded-md border border-zinc-300 px-2 text-sm"
                    placeholder="Qtd"
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...it, quantity: Number(e.target.value) || 1 };
                      setItems(next);
                    }}
                  />
                  <input
                    className="col-span-2 h-10 rounded-md border border-zinc-300 px-2 text-sm"
                    placeholder="Centavos"
                    type="number"
                    min={0}
                    value={it.unitPriceCents}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...it, unitPriceCents: Number(e.target.value) || 0 };
                      setItems(next);
                    }}
                  />
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-emerald-700"
                onClick={() => setItems([...items, { description: "", quantity: 1, unitPriceCents: 0, productId: null }])}
              >
                + adicionar item
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Total" hint="(automático)">
                <Input value={brl(total)} disabled />
              </Field>
              <Field label="Pago agora (centavos)">
                <Input
                  type="number"
                  min={0}
                  value={paidAmountCents}
                  onChange={(e) => setPaidAmountCents(Number(e.target.value) || 0)}
                />
              </Field>
            </div>
            <Field label="Observação">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            {create.error && <p className="text-sm text-red-600">{create.error.message}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando…" : "Registrar venda"}</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {list?.map((s) => (
          <Link key={s.id} href={`/vendas/${s.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{s.contactName || "(sem cliente)"}</div>
                  <div className="text-xs text-zinc-500">
                    {new Date(s.saleDate).toLocaleString("pt-BR")} · {s.source} · {s.paymentStatus}
                    {Number(s.pendingAmountCents) > 0 && (
                      <span className="text-red-700"> · {brl(Number(s.pendingAmountCents))} em aberto</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{brl(Number(s.totalAmountCents))}</div>
                  {s.saleStatus !== "cancelled" && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        if (window.confirm("Cancelar venda?")) cancel.mutate({ id: s.id });
                      }}
                      className="text-xs text-red-600"
                    >
                      cancelar
                    </button>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        ))}
        {list && list.length === 0 && <EmptyState />}
      </div>
    </div>
  );
}
