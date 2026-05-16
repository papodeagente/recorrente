"use client";

import { useState } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function ServicesPage() {
  const { data: services, refetch } = trpc.services.list.useQuery();
  const create = trpc.services.create.useMutation({ onSuccess: () => refetch() });
  const remove = trpc.services.remove.useMutation({ onSuccess: () => refetch() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    priceCents: 0,
    durationMinutes: 30,
    recurrenceDays: 30,
    recoveryAfterDays: 45,
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Catálogo de serviços</h1>
          <p className="text-sm text-zinc-500">Cada serviço define sua própria cadência.</p>
        </div>
        <Button onClick={() => setOpen((s) => !s)}>{open ? "Fechar" : "Novo serviço"}</Button>
      </header>

      {open && (
        <Card>
          <form
            className="grid grid-cols-2 gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              await create.mutateAsync(form);
              setForm({ ...form, name: "", description: "" });
              setOpen(false);
            }}
          >
            <div className="col-span-2">
              <Field label="Nome">
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Descrição">
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Preço (centavos)">
              <Input
                type="number"
                min={0}
                value={form.priceCents}
                onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })}
              />
            </Field>
            <Field label="Duração (min)">
              <Input
                type="number"
                min={1}
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
              />
            </Field>
            <Field label="Cadência (dias)" hint="Quando o agente sugere reagendar.">
              <Input
                type="number"
                min={1}
                value={form.recurrenceDays}
                onChange={(e) => setForm({ ...form, recurrenceDays: Number(e.target.value) })}
              />
            </Field>
            <Field label="Recovery após (dias)" hint="Quando o cliente vira 'atrasado'.">
              <Input
                type="number"
                min={1}
                value={form.recoveryAfterDays}
                onChange={(e) => setForm({ ...form, recoveryAfterDays: Number(e.target.value) })}
              />
            </Field>
            <div className="col-span-2 flex justify-end">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-3">
        {services?.map((s) => (
          <Card key={s.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-zinc-500">
                  R$ {(s.priceCents / 100).toFixed(2)} · {s.durationMinutes}min · recorrência {s.recurrenceDays}d · recovery {s.recoveryAfterDays}d
                </div>
                {s.description && <p className="text-sm text-zinc-600 mt-2">{s.description}</p>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Remover ${s.name}?`)) remove.mutate({ id: s.id });
                }}
              >
                Remover
              </Button>
            </div>
          </Card>
        ))}
        {services?.length === 0 && (
          <p className="text-sm text-zinc-500">Nenhum serviço ainda. Cadastre o primeiro para começar.</p>
        )}
      </div>
    </div>
  );
}
