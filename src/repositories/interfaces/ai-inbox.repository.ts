export type AiInboxStatus = "received" | "done" | "error";

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
  find(unitId: string, source: string, messageId: string): Promise<AiInboxRecord | null>;
  createReceived(input: CreateAiInboxInput): Promise<AiInboxRecord>;
  markDone(unitId: string, source: string, messageId: string, outputMessageId: string): Promise<void>;
  markError(unitId: string, source: string, messageId: string, error: string): Promise<void>;
}
