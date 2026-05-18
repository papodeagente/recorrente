"use client";

import { useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function TarefasPage() {
  const { data: list, refetch } = trpc.tasks.list.useQuery({ status: "open" });
  const create = trpc.tasks.create.useMutation({
    onSuccess: () => {
      refetch();
      setForm({ title: "", dueAt: "" });
      setShow(false);
    },
  });
  const complete = trpc.tasks.complete.useMutation({ onSuccess: () => refetch() });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: "", dueAt: "" });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tarefas</h1>
          <p className="text-sm text-zinc-500">Lembretes do dia. Crie pelo painel ou pelo WhatsApp.</p>
        </div>
        <Button onClick={() => setShow((s) => !s)}>{show ? "Fechar" : "+ Tarefa"}</Button>
      </header>

      {show && (
        <Card>
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await create.mutateAsync({
                title: form.title,
                dueAt: form.dueAt ? new Date(form.dueAt) : null,
              });
            }}
          >
            <div className="col-span-2">
              <Field label="Tarefa"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            </div>
            <Field label="Vencimento"><Input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></Field>
            <div className="flex items-end justify-end">
              <Button type="submit" disabled={create.isPending}>Salvar</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {list?.map((t) => (
          <Card key={t.id} className="flex items-center justify-between">
            <div>
              <div className="font-medium">{t.title}</div>
              {t.dueAt && (
                <div className="text-xs text-zinc-500">
                  {new Date(t.dueAt).toLocaleString("pt-BR")}
                </div>
              )}
            </div>
            <button
              className="text-xs rounded-md bg-emerald-600 text-white px-3 py-2"
              onClick={() => complete.mutate({ id: t.id })}
            >
              Concluir
            </button>
          </Card>
        ))}
        {list && list.length === 0 && (
          <p className="text-sm text-zinc-500 px-2">Sem tarefas abertas.</p>
        )}
      </div>
    </div>
  );
}
