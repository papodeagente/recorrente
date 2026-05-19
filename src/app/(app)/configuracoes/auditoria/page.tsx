"use client";

import { useState } from "react";
import { Card } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

const ENTITY_TYPES = [
  { key: "", label: "Todos" },
  { key: "sale", label: "Vendas" },
  { key: "expense", label: "Despesas" },
  { key: "payment", label: "Pagamentos" },
  { key: "receivable", label: "A receber" },
  { key: "payable", label: "A pagar" },
  { key: "contact", label: "Clientes" },
  { key: "task", label: "Tarefas" },
  { key: "user_tenant", label: "Usuários" },
];

const ACTOR_COLORS: Record<string, string> = {
  user: "bg-blue-100 text-blue-800",
  ai: "bg-purple-100 text-purple-800",
  system: "bg-zinc-100 text-zinc-700",
};

const ACTION_LABELS: Record<string, string> = {
  create: "criou",
  update: "atualizou",
  delete: "removeu",
  cancel: "cancelou",
  execute: "executou",
};

export default function AuditoriaPage() {
  const [entityType, setEntityType] = useState<string>("");
  const [actorType, setActorType] = useState<string>("");

  const { data: list } = trpc.audit.list.useQuery({
    entityType: entityType || undefined,
    actorType: (actorType as "user" | "ai" | "system") || undefined,
    daysBack: 14,
    limit: 200,
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="text-sm text-zinc-500">Tudo o que aconteceu nos últimos 14 dias.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="h-9 rounded-md border border-zinc-300 px-2 text-sm bg-white"
        >
          {ENTITY_TYPES.map((e) => (
            <option key={e.key} value={e.key}>{e.label}</option>
          ))}
        </select>
        <select
          value={actorType}
          onChange={(e) => setActorType(e.target.value)}
          className="h-9 rounded-md border border-zinc-300 px-2 text-sm bg-white"
        >
          <option value="">Quem fez (todos)</option>
          <option value="user">Pessoa</option>
          <option value="ai">IA</option>
          <option value="system">Sistema</option>
        </select>
      </div>

      <div className="space-y-2">
        {list?.map((r) => (
          <Card key={r.id} className="py-3">
            <div className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${ACTOR_COLORS[r.actorType] ?? "bg-zinc-100"}`}>
                    {r.actorType}
                  </span>
                  <span className="text-zinc-700">
                    {r.userName || r.userEmail || (r.actorType === "ai" ? "IA" : "Sistema")}{" "}
                    <strong>{ACTION_LABELS[r.action] ?? r.action}</strong>{" "}
                    <code className="text-xs bg-zinc-50 px-1.5 py-0.5 rounded">{r.entityType}</code>
                  </span>
                </div>
                {(r.newValue || r.reason) && (
                  <pre className="text-[11px] text-zinc-600 bg-zinc-50 rounded p-2 overflow-x-auto">
                    {r.reason ? `motivo: ${r.reason}\n` : ""}
                    {r.newValue ? JSON.stringify(r.newValue, null, 2) : ""}
                  </pre>
                )}
              </div>
              <div className="text-xs text-zinc-500 whitespace-nowrap">
                {new Date(r.createdAt).toLocaleString("pt-BR")}
              </div>
            </div>
          </Card>
        ))}
        {list && list.length === 0 && (
          <p className="text-sm text-zinc-500 px-2">Nada para mostrar com esses filtros.</p>
        )}
      </div>
    </div>
  );
}
