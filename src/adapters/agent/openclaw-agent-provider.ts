import type { ChatMessage } from "../../repositories/interfaces/chat-message.repository.js";

export type OpenClawMessageContext = {
  unitId: string;
  conversationId: string;
  messageId: string;
  senderName: string;
  text: string;
  source: string;
  timestamp: string;
  metadata?: {
    channel?: string;
    remote_jid?: string;
    attachments?: unknown[];
  };
  history: ChatMessage[];
};

export type OpenClawReply = {
  replyText: string;
  agentName: string;
  providerMessageId?: string;
  correlationId?: string;
};

export interface OpenClawAgentProvider {
  readonly providerName: "openclaw";
  sendMessage(context: OpenClawMessageContext): Promise<OpenClawReply>;
}

export class OpenClawProviderError extends Error {
  constructor(
    public readonly code: "openclaw_unavailable",
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}
