import type {
  AiInboxRecord,
  AiInboxRepository,
  CreateAiInboxInput
} from "../interfaces/ai-inbox.repository.js";
import { SupabaseRestClient } from "../../adapters/db/supabase-rest.client.js";

type AiInboxRow = {
  unit_id: string;
  source: string;
  message_id: string;
  conversation_id: string;
  sender_name: string;
  text: string;
  status: "received" | "processed" | "failed";
  attempts: number;
  output_message_id: string | null;
  error: string | null;
  created_at: string;
  processed_at: string | null;
};

export class SupabaseAiInboxRepository implements AiInboxRepository {
  constructor(private readonly client: SupabaseRestClient) {}

  async find(unitId: string, messageId: string): Promise<AiInboxRecord | null> {
    const params = new URLSearchParams({
      select:
        "unit_id,source,message_id,conversation_id,sender_name,text,status,attempts,output_message_id,error,created_at,processed_at",
      unit_id: `eq.${unitId}`,
      message_id: `eq.${messageId}`,
      limit: "1"
    });
    const rows = (await this.client.select("ai_inbox", params)) as AiInboxRow[];
    const row = rows[0];
    if (!row) return null;
    return this.mapRow(row);
  }

  async createReceived(input: CreateAiInboxInput): Promise<AiInboxRecord> {
    const rows = (await this.client.insert("ai_inbox", {
      unit_id: input.unitId,
      source: input.source,
      message_id: input.messageId,
      conversation_id: input.conversationId,
      sender_name: input.senderName,
      text: input.text,
      status: "received",
      attempts: 0
    })) as AiInboxRow[];

    const row = rows[0];
    if (!row) {
      throw new Error("Supabase insert returned empty result for ai_inbox");
    }
    return this.mapRow(row);
  }

  async markProcessed(unitId: string, messageId: string, outputMessageId: string | null): Promise<void> {
    const current = await this.find(unitId, messageId);
    if (!current) return;

    const filters = new URLSearchParams({
      unit_id: `eq.${unitId}`,
      message_id: `eq.${messageId}`
    });

    await this.client.update("ai_inbox", filters, {
      status: "processed",
      attempts: current.attempts + 1,
      output_message_id: outputMessageId,
      error: null,
      processed_at: new Date().toISOString()
    });
  }

  async markFailed(unitId: string, messageId: string, error: string): Promise<void> {
    const current = await this.find(unitId, messageId);
    if (!current) return;

    const filters = new URLSearchParams({
      unit_id: `eq.${unitId}`,
      message_id: `eq.${messageId}`
    });

    await this.client.update("ai_inbox", filters, {
      status: "failed",
      attempts: current.attempts + 1,
      error,
      processed_at: new Date().toISOString()
    });
  }

  private mapRow(row: AiInboxRow): AiInboxRecord {
    return {
      unitId: row.unit_id,
      source: row.source,
      messageId: row.message_id,
      conversationId: row.conversation_id,
      senderName: row.sender_name,
      text: row.text,
      status: row.status,
      attempts: row.attempts,
      outputMessageId: row.output_message_id ?? undefined,
      error: row.error ?? undefined,
      createdAt: new Date(row.created_at),
      processedAt: row.processed_at ? new Date(row.processed_at) : undefined
    };
  }
}
