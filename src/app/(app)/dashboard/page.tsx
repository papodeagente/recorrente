"use client";

import { Card } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function DashboardPage() {
  const { data: tenant } = trpc.tenant.current.useQuery();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Visão geral</h1>
        <p className="text-sm text-zinc-500">
          {tenant?.businessName ?? "Negócio não configurado"} ·{" "}
          <span className="text-zinc-400">status: {tenant?.status}</span>
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Recorrências confirmadas", value: "—" },
          { label: "Vendas recuperadas", value: "—" },
          { label: "Indicações geradas", value: "—" },
          { label: "Faturamento atribuído", value: "—" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <div className="text-xs uppercase tracking-wide text-zinc-500">{kpi.label}</div>
            <div className="text-2xl font-semibold mt-2">{kpi.value}</div>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="font-semibold mb-2">Próximos passos</h2>
        <ul className="text-sm text-zinc-600 list-disc pl-5 space-y-1">
          <li>Cadastrar serviços no catálogo</li>
          <li>Configurar tom e horário do agente</li>
          <li>Conectar Z-API (se ainda não fez no onboarding)</li>
        </ul>
      </Card>
    </div>
  );
}
