import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/server/auth/session";

export default async function HomePage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  if (!session.tenantId) redirect("/onboarding");
  redirect("/dashboard");
}
