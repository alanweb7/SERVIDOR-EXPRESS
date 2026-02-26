import { randomUUID } from "node:crypto";
import type {
  ChatMessage,
  ChatMessageRepository,
  CreateChatMessageInput
} from "../interfaces/chat-message.repository.js";

export class InMemoryChatMessageRepository implements ChatMessageRepository {
  private readonly store = new Map<string, ChatMessage[]>();

  async listRecentByConversation(conversationId: string, limit: number): Promise<ChatMessage[]> {
    const messages = this.store.get(conversationId) ?? [];
    return messages.slice(Math.max(messages.length - limit, 0));
  }

  async create(input: CreateChatMessageInput): Promise<ChatMessage> {
    const newMessage: ChatMessage = {
      id: randomUUID(),
      ...input,
      createdAt: new Date()
    };

    const current = this.store.get(input.conversationId) ?? [];
    current.push(newMessage);
    this.store.set(input.conversationId, current);
    return newMessage;
  }
}
