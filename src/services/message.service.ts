import type { FastifyBaseLogger } from "fastify";
import type { QueuePublisher } from "../adapters/queue/queue-publisher.js";
import type { MessageDedupRepository } from "../repositories/interfaces/message-dedup.repository.js";
import type { InboundWebhookInput, SendMessageInput } from "../schemas/message.schemas.js";
import { randomUUID } from "node:crypto";
import { mapInboundToAssistantPayload, extractPayloadIds } from "../integrations/evolution/assistant-payload.mapper.js";
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

  async sendMessage(input: SendMessageInput): Promise<{ queued: boolean; messageId: string }> {
    const messageId = input.messageId ?? randomUUID();
    await this.queuePublisher.publish("messages.send", {
      ...input,
      messageId
    });

    return { queued: true, messageId };
  }
}