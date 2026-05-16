# DECISÕES DE NEGÓCIO — RECORRENTE

> Codename: `RECORRENTE` (placeholder até o nome final ser decidido).
> Este arquivo congela as premissas que o schema, as filas e o agente assumem.
> Toda mudança aqui exige revisão de schema (gate da seção 3.3 do prompt fundacional).

---

## 1. Identidade e escopo do cliente

### 1.1 Um cliente pode pertencer a múltiplos tenants?
**Sim.** O mesmo telefone (`+5511999990000`) pode ser cliente de duas barbearias diferentes, e os registros são totalmente independentes.

**Implicação no schema:**
- `customers.phone` **não é único globalmente** — único apenas dentro do tenant.
- `UNIQUE(tenant_id, phone)` em `customers`.
- Queries de cliente *sempre* filtram por `tenant_id` antes de filtrar por `phone`.

### 1.2 Como o tenant identifica um cliente novo no primeiro contato?
**O agente coleta nome no primeiro fluxo de conversa.**
- Webhook recebe mensagem inbound de telefone que não existe em `customers` para aquele tenant → cria registro com `name = NULL`, `first_contact_at = NOW()`.
- O agente pergunta o nome na primeira interação útil. A resposta atualiza `customers.name`.
- Até ter o nome, o agente trata o cliente como "tudo bem?" / "oi!" — sem nome pessoal.

### 1.3 Fonte de verdade para "última visita"
**A tabela `visits`, sempre.**
- `customers.last_visit_at` é um cache desnormalizado, atualizado por trigger ou pelo serviço que insere em `visits`.
- Nenhuma decisão de produto pode usar `customers.last_visit_at` sem batimento contra `visits` em caso de dúvida.
- Recorrência, recovery e métricas leem de `visits`.

### 1.4 Definição de "venda recuperada" (para métrica)
**Visita registrada dentro de 14 dias após uma mensagem de `action_type = 'recovery_attempt'` ter sido enviada para esse cliente.**
- A `visits.recovered_from_task_id` aponta para o `scheduled_actions` que originou a recuperação.
- Janela de 14 dias é fixa nesta fase — não configurável por tenant.
- Se o cliente recebeu múltiplas tentativas de recovery, conta apenas a última enviada antes da visita.

### 1.5 Quem pode fazer follow-up: agente IA ou dono também?
**Ambos.** O dono pode mandar mensagem pela inbox a qualquer momento.
- Quando `messages.sender = 'owner'` é inserida, o agente fica pausado para aquela conversa por `tenant_settings.auto_pause_on_human_reply_hours` (default 6h).
- A pausa é **por conversa**, não por tenant.
- A pausa é representada por `conversations.last_human_message_at` + comparação no momento do envio (não por flag persistida, exceto `agent_paused_until` para handoff manual).

---

## 2. Premissas sobre os pilares

### 2.1 Recorrência
- Cada serviço (`service_catalog`) tem `recurrence_days` próprio. **Não há cadência por cliente** nesta fase.
- O job de recorrência é agendado **na criação da `visit`**, não em batch noturno.
- Se o cliente faz duas visitas em sequência (ex.: corte + barba), apenas a última agenda recorrência (a antiga é cancelada via `scheduled_actions.status = 'cancelled'`).

### 2.2 Recuperação
- O cron diário roda às **9h no timezone do tenant**.
- Para um cliente entrar em recovery, ele precisa: (a) `last_visit_at < hoje - service.recovery_after_days`, (b) **não ter** `scheduled_actions` pendente para esse cliente do tipo recovery.
- A escolha do serviço para o "recovery" usa o **último serviço consumido** pelo cliente naquele tenant.
- Máximo **3 tentativas**, espaçadas 7/14/21 dias. Após a terceira sem resposta, marcar como `lost` e parar.

### 2.3 Indicação
- Pedido de indicação dispara **2 dias após a visita concluída**, e **só** se a visita atual é `total_visits >= 2` no momento do pedido (não pedir para cliente novo).
- Consentimento do indicado é **implícito por indicação direta** — registrar no log que veio por indicação do cliente X.
- A primeira mensagem ao indicado também inclui aviso de opt-out LGPD (mesmo padrão do primeiro contato comum).
- Recompensa só é granted quando o indicado realiza a **primeira visita** dele (`referrals.status = 'rewarded'`, gravar `reward_granted_at`).

