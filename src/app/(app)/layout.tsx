import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/server/auth/session";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  return <AppShell needsOnboarding={!session.tenantId}>{children}</AppShell>;
}
