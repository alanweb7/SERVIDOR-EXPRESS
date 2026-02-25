Estruturação do servidor REST no formato de lab (MVP), já pensando em evolução pra RabbitMQ + Redis depois.

---

Quero que você atue como Arquiteto Backend Sênior e estruture um projeto **API REST Node.js** para um **lab de implantação**.

## Contexto do projeto
- O servidor será executado em **Docker Compose**
- Código versionado no **GitHub**
- Deploy/build na **Hostinger**
- Objetivo inicial: funcionamento mínimo estável (MVP/Lab)
- Em seguida vamos integrar **RabbitMQ** e **Redis** (não precisa implementar full agora, mas deixar pronto para plugar)

## Stack obrigatória
- Node.js 22+
- TypeScript
- Fastify **ou** Express (escolha e justifique)
- Zod para validação
- Pino para logs estruturados
- Docker + Docker Compose
- Variáveis por `.env`
- Arquitetura limpa e modular (routes/controllers/services/repositories)

## Entregáveis que eu quero de você
1. **Estrutura de pastas completa** (monorepo simples ou single service, você escolhe)
2. **Código base funcional** com:
- `GET /healthz`
- `GET /readyz`
- `POST /api/v1/webhooks/inbound` (recebe payload genérico de mensagem)
- `POST /api/v1/messages/send` (mock de envio)
3. **Middleware de segurança**
- validação de assinatura por header (`x-signature`)
- rate limit básico
- CORS configurável
4. **Observabilidade**
- request id por requisição
- logs JSON com correlação (`traceId`, `conversationId`, `messageId`)
5. **Persistência inicial**
- interface de repository (sem banco real obrigatório no MVP)
- implementação in-memory para deduplicação de `messageId`
6. **Preparação para fila**
- criar interfaces/adapters prontos para:
- `QueuePublisher` (RabbitMQ futuro)
- `CacheProvider` (Redis futuro)
- incluir stubs/mock implementations para rodar já
7. **Dockerização**
- `Dockerfile` produção
- `docker-compose.yml` com serviço `api`
- healthcheck no compose
8. **CI mínima (GitHub Actions)**
- install
- lint
- test
- build
9. **Hostinger-ready**
- instruções objetivas de deploy
- comandos de build/start
- checklist de variáveis de ambiente
10. **Documentação**
- README com:
- como rodar local
- como rodar via compose
- exemplo de curl para cada endpoint
- roadmap de integração RabbitMQ + Redis

## Requisitos de qualidade
- Código idempotente e organizado
- Tratamento de erros centralizado
- Sem segredos hardcoded
- Padrão de resposta JSON consistente:
- `{ ok: true, data: ... }`
- `{ ok: false, error: { code, message } }`

## Saída esperada
- Primeiro: árvore de diretórios
- Segundo: arquivos principais completos (não pseudocódigo)
- Terceiro: `docker-compose.yml`, `Dockerfile`, `.env.example`, `README.md`
- Quarto: plano de evolução em fases:
- Fase 1: MVP HTTP
- Fase 2: Redis (cache/dedupe/rate limit)
- Fase 3: RabbitMQ (fila de processamento assíncrono)
- Fase 4: worker separado no mesmo compose

Gere tudo em português, com foco prático para implementação imediata.
