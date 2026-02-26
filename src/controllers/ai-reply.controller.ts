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
        unitId: payload.unit_id,
        conversationId: payload.conversation_id,
        messageId: payload.message_id,
        source: payload.source
      },
      "AI reply request received"
    );

    const result = await this.aiReplyService.process(payload);
    request.log.info(
      {
        unitId: payload.unit_id,
        conversationId: payload.conversation_id,
        messageId: payload.message_id,
        outputMessageId: result.output_message_id,
        provider: result.provider_name,
        fallback: result.fallback_in_use,
        duplicated: result.duplicated
      },
      "AI reply processed"
    );
    return reply.code(200).send(ok(result));
  }
}
