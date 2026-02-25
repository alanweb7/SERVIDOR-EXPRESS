import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.routes.js";
import { messageRoutes } from "./routes/message.routes.js";
import { fail } from "./utils/response.js";
import { ZodError } from "zod";
import { HttpError } from "./utils/http-error.js";
import { InMemoryMessageDedupRepository } from "./repositories/in-memory/in-memory-message-dedup.repository.js";
import { MockQueuePublisher } from "./adapters/queue/mock-queue.publisher.js";
import { InMemoryCacheProvider } from "./adapters/cache/in-memory-cache.provider.js";
import { attachCorrelationContext } from "./middlewares/correlation.js";
import type { MessageDedupRepository } from "./repositories/interfaces/message-dedup.repository.js";
import type { QueuePublisher } from "./adapters/queue/queue-publisher.js";
import type { CacheProvider } from "./adapters/cache/cache-provider.js";

export type AppDeps = {
  dedupRepository: MessageDedupRepository;
  queuePublisher: QueuePublisher;
  cacheProvider: CacheProvider;
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
    cacheProvider: partialDeps?.cacheProvider ?? new InMemoryCacheProvider()
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

