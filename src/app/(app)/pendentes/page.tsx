"use client";

import { Card, Button } from "@/components/ui/primitives";
import { trpc } from "@/lib/trpc";

export default function PendentesPage() {
  const { data: list, refetch } = trpc.ai.pendingList.useQuery();
  const confirmMut = trpc.ai.confirm.useMutation({ onSuccess: () => refetch() });
  const rejectMut = trpc.ai.reject.useMutation({ onSuccess: () => refetch() });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Pendências da IA</h1>
        <p className="text-sm text-zinc-500">
          O agente identificou uma intenção mas pediu sua confirmação antes de lançar.
        </p>
      </header>

      <div className="space-y-3">
        {list?.map((e) => (
          <Card key={e.id}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium">{intentLabel(e.intent)}</div>
                <div className="text-xs text-zinc-500">
                  Origem: {e.sourceType} · Confiança: {Math.round(Number(e.confidence) * 100)}% ·{" "}
                  {new Date(e.createdAt).toLocaleString("pt-BR")}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm("Rejeitar?")) rejectMut.mutate({ id: e.id });
                  }}
                >
                  Rejeitar
                </Button>
                <Button
                  size="sm"
                  onClick={() => confirmMut.mutate({ id: e.id })}
                  disabled={confirmMut.isPending}
                >
                  Confirmar e lançar
                </Button>
              </div>
            </div>
            <details className="text-xs text-zinc-600">
              <summary className="cursor-pointer">Ver dados extraídos</summary>
              <pre className="mt-2 bg-zinc-50 rounded p-2 overflow-x-auto text-[11px]">
                {JSON.stringify(e.extractedJson, null, 2)}
              </pre>
            </details>
          </Card>
        ))}
        {list && list.length === 0 && (
          <p className="text-sm text-zinc-500 px-2">
            Sem pendências. Tudo que a IA entendeu com confiança foi lançado.
          </p>
        )}
      </div>
    </div>
  );
}

function intentLabel(i: string): string {
  const map: Record<string, string> = {
    register_sale: "Venda",
    register_expense: "Despesa",
    register_payable: "Conta a pagar",
    register_receivable: "Conta a receber",
    register_payment_received: "Pagamento recebido",
    register_payment_made: "Pagamento feito",
    create_contact: "Novo cliente",
    update_contact: "Atualizar cliente",
    create_task: "Tarefa",
    correct_last: "Correção",
    cancel_last: "Cancelamento",
    add_note: "Observação",
    other: "Outro",
    unknown: "Sem certeza",
  };
  return map[i] ?? i;
}
