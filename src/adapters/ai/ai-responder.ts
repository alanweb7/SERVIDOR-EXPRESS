import type { ChatMessage } from "../../repositories/interfaces/chat-message.repository.js";

export type GenerateAiReplyInput = {
  agentName: string;
  conversationId: string;
  unitId: string;
  userText: string;
  source: string;
  senderName: string;
  contextMessages: ChatMessage[];
};

export interface AiResponder {
  readonly providerName: string;
  readonly isFallback: boolean;
  generateReply(input: GenerateAiReplyInput): Promise<string>;
}
