export type AiInboxStatus = "received" | "processed" | "failed";

export type AiInboxRecord = {
  unitId: string;
  source: string;
  messageId: string;
  conversationId: string;
  senderName: string;
  text: string;
  status: AiInboxStatus;
  attempts: number;
  outputMessageId?: string;
  error?: string;
  createdAt: Date;
  processedAt?: Date;
};

export type CreateAiInboxInput = {
  unitId: string;
  source: string;
  messageId: string;
  conversationId: string;
  senderName: string;
  text: string;
};

export interface AiInboxRepository {
  find(unitId: string, messageId: string): Promise<AiInboxRecord | null>;
  createReceived(input: CreateAiInboxInput): Promise<AiInboxRecord>;
  markProcessed(unitId: string, messageId: string, outputMessageId: string | null): Promise<void>;
  markFailed(unitId: string, messageId: string, error: string): Promise<void>;
}
