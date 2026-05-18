"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

type Tone = "amigavel" | "profissional" | "descolado";

export default function ConfiguracoesPage() {
  const { data, refetch } = trpc.settings.get.useQuery();
  const update = trpc.settings.update.useMutation({ onSuccess: () => refetch() });

  const [persona, setPersona] = useState("Assistente");
  const [tone, setTone] = useState<Tone>("amigavel");
  const [autoBelow, setAutoBelow] = useState(5000);
  const [alwaysAbove, setAlwaysAbove] = useState(50000);
  const [confirmNewCustomer, setConfirmNewCustomer] = useState(true);
  const [confirmReceipt, setConfirmReceipt] = useState(true);
  const [allowAudioAuto, setAllowAudioAuto] = useState(false);

  useEffect(() => {
    if (!data) return;
    setPersona(data.aiPersonaName);
    setTone(data.aiTone as Tone);
    setAutoBelow(Number(data.aiAutoConfirmBelowCents));
    setAlwaysAbove(Number(data.aiAlwaysConfirmAboveCents));
    setConfirmNewCustomer(data.aiAlwaysConfirmNewCustomer);
    setConfirmReceipt(data.aiAlwaysConfirmReceiptImage);
    setAllowAudioAuto(data.aiAllowAudioAutoCreate);
  }, [data]);

  return (
    <div className="space-y-4 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-zinc-500">Como a IA se comporta no seu negócio.</p>
      </header>

      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({
              aiPersonaName: persona,
              aiTone: tone,
              aiAutoConfirmBelowCents: autoBelow,
              aiAlwaysConfirmAboveCents: alwaysAbove,
              aiAlwaysConfirmNewCustomer: confirmNewCustomer,
              aiAlwaysConfirmReceiptImage: confirmReceipt,
              aiAllowAudioAutoCreate: allowAudioAuto,
            });
          }}
        >
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Nome do assistente">
              <Input value={persona} onChange={(e) => setPersona(e.target.value)} />
            </Field>
            <Field label="Tom de voz">
              <select className="h-10 rounded-md border border-zinc-300 px-3 text-sm" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                <option value="amigavel">Amigável</option>
                <option value="profissional">Profissional</option>
                <option value="descolado">Descolado</option>
              </select>
            </Field>
            <Field label="Lançar automaticamente até (centavos)">
              <Input type="number" min={0} value={autoBelow} onChange={(e) => setAutoBelow(Number(e.target.value))} />
            </Field>
            <Field label="Sempre confirmar acima de (centavos)">
              <Input type="number" min={0} value={alwaysAbove} onChange={(e) => setAlwaysAbove(Number(e.target.value))} />
            </Field>
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmNewCustomer} onChange={(e) => setConfirmNewCustomer(e.target.checked)} />
              Sempre confirmar quando for cliente novo
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmReceipt} onChange={(e) => setConfirmReceipt(e.target.checked)} />
              Sempre confirmar quando vier de foto (cupom)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowAudioAuto} onChange={(e) => setAllowAudioAuto(e.target.checked)} />
              Permitir lançamento automático por áudio
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={update.isPending}>{update.isPending ? "Salvando…" : "Salvar"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
