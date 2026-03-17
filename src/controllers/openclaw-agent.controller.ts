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

    const trustedInboundMeta = this.buildTrustedInboundMeta(payload);

    return {
      message,
      container: payload.container,
      agent: payload.agent ?? env.OPENCLAW_WEBHOOK_AGENT,
      sessionId: this.resolveWebhookSessionId(payload),
      trustedInboundMeta,
      metadata: {
        ...trustedInboundMeta,
        source_message_id: payload.message_id ?? null,
        source_timestamp: payload.timestamp ?? null,
        sender_user_id: payload.user_id ?? null,
        remote_jid: payload.metadata?.raw_event
          ? this.readRemoteJid(payload.metadata.raw_event)
          : null,
        provider_instance: payload.metadata?.instance ?? null,
      }
    };
  }

  private buildTrustedInboundMeta(payload: OpenClawWebhookSendInput) {
    const channel = this.normalizeChannel(payload.channel);
    const chatType = this.detectChatType(payload);

    return {
      schema: "openclaw.inbound_meta.v1" as const,
      channel,
      provider: channel,
      surface: channel,
      chat_type: chatType,
    };
  }

  private normalizeChannel(raw: string | undefined): string {
    const value = (raw || "").trim().toLowerCase();
    if (value.includes("whats")) return "whatsapp";
    if (value.includes("telegram")) return "telegram";
    if (value.includes("discord")) return "discord";
    if (value.includes("instagram")) return "instagram";
    if (value.includes("web")) return "webchat";
    if (value.includes("internal")) return "webchat";
    return "webchat";
  }

  private detectChatType(payload: OpenClawWebhookSendInput): "direct" | "group" {
    const jid = (
      (payload.metadata?.raw_event && this.readRemoteJid(payload.metadata.raw_event)) ||
      payload.user_id ||
      ""
    )
      .trim()
      .toLowerCase();

    if (jid.endsWith("@g.us")) return "group";
    return "direct";
  }

  private readRemoteJid(rawEvent: Record<string, unknown>): string | null {
    const body = this.asRecord(rawEvent.body);
    const data = this.asRecord(body?.data);
    const key = this.asRecord(data?.key);
    const remoteJid = key?.remoteJid;
    return typeof remoteJid === "string" && remoteJid.trim().length > 0 ? remoteJid.trim() : null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
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
