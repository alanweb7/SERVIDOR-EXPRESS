export type ChatConversation = {
  id: string;
  unitId: string;
  isAiAgent: boolean;
  aiAgentName?: string;
  aiMode?: string;
  unreadCount: number;
  lastMessage?: string;
  updatedAt: Date;
};

export interface ChatConversationRepository {
  findById(conversationId: string): Promise<ChatConversation | null>;
  updateAfterAiReply(conversationId: string, unitId: string, content: string): Promise<void>;
}
