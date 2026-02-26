import type {
  ChatMessage,
  ChatMessageRepository,
  CreateChatMessageInput
} from "../interfaces/chat-message.repository.js";
import { SupabaseRestClient } from "../../adapters/db/supabase-rest.client.js";

type MessageRow = {
  id: string;
  conversation_id: string;
  unit_id: string;
  sender_name: string;
  content: string;
  is_me: boolean;
  message_type: string;
  remote_id: string | null;
  created_at: string;
};

export class SupabaseChatMessageRepository implements ChatMessageRepository {
  constructor(private readonly client: SupabaseRestClient) {}

  async listRecentByConversation(conversationId: string, unitId: string, limit: number): Promise<ChatMessage[]> {
    const params = new URLSearchParams({
      select: "id,conversation_id,unit_id,sender_name,content,is_me,message_type,remote_id,created_at",
      conversation_id: `eq.${conversationId}`,
      unit_id: `eq.${unitId}`,
      order: "created_at.desc",
      limit: String(limit)
    });

    const rows = (await this.client.select("chat_messages", params)) as MessageRow[];
    return rows
      .reverse()
      .map((row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        unitId: row.unit_id,
        senderName: row.sender_name,
        content: row.content,
        isMe: row.is_me,
        messageType: row.message_type,
        remoteId: row.remote_id ?? undefined,
        createdAt: new Date(row.created_at)
      }));
  }

  async create(input: CreateChatMessageInput): Promise<ChatMessage> {
    const rows = (await this.client.insert("chat_messages", {
      conversation_id: input.conversationId,
      unit_id: input.unitId,
      sender_name: input.senderName,
      content: input.content,
      is_me: input.isMe,
      message_type: input.messageType,
      remote_id: input.remoteId ?? null
    })) as MessageRow[];

    const row = rows[0];
    if (!row) {
      throw new Error("Supabase insert returned empty result for chat_messages");
    }

    return {
      id: row.id,
      conversationId: row.conversation_id,
      unitId: row.unit_id,
      senderName: row.sender_name,
      content: row.content,
      isMe: row.is_me,
      messageType: row.message_type,
      remoteId: row.remote_id ?? undefined,
      createdAt: new Date(row.created_at)
    };
  }
}
