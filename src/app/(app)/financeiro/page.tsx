"use client";

import { useState } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

type Tab = "receber" | "pagar" | "despesas" | "fluxo";

function brl(c: number): string {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FinanceiroPage() {
  const [tab, setTab] = useState<Tab>("receber");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Financeiro</h1>
        <p className="text-sm text-zinc-500">Dinheiro a receber, a pagar e despesas do dia.</p>
      </header>

      <div className="flex gap-2 border-b border-zinc-200 overflow-x-auto">
        {([
          ["receber", "A receber"],
          ["pagar", "A pagar"],
          ["despesas", "Despesas"],
          ["fluxo", "Fluxo de caixa"],
        ] as Array<[Tab, string]>).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${
              tab === key ? "border-emerald-600 text-emerald-700 font-medium" : "border-transparent text-zinc-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "receber" && <Receivables />}
      {tab === "pagar" && <Payables />}
      {tab === "despesas" && <Expenses />}
      {tab === "fluxo" && <CashFlow />}
    </div>
  );
}

function CashFlow() {
  const { data } = trpc.reports.cashflow.useQuery({ period: "month" });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Card><div className="text-[10px] uppercase text-zinc-500">Entrou no mês</div><div className="text-xl font-semibold text-emerald-700 mt-1">{brl(data?.inCents ?? 0)}</div></Card>
        <Card><div className="text-[10px] uppercase text-zinc-500">Saiu no mês</div><div className="text-xl font-semibold text-red-700 mt-1">{brl(data?.outCents ?? 0)}</div></Card>
        <Card className={(data?.balanceCents ?? 0) >= 0 ? "border-emerald-200" : "border-red-200"}>
          <div className="text-[10px] uppercase text-zinc-500">Saldo</div>
          <div className="text-xl font-semibold mt-1">{brl(data?.balanceCents ?? 0)}</div>
        </Card>
      </div>
      <Card>
        <h3 className="font-semibold mb-2">Últimas movimentações</h3>
        {(data?.recent.length ?? 0) === 0 ? (
          <p className="text-sm text-zinc-500">Sem movimentações ainda.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm">
            {data?.recent.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span>{p.direction === "in" ? "📥" : "📤"}</span>
                  <div className="min-w-0">
                    <div className="truncate">{p.notes || (p.direction === "in" ? "Entrada" : "Saída")}</div>
                    <div className="text-xs text-zinc-500">
                      {new Date(p.paidAt).toLocaleString("pt-BR")} · {p.paymentMethod ?? "—"} · {p.source}
                    </div>
                  </div>
                </div>
                <div className={`font-medium ${p.direction === "in" ? "text-emerald-700" : "text-red-700"}`}>
                  {p.direction === "in" ? "+" : "−"} {brl(p.amountCents)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Receivables() {
  const { data: list, refetch } = trpc.receivables.list.useQuery();
  const receive = trpc.receivables.receivePayment.useMutation({ onSuccess: () => refetch() });

  return (
    <div className="space-y-2">
      {list?.map((r) => (
        <Card key={r.id} className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="font-medium truncate">{r.contactName || r.description}</div>
            <div className="text-xs text-zinc-500">
              {brl(Number(r.amountReceivedCents))} de {brl(Number(r.amountCents))} ·{" "}
              {r.dueDate ? new Date(r.dueDate).toLocaleDateString("pt-BR") : "sem prazo"} · {r.status}
            </div>
          </div>
          {(r.status === "open" || r.status === "partial" || r.status === "overdue") && (
            <button
              className="text-xs rounded-md bg-emerald-600 text-white px-3 py-2"
              onClick={() => {
                if (confirm(`Confirmar recebimento de ${brl(Number(r.amountPendingCents))}?`)) {
                  receive.mutate({ id: r.id, amountCents: Number(r.amountPendingCents) });
                }
              }}
            >
              Recebido
            </button>
          )}
        </Card>
      ))}
      {list && list.length === 0 && <p className="text-sm text-zinc-500 px-2">Sem nada a receber agora 👏</p>}
    </div>
  );
}

function Payables() {
  const { data: list, refetch } = trpc.payables.list.useQuery();
  const pay = trpc.payables.markPaid.useMutation({ onSuccess: () => refetch() });
  const create = trpc.payables.create.useMutation({
    onSuccess: () => {
      refetch();
      setShow(false);
      setForm({ supplierName: "", description: "", amountCents: 0, dueDate: "" });
    },
  });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ supplierName: "", description: "", amountCents: 0, dueDate: "" });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setShow((s) => !s)}>{show ? "Fechar" : "+ Conta a pagar"}</Button>
      </div>
      {show && (
        <Card>
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await create.mutateAsync({
                supplierName: form.supplierName || undefined,
                description: form.description,
                amountCents: form.amountCents,
                dueDate: form.dueDate ? new Date(form.dueDate) : null,
              });
            }}
          >
            <Field label="Fornecedor"><Input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} /></Field>
            <Field label="Descrição"><Input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Valor (centavos)"><Input type="number" min={1} required value={form.amountCents} onChange={(e) => setForm({ ...form, amountCents: Number(e.target.value) })} /></Field>
            <Field label="Vencimento"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
            <div className="col-span-2 flex justify-end">
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando…" : "Salvar"}</Button>
            </div>
          </form>
        </Card>
      )}
      {list?.map((p) => (
        <Card key={p.id} className="flex items-center justify-between">
          <div>
            <div className="font-medium">{p.supplierName || p.description}</div>
            <div className="text-xs text-zinc-500">
              {brl(Number(p.amountCents))} ·{" "}
              {p.dueDate ? new Date(p.dueDate).toLocaleDateString("pt-BR") : "sem prazo"} · {p.status}
            </div>
          </div>
          {(p.status === "open" || p.status === "partial" || p.status === "overdue") && (
            <button
              className="text-xs rounded-md bg-emerald-600 text-white px-3 py-2"
              onClick={() => {
                if (confirm(`Marcar como pago (${brl(Number(p.amountCents) - Number(p.amountPaidCents))})?`)) {
                  pay.mutate({ id: p.id, amountCents: Number(p.amountCents) - Number(p.amountPaidCents) });
                }
              }}
            >
              Pago
            </button>
          )}
        </Card>
      ))}
      {list && list.length === 0 && <p className="text-sm text-zinc-500 px-2">Nenhuma conta pra pagar.</p>}
    </div>
  );
}

