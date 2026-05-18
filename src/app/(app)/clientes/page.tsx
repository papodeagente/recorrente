"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

function brl(c: number): string {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ClientesPage() {
  const [search, setSearch] = useState("");
  const { data: list, refetch } = trpc.contacts.list.useQuery({ search });
  const create = trpc.contacts.create.useMutation({
    onSuccess: () => {
      refetch();
      setShow(false);
      setForm({ phone: "", name: "", email: "", notes: "" });
    },
  });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ phone: "", name: "", email: "", notes: "" });
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-zinc-500">Quem você atende. Cadastro automático via WhatsApp.</p>
        </div>
        <Button onClick={() => setShow((s) => !s)}>{show ? "Fechar" : "+ Cliente"}</Button>
      </header>

      <Input placeholder="Buscar por nome ou telefone…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {show && (
        <Card>
          <form
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
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
              } catch (ex) {
                setErr((ex as Error).message);
              }
            }}
          >
            <Field label="Telefone (E.164)" hint="+5511999990000">
              <Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Nome">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Notas">
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>
            {err && <p className="md:col-span-2 text-sm text-red-600">{err}</p>}
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando…" : "Salvar"}</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-2">
        {list?.map((c) => (
          <Link key={c.id} href={`/clientes/${c.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name || "(sem nome)"}</div>
                  <div className="text-xs text-zinc-500">{c.phone}</div>
                </div>
                <div className="text-right text-sm">
                  <div>{brl(c.totalSpentCents)}</div>
                  {c.totalDueCents > 0 && (
                    <div className="text-red-600 text-xs">{brl(c.totalDueCents)} em aberto</div>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        ))}
        {list && list.length === 0 && (
          <p className="text-sm text-zinc-500 px-2">
            Nenhum cliente ainda. Envie uma venda pelo WhatsApp ou cadastre acima.
          </p>
        )}
      </div>
    </div>
  );
}
