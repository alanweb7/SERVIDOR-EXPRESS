# OpenClaw Agent Endpoint

## Rotas
- `POST /v1/webhook/agent/send`
- `POST /api/v1/openclaw/agent/send`

## Auth
- Header obrigatorio: `Authorization: Bearer <AI_INTERNAL_TOKEN>`

## Objetivo
Encapsular este comando via HTTP:

```bash
docker exec -u node openclaw-jsyu-openclaw-1 openclaw agent --agent interpreter --session-id n8n-interpreter --message "Quem e voce?" --json
```

## Parametros do payload

Payload base:

```json
{
  "message": "Quem e voce?",
  "sessionId": "n8n-interpreter",
  "agent": "interpreter",
  "container": "openclaw-jsyu-openclaw-1"
}
```

Obrigatorio:
- `message`

Opcionais:
- `sessionId`
- `agent`
- `container`

## Fallback por env (quando omitir no payload)

### Para `POST /v1/webhook/agent/send`
- `agent` -> `OPENCLAW_WEBHOOK_AGENT`
- `sessionId` -> `OPENCLAW_WEBHOOK_SESSION_ID`
- `container` -> `OPENCLAW_AGENT_CONTAINER_NAME`

### Para `POST /api/v1/openclaw/agent/send`
- `agent` -> `OPENCLAW_AGENT_DEFAULT`
- `sessionId` -> `OPENCLAW_AGENT_SESSION_DEFAULT`
- `container` -> `OPENCLAW_AGENT_CONTAINER_NAME`

Sempre via env:
- usuario docker -> `OPENCLAW_AGENT_DOCKER_USER`
- timeout -> `OPENCLAW_AGENT_COMMAND_TIMEOUT_MS`

## Env utilizados

```env
OPENCLAW_AGENT_CONTAINER_NAME=openclaw-jsyu-openclaw-1
OPENCLAW_AGENT_DOCKER_USER=node
OPENCLAW_AGENT_SESSION_DEFAULT=n8n-main
OPENCLAW_AGENT_DEFAULT=
OPENCLAW_WEBHOOK_AGENT=interpreter
OPENCLAW_WEBHOOK_SESSION_ID=n8n-interpreter
OPENCLAW_AGENT_COMMAND_TIMEOUT_MS=120000
```

## Exemplo curl (webhook)

```bash
curl -s -X POST http://localhost:3000/v1/webhook/agent/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer change-me-ai-token" \
  -d '{"message":"Quem e voce?"}'
```

## Exemplo curl (lab/dinamico)

```bash
curl -s -X POST http://localhost:3000/api/v1/openclaw/agent/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer change-me-ai-token" \
  -d '{"message":"Quem e voce?","agent":"interpreter","sessionId":"n8n-interpreter"}'
```

## Retorno de sucesso

```json
{
  "ok": true,
  "data": {
    "request": {
      "sessionId": "n8n-interpreter",
      "agent": "interpreter",
      "container": "openclaw-jsyu-openclaw-1",
      "message": "Quem e voce?"
    },
    "openclaw": {},
    "raw": "stdout bruto"
  }
}
```

## Erros comuns
- `401 UNAUTHORIZED`: token interno invalido/ausente.
- `422 invalid_parameter`: `sessionId/agent/container` fora do padrao permitido.
- `502 openclaw_command_failed`: erro no `docker exec`/CLI.
- `504 openclaw_command_timeout`: timeout estourado.