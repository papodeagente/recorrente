"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const login = trpc.auth.login.useMutation({
    onSuccess: () => router.push("/"),
    onError: (e) => setErr(e.message),
  });

  return (
    <Card>
      <h1 className="text-xl font-semibold mb-1">Entrar no RECORRENTE</h1>
      <p className="text-sm text-zinc-500 mb-4">Use seu e-mail e senha.</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          login.mutate({ email, password });
        }}
      >
        <Field label="E-mail">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha">
          <Input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? "Entrando…" : "Entrar"}
        </Button>
      </form>
      <p className="mt-4 text-sm text-zinc-500">
        Sem conta? <a href="/signup" className="text-emerald-700 font-medium">Criar agora</a>
      </p>
    </Card>
  );
}
