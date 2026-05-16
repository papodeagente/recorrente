"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function OnboardingPage() {
  const router = useRouter();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: tenants, refetch } = trpc.tenant.list.useQuery();
  const currentTenant = trpc.tenant.current.useQuery(undefined, {
    enabled: (tenants?.length ?? 0) > 0,
  });

  const create = trpc.tenant.create.useMutation({
    onSuccess: async () => {
      await refetch();
      await currentTenant.refetch();
    },
  });
  const connect = trpc.tenant.connectZapi.useMutation({
    onSuccess: () => router.push("/dashboard"),
  });

  const [step, setStep] = useState<"business" | "zapi">(tenants?.length ? "zapi" : "business");
  const [form, setForm] = useState({
    slug: "",
    businessName: "",
    businessType: "barbearia",
    lgpdEmail: me?.email ?? "",
  });
  const [zapi, setZapi] = useState({ instanceId: "", instanceToken: "", clientToken: "" });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Onboarding</h1>
        <p className="text-sm text-zinc-500">2 passos · menos de 5 minutos.</p>
      </header>

      {step === "business" && (
        <Card>
          <h2 className="font-semibold mb-4">1. Seu negócio</h2>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              await create.mutateAsync({
                slug: form.slug,
                businessName: form.businessName,
                businessType: form.businessType,
                lgpdDataControllerEmail: form.lgpdEmail || me?.email || "owner@example.com",
              });
              setStep("zapi");
            }}
          >
            <Field label="Nome do negócio">
              <Input
                required
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              />
            </Field>
            <Field label="Slug (URL)" hint="Letras minúsculas, números e hífen.">
              <Input
                required
                pattern="[a-z0-9-]+"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </Field>
            <Field label="Segmento">
              <Input
                required
                value={form.businessType}
                onChange={(e) => setForm({ ...form, businessType: e.target.value })}
              />
            </Field>
            <Field label="E-mail responsável LGPD" hint="Aparece no rodapé das mensagens iniciais.">
              <Input
                type="email"
                required
                value={form.lgpdEmail}
                onChange={(e) => setForm({ ...form, lgpdEmail: e.target.value })}
              />
            </Field>
            {create.error && <p className="text-sm text-red-600">{create.error.message}</p>}
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Criando…" : "Continuar"}
            </Button>
          </form>
        </Card>
      )}

      {step === "zapi" && (
        <Card>
          <h2 className="font-semibold mb-4">2. Conectar WhatsApp (Z-API)</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Crie uma instância em <a className="text-emerald-700" href="https://app.z-api.io" target="_blank">z-api.io</a> e cole os tokens abaixo.
          </p>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              connect.mutate({
                zapiInstanceId: zapi.instanceId,
                zapiInstanceToken: zapi.instanceToken,
                zapiClientToken: zapi.clientToken,
              });
            }}
          >
            <Field label="Instance ID">
              <Input required value={zapi.instanceId} onChange={(e) => setZapi({ ...zapi, instanceId: e.target.value })} />
            </Field>
            <Field label="Instance Token">
              <Input required value={zapi.instanceToken} onChange={(e) => setZapi({ ...zapi, instanceToken: e.target.value })} />
            </Field>
            <Field label="Client Token (Account)" hint="Usado para validar webhooks.">
              <Input required value={zapi.clientToken} onChange={(e) => setZapi({ ...zapi, clientToken: e.target.value })} />
            </Field>
            {connect.error && <p className="text-sm text-red-600">{connect.error.message}</p>}
            <Button type="submit" disabled={connect.isPending}>
              {connect.isPending ? "Conectando…" : "Conectar e ir para o painel"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
