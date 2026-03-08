# Deploy no Portainer (Docker Swarm)

Este projeto suporta dois modos sem conflito:

- `docker-compose.yml` para ambiente local/VPS tradicional
- `docker-stack.yml` para Portainer + Docker Swarm

## Arquivo da stack

Use:

- `docker-stack.yml`

Ele ja esta preparado com:

- imagem `ghcr.io/alanweb7/servidor-express-opclaw:latest`
- healthcheck
- estrategia de update/rollback
- mount do Docker socket (`/var/run/docker.sock`) para fallback Docker CLI
- transporte OpenClaw em `ws` fixo no exemplo (`OPENCLAW_AGENT_TRANSPORT=ws`)
- fallback Docker desativado no exemplo (`OPENCLAW_AGENT_DOCKER_FALLBACK=false`)

## Passo a passo (Portainer)

1. Abra `Stacks` -> `Add stack`
2. Nome da stack: `servidor-api-rest`
3. Cole o conteudo de `docker-stack.yml`
4. Em `Environment variables`, preencha no minimo:
   - `WEBHOOK_SIGNING_SECRET`
   - `AI_INTERNAL_TOKEN`
   - `ADMIN_MANAGER_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Clique em `Deploy the stack`

## OpenClaw sem docker exec (recomendado)

Para evitar dependencia de nome de container no Swarm, use service discovery + WS:

- `OPENCLAW_AGENT_TRANSPORT=ws`
- `OPENCLAW_AGENT_DOCKER_FALLBACK=false`
- `OPENCLAW_GATEWAY_URL=ws://<servico-openclaw>:<porta>`
- `OPENCLAW_GATEWAY_TOKEN=<token>`

Exemplo em Swarm:

- `OPENCLAW_GATEWAY_URL=ws://openclaw_ai:18789`

Exemplo em docker compose:

- `OPENCLAW_GATEWAY_URL=ws://openclaw:18789`

Notas:

- O hostname deve ser o nome do servico Docker na mesma rede.
- Em modo `ws`, a API nao usa `docker exec` para `/v1/webhook/agent/send`.
- Para migracao gradual:
  - `OPENCLAW_AGENT_TRANSPORT=auto`
  - `OPENCLAW_AGENT_DOCKER_FALLBACK=true`
  - Nesse modo tenta WS primeiro e cai para Docker CLI se WS falhar.

## Atualizar versao

1. Publique nova imagem no GHCR
2. No Portainer, abra a stack
3. Clique em `Pull and redeploy`

## Observacoes importantes

- Se a imagem GHCR for privada, configure credencial de registry no Portainer.
- Para usar tag imutavel, troque em `image:` de `latest` para `sha-<commit>`.
- O `docker-compose.yml` atual permanece inalterado e funcional.


## Bloco de exemplo
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
CORS_ORIGIN=*

RATE_LIMIT_MAX=60
RATE_LIMIT_WINDOW=1 minute

WEBHOOK_SIGNING_SECRET=troque-por-segredo-forte
AI_INTERNAL_TOKEN=troque-por-token-forte
ADMIN_MANAGER_TOKEN=troque-por-token-admin-forte

DATA_PROVIDER=supabase
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SEU_SERVICE_ROLE_KEY

OPENCLAW_AGENT_TRANSPORT=ws
OPENCLAW_GATEWAY_URL=ws://openclaw_ai:18789
OPENCLAW_GATEWAY_TOKEN=SEU_TOKEN_GATEWAY

OPENCLAW_DEVICE_ID=lab-api-main
OPENCLAW_DEVICE_IDENTITY_PATH=/app/.openclaw/device-identity.json
OPENCLAW_CONNECT_TIMEOUT_MS=15000
OPENCLAW_DEBUG=false

OPENCLAW_WEBHOOK_AGENT=interpreter
OPENCLAW_WEBHOOK_SESSION_ID=n8n-interpreter
OPENCLAW_AGENT_SESSION_DEFAULT=n8n-main
OPENCLAW_AGENT_DEFAULT=

OPENCLAW_AGENT_COMMAND_TIMEOUT_MS=120000
OPENCLAW_AGENT_DOCKER_FALLBACK=false
OPENCLAW_AGENT_CONTAINER_NAME=openclaw-jsyu-openclaw-1
OPENCLAW_AGENT_DOCKER_USER=node

AI_CONTEXT_WINDOW=12
AI_TRANSIENT_MAX_RETRIES=1
