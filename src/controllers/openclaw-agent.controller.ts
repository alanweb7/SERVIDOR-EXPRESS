import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
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

    if (payload.mode === "async") {
      const jobId = `job_${randomUUID().replace(/-/g, "")}`;
      const etaSec = 8;

      void this.service
        .send(forced)
        .then(async (result) => {
          if (!payload.callback?.url) return;
          await this.sendCallback(payload.callback.url, payload.callback.auth_header, {
            accepted: true,
            job_id: jobId,
            status: "completed",
            result
          });
        })
        .catch(async (error) => {
          if (!payload.callback?.url) return;
          await this.sendCallback(payload.callback.url, payload.callback.auth_header, {
            accepted: true,
            job_id: jobId,
            status: "failed",
            error: {
              code: "openclaw_command_failed",
              message: error instanceof Error ? error.message : "Falha ao executar comando OpenClaw"
            }
          });
        });

      return reply.code(202).send({
        accepted: true,
        job_id: jobId,
        status: "queued",
        eta_sec: etaSec
      });
    }

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
      sessionId: this.resolveWebhookSessionId(payload)
    };
  }

  private resolveWebhookSessionId(payload: OpenClawWebhookSendInput): string {
    const explicitSessionId = payload.sessionId?.trim() || payload.session_id?.trim();
    if (explicitSessionId) {
      return explicitSessionId;
    }

    const rawUserId = payload.user_id?.trim() ?? "";
    if (!rawUserId) {
      return env.OPENCLAW_WEBHOOK_SESSION_ID;
    }

    const normalizedUser = rawUserId
      .replace(/@.*$/, "")
      .replace(/[^A-Za-z0-9._:/-]/g, "");
    const normalizedChannel = (payload.channel?.trim() ?? "webhook")
      .toLowerCase()
      .replace(/[^A-Za-z0-9._:/-]/g, "");

    if (!normalizedUser) {
      return env.OPENCLAW_WEBHOOK_SESSION_ID;
    }

    return `${normalizedChannel || "webhook"}:${normalizedUser}`;
  }

  private async sendCallback(url: string, authHeader: string | undefined, payload: unknown): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (authHeader) {
      headers.Authorization = authHeader;
    }

    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }).catch(() => undefined);
  }
}
