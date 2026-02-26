# AI Reply Flow (`POST /ai/reply`)

## Objetivo
Processar mensagens humanas de conversas IA e persistir a resposta real do agente (LLM) no mesmo thread (`chat_messages`), com anti-loop e idempotencia.

## Contrato
- Rotas: `POST /ai/reply` e `POST /api/v1/ai/reply`
- Auth:
  - `Authorization: Bearer <AI_INTERNAL_TOKEN>` ou
  - `x-signature: <WEBHOOK_SIGNING_SECRET>`

Body:
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
1. Valida isolamento: conversa deve existir e pertencer ao `unit_id`.
2. Conversa deve ser IA (`is_ai_agent = true`), senao `409`.
3. Anti-loop:
   - ignora quando `sender_name == ai_agent_name`
   - ignora quando `source == internal_ai`
4. Idempotencia forte em `ai_inbox` por `(unit_id, source, message_id)`.
5. Rejeita payload sem texto/anexo (`422`).
6. Isolamento multitenant em todas as leituras/escritas usando `unit_id`.

## Fluxo
1. Registra inbound em `ai_inbox` com status `received`.
2. Persiste mensagem de entrada do usuario em `chat_messages` (dedupe por `remote_id`).
3. Carrega janela de contexto da conversa (`AI_CONTEXT_WINDOW`).
4. Gera resposta via `AiResponder` (provider configurado).
5. Persiste resposta em `chat_messages`:
   - `sender_name = ai_agent_name`
   - `is_me = false`
   - `message_type = text`
   - `remote_id = ai:{conversation_id}:{message_id}`
6. Atualiza conversa (`last_message`, `unread_count + 1`, `updated_at`).
7. Marca `ai_inbox` como `done`.

## Provider real (Supabase)
Defina no ambiente:
- `DATA_PROVIDER=supabase`
- `SUPABASE_URL=https://<project>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<service_role>`
- `AI_PROVIDER=openai`
- `AI_PROVIDER_API_KEY=<token>`
- `AI_PROVIDER_MODEL=gpt-4o-mini` (ou outro)
- `AI_PROVIDER_BASE_URL=https://api.openai.com/v1`
- `AI_PROVIDER_MAX_RETRIES=1`

Com isso, os repositorios reais sao usados no lugar dos `InMemory...`.
