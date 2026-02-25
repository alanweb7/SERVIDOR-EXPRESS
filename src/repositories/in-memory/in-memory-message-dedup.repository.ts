import type { MessageDedupRepository } from "../interfaces/message-dedup.repository.js";

export class InMemoryMessageDedupRepository implements MessageDedupRepository {
  private readonly store = new Set<string>();

  async has(messageId: string): Promise<boolean> {
    return this.store.has(messageId);
  }

  async save(messageId: string): Promise<void> {
    this.store.add(messageId);
  }
}