---

## 3. Premissas operacionais do agente

### 3.1 Hard stops (não-envio)
Lista canônica replicada da seção 7.1 do prompt fundacional, *para conferência cruzada*:
1. `customers.lgpd_opted_out_at IS NOT NULL`
2. Horário fora de `tenant_settings.business_hours` **(exceto** se for resposta a inbound do próprio cliente).
3. `messages.sender = 'owner'` recente (`< auto_pause_on_human_reply_hours` horas).
4. `conversations.agent_paused_until > NOW()`.
5. Já existe outbound do agente para esse cliente nas últimas 12h.
6. Cliente respondeu negativamente nas últimas 24h (classificação Haiku).

### 3.2 Auto-pause por handoff
- Pausa `agent_paused_until = NOW() + 24h` em qualquer um dos casos da seção 7.3 do prompt.
- **Notificação ao dono é obrigatória** — push (mobile) + flag visível na inbox web.

### 3.3 Modelos LLM por finalidade
- **Sonnet** — composição de mensagens de produção (recorrência, recovery, indicação, resposta livre).
- **Haiku** — classificações rápidas: detectar reclamação, opt-out implícito, intenção de fora-de-escopo, resposta negativa.

### 3.4 Logs do agente
- Toda decisão (enviar OU não enviar) cria linha em `agent_decisions`.
- Retenção 90 dias via job diário de purge.

---

## 4. Multi-tenant — invariante de isolamento

### 4.1 Resolução de tenant em entradas externas
- **Webhook Z-API**: tenant resolvido por `instanceId` da Z-API (path param `/api/webhooks/zapi/[instanceId]`). Telefone do cliente *não é* identificador de tenant.
- **tRPC**: `getTenantId(ctx)` lê do header `x-tenant-id` (ou cookie de sessão), valida que o usuário autenticado pertence ao tenant, e cacheia no contexto.

### 4.2 Lint/wrapper para escrita Drizzle
- **Decidido:** wrapper helper `tenantDb(tenantId).table(table).where(...)` que injeta o filtro automaticamente em SELECT/UPDATE/DELETE. PRs com Drizzle "raw" sem wrapper são bloqueadas por lint custom.
- Implementação concreta entra na fase de Fundação (seção 4.3 do prompt → `src/server/lib/tenant-context.ts`).

---

## 5. LGPD — premissas de implementação

- Primeiro outbound do agente para um cliente novo **sempre** termina com: *"Se preferir não receber mensagens, responda SAIR."*
- Palavras-chave de opt-out (case-insensitive, com tolerância a acentos): `SAIR`, `PARAR`, `REMOVER`, `CANCELAR`, `STOP`.
- Ao detectar opt-out: `customers.lgpd_opted_out_at = NOW()` + envio de uma única mensagem de confirmação ("Pronto, você não receberá mais mensagens desta conta. Para retornar, basta responder 'voltar'.").
- Endpoint de exclusão de dados: `/api/lgpd/request-deletion` — recebe telefone + tenant slug, dispara código de 6 dígitos via WhatsApp, cliente confirma, agente faz hard delete em até 72h.
- `tenant_settings.lgpd_data_controller_email` exibido no rodapé do primeiro template.

---

## 6. Pendências / decisões adiadas (não bloqueantes para Fase 0)

| Tema | Decisão adiada | Quando decidir |
|------|----------------|----------------|
| Nome comercial final | Usando `RECORRENTE` como placeholder | Antes do primeiro deploy em produção (find/replace global) |
| Validação Z-API | Pulada — credenciais "configuro depois" | Antes da primeira mensagem de teste end-to-end |
| Validação Anthropic | Pulada — chave "configuro depois" | Antes do primeiro `agent:reason` real |
| Multi-usuário por tenant | Fora de escopo desta fase | Próximo prompt fundacional após MVP |
| Billing | Fora de escopo desta fase | Após validação com primeiros clientes |
| Tabela `users` / `user_tenants` | Mínimas, criadas para suportar signup do entregável 8 | Pode ganhar campos depois conforme auth evolui |
