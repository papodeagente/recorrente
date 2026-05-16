"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const signup = trpc.auth.signup.useMutation({
    onSuccess: () => router.push("/onboarding"),
    onError: (e) => setErr(e.message),
  });

  return (
    <Card>
      <h1 className="text-xl font-semibold mb-1">Criar conta</h1>
      <p className="text-sm text-zinc-500 mb-4">3 campos. Próximo passo: cadastrar seu negócio.</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          signup.mutate({ name, email, password });
        }}
      >
        <Field label="Seu nome">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-mail">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha" hint="Mínimo 8 caracteres.">
          <Input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button type="submit" disabled={signup.isPending}>
          {signup.isPending ? "Criando…" : "Criar conta"}
        </Button>
      </form>
      <p className="mt-4 text-sm text-zinc-500">
        Já tem conta? <a href="/login" className="text-emerald-700 font-medium">Entrar</a>
      </p>
    </Card>
  );
}
