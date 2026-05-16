"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Textarea } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function TemplatesPage() {
  const { data, refetch } = trpc.settings.get.useQuery();
  const update = trpc.settings.update.useMutation({ onSuccess: () => refetch() });

  const [recovery, setRecovery] = useState("");
  const [referral, setReferral] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!data) return;
    setRecovery(data.recoveryMessageTemplate ?? "");
    setReferral(data.referralRewardText ?? "");
    setEnabled(data.referralEnabled);
  }, [data]);

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold">Templates de mensagem</h1>
        <p className="text-sm text-zinc-500">
          Tudo que o agente envia parte daqui. Variáveis disponíveis: <code>{"{{nome}}"}</code>,{" "}
          <code>{"{{servico}}"}</code>, <code>{"{{ultima_visita}}"}</code>.
        </p>
      </header>

      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({
              recoveryMessageTemplate: recovery || null,
              referralRewardText: referral || null,
              referralEnabled: enabled,
            });
          }}
        >
          <Field
            label="Recovery (recuperação)"
            hint="Template-base para a 1ª tentativa de recovery. 2ª e 3ª são geradas pelo agente."
          >
            <Textarea
              rows={4}
              value={recovery}
              placeholder="Oi {{nome}}, faz tempo que a gente não se vê! Seu {{servico}} costuma ser a cada 30 dias e já passou de {{ultima_visita}}…"
              onChange={(e) => setRecovery(e.target.value)}
            />
          </Field>

          <Field
            label="Recompensa de indicação"
            hint="Texto curto descrevendo o benefício para quem indica."
          >
            <Textarea
              rows={3}
              value={referral}
              placeholder="Cada amigo que vier por você ganha R$ 20 de desconto na primeira visita — e você ganha o mesmo."
              onChange={(e) => setReferral(e.target.value)}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Pedir indicação após visita concluída
          </label>

          <div className="flex justify-end">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
