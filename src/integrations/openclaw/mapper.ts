import type { AiReplyInput } from "../../schemas/ai-reply.schemas.js";
import type { ChatMessage } from "../../repositories/interfaces/chat-message.repository.js";

type OpenClawChatInput = {
  sessionKey: string;
  message: string;
  idempotencyKey: string;
  audit: {
    unitId: string;
    senderName: string;
    timestamp: string;
    source: string;
    metadata?: AiReplyInput["metadata"];
    conversationId: string;
    historySize: number;
  };
};

const sessionMemory = new Map<string, string>();

export function mapToOpenClawChatInput(
  payload: AiReplyInput,
  history: ChatMessage[],
  sessionDefault?: string
): OpenClawChatInput {
  const key = `${payload.unit_id}:${payload.conversation_id}`;
  const deterministicSession = sessionDefault?.trim() || `agent:${payload.unit_id}:${payload.conversation_id}`;
  const sessionKey = sessionMemory.get(key) ?? deterministicSession;
  sessionMemory.set(key, sessionKey);

  return {
    sessionKey,
    message: payload.text,
    idempotencyKey: payload.message_id,
    audit: {
      unitId: payload.unit_id,
      senderName: payload.sender_name,
      timestamp: payload.timestamp,
      source: payload.source,
      metadata: payload.metadata,
      conversationId: payload.conversation_id,
      historySize: history.length
    }
  };
}

