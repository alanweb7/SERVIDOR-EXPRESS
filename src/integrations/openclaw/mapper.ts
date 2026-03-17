import type { AiReplyInput } from "../../schemas/ai-reply.schemas.js";
import type { ChatMessage } from "../../repositories/interfaces/chat-message.repository.js";

type TrustedInboundMetadata = {
  schema: "openclaw.inbound_meta.v1";
  channel: string;
  provider: string;
  surface: string;
  chat_type: "direct" | "group";
};

type OpenClawChatInput = {
  sessionKey: string;
  message: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  trustedInboundMeta: TrustedInboundMetadata;
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

  const trustedInboundMeta = buildTrustedInboundMeta(payload);

  return {
    sessionKey,
    message: payload.text,
    idempotencyKey: payload.message_id,
    trustedInboundMeta,
    metadata: {
      ...trustedInboundMeta,
      source: payload.source,
      remote_jid: payload.metadata?.remote_jid ?? null,
      attachments: payload.metadata?.attachments ?? [],
      unit_id: payload.unit_id,
      conversation_id: payload.conversation_id,
    },
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

function buildTrustedInboundMeta(payload: AiReplyInput): TrustedInboundMetadata {
  const normalizedChannel = normalizeChannel(payload.metadata?.channel ?? payload.source);
  const chatType = detectChatType(payload.metadata?.remote_jid);

  return {
    schema: "openclaw.inbound_meta.v1",
    channel: normalizedChannel,
    provider: normalizedChannel,
    surface: normalizedChannel,
    chat_type: chatType,
  };
}

function normalizeChannel(raw: string | undefined): string {
  const value = String(raw || "")
    .trim()
    .toLowerCase();

  if (value.includes("whats")) return "whatsapp";
  if (value.includes("telegram")) return "telegram";
  if (value.includes("discord")) return "discord";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("web")) return "webchat";
  if (value.includes("internal")) return "webchat";

  return "webchat";
}

function detectChatType(remoteJid: string | undefined): "direct" | "group" {
  const jid = String(remoteJid || "")
    .trim()
    .toLowerCase();

  if (jid.endsWith("@g.us")) return "group";
  return "direct";
}
