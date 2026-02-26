import type {
  AiInboxRecord,
  AiInboxRepository,
  CreateAiInboxInput
} from "../interfaces/ai-inbox.repository.js";

function key(unitId: string, source: string, messageId: string): string {
  return `${unitId}::${source}::${messageId}`;
}

export class InMemoryAiInboxRepository implements AiInboxRepository {
  private readonly store = new Map<string, AiInboxRecord>();

  async find(unitId: string, source: string, messageId: string): Promise<AiInboxRecord | null> {
    return this.store.get(key(unitId, source, messageId)) ?? null;
  }

  async createReceived(input: CreateAiInboxInput): Promise<AiInboxRecord> {
    const record: AiInboxRecord = {
      ...input,
      status: "received",
      attempts: 0,
      createdAt: new Date()
    };
    this.store.set(key(input.unitId, input.source, input.messageId), record);
    return record;
  }

  async markDone(unitId: string, source: string, messageId: string, outputMessageId: string): Promise<void> {
    const current = this.store.get(key(unitId, source, messageId));
    if (!current) return;
    this.store.set(key(unitId, source, messageId), {
      ...current,
      status: "done",
      attempts: current.attempts + 1,
      outputMessageId,
      processedAt: new Date()
    });
  }

  async markError(unitId: string, source: string, messageId: string, error: string): Promise<void> {
    const current = this.store.get(key(unitId, source, messageId));
    if (!current) return;
    this.store.set(key(unitId, source, messageId), {
      ...current,
      status: "error",
      attempts: current.attempts + 1,
      error,
      processedAt: new Date()
    });
  }
}
