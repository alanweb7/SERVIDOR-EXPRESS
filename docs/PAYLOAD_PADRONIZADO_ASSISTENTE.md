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