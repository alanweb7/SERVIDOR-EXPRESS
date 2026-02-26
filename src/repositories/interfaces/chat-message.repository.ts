export type ChatMessage = {
  id: string;
  conversationId: string;
  unitId: string;
  senderName: string;
  content: string;
  isMe: boolean;
  messageType: string;
  remoteId?: string;
  createdAt: Date;
};

export type CreateChatMessageInput = {
  conversationId: string;
  unitId: string;
  senderName: string;
  content: string;
  isMe: boolean;
  messageType: string;
  remoteId?: string;
};

export interface ChatMessageRepository {
  listRecentByConversation(conversationId: string, unitId: string, limit: number): Promise<ChatMessage[]>;
  create(input: CreateChatMessageInput): Promise<ChatMessage>;
}
