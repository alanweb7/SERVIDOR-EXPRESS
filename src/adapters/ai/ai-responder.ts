import type { ChatMessage } from "../../repositories/interfaces/chat-message.repository.js";

export type GenerateAiReplyInput = {
  agentName: string;
  conversationId: string;
  unitId: string;
  userText: string;
  contextMessages: ChatMessage[];
};

export interface AiResponder {
  generateReply(input: GenerateAiReplyInput): Promise<string>;
}
