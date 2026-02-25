# API REST Node.js - Lab MVP (Hostinger + Docker Compose)

Projeto base de API REST com Fastify, TypeScript, Zod e Pino, preparado para evoluir com Redis e RabbitMQ.

## Por que Fastify
- Melhor desempenho para APIs IO-bound no Node.
- Validação e serialização por schema nativas.
- Logging com Pino integrado por padrão.

## Estrutura de pastas
```text
.
|-- .github/workflows/ci.yml
|-- Dockerfile
|-- docker-compose.yml
|-- .env.example
|-- package.json
|-- src
|   |-- adapters
|   |   |-- cache
|   |   |   |-- cache-provider.ts
|   |   |   `-- in-memory-cache.provider.ts
|   |   `-- queue
|   |       |-- mock-queue.publisher.ts
|   |       `-- queue-publisher.ts
|   |-- config/env.ts
|   |-- controllers
|   |   |-- health.controller.ts
|   |   `-- message.controller.ts
|   |-- middlewares
|   |   |-- correlation.ts
|   |   `-- signature.ts
|   |-- repositories
|   |   |-- in-memory/in-memory-message-dedup.repository.ts
|   |   `-- interfaces/message-dedup.repository.ts
|   |-- routes
|   |   |-- health.routes.ts
|   |   `-- message.routes.ts
|   |-- schemas/message.schemas.ts
|   |-- services
|   |   |-- health.service.ts
|   |   `-- message.service.ts
|   |-- types
|   |   |-- correlation.ts
|   |   `-- fastify.d.ts
|   |-- utils
|   |   |-- http-error.ts
|   |   `-- response.ts
|   |-- app.ts
|   `-- main.ts
`-- tests/app.test.ts
```

## Endpoints
- `GET /healthz`
- `GET /readyz`
- `POST /api/v1/webhooks/inbound`
- `POST /api/v1/messages/send`

Todas as respostas seguem:
- sucesso: `{ "ok": true, "data": ... }`
- erro: `{ "ok": false, "error": { "code": "...", "message": "..." } }`

## Segurança
- Header obrigatório: `x-signature` para endpoints de API.
- Rate limit básico via `@fastify/rate-limit`.
- CORS configurável por `CORS_ORIGIN`.

## Observabilidade
- `requestId` por requisição.
- Correlação por headers:
  - `x-trace-id`
  - `x-conversation-id`
  - `x-message-id`
- Logs estruturados em JSON (Pino).

## Executar local
```bash
cp .env.example .env
npm install
npm run dev
```

## Executar com Docker Compose
```bash
cp .env.example .env
docker compose up --build -d
docker compose logs -f api
```

## Curl de exemplo
```bash
curl -s http://localhost:3000/healthz
```

```bash
curl -s http://localhost:3000/readyz
```

```bash
curl -s -X POST http://localhost:3000/api/v1/webhooks/inbound \
  -H "content-type: application/json" \
  -H "x-signature: change-me" \
  -H "x-trace-id: trace-123" \
  -d '{"messageId":"msg-1","payload":{"text":"hello"}}'
```

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/send \
  -H "content-type: application/json" \
  -H "x-signature: change-me" \
  -d '{"to":"+5511999999999","content":"Olá"}'
```

## CI mínima
Workflow em `.github/workflows/ci.yml` executa:
- install (`npm ci`)
- lint (`npm run lint`)
- test (`npm run test`)
- build (`npm run build`)

## Hostinger-ready
### Build/Start
- Build image: `docker compose build api`
- Start stack: `docker compose up -d`
- Healthcheck interno configurado para `/healthz`.

### Checklist de ambiente
- `PORT`
- `NODE_ENV`
- `LOG_LEVEL`
- `CORS_ORIGIN`
- `RATE_LIMIT_MAX`
- `RATE_LIMIT_WINDOW`
- `WEBHOOK_SIGNING_SECRET`

## Roadmap de evolução
1. Fase 1 - MVP HTTP
- Endpoints e fluxos síncronos prontos.
- Dedupe em memória.

2. Fase 2 - Redis (cache/dedupe/rate limit)
- Implementar `CacheProvider` com Redis.
- Mover dedupe para Redis com TTL.
- Integrar rate limit com backend Redis.

3. Fase 3 - RabbitMQ (fila assíncrona)
- Implementar `QueuePublisher` real.
- Publicar eventos inbound/send em exchange dedicada.

4. Fase 4 - Worker separado no compose
- Criar serviço `worker` no `docker-compose.yml`.
- Consumir fila e processar mensagens de forma assíncrona.
