import type { FastifyReply, FastifyRequest } from "fastify";
import { openClawAgentSendSchema } from "../schemas/openclaw-agent.schemas.js";
import type { OpenClawAgentService } from "../services/openclaw-agent.service.js";
import { ok } from "../utils/response.js";

export class OpenClawAgentController {
  constructor(private readonly service: OpenClawAgentService) {}

  async send(request: FastifyRequest, reply: FastifyReply) {
    const payload = openClawAgentSendSchema.parse(request.body);

    request.log.info(
      {
        phase: "openclaw_agent_send",
        sessionId: payload.sessionId,
        agent: payload.agent,
        container: payload.container
      },
      "OpenClaw agent request received"
    );

    const result = await this.service.send(payload);
    return reply.code(200).send(ok(result));
  }
}