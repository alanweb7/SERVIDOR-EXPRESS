import { randomUUID } from "node:crypto";
import type { InboundWebhookInput } from "../../schemas/message.schemas.js";
import {
  assistantInboundPayloadSchema,
  type AssistantInboundPayload
} from "../../schemas/assistant-inbound.schemas.js";

type MessageType = "text" | "image" | "audio" | "video" | "document";

type RecordLike = Record<string, unknown>;

export function mapInboundToAssistantPayload(input: InboundWebhookInput): AssistantInboundPayload {
  const directCandidate = asRecord(input);
  const payloadCandidate = asRecord(input.payload);

  const legacyCandidate = looksLikeStandardPayload(payloadCandidate)
    ? payloadCandidate
    : looksLikeStandardPayload(directCandidate)
      ? directCandidate
      : null;

  if (legacyCandidate) {
    return assistantInboundPayloadSchema.parse({
      ...legacyCandidate,
      metadata: {
        provider: asString(asRecord(legacyCandidate.metadata)?.provider) ?? "evolution",
        instance: asString(asRecord(legacyCandidate.metadata)?.instance) ?? "unknown",
        raw_event: asRecord(asRecord(legacyCandidate.metadata)?.raw_event) ?? legacyCandidate
      }
    });
  }

  const sourceRoot = payloadCandidate ?? directCandidate;
  const evo = asRecord(sourceRoot?.body) ?? sourceRoot;

  const data = asRecord(evo?.data) ?? {};
  const key = asRecord(data.key) ?? {};
  const messageNode = asRecord(data.message) ?? asRecord(evo?.message) ?? {};

  const messageType = normalizeMessageType(asString(data.messageType), messageNode);
  const userId = normalizeUserId(
    asString(key.remoteJid) ?? asString(data.from) ?? asString(evo?.from) ?? "unknown"
  );
  const instance = asString(evo?.instance) ?? "unknown";
  const messageId =
    asString(key.id) ?? asString(data.id) ?? asString(input.messageId) ?? randomUUID();
  const timestamp = normalizeTimestamp(
    asString(data.messageTimestamp) ?? asString(evo?.date_time) ?? asString(evo?.timestamp)
  );

  const text = extractText(messageNode);
  const mediaNode = mediaNodeByType(messageNode, messageType);
  const mediaUrl = asString(mediaNode?.url) ?? asString(mediaNode?.mediaUrl) ?? null;
  const mimeType = asString(mediaNode?.mimetype) ?? asString(mediaNode?.mime_type) ?? null;
  const caption = asString(mediaNode?.caption) ?? null;
  const filename = asString(mediaNode?.fileName) ?? asString(mediaNode?.file_name) ?? null;
  const durationSec = asNumber(mediaNode?.seconds) ?? asNumber(mediaNode?.duration) ?? null;

  const normalizedMessage = resolveMessageText(messageType, text, caption);

  const mapped: AssistantInboundPayload = {
    session_id: `${instance}:${userId}`,
    user_id: userId,
    channel: "whatsapp",
    message_id: messageId,
    timestamp,
    message_type: messageType,
    message: normalizedMessage,
    media: {
      url: messageType === "text" ? null : mediaUrl,
      mime_type: messageType === "text" ? null : mimeType,
      caption: caption,
      filename,
      duration_sec: durationSec
    },
    metadata: {
      provider: "evolution",
      instance,
      raw_event: evo ?? {}
    }
  };

  return assistantInboundPayloadSchema.parse(mapped);
}

export function extractPayloadIds(input: InboundWebhookInput): { session_id?: string; message_id?: string } {
  const root = asRecord(input.payload) ?? asRecord(input);
  const body = asRecord(root?.body) ?? root;
  const data = asRecord(body?.data) ?? {};
  const key = asRecord(data?.key) ?? {};

  const instance = asString(body?.instance) ?? asString(asRecord(root?.metadata)?.instance);
  const remote = asString(key?.remoteJid) ?? asString(data?.from) ?? asString(body?.from);
  const userId = remote ? normalizeUserId(remote) : undefined;

  return {
    message_id:
      asString(key?.id) ?? asString(data?.id) ?? asString(root?.messageId) ?? undefined,
    session_id: instance && userId ? `${instance}:${userId}` : undefined
  };
}

function looksLikeStandardPayload(value: RecordLike | undefined): value is RecordLike {
  if (!value) return false;
  return (
    typeof value.session_id === "string" &&
    typeof value.user_id === "string" &&
    typeof value.message_id === "string" &&
    typeof value.message_type === "string"
  );
}

function normalizeMessageType(rawType: string | undefined, messageNode: RecordLike): MessageType {
  const raw = (rawType ?? "").toLowerCase();
  if (raw.includes("image")) return "image";
  if (raw.includes("audio")) return "audio";
  if (raw.includes("video")) return "video";
  if (raw.includes("document") || raw.includes("file")) return "document";
  if (raw.includes("text")) return "text";

  if (asRecord(messageNode.imageMessage)) return "image";
  if (asRecord(messageNode.audioMessage)) return "audio";
  if (asRecord(messageNode.videoMessage)) return "video";
  if (asRecord(messageNode.documentMessage)) return "document";
  return "text";
}

function mediaNodeByType(messageNode: RecordLike, type: MessageType): RecordLike {
  if (type === "image") return asRecord(messageNode.imageMessage) ?? {};
  if (type === "audio") return asRecord(messageNode.audioMessage) ?? {};
  if (type === "video") return asRecord(messageNode.videoMessage) ?? {};
  if (type === "document") return asRecord(messageNode.documentMessage) ?? {};
  return {};
}

function extractText(messageNode: RecordLike): string {
  return (
    asString(messageNode.conversation) ??
    asString(asRecord(messageNode.extendedTextMessage)?.text) ??
    asString(messageNode.text) ??
    ""
  ).trim();
}

function resolveMessageText(type: MessageType, text: string, caption: string | null): string {
  if (type === "text") return text;
  if (type === "audio") {
    if (text.trim().length > 0) return text;
    return "[audio recebido]";
  }
  if (caption && caption.trim().length > 0) return caption.trim();
  return text;
}

function normalizeTimestamp(value?: string): string {
  if (!value) return new Date().toISOString();

  if (/^\d+$/.test(value)) {
    const asNumberValue = Number(value);
    const ms = asNumberValue > 1_000_000_000_000 ? asNumberValue : asNumberValue * 1000;
    return new Date(ms).toISOString();
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function normalizeUserId(value: string): string {
  return value.split("@")[0]?.trim() || value.trim();
}

function asRecord(value: unknown): RecordLike | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as RecordLike;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}