function Expenses() {
  const { data: list, refetch } = trpc.expenses.list.useQuery();
  const create = trpc.expenses.create.useMutation({
    onSuccess: () => {
      refetch();
      setShow(false);
      setForm({ supplierName: "", description: "", amountCents: 0, notes: "" });
    },
  });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ supplierName: "", description: "", amountCents: 0, notes: "" });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setShow((s) => !s)}>{show ? "Fechar" : "+ Despesa"}</Button>
      </div>
      {show && (
        <Card>
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await create.mutateAsync({
                supplierName: form.supplierName || undefined,
                description: form.description,
                amountCents: form.amountCents,
                expenseDate: new Date(),
                notes: form.notes || undefined,
              });
            }}
          >
            <Field label="Fornecedor"><Input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} /></Field>
            <Field label="Descrição"><Input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Valor (centavos)"><Input type="number" min={1} required value={form.amountCents} onChange={(e) => setForm({ ...form, amountCents: Number(e.target.value) })} /></Field>
            <div className="col-span-2">
              <Field label="Notas"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
            <div className="col-span-2 flex justify-end">
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando…" : "Salvar"}</Button>
            </div>
          </form>
        </Card>
      )}
      {list?.map((e) => (
        <Card key={e.id} className="flex items-center justify-between">
          <div>
            <div className="font-medium">{e.supplierName || e.description}</div>
            <div className="text-xs text-zinc-500">
              {new Date(e.expenseDate).toLocaleDateString("pt-BR")} · {e.status}
            </div>
          </div>
          <div className="text-lg font-semibold">{brl(Number(e.amountCents))}</div>
        </Card>
      ))}
      {list && list.length === 0 && <p className="text-sm text-zinc-500 px-2">Sem despesas registradas.</p>}
    </div>
  );
}
