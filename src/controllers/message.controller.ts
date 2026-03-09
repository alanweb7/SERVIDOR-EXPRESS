import type { FastifyReply, FastifyRequest } from "fastify";
import { inboundBridgeSchema, inboundWebhookSchema, sendMessageSchema } from "../schemas/message.schemas.js";
import { MessageService } from "../services/message.service.js";
import { ok } from "../utils/response.js";

export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  async inbound(request: FastifyRequest, reply: FastifyReply) {
    const bridgePayload = inboundBridgeSchema.safeParse(request.body);
    if (bridgePayload.success) {
      request.log.info({ body: bridgePayload.data }, "Inbound bridge recebido");
      const result = await this.messageService.processInboundBridge(bridgePayload.data);
      return reply.code(200).send(result);
    }

    const payload = inboundWebhookSchema.parse(request.body);
    request.log.info({ body: payload }, "Inbound webhook recebido");
    const result = await this.messageService.processInbound(payload, request.log);
    return reply.code(result.duplicate ? 200 : 202).send(ok(result));
  }

  async send(request: FastifyRequest, reply: FastifyReply) {
    const payload = sendMessageSchema.parse(request.body);
    request.log.info({ body: payload }, "Solicitacao de envio recebida");
    const result = await this.messageService.sendMessage(payload);
    return reply.code(202).send(ok(result));
  }
}
