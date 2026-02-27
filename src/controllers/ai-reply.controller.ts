import type { FastifyReply, FastifyRequest } from "fastify";
import { aiReplySchema } from "../schemas/ai-reply.schemas.js";
import type { AiReplyService } from "../services/ai-reply.service.js";
import { ok } from "../utils/response.js";

export class AiReplyController {
  constructor(private readonly aiReplyService: AiReplyService) {}

  async reply(request: FastifyRequest, reply: FastifyReply) {
    const payload = aiReplySchema.parse(request.body);
    request.log.info(
      {
        phase: "auth",
        unitId: payload.unit_id,
        conversationId: payload.conversation_id,
        messageId: payload.message_id,
        source: payload.source
      },
      "AI reply request received"
    );

    const result = await this.aiReplyService.process(payload, request.log, request.id);
    request.log.info(
      {
        phase: "dispatch_out",
        unitId: payload.unit_id,
        conversationId: payload.conversation_id,
        messageId: payload.message_id,
        outputMessageId: result.output_message_id,
        duplicated: result.duplicated,
        deliveryMode: result.delivery_mode
      },
      "AI reply processed"
    );
    return reply.code(200).send(ok(result));
  }
}
