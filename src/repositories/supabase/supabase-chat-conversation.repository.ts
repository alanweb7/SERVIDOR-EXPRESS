import type {
  ChatConversation,
  ChatConversationRepository
} from "../interfaces/chat-conversation.repository.js";
import { SupabaseRestClient } from "../../adapters/db/supabase-rest.client.js";

type ConversationRow = {
  id: string;
  unit_id: string;
  is_ai_agent: boolean;
  ai_agent_name: string | null;
  ai_mode: string | null;
  unread_count: number | null;
  last_message: string | null;
  updated_at: string | null;
};

export class SupabaseChatConversationRepository implements ChatConversationRepository {
  constructor(private readonly client: SupabaseRestClient) {}

  async findById(conversationId: string): Promise<ChatConversation | null> {
    const params = new URLSearchParams({
      select: "id,unit_id,is_ai_agent,ai_agent_name,ai_mode,unread_count,last_message,updated_at",
      id: `eq.${conversationId}`,
      limit: "1"
    });

    const rows = (await this.client.select("chat_conversations", params)) as ConversationRow[];
    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      unitId: row.unit_id,
      isAiAgent: row.is_ai_agent,
      aiAgentName: row.ai_agent_name ?? undefined,
      aiMode: row.ai_mode ?? undefined,
      unreadCount: row.unread_count ?? 0,
      lastMessage: row.last_message ?? undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at) : new Date()
    };
  }

  async updateAfterAiReply(conversationId: string, unitId: string, content: string): Promise<void> {
    const current = await this.findById(conversationId);
    if (!current || current.unitId !== unitId) return;

    const filters = new URLSearchParams({
      id: `eq.${conversationId}`,
      unit_id: `eq.${unitId}`
    });
    await this.client.update("chat_conversations", filters, {
      last_message: content,
      unread_count: current.unreadCount + 1,
      updated_at: new Date().toISOString()
    });
  }
}
