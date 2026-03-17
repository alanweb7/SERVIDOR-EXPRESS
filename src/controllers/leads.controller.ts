import type { FastifyReply, FastifyRequest } from "fastify";
import { createLeadWebhookSchema } from "../schemas/leads.schemas.js";
import { LeadsService } from "../services/leads.service.js";
import { ok } from "../utils/response.js";

export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  async upsertFromWebhook(request: FastifyRequest, reply: FastifyReply) {
    const payload = createLeadWebhookSchema.parse(request.body);
    request.log.info(
      {
        ticket_id: payload.ticket.id,
        contact_number: payload.contact.number,
        whatsapp_number: payload.whatsapp.number || null
      },
      "Webhook de lead recebido"
    );

    const result = await this.leadsService.upsertLeadFromWebhook(payload);
    return reply.code(result.created ? 201 : 200).send(ok(result));
  }
}

