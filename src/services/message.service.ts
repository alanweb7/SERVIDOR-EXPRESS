import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { QueuePublisher } from "../adapters/queue/queue-publisher.js";
import { env } from "../config/env.js";
import { mapInboundToAssistantPayload, extractPayloadIds } from "../integrations/evolution/assistant-payload.mapper.js";
import type { MessageDedupRepository } from "../repositories/interfaces/message-dedup.repository.js";
import type { InboundBridgeInput, InboundWebhookInput, SendMessageInput } from "../schemas/message.schemas.js";
import { HttpError } from "../utils/http-error.js";

export class MessageService {
  constructor(
    private readonly dedupRepository: MessageDedupRepository,
    private readonly queuePublisher: QueuePublisher
  ) {}

  async processInbound(
    payload: InboundWebhookInput,
    logger?: FastifyBaseLogger
  ): Promise<{ accepted: boolean; duplicate: boolean; messageId: string; sessionId?: string; messageType?: string }> {
    let normalized;

    try {
      normalized = mapInboundToAssistantPayload(payload);
    } catch (error) {
      const ids = extractPayloadIds(payload);
      logger?.error(
        {
          phase: "validate_inbound_payload",
          message_id: ids.message_id,
          session_id: ids.session_id,
          err: error instanceof Error ? error : new Error(String(error))
        },
        "Falha de validacao do payload padronizado"
      );
      throw new HttpError(422, "VALIDATION_ERROR", "Payload inbound invalido", error);
    }

    const messageId = normalized.message_id || payload.messageId || randomUUID();
    const duplicate = await this.dedupRepository.has(messageId);

    if (duplicate) {
      return {
        accepted: false,
        duplicate: true,
        messageId,
        sessionId: normalized.session_id,
        messageType: normalized.message_type
      };
    }

    await this.dedupRepository.save(messageId);
    await this.queuePublisher.publish("inbound.received", normalized);

    return {
      accepted: true,
      duplicate: false,
      messageId,
      sessionId: normalized.session_id,
      messageType: normalized.message_type
    };
  }

  async processInboundBridge(
    input: InboundBridgeInput
  ): Promise<{ ok: boolean; requestId: string; openclawStatus: number; callbackStatus: number }> {
    const openclawToken = (env.OPENCLAW_TOKEN || "").trim();
    const callbackUrl = (input.callbackUrl || env.CALLBACK_URL || "").trim();

    if (!openclawToken) {
      throw new HttpError(503, "bridge_not_configured", "OPENCLAW_TOKEN nao configurado");
    }

    if (!callbackUrl) {
      throw new HttpError(503, "bridge_not_configured", "CALLBACK_URL nao configurado");
    }

    const ocResp = await fetch(env.OPENCLAW_HOOK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openclawToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agentId: input.agentId,
        sessionKey: input.sessionKey,
        message: input.message,
        wakeMode: "now",
        deliver: false,
        name: `bridge:${input.customerId || "unknown"}`
      })
    });

    if (!ocResp.ok) {
      const detail = await ocResp.text();
      throw new HttpError(502, "openclaw_error", "Falha ao chamar hook OpenClaw", {
        status: ocResp.status,
        detail: detail.slice(0, 1500)
      });
    }

    const cbResp = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: input.requestId,
        reply: "Recebi sua mensagem e ja estou processando ✅"
      })
    });

    if (!cbResp.ok) {
      const detail = await cbResp.text();
      throw new HttpError(502, "callback_error", "Falha ao chamar callback", {
        status: cbResp.status,
        detail: detail.slice(0, 1500)
      });
    }

    return {
      ok: true,
      requestId: input.requestId,
      openclawStatus: ocResp.status,
      callbackStatus: cbResp.status
    };
  }

  async sendMessage(input: SendMessageInput): Promise<{ queued: boolean; messageId: string }> {
    const messageId = input.messageId ?? randomUUID();
    await this.queuePublisher.publish("messages.send", {
      ...input,
      messageId
    });

    return { queued: true, messageId };
  }
}
