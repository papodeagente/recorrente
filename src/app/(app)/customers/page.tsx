"use client";

import { useState } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const { data: list, refetch } = trpc.customers.list.useQuery({ search });
  const create = trpc.customers.create.useMutation({
    onSuccess: () => {
      refetch();
      setShow(false);
    },
  });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ phone: "", name: "", email: "", notes: "" });
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-zinc-500">Quem o agente atende.</p>
        </div>
        <Button onClick={() => setShow((s) => !s)}>{show ? "Fechar" : "Novo cliente"}</Button>
      </header>

      <Input
        placeholder="Buscar por nome ou telefone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {show && (
        <Card>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              try {
                await create.mutateAsync({
                  phone: form.phone,
                  name: form.name || undefined,
                  email: form.email || undefined,
                  notes: form.notes || undefined,
                });
                setForm({ phone: "", name: "", email: "", notes: "" });
              } catch (ex) {
                setErr((ex as Error).message);
              }
            }}
          >
            <Field label="Telefone (E.164)" hint="Ex.: +5511999990000">
              <Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Nome">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Notas">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </form>
        </Card>
      )}

      <div className="grid gap-2">
        {list?.map((c) => (
          <Card key={c.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{c.name || "(sem nome)"}</div>
                <div className="text-xs text-zinc-500">
                  {c.phone} · {c.totalVisits} visita(s)
                  {c.lastVisitAt && (
                    <> · última {new Date(c.lastVisitAt).toLocaleDateString("pt-BR")}</>
                  )}
                  {c.lgpdOptedOutAt && <> · <span className="text-red-600">opt-out LGPD</span></>}
                </div>
              </div>
            </div>
          </Card>
        ))}
        {list && list.length === 0 && (
          <p className="text-sm text-zinc-500">Nenhum cliente. Cadastre o primeiro ou aguarde os webhooks da Z-API.</p>
        )}
      </div>
    </div>
  );
}
