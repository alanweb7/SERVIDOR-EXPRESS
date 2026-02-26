import { randomUUID } from "node:crypto";
import type { QueuePublisher } from "../queue/queue-publisher.js";
import { DispatchOutboundError, type DispatchOutboundInput, type OutboundDispatcher } from "./outbound-dispatcher.js";

export class QueueOutboundDispatcher implements OutboundDispatcher {
  constructor(private readonly queuePublisher: QueuePublisher) {}

  async dispatchReply(input: DispatchOutboundInput): Promise<{ dispatchId?: string }> {
    const dispatchId = randomUUID();
    try {
      await this.queuePublisher.publish("ai.reply.dispatch", {
        dispatch_id: dispatchId,
        unit_id: input.unitId,
        conversation_id: input.conversationId,
        input_message_id: input.inputMessageId,
        output_message_id: input.outputMessageId,
        source: input.source,
        text: input.text,
        metadata: input.metadata ?? {}
      });

      return { dispatchId };
    } catch {
      throw new DispatchOutboundError("dispatch_failed", "Outbound dispatch failed", true);
    }
  }
}
