import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/server/auth/session";

const nav = [
  { href: "/dashboard", label: "Início", emoji: "🏠" },
  { href: "/clientes", label: "Clientes", emoji: "👥" },
  { href: "/vendas", label: "Vendas", emoji: "🧾" },
  { href: "/financeiro", label: "Financeiro", emoji: "💰" },
  { href: "/pendentes", label: "Pendentes IA", emoji: "⏳" },
  { href: "/produtos", label: "Produtos", emoji: "📦" },
  { href: "/tarefas", label: "Tarefas", emoji: "✅" },
  { href: "/ia", label: "WhatsApp IA", emoji: "💬" },
  { href: "/configuracoes", label: "Config", emoji: "⚙️" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen grid grid-rows-[auto_1fr] md:grid-rows-1 md:grid-cols-[220px_1fr] bg-zinc-50">
      {/* Sidebar (desktop) / Topbar (mobile) */}
      <aside className="border-b md:border-b-0 md:border-r border-zinc-200 bg-white">
        <div className="md:h-screen flex flex-col">
          <div className="px-4 py-4 flex items-center gap-2 border-b border-zinc-200">
            <span className="text-xl">📒</span>
            <Link href="/dashboard" className="font-bold text-emerald-700 tracking-tight">
              BOLSO
            </Link>
          </div>
          <nav className="flex md:flex-col gap-1 p-2 overflow-x-auto md:overflow-y-auto">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 hover:bg-zinc-100 whitespace-nowrap"
              >
                <span aria-hidden>{item.emoji}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
          {!session.tenantId && (
            <Link
              href="/onboarding"
              className="mx-2 mb-2 text-xs rounded-md bg-amber-100 text-amber-900 px-3 py-2"
            >
              ⚠ Finalize o cadastro
            </Link>
          )}
        </div>
      </aside>
      <main className="p-4 md:p-6 max-w-6xl w-full mx-auto">{children}</main>
    </div>
  );
}
