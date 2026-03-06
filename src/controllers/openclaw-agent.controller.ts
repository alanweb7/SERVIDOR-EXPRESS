import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import {
  openClawAgentSendSchema,
  openClawWebhookSendSchema,
  type OpenClawWebhookSendInput
} from "../schemas/openclaw-agent.schemas.js";
import type { OpenClawAgentService } from "../services/openclaw-agent.service.js";
import { ok } from "../utils/response.js";
import { HttpError } from "../utils/http-error.js";

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

  async sendWebhook(request: FastifyRequest, reply: FastifyReply) {
    const payload = openClawWebhookSendSchema.parse(request.body);
    const forced = this.normalizeWebhookPayload(payload);

    request.log.info(
      {
        phase: "openclaw_agent_send_webhook",
        sessionId: forced.sessionId,
        agent: forced.agent,
        container: forced.container
      },
      "OpenClaw webhook request received"
    );

    const result = await this.service.send(forced);
    return reply.code(200).send(ok(result));
  }

  private normalizeWebhookPayload(payload: OpenClawWebhookSendInput) {
    const messageType = payload.message_type ?? "text";
    const caption = payload.media?.caption?.trim() ?? "";
    const directMessage = payload.message?.trim() ?? "";
    const mediaUrl = payload.media?.url?.trim() ?? "";
    const mediaMime = payload.media?.mime_type?.trim() ?? "";
    const mediaFile = payload.media?.filename?.trim() ?? "";
    const duration = payload.media?.duration_sec;

    let message = directMessage || caption;

    if (!message) {
      if (messageType === "audio") message = "[audio recebido]";
      if (messageType === "image") message = "[imagem recebida]";
      if (messageType === "video") message = "[video recebido]";
      if (messageType === "document") message = "[documento recebido]";
    }

    if (mediaUrl) {
      const mediaLines = [
        `[message_type] ${messageType}`,
        `[media_url] ${mediaUrl}`,
        mediaMime ? `[media_mime] ${mediaMime}` : "",
        mediaFile ? `[media_filename] ${mediaFile}` : "",
        typeof duration === "number" ? `[media_duration_sec] ${duration}` : ""
      ]
        .filter(Boolean)
        .join("\n");

      message = message ? `${message}\n${mediaLines}` : mediaLines;
    }

    if (!message) {
      throw new HttpError(422, "VALIDATION_ERROR", "message nao pode ser vazio");
    }

    return {
      message,
      container: payload.container,
      agent: payload.agent ?? env.OPENCLAW_WEBHOOK_AGENT,
      sessionId: payload.sessionId ?? payload.session_id ?? env.OPENCLAW_WEBHOOK_SESSION_ID
    };
  }
}
