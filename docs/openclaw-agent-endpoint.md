# OpenClaw Agent Endpoint

## Rota
- `POST /api/v1/openclaw/agent/send`

## Auth
- Header obrigatorio: `Authorization: Bearer <AI_INTERNAL_TOKEN>`

## Objetivo
Encapsular este comando via HTTP:

```bash
docker exec -u node openclaw-jsyu-openclaw-1 openclaw agent --session-id n8n-main --message "Quem e voce?" --json
```

Comportamento dinamico:
- `agent`: pode vir no payload; se ausente usa env.
- `message`: obrigatorio no payload.
- `container`: pode vir no payload; se ausente usa env.

## Payload

```json
{
  "message": "Quem e voce?",
  "sessionId": "n8n-main",
  "agent": "main",
  "container": "openclaw-jsyu-openclaw-1"
}
```

Campos:
- `message` obrigatorio
- `sessionId` opcional (default env)
- `agent` opcional (default env)
- `container` opcional (default env)

## Env utilizados

```env
OPENCLAW_AGENT_CONTAINER_NAME=openclaw-jsyu-openclaw-1
OPENCLAW_AGENT_DOCKER_USER=node
OPENCLAW_AGENT_SESSION_DEFAULT=n8n-main
OPENCLAW_AGENT_DEFAULT=main
OPENCLAW_AGENT_COMMAND_TIMEOUT_MS=120000
```

## Exemplo curl

```bash
curl -s -X POST http://localhost:3000/api/v1/openclaw/agent/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer change-me-ai-token" \
  -d '{"message":"Quem e voce?"}'
```

## Retorno de sucesso

```json
{
  "ok": true,
  "data": {
    "request": {
      "sessionId": "n8n-main",
      "agent": "main",
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