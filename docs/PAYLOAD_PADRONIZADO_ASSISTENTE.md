# Payload Padronizado para Assistente

## Endpoint
- `POST /api/v1/webhooks/inbound`

## Autenticacao
- Header obrigatorio: `x-signature: <WEBHOOK_SIGNING_SECRET>`
- Header recomendado: `Content-Type: application/json`

## Contrato padrao

```json
{
  "session_id": "string",
  "user_id": "string",
  "channel": "whatsapp|telegram|webchat|etc",
  "message_id": "string",
  "timestamp": "ISO-8601",
  "message_type": "text|image|audio|video|document",
  "message": "string",
  "media": {
    "url": "string|null",
    "mime_type": "string|null",
    "caption": "string|null",
    "filename": "string|null",
    "duration_sec": "number|null"
  },
  "metadata": {
    "provider": "evolution|...",
    "instance": "string",
    "raw_event": {}
  }
}
```

## Regras de uso
- Sempre enviar `message_type`.
- Para `text`: preencher `message` e enviar `media.url = null`.
- Para `image|audio|video|document`: preencher `media.url` e `media.mime_type`.
- Para imagem com legenda: usar `media.caption` (e opcionalmente repetir em `message`).
- Para audio sem transcricao: usar `message` vazio ou `"[audio recebido]"`.
- Nao usar chaves por tipo (`imageUrl`, `audioUrl`, etc). Sempre `media.url`.

## Exemplo de uso (texto)

```bash
curl -s -X POST http://localhost:3000/api/v1/webhooks/inbound \
  -H "Content-Type: application/json" \
  -H "x-signature: change-me" \
  -d '{
    "session_id":"inst-1:5511999999999",
    "user_id":"5511999999999",
    "channel":"whatsapp",
    "message_id":"msg-text-001",
    "timestamp":"2026-03-05T18:00:00Z",
    "message_type":"text",
    "message":"Oi, tudo bem?",
    "media":{
      "url":null,
      "mime_type":null,
      "caption":null,
      "filename":null,
      "duration_sec":null
    },
    "metadata":{
      "provider":"evolution",
      "instance":"inst-1",
      "raw_event":{}
    }
  }'
```

## Exemplo de uso (imagem + legenda)

```bash
curl -s -X POST http://localhost:3000/api/v1/webhooks/inbound \
  -H "Content-Type: application/json" \
  -H "x-signature: change-me" \
  -d '{
    "session_id":"inst-1:5511999999999",
    "user_id":"5511999999999",
    "channel":"whatsapp",
    "message_id":"msg-image-001",
    "timestamp":"2026-03-05T18:01:00Z",
    "message_type":"image",
    "message":"segue a foto",
    "media":{
      "url":"https://cdn.exemplo.com/midia/foto.jpg",
      "mime_type":"image/jpeg",
      "caption":"segue a foto",
      "filename":"foto.jpg",
      "duration_sec":null
    },
    "metadata":{
      "provider":"evolution",
      "instance":"inst-1",
      "raw_event":{}
    }
  }'
```

## Exemplo de uso (audio)

```bash
curl -s -X POST http://localhost:3000/api/v1/webhooks/inbound \
  -H "Content-Type: application/json" \
  -H "x-signature: change-me" \
  -d '{
    "session_id":"inst-1:5511999999999",
    "user_id":"5511999999999",
    "channel":"whatsapp",
    "message_id":"msg-audio-001",
    "timestamp":"2026-03-05T18:02:00Z",
    "message_type":"audio",
    "message":"[audio recebido]",
    "media":{
      "url":"https://cdn.exemplo.com/midia/audio.ogg",
      "mime_type":"audio/ogg",
      "caption":null,
      "filename":"audio.ogg",
      "duration_sec":14
    },
    "metadata":{
      "provider":"evolution",
      "instance":"inst-1",
      "raw_event":{}
    }
  }'
```

## Exemplo de uso no n8n (HTTP Request)
- Method: `POST`
- URL: `http://SEU_HOST:3000/api/v1/webhooks/inbound`
- Headers:
  - `Content-Type: application/json`
  - `x-signature: {{ $env.WEBHOOK_SIGNING_SECRET }}`
- Body: JSON no contrato padrao acima.

## Compatibilidade com payload antigo
O backend possui mapper interno:
- Se receber payload Evolution bruto, ele converte para o contrato padrao.
- Se receber payload ja padronizado, valida e segue o fluxo normalmente.

## Observabilidade
Em erro de validacao, os logs incluem:
- `message_id`
- `session_id`
- `phase=validate_inbound_payload`
## Uso do mesmo payload na rota de agente

A rota abaixo tambem aceita o payload padronizado e converte internamente para envio ao OpenClaw:
- `POST /v1/webhook/agent/send`

Auth dessa rota:
- Header obrigatorio: `Authorization: Bearer <AI_INTERNAL_TOKEN>`

### Comportamento nessa rota
- Aceita payload padronizado (`session_id`, `message_type`, `media`, etc).
- Monta a mensagem para o agente com contexto de tipo de midia (tipo, url, mime, arquivo, duracao).
- `sessionId` pode vir como `sessionId` ou `session_id`.
- `agent` pode ser enviado no payload; se omitido, usa `OPENCLAW_WEBHOOK_AGENT`.
- `sessionId` se omitido usa `OPENCLAW_WEBHOOK_SESSION_ID`.

### Exemplo (imagem + legenda) em `/v1/webhook/agent/send`

```bash
curl -s -X POST http://localhost:3000/v1/webhook/agent/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer change-me-ai-token" \
  -d '{
    "session_id":"n8n-interpreter",
    "user_id":"5511999999999",
    "channel":"whatsapp",
    "message_id":"msg-image-002",
    "timestamp":"2026-03-05T18:05:00Z",
    "message_type":"image",
    "message":"Segue comprovante",
    "media":{
      "url":"https://cdn.exemplo.com/midia/comprovante.jpg",
      "mime_type":"image/jpeg",
      "caption":"Segue comprovante",
      "filename":"comprovante.jpg",
      "duration_sec":null
    },
    "metadata":{
      "provider":"evolution",
      "instance":"inst-1",
      "raw_event":{}
    },
    "agent":"interpreter"
  }'
```

Obs: para essa rota, o backend nao persiste em banco; ele apenas encaminha para o OpenClaw e retorna a resposta.

## Modo async (background) em `/v1/webhook/agent/send`

A mesma rota aceita processamento assincrono:

```json
{
  "mode": "async",
  "callback": {
    "url": "https://seu-backend.com/webhooks/assistant-result",
    "auth_header": "Bearer SEU_TOKEN_CALLBACK"
  },
  "session_id": "n8n-interpreter",
  "message_type": "text",
  "message": "Oi"
}
```

Resposta imediata:

```json
{
  "accepted": true,
  "job_id": "job_01HVXYZ...",
  "status": "queued",
  "eta_sec": 8
}
```

Callback de sucesso:

```json
{
  "accepted": true,
  "job_id": "job_01HVXYZ...",
  "status": "completed",
  "result": {}
}
```

Callback de falha:

```json
{
  "accepted": true,
  "job_id": "job_01HVXYZ...",
  "status": "failed",
  "error": {
    "code": "openclaw_command_failed",
    "message": "..."
  }
}
```
