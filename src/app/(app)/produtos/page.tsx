"use client";

import { useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function ProdutosPage() {
  const { data: list, refetch } = trpc.products.list.useQuery();
  const create = trpc.products.create.useMutation({
    onSuccess: () => {
      refetch();
      setForm({ name: "", type: "product", defaultPriceCents: 0, aliases: "" });
      setShow(false);
    },
  });
  const remove = trpc.products.remove.useMutation({ onSuccess: () => refetch() });

  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "product" as "product" | "service",
    defaultPriceCents: 0,
    aliases: "",
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Produtos e serviços</h1>
          <p className="text-sm text-zinc-500">
            Cadastre aqui o que você vende. Os apelidos ajudam a IA a reconhecer no áudio.
          </p>
        </div>
        <Button onClick={() => setShow((s) => !s)}>{show ? "Fechar" : "+ Produto"}</Button>
      </header>

      {show && (
        <Card>
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await create.mutateAsync({
                name: form.name,
                type: form.type,
                defaultPriceCents: form.defaultPriceCents,
                aliases: form.aliases
                  ? form.aliases.split(",").map((s) => s.trim()).filter(Boolean)
                  : [],
              });
            }}
          >
            <Field label="Nome"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Tipo">
              <select className="h-10 rounded-md border border-zinc-300 px-3 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}>
                <option value="product">Produto</option>
                <option value="service">Serviço</option>
              </select>
            </Field>
            <Field label="Preço (centavos)"><Input type="number" min={0} value={form.defaultPriceCents} onChange={(e) => setForm({ ...form, defaultPriceCents: Number(e.target.value) })} /></Field>
            <Field label="Apelidos" hint='separados por vírgula: "quentinha, marmitex"'>
              <Input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
            </Field>
            <div className="col-span-2 flex justify-end">
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando…" : "Salvar"}</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-2">
        {list?.map((p) => (
          <Card key={p.id} className="flex justify-between items-start">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-zinc-500">
                {p.type} · R$ {(p.defaultPriceCents / 100).toFixed(2)}
                {p.aliases.length > 0 && <> · apelidos: {p.aliases.join(", ")}</>}
              </div>
            </div>
            <button
              className="text-xs text-red-600"
              onClick={() => {
                if (confirm(`Remover ${p.name}?`)) remove.mutate({ id: p.id });
              }}
            >
              remover
            </button>
          </Card>
        ))}
        {list && list.length === 0 && (
          <p className="text-sm text-zinc-500 px-2">Sem produtos cadastrados.</p>
        )}
      </div>
    </div>
  );
}
