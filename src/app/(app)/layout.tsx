import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/server/auth/session";

const navItems = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/services", label: "Catálogo" },
  { href: "/settings", label: "Agente" },
  { href: "/templates", label: "Templates" },
];

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params?: { route?: string };
}) {
  void params;
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen grid grid-cols-[220px_1fr]">
      <aside className="border-r border-zinc-200 bg-white px-4 py-6 flex flex-col gap-1">
        <Link href="/" className="font-bold text-emerald-700 px-3 py-2 mb-2">
          RECORRENTE
        </Link>
        {navItems.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="text-sm rounded-md px-3 py-2 hover:bg-zinc-100"
          >
            {n.label}
          </Link>
        ))}
        {!session.tenantId && (
          <Link
            href="/onboarding"
            className="mt-auto text-xs rounded-md bg-amber-100 text-amber-900 px-3 py-2"
          >
            ⚠ Finalize o onboarding
          </Link>
        )}
      </aside>
      <main className="p-8">{children}</main>
    </div>
  );
}
