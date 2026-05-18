"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";

const SIDEBAR = [
  { href: "/dashboard", label: "Início", emoji: "🏠" },
  { href: "/clientes", label: "Clientes", emoji: "👥" },
  { href: "/vendas", label: "Vendas", emoji: "🧾" },
  { href: "/financeiro", label: "Financeiro", emoji: "💰" },
  { href: "/pendentes", label: "Pendentes IA", emoji: "⏳" },
  { href: "/relatorios", label: "Relatórios", emoji: "📊" },
  { href: "/produtos", label: "Produtos", emoji: "📦" },
  { href: "/tarefas", label: "Tarefas", emoji: "✅" },
  { href: "/ia", label: "WhatsApp IA", emoji: "💬" },
  { href: "/configuracoes", label: "Config", emoji: "⚙️" },
];

// 5 abas principais no mobile bottom-nav
const MOBILE_TABS = [
  { href: "/dashboard", label: "Início", emoji: "🏠" },
  { href: "/vendas", label: "Vendas", emoji: "🧾" },
  { href: "/financeiro", label: "Dinheiro", emoji: "💰" },
  { href: "/clientes", label: "Clientes", emoji: "👥" },
  { href: "/ia", label: "WhatsApp", emoji: "💬" },
];

const QUICK_ACTIONS = [
  { href: "/vendas", label: "Nova venda", emoji: "🧾" },
  { href: "/financeiro", label: "Nova despesa", emoji: "💸" },
  { href: "/clientes", label: "Novo cliente", emoji: "👤" },
  { href: "/tarefas", label: "Nova tarefa", emoji: "✅" },
];

export function AppShell({
  children,
  needsOnboarding,
}: {
  children: React.ReactNode;
  needsOnboarding: boolean;
}) {
  const pathname = usePathname() ?? "";
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-zinc-50">
      {/* Sidebar — desktop apenas */}
      <aside className="hidden md:flex md:flex-col w-[220px] border-r border-zinc-200 bg-white">
        <div className="px-4 py-4 flex items-center gap-2 border-b border-zinc-200">
          <span className="text-xl">📒</span>
          <Link href="/dashboard" className="font-bold text-emerald-700 tracking-tight">
            BOLSO
          </Link>
        </div>
        <nav className="flex-1 flex flex-col gap-1 p-2 overflow-y-auto">
          {SIDEBAR.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 text-sm rounded-lg px-3 py-2 whitespace-nowrap",
                  active ? "bg-emerald-50 text-emerald-700 font-medium" : "hover:bg-zinc-100",
                )}
              >
                <span aria-hidden>{item.emoji}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        {needsOnboarding && (
          <Link
            href="/onboarding"
            className="mx-2 mb-2 text-xs rounded-md bg-amber-100 text-amber-900 px-3 py-2"
          >
            ⚠ Finalize o cadastro
          </Link>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar mobile */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-zinc-200">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-emerald-700">
            <span>📒</span> BOLSO
          </Link>
          {needsOnboarding && (
            <Link href="/onboarding" className="text-xs rounded-full bg-amber-100 text-amber-900 px-3 py-1">
              Continuar setup
            </Link>
          )}
        </header>

        {/* Conteúdo */}
        <main className="flex-1 p-4 md:p-6 max-w-6xl w-full md:mx-auto pb-24 md:pb-6">
          {children}
        </main>

        {/* Bottom-nav mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 grid grid-cols-5 z-30">
          {MOBILE_TABS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center py-2 text-[10px] gap-0.5",
                  active ? "text-emerald-700" : "text-zinc-500",
                )}
              >
                <span className="text-xl leading-none">{item.emoji}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* FAB mobile */}
        <div className="md:hidden fixed right-4 bottom-20 z-40">
          {fabOpen && (
            <div className="mb-2 flex flex-col items-end gap-2">
              {QUICK_ACTIONS.map((q) => (
                <Link
                  key={q.label}
                  href={q.href}
                  onClick={() => setFabOpen(false)}
                  className="flex items-center gap-2 bg-white border border-zinc-200 shadow-md rounded-full px-3 py-2 text-sm"
                >
                  <span>{q.emoji}</span> {q.label}
                </Link>
              ))}
            </div>
          )}
          <button
            onClick={() => setFabOpen((s) => !s)}
            className={cn(
              "h-14 w-14 rounded-full shadow-lg flex items-center justify-center text-2xl",
              fabOpen ? "bg-zinc-900 text-white rotate-45" : "bg-emerald-600 text-white",
            )}
            aria-label="Registrar"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
