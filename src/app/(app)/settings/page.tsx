"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

type Tone = "amigavel" | "profissional" | "descolado";
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const dayLabels: Record<DayKey, string> = {
  mon: "Segunda",
  tue: "Terça",
  wed: "Quarta",
  thu: "Quinta",
  fri: "Sexta",
  sat: "Sábado",
  sun: "Domingo",
};

type DayHours = { open: string; close: string } | null;
type BusinessHours = Record<DayKey, DayHours>;

const emptyHours: BusinessHours = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: { open: "09:00", close: "14:00" },
  sun: null,
};

export default function SettingsPage() {
  const { data, refetch } = trpc.settings.get.useQuery();
  const update = trpc.settings.update.useMutation({ onSuccess: () => refetch() });

  const [persona, setPersona] = useState("Assistente");
  const [tone, setTone] = useState<Tone>("amigavel");
  const [hours, setHours] = useState<BusinessHours>(emptyHours);
  const [pauseHours, setPauseHours] = useState(6);

  useEffect(() => {
    if (!data) return;
    setPersona(data.agentPersonaName);
    setTone(data.agentTone as Tone);
    setPauseHours(data.autoPauseOnHumanReplyHours);
    const raw = (data.businessHours ?? {}) as Partial<BusinessHours>;
    setHours({ ...emptyHours, ...raw } as BusinessHours);
  }, [data]);

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold">Agente</h1>
        <p className="text-sm text-zinc-500">Como o agente fala e quando ele pode falar.</p>
      </header>

      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({
              agentPersonaName: persona,
              agentTone: tone,
              businessHours: hours,
              autoPauseOnHumanReplyHours: pauseHours,
            });
          }}
        >
          <Field label="Nome do agente (persona)">
            <Input required value={persona} onChange={(e) => setPersona(e.target.value)} />
          </Field>

          <Field label="Tom">
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
            >
              <option value="amigavel">Amigável</option>
              <option value="profissional">Profissional</option>
              <option value="descolado">Descolado</option>
            </select>
          </Field>

          <div>
            <div className="text-sm font-medium text-zinc-700 mb-2">Horário de atendimento</div>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(dayLabels) as Array<DayKey>).map((d) => (
                <div key={d} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 w-28 text-sm">
                    <input
                      type="checkbox"
                      checked={hours[d] !== null}
                      onChange={(e) =>
                        setHours({ ...hours, [d]: e.target.checked ? { open: "09:00", close: "18:00" } : null })
                      }
                    />
                    {dayLabels[d]}
                  </label>
                  {hours[d] && (
                    <>
                      <input
                        type="time"
                        value={hours[d]!.open}
                        onChange={(e) => setHours({ ...hours, [d]: { ...hours[d]!, open: e.target.value } })}
                        className="h-8 rounded border border-zinc-300 px-2 text-sm"
                      />
                      <span className="text-zinc-400">→</span>
                      <input
                        type="time"
                        value={hours[d]!.close}
                        onChange={(e) => setHours({ ...hours, [d]: { ...hours[d]!, close: e.target.value } })}
                        className="h-8 rounded border border-zinc-300 px-2 text-sm"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Field
            label="Pausar agente após mensagem humana (horas)"
            hint="Quando o dono manda mensagem na inbox, o agente fica em silêncio por X horas naquela conversa."
          >
            <Input
              type="number"
              min={0}
              max={168}
              value={pauseHours}
              onChange={(e) => setPauseHours(Number(e.target.value))}
            />
          </Field>

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
