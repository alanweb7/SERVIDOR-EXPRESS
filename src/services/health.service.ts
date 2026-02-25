import type { CacheProvider } from "../adapters/cache/cache-provider.js";
import type { QueuePublisher } from "../adapters/queue/queue-publisher.js";

export class HealthService {
  constructor(
    private readonly cacheProvider: CacheProvider,
    private readonly queuePublisher: QueuePublisher
  ) {}

  async readiness() {
    const [cache, queue] = await Promise.all([
      this.cacheProvider.ping(),
      this.queuePublisher.ping()
    ]);

    return {
      status: cache && queue ? "ready" : "degraded",
      dependencies: {
        cache,
        queue
      }
    };
  }
}
