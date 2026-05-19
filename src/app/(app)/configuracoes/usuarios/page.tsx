"use client";

import { useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

type Role = "manager" | "operator";
const PERMS = [
  { key: "view_revenue", label: "Ver receita" },
  { key: "view_profit", label: "Ver lucro" },
  { key: "view_expenses", label: "Ver despesas" },
  { key: "view_reports", label: "Ver relatórios" },
  { key: "manage_users", label: "Gerenciar usuários" },
] as const;
type PermKey = (typeof PERMS)[number]["key"];

export default function UsuariosPage() {
  const { data: list, refetch } = trpc.users.list.useQuery();
  const add = trpc.users.addMember.useMutation({
    onSuccess: () => {
      refetch();
      setShow(false);
      setForm({ email: "", name: "", role: "operator", tempPassword: "" });
    },
  });
  const update = trpc.users.updateMember.useMutation({ onSuccess: () => refetch() });
  const remove = trpc.users.removeMember.useMutation({ onSuccess: () => refetch() });

  const [show, setShow] = useState(false);
  const [form, setForm] = useState<{ email: string; name: string; role: Role; tempPassword: string }>({
    email: "",
    name: "",
    role: "operator",
    tempPassword: "",
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usuários</h1>
          <p className="text-sm text-zinc-500">Quem mais acessa o BOLSO neste negócio.</p>
        </div>
        <Button onClick={() => setShow((s) => !s)}>{show ? "Fechar" : "+ Convidar"}</Button>
      </header>

      {show && (
        <Card>
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await add.mutateAsync({
                  email: form.email,
                  name: form.name || undefined,
                  role: form.role,
                  tempPassword: form.tempPassword || undefined,
                });
              } catch {}
            }}
          >
            <Field label="E-mail">
              <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Nome">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Papel">
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
              >
                <option value="operator">Operador (registra)</option>
                <option value="manager">Gerente (registra + vê tudo)</option>
              </select>
            </Field>
            <Field label="Senha temporária" hint="Mín. 8 caracteres — só usada se o e-mail ainda não existir.">
              <Input
                type="text"
                minLength={8}
                value={form.tempPassword}
                onChange={(e) => setForm({ ...form, tempPassword: e.target.value })}
              />
            </Field>
            {add.error && <p className="col-span-2 text-sm text-red-600">{add.error.message}</p>}
            <div className="col-span-2 flex justify-end">
              <Button type="submit" disabled={add.isPending}>
                {add.isPending ? "Adicionando…" : "Adicionar membro"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {list?.map((u) => (
          <MemberCard
            key={u.userId}
            user={u}
            onChangeRole={(r) => update.mutate({ userId: u.userId, role: r })}
            onTogglePerm={(p, v) => {
              const next = { ...(u.permissions ?? {}), [p]: v };
              update.mutate({ userId: u.userId, permissions: next });
            }}
            onRemove={() => {
              if (window.confirm(`Remover ${u.email}?`)) remove.mutate({ userId: u.userId });
            }}
          />
        ))}
        {list && list.length === 0 && (
          <p className="text-sm text-zinc-500 px-2">Só você por enquanto. Convide um operador ou gerente.</p>
        )}
      </div>
    </div>
  );
}

type Member = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  permissions: unknown;
};

function MemberCard({
  user,
  onChangeRole,
  onTogglePerm,
  onRemove,
}: {
  user: Member;
  onChangeRole: (r: Role) => void;
  onTogglePerm: (perm: PermKey, value: boolean) => void;
  onRemove: () => void;
}) {
  const isOwner = user.role === "owner";
  const perms = (user.permissions ?? {}) as Partial<Record<PermKey, boolean>>;
  const isOperator = user.role === "operator";

  function effective(p: PermKey): boolean {
    if (isOwner) return true;
    if (p in perms) return Boolean(perms[p]);
    // defaults: manager=true (exceto manage_users), operator=false
    if (user.role === "manager") return p !== "manage_users";
    return false;
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{user.name || user.email}</div>
          <div className="text-xs text-zinc-500">{user.email}</div>
        </div>
        <div className="flex items-center gap-2">
          {!isOwner && (
            <>
              <select
                value={user.role}
                onChange={(e) => onChangeRole(e.target.value as Role)}
                className="h-8 rounded-md border border-zinc-300 px-2 text-xs bg-white"
              >
                <option value="operator">Operador</option>
                <option value="manager">Gerente</option>
              </select>
              <button onClick={onRemove} className="text-xs text-red-600">remover</button>
            </>
          )}
          {isOwner && (
            <span className="text-xs uppercase rounded-full bg-emerald-100 text-emerald-800 px-2 py-1">Dono</span>
          )}
        </div>
      </div>

      {!isOwner && (
        <div className="mt-3 pt-3 border-t border-zinc-100 grid grid-cols-2 md:grid-cols-3 gap-2">
          {PERMS.map((p) => (
            <label key={p.key} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={effective(p.key)}
                disabled={isOperator && p.key === "manage_users"}
                onChange={(e) => onTogglePerm(p.key, e.target.checked)}
              />
              {p.label}
            </label>
          ))}
        </div>
      )}
    </Card>
  );
}
