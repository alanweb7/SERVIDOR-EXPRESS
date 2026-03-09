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
- volume persistente de identidade WS (`/app/.openclaw`)
- transporte OpenClaw em `docker` com descoberta automatica do container
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

## OpenClaw via docker exec com descoberta automatica (recomendado para seu cenario)

Use:

- `OPENCLAW_AGENT_TRANSPORT=docker`
- `OPENCLAW_AGENT_CONTAINER_DISCOVERY=true`
- `OPENCLAW_AGENT_CONTAINER_FILTER=openclaw_ai`
- `OPENCLAW_AGENT_DOCKER_USER=node`

Como funciona:

- A API roda `docker ps --filter name=openclaw_ai --format {{.ID}}`
- Usa o primeiro container encontrado para executar `openclaw agent ...`
- Voce nao precisa enviar `container` no payload na maioria dos casos

Se quiser fixar um container manualmente:

- `OPENCLAW_AGENT_CONTAINER_DISCOVERY=false`
- `OPENCLAW_AGENT_CONTAINER_NAME=<nome-ou-id-do-container>`

## Atualizar versao

1. Publique nova imagem no GHCR
2. No Portainer, abra a stack
3. Clique em `Pull and redeploy`

## Observacoes importantes

- Se a imagem GHCR for privada, configure credencial de registry no Portainer.
- Para usar tag imutavel, troque em `image:` de `latest` para `sha-<commit>`.
- O `docker-compose.yml` atual permanece inalterado e funcional.
- Em modo `docker`, `OPENCLAW_DEVICE_ID` nao e obrigatorio para o fluxo principal.

## Se ocorrer "openclaw_container_not_found"

1. Verifique se existe container OpenClaw com o filtro:
   - `docker ps --filter "name=openclaw_ai"`
2. Se o nome do service for outro, ajuste:
   - `OPENCLAW_AGENT_CONTAINER_FILTER=<seu-filtro-real>`
3. Redeploy da stack.


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

OPENCLAW_AGENT_TRANSPORT=docker
OPENCLAW_AGENT_CONTAINER_DISCOVERY=true
OPENCLAW_AGENT_CONTAINER_FILTER=openclaw_ai
OPENCLAW_AGENT_DOCKER_USER=node

OPENCLAW_WEBHOOK_AGENT=interpreter
OPENCLAW_WEBHOOK_SESSION_ID=n8n-interpreter
OPENCLAW_AGENT_SESSION_DEFAULT=n8n-main
OPENCLAW_AGENT_DEFAULT=

OPENCLAW_AGENT_COMMAND_TIMEOUT_MS=120000
OPENCLAW_AGENT_DOCKER_FALLBACK=false
OPENCLAW_AGENT_CONTAINER_NAME=openclaw-jsyu-openclaw-1

AI_CONTEXT_WINDOW=12
AI_TRANSIENT_MAX_RETRIES=1
