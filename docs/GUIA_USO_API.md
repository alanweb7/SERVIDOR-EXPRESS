# Guia de Uso da API (`servidor-api-rest`)

## Objetivo
Este guia mostra como usar a API no dia a dia e como corrigir o erro:

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Credencial interna invalida"
  }
}
```

## 1. Credenciais usadas pela API

A API tem **dois mecanismos de autenticação**:

1. Endpoints de webhook/mensageria HTTP pública:
- `POST /api/v1/webhooks/inbound`
- `POST /api/v1/messages/send`
- Header obrigatório: `x-signature: <WEBHOOK_SIGNING_SECRET>`

2. Endpoint interno de IA:
- `POST /ai/reply`
- `POST /api/v1/ai/reply`
- Header obrigatório: `Authorization: Bearer <AI_INTERNAL_TOKEN>`

### Variáveis no `.env`

```env
WEBHOOK_SIGNING_SECRET=change-me
AI_INTERNAL_TOKEN=change-me-ai-token
```

Se estas variáveis mudarem, reinicie a API para aplicar os novos valores.

## 2. Subir a API

### Local (Node)

```bash
cp .env.example .env
npm install
npm run dev
```

### Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
docker compose logs -f api
```

## 3. Testes rápidos com curl

### Health

```bash
curl -s http://localhost:3000/healthz
curl -s http://localhost:3000/readyz
```

### Webhook inbound (usa `x-signature`)

```bash
curl -s -X POST http://localhost:3000/api/v1/webhooks/inbound \
  -H "Content-Type: application/json" \
  -H "x-signature: change-me" \
  -d '{"messageId":"msg-1","payload":{"text":"hello"}}'
```

### Mensagem send (usa `x-signature`)

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/send \
  -H "Content-Type: application/json" \
  -H "x-signature: change-me" \
  -d '{"to":"+5511999999999","content":"Olá"}'
```

### AI reply (usa Bearer token interno)

```bash
curl -s -X POST http://localhost:3000/api/v1/ai/reply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer change-me-ai-token" \
  -d '{
    "unit_id":"unit-1",
    "conversation_id":"conv-ai-1",
    "message_id":"msg-human-1",
    "text":"Oi, agente",
    "sender_name":"Alan",
    "source":"internal_panel",
    "timestamp":"2026-03-04T12:00:00Z",
    "metadata":{"channel":"internal","attachments":[]}
  }'
```

## 4. Como corrigir `Credencial interna invalida`

Se retornar 401 com `Credencial interna invalida`, valide nesta ordem:

1. Você está chamando endpoint correto?
- Para IA: `/ai/reply` ou `/api/v1/ai/reply`.

2. O header está exatamente assim?
- `Authorization: Bearer <AI_INTERNAL_TOKEN>`
- Atenção para espaço depois de `Bearer`.

3. O valor enviado é igual ao `.env` do backend?
- Compare `AI_INTERNAL_TOKEN` do servidor com o token usado no cliente.

4. A API foi reiniciada após mudar `.env`?
- Sem restart, continua usando valor antigo.

5. Existe proxy removendo `Authorization`?
- Em alguns proxies/reverse proxies esse header pode ser descartado.

## 5. Integração com `chat-crm-v6`

No frontend, o serviço de chat usa:

- `VITE_API_BASE_URL`
- `VITE_AI_REPLY_ENDPOINT`
- `VITE_AI_INTERNAL_TOKEN`

Exemplo:

```env
VITE_API_BASE_URL=http://SEU_HOST:3000
VITE_AI_REPLY_ENDPOINT=/api/v1/ai/reply
VITE_AI_INTERNAL_TOKEN=mesmo_valor_do_AI_INTERNAL_TOKEN_do_backend
```

Para funcionar, `VITE_AI_INTERNAL_TOKEN` deve bater com `AI_INTERNAL_TOKEN` do `servidor-api-rest`.

## 6. Diagnóstico de erros comuns

1. `UNAUTHORIZED` + `Credencial interna invalida`
- Token ausente, inválido, ou diferente do backend.

2. `openclaw_unavailable`
- Variáveis OpenClaw não configuradas (`OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_AGENT_ID`) ou indisponibilidade do gateway.

3. `conversation_not_found`
- `conversation_id` não existe no provedor de dados configurado.

4. `not_ai_conversation`
- Conversa existe, mas não está marcada como IA (`is_ai_agent=false`).

## 7. Checklist de operação

1. `.env` preenchido e consistente.
2. API em execução (`/healthz` e `/readyz` OK).
3. Header correto por endpoint (`x-signature` ou `Authorization`).
4. Para IA, payload válido conforme contrato.
5. Logs da API acompanhados durante testes.