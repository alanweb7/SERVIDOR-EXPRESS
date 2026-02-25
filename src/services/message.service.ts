import type { QueuePublisher } from "../adapters/queue/queue-publisher.js";
import type { MessageDedupRepository } from "../repositories/interfaces/message-dedup.repository.js";
import type { InboundWebhookInput, SendMessageInput } from "../schemas/message.schemas.js";
import { randomUUID } from "node:crypto";

export class MessageService {
  constructor(
    private readonly dedupRepository: MessageDedupRepository,
    private readonly queuePublisher: QueuePublisher
  ) {}

  async processInbound(payload: InboundWebhookInput): Promise<{ accepted: boolean; duplicate: boolean; messageId: string }> {
    const messageId = payload.messageId ?? randomUUID();
    const duplicate = await this.dedupRepository.has(messageId);

    if (duplicate) {
      return { accepted: false, duplicate: true, messageId };
    }

    await this.dedupRepository.save(messageId);
    await this.queuePublisher.publish("inbound.received", {
      ...payload,
      messageId
    });

    return { accepted: true, duplicate: false, messageId };
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
