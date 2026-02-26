import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.routes.js";
import { messageRoutes } from "./routes/message.routes.js";
import { aiRoutes } from "./routes/ai.routes.js";
import { fail } from "./utils/response.js";
import { ZodError } from "zod";
import { HttpError } from "./utils/http-error.js";
import { InMemoryMessageDedupRepository } from "./repositories/in-memory/in-memory-message-dedup.repository.js";
import { MockQueuePublisher } from "./adapters/queue/mock-queue.publisher.js";
import { InMemoryCacheProvider } from "./adapters/cache/in-memory-cache.provider.js";
import { InMemoryAiInboxRepository } from "./repositories/in-memory/in-memory-ai-inbox.repository.js";
import { InMemoryChatConversationRepository } from "./repositories/in-memory/in-memory-chat-conversation.repository.js";
import { InMemoryChatMessageRepository } from "./repositories/in-memory/in-memory-chat-message.repository.js";
import { MockAiResponder } from "./adapters/ai/mock-ai.responder.js";
import { attachCorrelationContext } from "./middlewares/correlation.js";
import type { MessageDedupRepository } from "./repositories/interfaces/message-dedup.repository.js";
import type { QueuePublisher } from "./adapters/queue/queue-publisher.js";
import type { CacheProvider } from "./adapters/cache/cache-provider.js";
import type { AiInboxRepository } from "./repositories/interfaces/ai-inbox.repository.js";
import type { ChatConversationRepository } from "./repositories/interfaces/chat-conversation.repository.js";
import type { ChatMessageRepository } from "./repositories/interfaces/chat-message.repository.js";
import type { AiResponder } from "./adapters/ai/ai-responder.js";

export type AppDeps = {
  dedupRepository: MessageDedupRepository;
  queuePublisher: QueuePublisher;
  cacheProvider: CacheProvider;
  aiInboxRepository: AiInboxRepository;
  chatConversationRepository: ChatConversationRepository;
  chatMessageRepository: ChatMessageRepository;
  aiResponder: AiResponder;
};

export function createApp(partialDeps?: Partial<AppDeps>): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL
    },
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId"
  });

  app.decorate("deps", {
    dedupRepository: partialDeps?.dedupRepository ?? new InMemoryMessageDedupRepository(),
    queuePublisher: partialDeps?.queuePublisher ?? new MockQueuePublisher(),
    cacheProvider: partialDeps?.cacheProvider ?? new InMemoryCacheProvider(),
    aiInboxRepository: partialDeps?.aiInboxRepository ?? new InMemoryAiInboxRepository(),
    chatConversationRepository:
      partialDeps?.chatConversationRepository ?? new InMemoryChatConversationRepository(),
    chatMessageRepository: partialDeps?.chatMessageRepository ?? new InMemoryChatMessageRepository(),
    aiResponder: partialDeps?.aiResponder ?? new MockAiResponder()
  });

  app.addHook("onRequest", attachCorrelationContext);

  app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((s) => s.trim())
  });

  app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    addHeadersOnExceeding: {
      "x-ratelimit-remaining": true
    }
  });

  app.register(healthRoutes);
  app.register(messageRoutes);
  app.register(aiRoutes);

  app.setNotFoundHandler((request, reply) => {
    request.log.warn({ url: request.url }, "Rota nao encontrada");
    reply.code(404).send(fail("NOT_FOUND", "Rota nao encontrada"));
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      request.log.warn({ issues: error.issues }, "Erro de validacao");
      reply.code(400).send(fail("VALIDATION_ERROR", "Payload invalido"));
      return;
    }

    if (error instanceof HttpError) {
      request.log.warn({ code: error.code, message: error.message }, "Erro de negocio");
      reply.code(error.statusCode).send(fail(error.code, error.message));
      return;
    }

    request.log.error({ err: error }, "Erro interno nao tratado");
    reply.code(500).send(fail("INTERNAL_SERVER_ERROR", "Erro interno do servidor"));
  });

  return app;
}

