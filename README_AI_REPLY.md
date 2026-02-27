# AI Reply Flow (`POST /ai/reply`)

## Objetivo
Orquestrar autenticacao, persistencia e dispatch no backend Fastify, delegando a geracao da resposta exclusivamente ao agente Nolan no OpenClaw Gateway via WebSocket.

## Arquitetura
Evolution API / Chat CRM
-> Fastify (`/ai/reply` inbound)
-> OpenClaw (Nolan Neo)
-> Fastify (persist + dispatch outbound)
-> Evolution API / Chat CRM

## Contrato
- Rotas: `POST /ai/reply` e `POST /api/v1/ai/reply`
- Auth:
  - `Authorization: Bearer <AI_INTERNAL_TOKEN>`

Body obrigatorio:
```json
{
  "unit_id": "uuid",
  "conversation_id": "uuid",
  "message_id": "uuid-ou-string",
  "text": "mensagem",
  "sender_name": "Operador",
  "source": "internal_panel",
  "timestamp": "2026-02-26T18:00:00Z",
  "metadata": { "channel": "internal", "attachments": [] }
}
```

## Regras implementadas
1. Isolamento por `unit_id` em todas as consultas e escritas.
2. Idempotencia por `(unit_id, message_id)` em `ai_inbox`.
3. Conversa precisa existir em `chat_conversations` e estar marcada como IA.
4. Sem geracao local/template no caminho principal.
5. Erros atualizam `ai_inbox` com `status=failed`, `attempts` e `error` sanitizado.

## Fluxo
1. Autentica request interno.
2. Valida payload e contexto da conversa.
3. Persiste inbound em `ai_inbox(status=received)` e `chat_messages(is_me=false)`.
4. Resolve contexto (ultimas `AI_CONTEXT_WINDOW` mensagens).
5. Chama OpenClaw para gerar a resposta do Nolan.
6. Persiste outbound em `chat_messages(is_me=true)`.
7. Atualiza conversa e `ai_inbox(status=processed, output_message_id, attempts)`.
8. Dispara outbound para o canal via dispatcher (`ai.reply.dispatch`).
9. Retorna `delivery_mode` para diagnostico (`ws` ou `fallback-cli`).

## Configuracao obrigatoria
- `DATA_PROVIDER=supabase`
- `SUPABASE_URL=https://<project>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<service_role>`
- `OPENCLAW_GATEWAY_URL=ws://openclaw:18789`
- `OPENCLAW_GATEWAY_TOKEN=<token-interno>`
- `OPENCLAW_AGENT_ID=<agent-id-do-nolan>`
- `OPENCLAW_SESSION_DEFAULT=agent:main:main`
- `OPENCLAW_DEVICE_ID=lab-api-main`
- `OPENCLAW_DEVICE_IDENTITY_PATH=/app/.openclaw/device-identity.json`
- `OPENCLAW_ENABLE_FALLBACK_CLI=true|false`
- `OPENCLAW_FALLBACK_CONTAINER=openclaw-cvsy-openclaw-1`
- `OPENCLAW_CONNECT_TIMEOUT_MS=15000`
- `OPENCLAW_DEBUG=false`
- `AI_TRANSIENT_MAX_RETRIES=1`

## Observabilidade
Logs estruturados com:
- `request_id`, `unit_id`, `conversation_id`, `message_id`
- `provider=openclaw`
- `phase` em `auth|validate|persist_in|resolve_context|openclaw_call|persist_out|dispatch_out`
