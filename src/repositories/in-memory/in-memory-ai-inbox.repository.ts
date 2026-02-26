import type {
  AiInboxRecord,
  AiInboxRepository,
  CreateAiInboxInput
} from "../interfaces/ai-inbox.repository.js";

function key(unitId: string, messageId: string): string {
  return `${unitId}::${messageId}`;
}

export class InMemoryAiInboxRepository implements AiInboxRepository {
  private readonly store = new Map<string, AiInboxRecord>();

  async find(unitId: string, messageId: string): Promise<AiInboxRecord | null> {
    return this.store.get(key(unitId, messageId)) ?? null;
  }

  async createReceived(input: CreateAiInboxInput): Promise<AiInboxRecord> {
    const record: AiInboxRecord = {
      ...input,
      status: "received",
      attempts: 0,
      createdAt: new Date()
    };
    this.store.set(key(input.unitId, input.messageId), record);
    return record;
  }

  async markProcessed(unitId: string, messageId: string, outputMessageId: string): Promise<void> {
    const current = this.store.get(key(unitId, messageId));
    if (!current) return;
    this.store.set(key(unitId, messageId), {
      ...current,
      status: "processed",
      attempts: current.attempts + 1,
      outputMessageId,
      error: undefined,
      processedAt: new Date()
    });
  }

  async markFailed(unitId: string, messageId: string, error: string): Promise<void> {
    const current = this.store.get(key(unitId, messageId));
    if (!current) return;
    this.store.set(key(unitId, messageId), {
      ...current,
      status: "failed",
      attempts: current.attempts + 1,
      error,
      processedAt: new Date()
    });
  }
}
