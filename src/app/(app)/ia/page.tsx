"use client";

import { Card } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

const STATUS_LABELS: Record<string, string> = {
  received: "Recebida",
  processing: "Processando",
  interpreted: "Interpretada",
  launched: "Lançada",
  pending_confirmation: "Aguardando confirmação",
  error: "Erro",
  ignored: "Ignorada",
  responded: "Respondida",
};

const STATUS_COLORS: Record<string, string> = {
  launched: "bg-emerald-100 text-emerald-800",
  responded: "bg-emerald-100 text-emerald-800",
  pending_confirmation: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-700",
  received: "bg-zinc-100 text-zinc-700",
  processing: "bg-zinc-100 text-zinc-700",
};

export default function IaPage() {
  const { data: list } = trpc.ai.messages.useQuery({ limit: 50 });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">WhatsApp IA</h1>
        <p className="text-sm text-zinc-500">
          Tudo que chegou e o que a IA entendeu. Áudio é transcrito, foto é lida por OCR.
        </p>
      </header>

      <div className="space-y-2">
        {list?.map((m) => (
          <Card key={m.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                  <span>{m.direction === "inbound" ? "📥" : "📤"} {m.messageType}</span>
                  <span>·</span>
                  <span>{new Date(m.receivedAt).toLocaleString("pt-BR")}</span>
                  <span>·</span>
                  <span>{m.fromNumber}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap">
                  {m.transcription || m.rawContent || "(mídia sem texto)"}
                </div>
                {m.aiResponse && (
                  <div className="mt-2 text-xs text-zinc-600 border-l-2 border-emerald-300 pl-2">
                    <span className="font-medium">IA respondeu:</span> {m.aiResponse}
                  </div>
                )}
              </div>
              <span className={`text-[10px] uppercase px-2 py-1 rounded ${STATUS_COLORS[m.processingStatus] ?? "bg-zinc-100 text-zinc-700"}`}>
                {STATUS_LABELS[m.processingStatus] ?? m.processingStatus}
              </span>
            </div>
          </Card>
        ))}
        {list && list.length === 0 && (
          <p className="text-sm text-zinc-500 px-2">
            Sem mensagens ainda. Quando alguém escrever pro seu WhatsApp, aparece aqui.
          </p>
        )}
      </div>
    </div>
  );
}
