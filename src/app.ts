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
import { SupabaseAiInboxRepository } from "./repositories/supabase/supabase-ai-inbox.repository.js";
import { SupabaseChatConversationRepository } from "./repositories/supabase/supabase-chat-conversation.repository.js";
import { SupabaseChatMessageRepository } from "./repositories/supabase/supabase-chat-message.repository.js";
import { OpenClawHttpAgentProvider } from "./adapters/agent/openclaw-http-agent.provider.js";
import { QueueOutboundDispatcher } from "./adapters/outbound/queue-outbound.dispatcher.js";
import { SupabaseRestClient } from "./adapters/db/supabase-rest.client.js";
import { attachCorrelationContext } from "./middlewares/correlation.js";
import type { MessageDedupRepository } from "./repositories/interfaces/message-dedup.repository.js";
import type { QueuePublisher } from "./adapters/queue/queue-publisher.js";
import type { CacheProvider } from "./adapters/cache/cache-provider.js";
import type { AiInboxRepository } from "./repositories/interfaces/ai-inbox.repository.js";
import type { ChatConversationRepository } from "./repositories/interfaces/chat-conversation.repository.js";
import type { ChatMessageRepository } from "./repositories/interfaces/chat-message.repository.js";
import type { OpenClawAgentProvider } from "./adapters/agent/openclaw-agent-provider.js";
import { OpenClawProviderError } from "./adapters/agent/openclaw-agent-provider.js";
import type { OutboundDispatcher } from "./adapters/outbound/outbound-dispatcher.js";

export type AppDeps = {
  dedupRepository: MessageDedupRepository;
  queuePublisher: QueuePublisher;
  cacheProvider: CacheProvider;
  aiInboxRepository: AiInboxRepository;
  chatConversationRepository: ChatConversationRepository;
  chatMessageRepository: ChatMessageRepository;
  openClawProvider: OpenClawAgentProvider;
  outboundDispatcher: OutboundDispatcher;
};

export function createApp(partialDeps?: Partial<AppDeps>): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL
    },
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId"
  });

  const useSupabase =
    env.DATA_PROVIDER === "supabase" &&
    typeof env.SUPABASE_URL === "string" &&
    env.SUPABASE_URL.length > 0 &&
    typeof env.SUPABASE_SERVICE_ROLE_KEY === "string" &&
    env.SUPABASE_SERVICE_ROLE_KEY.length > 0;

  const supabaseClient = useSupabase
    ? new SupabaseRestClient(env.SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string)
    : null;
  const queuePublisher = partialDeps?.queuePublisher ?? new MockQueuePublisher();

  const openClawProvider = partialDeps?.openClawProvider ?? createOpenClawProvider();
  const outboundDispatcher = partialDeps?.outboundDispatcher ?? new QueueOutboundDispatcher(queuePublisher);
  app.log.info({ provider: openClawProvider.providerName }, "AI provider configured");

  app.decorate("deps", {
    dedupRepository: partialDeps?.dedupRepository ?? new InMemoryMessageDedupRepository(),
    queuePublisher,
    cacheProvider: partialDeps?.cacheProvider ?? new InMemoryCacheProvider(),
    aiInboxRepository:
      partialDeps?.aiInboxRepository ??
      (supabaseClient ? new SupabaseAiInboxRepository(supabaseClient) : new InMemoryAiInboxRepository()),
    chatConversationRepository:
      partialDeps?.chatConversationRepository ??
      (supabaseClient
        ? new SupabaseChatConversationRepository(supabaseClient)
        : new InMemoryChatConversationRepository()),
    chatMessageRepository:
      partialDeps?.chatMessageRepository ??
      (supabaseClient
        ? new SupabaseChatMessageRepository(supabaseClient)
        : new InMemoryChatMessageRepository()),
    openClawProvider,
    outboundDispatcher
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
      reply.code(400).send(fail("VALIDATION_ERROR", "Payload invalido", { request_id: request.id }));
      return;
    }

    if (error instanceof HttpError) {
      if (error.statusCode >= 500) {
        request.log.error(
          {
            code: error.code,
            message: error.message,
            statusCode: error.statusCode,
            err: error.cause instanceof Error ? error.cause : error
          },
          "Erro interno de negocio"
        );
      } else {
        request.log.warn({ code: error.code, message: error.message }, "Erro de negocio");
      }
      reply.code(error.statusCode).send(fail(error.code, error.message, { request_id: request.id }));
      return;
    }

    request.log.error({ err: error }, "Erro interno nao tratado");
    reply
      .code(500)
      .send(fail("INTERNAL_SERVER_ERROR", "Erro interno do servidor", { request_id: request.id }));
  });

  return app;
}

function createOpenClawProvider(): OpenClawAgentProvider {
  if (!env.OPENCLAW_BASE_URL || !env.OPENCLAW_GATEWAY_TOKEN || !env.OPENCLAW_AGENT_ID) {
    return {
      providerName: "openclaw",
      async sendMessage() {
        throw new OpenClawProviderError("openclaw_unavailable", "OpenClaw provider is not configured", false);
      }
    };
  }

  return new OpenClawHttpAgentProvider({
    baseUrl: env.OPENCLAW_BASE_URL,
    gatewayToken: env.OPENCLAW_GATEWAY_TOKEN,
    agentId: env.OPENCLAW_AGENT_ID,
    timeoutMs: env.OPENCLAW_TIMEOUT_MS
  });
}

