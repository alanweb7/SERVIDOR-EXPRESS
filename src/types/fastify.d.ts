import "fastify";
import type { CorrelationContext } from "./correlation.js";
import type { MessageDedupRepository } from "../repositories/interfaces/message-dedup.repository.js";
import type { QueuePublisher } from "../adapters/queue/queue-publisher.js";
import type { CacheProvider } from "../adapters/cache/cache-provider.js";
import type { AiInboxRepository } from "../repositories/interfaces/ai-inbox.repository.js";
import type { ChatConversationRepository } from "../repositories/interfaces/chat-conversation.repository.js";
import type { ChatMessageRepository } from "../repositories/interfaces/chat-message.repository.js";
import type { OpenClawAgentProvider } from "../adapters/agent/openclaw-agent-provider.js";
import type { OutboundDispatcher } from "../adapters/outbound/outbound-dispatcher.js";

declare module "fastify" {
  interface FastifyRequest {
    correlation: CorrelationContext;
  }

  interface FastifyInstance {
    deps: {
      dedupRepository: MessageDedupRepository;
      queuePublisher: QueuePublisher;
      cacheProvider: CacheProvider;
      aiInboxRepository: AiInboxRepository;
      chatConversationRepository: ChatConversationRepository;
      chatMessageRepository: ChatMessageRepository;
      openClawProvider: OpenClawAgentProvider;
      outboundDispatcher: OutboundDispatcher;
    };
  }
}
