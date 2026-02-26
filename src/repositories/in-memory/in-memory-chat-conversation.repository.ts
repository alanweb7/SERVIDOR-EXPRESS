import type {
  ChatConversation,
  ChatConversationRepository
} from "../interfaces/chat-conversation.repository.js";

const defaultConversations: ChatConversation[] = [
  {
    id: "conv-ai-1",
    unitId: "unit-1",
    isAiAgent: true,
    aiAgentName: "Nolan Neo",
    aiMode: "assistido",
    unreadCount: 0,
    lastMessage: "",
    updatedAt: new Date()
  },
  {
    id: "conv-human-1",
    unitId: "unit-1",
    isAiAgent: false,
    unreadCount: 0,
    lastMessage: "",
    updatedAt: new Date()
  }
];

export class InMemoryChatConversationRepository implements ChatConversationRepository {
  private readonly store = new Map<string, ChatConversation>();

  constructor(initialData: ChatConversation[] = defaultConversations) {
    for (const item of initialData) {
      this.store.set(item.id, item);
    }
  }

  async findById(conversationId: string): Promise<ChatConversation | null> {
    return this.store.get(conversationId) ?? null;
  }

  async updateAfterAiReply(conversationId: string, unitId: string, content: string): Promise<void> {
    const current = this.store.get(conversationId);
    if (!current || current.unitId !== unitId) return;

    this.store.set(conversationId, {
      ...current,
      lastMessage: content,
      unreadCount: current.unreadCount + 1,
      updatedAt: new Date()
    });
  }
}
