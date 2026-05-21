"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

const SEGMENTS: Array<{ key: string; label: string; emoji: string; desc: string }> = [
  { key: "delivery", label: "Delivery", emoji: "🛵", desc: "Marmita, lanche, entrega" },
  { key: "alimentacao", label: "Alimentação", emoji: "🍱", desc: "Lanchonete, marmitaria, food truck" },
  { key: "barbearia", label: "Barbearia", emoji: "💈", desc: "Corte, barba, combo" },
  { key: "beleza", label: "Beleza", emoji: "💅", desc: "Salão, manicure, sobrancelha" },
  { key: "estetica", label: "Estética", emoji: "✨", desc: "Limpeza, procedimentos" },
  { key: "loja", label: "Loja local", emoji: "🏪", desc: "Loja de bairro, produtos" },
  { key: "servico", label: "Serviço", emoji: "🔧", desc: "Autônomo, prestador" },
  { key: "outro", label: "Outro", emoji: "📦", desc: "Customizar depois" },
];

type Step = "business" | "products" | "zapi" | "done";

export default function OnboardingPage() {
  const router = useRouter();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: tenants, refetch: refetchTenants } = trpc.tenant.list.useQuery();
  const createTenant = trpc.tenant.create.useMutation({ onSuccess: () => refetchTenants() });
  const connect = trpc.tenant.connectZapi.useMutation({ onSuccess: () => setStep("done") });
  const tenantCurrent = trpc.tenant.current.useQuery(undefined, {
    enabled: (tenants?.length ?? 0) > 0,
  });

  const initial: Step = (tenants?.length ?? 0) > 0 ? (tenantCurrent.data?.zapiInstanceId ? "done" : "zapi") : "business";
  const [step, setStep] = useState<Step>(initial);

  const [biz, setBiz] = useState({
    name: "",
    segment: "delivery",
    lgpdEmail: "",
  });
  const [zapi, setZapi] = useState({ instanceId: "", instanceToken: "", clientToken: "" });

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Bem-vindo ao BOLSO</h1>
        <p className="text-sm text-zinc-500">
          3 passos curtos. Em menos de 5 minutos você está vendendo pelo WhatsApp.
        </p>
      </header>

      <Steps step={step} />

      {step === "business" && (
        <Card>
          <h2 className="font-semibold mb-3">1. Seu negócio</h2>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await createTenant.mutateAsync({
                name: biz.name,
                businessType: biz.segment as "delivery" | "alimentacao" | "barbearia" | "beleza" | "estetica" | "loja" | "servico" | "outro",
                lgpdDataControllerEmail: biz.lgpdEmail || me?.user?.email || "owner@example.com",
                seedProducts: true,
              });
              setStep("products");
            }}
          >
            <Field label="Nome do negócio" hint="Pode usar acentos e espaços normalmente.">
              <Input required value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} />
            </Field>
            <Field label="Segmento">
              <div className="grid grid-cols-2 gap-2">
                {SEGMENTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setBiz({ ...biz, segment: s.key })}
                    className={`text-left rounded-lg border p-3 ${
                      biz.segment === s.key ? "border-emerald-600 bg-emerald-50" : "border-zinc-200"
                    }`}
                  >
                    <div className="text-xl">{s.emoji}</div>
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-zinc-500">{s.desc}</div>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="E-mail responsável (LGPD)">
              <Input type="email" required value={biz.lgpdEmail || me?.user?.email || ""} onChange={(e) => setBiz({ ...biz, lgpdEmail: e.target.value })} />
            </Field>
            {createTenant.error && <p className="text-sm text-red-600">{createTenant.error.message}</p>}
            <Button type="submit" disabled={createTenant.isPending} className="w-full">
              {createTenant.isPending ? "Criando…" : "Continuar"}
            </Button>
          </form>
        </Card>
      )}

      {step === "products" && (
        <Card>
          <h2 className="font-semibold mb-2">2. Produtos e serviços</h2>
          <p className="text-sm text-zinc-500 mb-3">
            Já cadastramos uma base inicial baseada no seu segmento. Você ajusta depois.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => router.push("/produtos")}>Ver e editar produtos</Button>
            <Button onClick={() => setStep("zapi")}>Pular pra conectar WhatsApp →</Button>
          </div>
        </Card>
      )}

      {step === "zapi" && (
        <Card>
          <h2 className="font-semibold mb-2">3. Conectar WhatsApp (Z-API)</h2>
          <p className="text-sm text-zinc-500 mb-3">
            Crie uma instância em <a className="text-emerald-700" href="https://app.z-api.io" target="_blank">z-api.io</a> e cole os tokens.
          </p>
          <form
            className="space-y-3"
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
            <Field label="Client Token (Account)" hint="Z-API envia este header em cada webhook — usamos pra validar.">
              <Input required value={zapi.clientToken} onChange={(e) => setZapi({ ...zapi, clientToken: e.target.value })} />
            </Field>
            {connect.error && <p className="text-sm text-red-600">{connect.error.message}</p>}
            <Button type="submit" disabled={connect.isPending} className="w-full">
              {connect.isPending ? "Conectando…" : "Conectar e ir pro painel"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => router.push("/dashboard")}>
              Configurar depois
            </Button>
          </form>
        </Card>
      )}

      {step === "done" && (
        <Card className="border-emerald-300 bg-emerald-50">
          <h2 className="font-semibold">Tudo pronto!</h2>
          <p className="text-sm">
            Agora envie pelo WhatsApp: <em>&quot;vendi um corte para João por 50 reais no Pix&quot;</em>.
          </p>
          <div className="mt-3">
            <Button onClick={() => router.push("/dashboard")}>Ir pro painel</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const order: Step[] = ["business", "products", "zapi", "done"];
  const labels: Record<Step, string> = {
    business: "Negócio",
    products: "Produtos",
    zapi: "WhatsApp",
    done: "Pronto",
  };
  return (
    <ol className="flex gap-1 text-xs">
      {order.slice(0, 3).map((s, i) => {
        const active = order.indexOf(step) >= i;
        return (
          <li key={s} className={`flex-1 rounded-full h-1.5 ${active ? "bg-emerald-600" : "bg-zinc-200"}`}>
            <span className="sr-only">{labels[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}
