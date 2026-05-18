"use client";

import { useState } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

function dtLocalInputValue(d: Date): string {
  // YYYY-MM-DDTHH:MM no fuso local — formato aceito por <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function VisitsPage() {
  const { data: customers } = trpc.customers.list.useQuery();
  const { data: services } = trpc.services.list.useQuery();
  const { data: visits, refetch } = trpc.visits.list.useQuery();
  const create = trpc.visits.create.useMutation({ onSuccess: () => refetch() });

  const [form, setForm] = useState({
    customerId: "",
    serviceId: "",
    visitedAt: dtLocalInputValue(new Date()),
    revenueCents: 0,
    notes: "",
  });
  const [show, setShow] = useState(false);
  const [scheduled, setScheduled] = useState<{ at: Date; id: string } | null>(null);

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Visitas</h1>
          <p className="text-sm text-zinc-500">
            Registrar uma visita dispara o agendamento da próxima recorrência automaticamente.
          </p>
        </div>
        <Button onClick={() => setShow((s) => !s)}>{show ? "Fechar" : "Registrar visita"}</Button>
      </header>

      {show && (
        <Card>
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!form.customerId || !form.serviceId) return;
              const res = await create.mutateAsync({
                customerId: form.customerId,
                serviceId: form.serviceId,
                visitedAt: new Date(form.visitedAt),
                revenueCents: form.revenueCents,
                notes: form.notes || undefined,
                recordedVia: "owner_manual",
              });
              setScheduled({ at: new Date(res.recurrenceFor), id: res.scheduledActionId });
              setShow(false);
            }}
          >
            <div className="col-span-2">
              <Field label="Cliente">
                <select
                  required
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                >
                  <option value="">Selecione…</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.phone} ({c.phone})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Serviço">
              <select
                required
                value={form.serviceId}
                onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
              >
                <option value="">Selecione…</option>
                {services?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.recurrenceDays}d)
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Data/hora">
              <Input
                type="datetime-local"
                required
                value={form.visitedAt}
                onChange={(e) => setForm({ ...form, visitedAt: e.target.value })}
              />
            </Field>
            <Field label="Receita (centavos)">
              <Input
                type="number"
                min={0}
                value={form.revenueCents}
                onChange={(e) => setForm({ ...form, revenueCents: Number(e.target.value) })}
              />
            </Field>
            <div className="col-span-2">
              <Field label="Notas">
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>
            {create.error && (
              <p className="col-span-2 text-sm text-red-600">{create.error.message}</p>
            )}
            <div className="col-span-2 flex justify-end">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Registrando…" : "Registrar visita"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {scheduled && (
        <Card className="border-emerald-300 bg-emerald-50">
          <p className="text-sm">
            ✅ Recorrência agendada para{" "}
            <strong>{scheduled.at.toLocaleString("pt-BR")}</strong>
            <span className="block text-xs text-zinc-500">
              scheduled_action: <code>{scheduled.id}</code>
            </span>
          </p>
        </Card>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase">Últimas</h2>
        {visits?.map((v) => (
          <Card key={v.id}>
            <div className="text-sm">
              {new Date(v.visitedAt).toLocaleString("pt-BR")} · R$ {(v.revenueCents / 100).toFixed(2)}{" "}
              · via <code>{v.recordedVia}</code>
            </div>
            {v.notes && <p className="text-xs text-zinc-600 mt-1">{v.notes}</p>}
          </Card>
        ))}
        {visits && visits.length === 0 && (
          <p className="text-sm text-zinc-500">Sem visitas. Registre a primeira.</p>
        )}
      </div>
    </div>
  );
}
