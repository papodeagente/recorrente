"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

const STATUS_LABEL: Record<string, string> = {
  setup: "Aguardando configurar",
  active: "Conectado",
  paused: "Pausado",
  cancelled: "Cancelado",
};

export default function ConfigWhatsappPage() {
  const { data: tenant, refetch } = trpc.tenant.current.useQuery();
  const connect = trpc.tenant.connectZapi.useMutation({ onSuccess: () => refetch() });

  const [form, setForm] = useState({ instanceId: "", instanceToken: "", clientToken: "" });
  useEffect(() => {
    if (!tenant) return;
    setForm({
      instanceId: tenant.zapiInstanceId ?? "",
      instanceToken: tenant.zapiInstanceToken ?? "",
      clientToken: tenant.zapiClientToken ?? "",
    });
  }, [tenant]);

  const webhookUrl = tenant?.zapiInstanceId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/zapi/${tenant.zapiInstanceId}`
    : null;

  return (
    <div className="space-y-4 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold">WhatsApp</h1>
        <p className="text-sm text-zinc-500">
          Status:{" "}
          <span className={tenant?.status === "active" ? "text-emerald-700" : "text-zinc-700"}>
            {STATUS_LABEL[tenant?.status ?? "setup"]}
          </span>
        </p>
      </header>

      {webhookUrl && (
        <Card className="border-emerald-200 bg-emerald-50">
          <h2 className="font-semibold mb-1">URL do webhook</h2>
          <p className="text-xs text-zinc-700 mb-2">
            Cole esta URL no painel da Z-API → On message received:
          </p>
          <code className="block text-[11px] bg-white border border-emerald-200 rounded p-2 break-all">
            {webhookUrl}
          </code>
          <p className="text-xs text-zinc-500 mt-2">
            Cabeçalho obrigatório: <code>Client-Token: &lt;seu client token&gt;</code>
          </p>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold mb-3">Tokens Z-API</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            connect.mutate({
              zapiInstanceId: form.instanceId,
              zapiInstanceToken: form.instanceToken,
              zapiClientToken: form.clientToken,
            });
          }}
        >
          <Field label="Instance ID">
            <Input required value={form.instanceId} onChange={(e) => setForm({ ...form, instanceId: e.target.value })} />
          </Field>
          <Field label="Instance Token">
            <Input required value={form.instanceToken} onChange={(e) => setForm({ ...form, instanceToken: e.target.value })} />
          </Field>
          <Field label="Client Token (Account)" hint="Cabeçalho enviado pela Z-API em todo webhook.">
            <Input required value={form.clientToken} onChange={(e) => setForm({ ...form, clientToken: e.target.value })} />
          </Field>
          {connect.error && <p className="text-sm text-red-600">{connect.error.message}</p>}
          <Button type="submit" disabled={connect.isPending}>
            {connect.isPending ? "Salvando…" : "Salvar e ativar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
