# RECORRENTE

> Agente de IA + CRM enxuto para pequenos negócios locais.
> Três pilares de receita: **Recorrência**, **Recuperação**, **Indicação**.
> O produto acontece no **WhatsApp**; a UI web só configura.

`RECORRENTE` é o codename. O nome comercial final ainda não foi decidido —
substituir via find/replace antes do primeiro deploy de produção.

---

## Pré-requisitos

- Node.js 22+
- [OrbStack](https://orbstack.dev) (recomendado no Mac) **ou** Docker Desktop
- Uma conta [Z-API](https://z-api.io) com pelo menos uma instância de teste
- Chave de API [Anthropic](https://console.anthropic.com) (Sonnet e Haiku)

---

## Setup local em 5 minutos

```bash
# 1. Variáveis
cp .env.example .env
# Edite ANTHROPIC_API_KEY e AUTH_SECRET (gere com `openssl rand -base64 32`)

# 2. Sobe Postgres + Redis + app + worker
docker compose up -d

# 3. Aplica o schema no banco
npm run db:migrate

# 4. Abre o painel
open http://localhost:3000
```

> **Sem Docker?** Você pode rodar `app` e `worker` no host:
> sobe só `docker compose up -d postgres redis`, depois `npm run dev` em um
> terminal e `npm run worker:dev` em outro.

### Scripts úteis

| Script                | O que faz                                                  |
| --------------------- | ---------------------------------------------------------- |
| `npm run dev`         | Next.js em modo dev (porta 3000)                           |
| `npm run worker:dev`  | Workers BullMQ com hot-reload (tsx watch)                  |
| `npm run typecheck`   | `tsc --noEmit`                                             |
| `npm run db:generate` | Gera migration nova a partir do schema Drizzle             |
| `npm run db:migrate`  | Aplica migrations pendentes                                |
| `npm run db:studio`   | Abre o Drizzle Studio                                      |

---

## Estrutura

```
src/
  app/                    Next.js App Router
    (auth)/               login, signup
    (app)/                área autenticada (dashboard, services, settings, templates, onboarding)
    api/
      trpc/[trpc]/        handler tRPC
      webhooks/zapi/      webhook Z-API resolvido por instanceId
  components/             UI shell + primitivas (button, input, card, field)
  lib/                    env, trpc client, cn()
  server/
    auth/                 password (bcrypt) + session (JWT em cookie)
    db/
      client.ts           drizzle + pg.Pool
      schema/             uma tabela por arquivo
    lib/
      tenant-context.ts   getTenantId, assertSameTenant, tenantDb() — INVARIANTE
      anthropic.ts        client Anthropic + modelos por finalidade
      zapi.ts             client Z-API (sendText, verifyWebhookToken)
      logger.ts           pino
    queues/               BullMQ — connection, registry de 6 filas
    trpc/
      init.ts             procedures base (public, protected, tenantRead, tenantWrite)
      routers/            auth, tenant, services, settings
workers/                  processo separado: roda os 6 workers BullMQ (stubs nesta fase)
drizzle/migrations/       SQL versionado
docs/
  schema_review.sql       SQL aprovado no gate da Fase 0
DECISOES_NEGOCIO.md       premissas congeladas da seção 3.2 do prompt fundacional
ARQUITETURA.md            diagramas + invariantes
```

---

## Invariantes não-negociáveis

1. **Toda tabela de negócio tem `tenant_id NOT NULL`.**
2. **Toda query Drizzle de tabela com `tenant_id` passa por `tenantDb(tenantId)`** — nunca chama `db` direto. Quem precisar de query crua usa `.raw` e documenta o motivo.
3. **Webhook Z-API resolve tenant por `instanceId`**, não por telefone.
4. **Workers rodam em processo separado do Next.js** (`workers/index.ts`).
5. **Toda mensagem outbound do agente para cliente novo termina com aviso LGPD** de opt-out.
6. **Agente nunca envia áudio/imagem nesta fase** — apenas texto.

Ver [ARQUITETURA.md](./ARQUITETURA.md) para o fluxo end-to-end.

---

## Deploy (Coolify)

- Servidor: a definir no momento do deploy (vai entrar como app + worker + Postgres + Redis no projeto **Agente de IA Negocios locais**).
- Use o `Dockerfile` (target `runner`) para o serviço web e `Dockerfile.worker` para o serviço de workers.
- Postgres e Redis como recursos gerenciados pelo Coolify.
- Variáveis: copie de `.env.example` e preencha com os tokens reais.

---

## Próximos prompts (não-objetivo desta fase)

Esta entrega é a **fundação**. Não tem lógica dos três pilares ainda.
Próximos prompts implementam:

1. Pilar **Recorrência** (job ao criar visit + envio agendado + confirmação)
2. Pilar **Recuperação** (cron diário + 3 tentativas + métrica de venda recuperada)
3. Pilar **Indicação** (gatilho pós-visita + recompensa)
4. Inbox de conversas (Socket.IO live)
5. Dashboard de métricas
6. Multi-usuário por tenant + billing
