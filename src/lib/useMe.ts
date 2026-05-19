"use client";

import { trpc } from "./trpc";

type Perm =
  | "view_revenue"
  | "view_profit"
  | "view_expenses"
  | "view_reports"
  | "manage_users";

/**
 * Hook compartilhado: identidade do usuário no tenant ativo + permissões.
 * Antes do primeiro carregamento, retorna defaults conservadores (tudo true)
 * para evitar "flash de UI escondida". O backend faz a checagem real.
 */
export function useMe() {
  const me = trpc.auth.me.useQuery();
  const tenant = me.data?.tenant ?? null;
  const role = (tenant?.role ?? "owner") as "owner" | "manager" | "operator";
  const perms = (tenant?.permissions ?? null) as Record<Perm, boolean> | null;
  function can(p: Perm): boolean {
    if (!me.data) return true; // não bloqueia durante carregamento
    if (role === "owner") return true;
    return Boolean(perms?.[p]);
  }
  return {
    isLoading: me.isLoading,
    user: me.data?.user ?? null,
    tenant,
    role,
    can,
  };
}
