import "fastify";
import type { CorrelationContext } from "./correlation.js";
import type { MessageDedupRepository } from "../repositories/interfaces/message-dedup.repository.js";
import type { QueuePublisher } from "../adapters/queue/queue-publisher.js";
import type { CacheProvider } from "../adapters/cache/cache-provider.js";

declare module "fastify" {
  interface FastifyRequest {
    correlation: CorrelationContext;
  }

  interface FastifyInstance {
    deps: {
      dedupRepository: MessageDedupRepository;
      queuePublisher: QueuePublisher;
      cacheProvider: CacheProvider;
    };
  }
}
