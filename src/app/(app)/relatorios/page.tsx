"use client";

import { useState } from "react";
import { Card } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

type Period = "today" | "week" | "month";

function brl(c: number): string {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function RelatoriosPage() {
  const [period, setPeriod] = useState<Period>("month");

  const cashflow = trpc.reports.cashflow.useQuery({ period });
  const topProducts = trpc.reports.topProducts.useQuery({ period });
  const topCustomers = trpc.reports.topCustomers.useQuery({ period });
  const expensesCat = trpc.reports.expensesByCategory.useQuery({ period });
  const salesByDay = trpc.reports.salesByDay.useQuery();

  const totalProd = topProducts.data?.reduce((a, p) => a + p.totalCents, 0) ?? 0;
  const totalCust = topCustomers.data?.reduce((a, c) => a + c.totalCents, 0) ?? 0;
  const totalExp = expensesCat.data?.reduce((a, c) => a + c.totalCents, 0) ?? 0;
  const maxSale = Math.max(1, ...(salesByDay.data?.map((s) => s.totalCents) ?? [1]));

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Resumo do dinheiro</h1>
          <p className="text-sm text-zinc-500">Como seu negócio está indo neste período.</p>
        </div>
        <div className="flex gap-1 text-xs bg-white border border-zinc-200 rounded-full p-1">
          {(["today", "week", "month"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-full ${period === p ? "bg-emerald-600 text-white" : "text-zinc-600"}`}
            >
              {p === "today" ? "Hoje" : p === "week" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </header>

      {/* Saldo */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <div className="text-[10px] uppercase text-zinc-500">Entrou</div>
          <div className="text-xl font-semibold text-emerald-700 mt-1">{brl(cashflow.data?.inCents ?? 0)}</div>
        </Card>
        <Card>
          <div className="text-[10px] uppercase text-zinc-500">Saiu</div>
          <div className="text-xl font-semibold text-red-700 mt-1">{brl(cashflow.data?.outCents ?? 0)}</div>
        </Card>
        <Card className={(cashflow.data?.balanceCents ?? 0) >= 0 ? "border-emerald-200" : "border-red-200"}>
          <div className="text-[10px] uppercase text-zinc-500">Saldo</div>
          <div className="text-xl font-semibold mt-1">{brl(cashflow.data?.balanceCents ?? 0)}</div>
        </Card>
      </div>

      {/* Vendas por dia — mini-chart por barras */}
      <Card>
        <h2 className="font-semibold mb-3">Vendas por dia (últimos 30 dias)</h2>
        {(salesByDay.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-zinc-500">Sem vendas no período.</p>
        ) : (
          <div className="space-y-1.5">
            {salesByDay.data?.map((s) => (
              <div key={s.day} className="flex items-center gap-2 text-xs">
                <div className="w-14 text-zinc-500">{dayLabel(s.day)}</div>
                <div className="flex-1 h-5 rounded bg-emerald-50 relative overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/70"
                    style={{ width: `${(s.totalCents / maxSale) * 100}%` }}
                  />
                </div>
                <div className="w-24 text-right font-medium">{brl(s.totalCents)}</div>
                <div className="w-10 text-right text-zinc-400">{s.count}x</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-semibold mb-3">Produtos mais vendidos</h2>
          {(topProducts.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">Sem vendas no período.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {topProducts.data?.map((p, i) => (
                <li key={`${p.description}-${i}`}>
                  <div className="flex justify-between mb-0.5">
                    <span className="truncate">{p.description}</span>
                    <span className="font-medium">{brl(p.totalCents)}</span>
                  </div>
                  <div className="h-1.5 rounded bg-zinc-100">
                    <div className="h-full rounded bg-emerald-500" style={{ width: `${(p.totalCents / Math.max(1, totalProd)) * 100}%` }} />
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{p.qty} unidade(s)</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold mb-3">Clientes que mais compram</h2>
          {(topCustomers.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">Sem clientes no período.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {topCustomers.data?.map((c) => (
                <li key={c.contactId}>
                  <div className="flex justify-between mb-0.5">
                    <span className="truncate">{c.name || c.phone}</span>
                    <span className="font-medium">{brl(c.totalCents)}</span>
                  </div>
                  <div className="h-1.5 rounded bg-zinc-100">
                    <div className="h-full rounded bg-emerald-500" style={{ width: `${(c.totalCents / Math.max(1, totalCust)) * 100}%` }} />
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{c.count} venda(s)</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold mb-3">Despesas por categoria</h2>
        {(expensesCat.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-zinc-500">Sem despesas no período.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {expensesCat.data?.map((c) => (
              <li key={c.categoryId ?? c.name}>
                <div className="flex justify-between mb-0.5">
                  <span>{c.name}</span>
                  <span className="font-medium">{brl(c.totalCents)}</span>
                </div>
                <div className="h-1.5 rounded bg-zinc-100">
                  <div className="h-full rounded bg-red-400" style={{ width: `${(c.totalCents / Math.max(1, totalExp)) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
