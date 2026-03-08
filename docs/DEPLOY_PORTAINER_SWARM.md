# Deploy no Portainer (Docker Swarm)

Este projeto agora suporta dois modos sem conflito:

- `docker-compose.yml` -> ambiente local/VPS tradicional
- `docker-stack.yml` -> Portainer + Docker Swarm

## Arquivo da stack

Use o arquivo:

- `docker-stack.yml`

Ele já está preparado com:

- imagem `ghcr.io/alanweb7/servidor-express-opclaw:latest`
- healthcheck
- estratégia de update/rollback
- mount do Docker socket (`/var/run/docker.sock`) para comandos `docker exec` internos

## Passo a passo (Portainer)

1. Abra `Stacks` -> `Add stack`
2. Nome da stack: `servidor-api-rest` (ou similar)
3. Cole o conteúdo de `docker-stack.yml`
4. Em `Environment variables`, preencha no mínimo:
   - `WEBHOOK_SIGNING_SECRET`
   - `AI_INTERNAL_TOKEN`
   - `ADMIN_MANAGER_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Clique em `Deploy the stack`

## Atualizar versão

1. Publique nova imagem no GHCR (pipeline já existente)
2. No Portainer, abra a stack
3. Clique em `Pull and redeploy`

## Observações importantes

- Não remova o volume `/var/run/docker.sock:/var/run/docker.sock` se for usar endpoints que chamam OpenClaw via Docker CLI.
- Para usar tag imutável, troque em `image:` de `latest` para `sha-<commit>`.
- O `docker-compose.yml` atual permanece inalterado e funcional.
