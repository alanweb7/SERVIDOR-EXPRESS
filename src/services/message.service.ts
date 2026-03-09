import { createHmac, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { FastifyBaseLogger } from "fastify";
import type { QueuePublisher } from "../adapters/queue/queue-publisher.js";
import { env } from "../config/env.js";
import { mapInboundToAssistantPayload, extractPayloadIds } from "../integrations/evolution/assistant-payload.mapper.js";
import type { MessageDedupRepository } from "../repositories/interfaces/message-dedup.repository.js";
import type { InboundBridgeInput, InboundWebhookInput, SendMessageInput } from "../schemas/message.schemas.js";
import { HttpError } from "../utils/http-error.js";

const DEFAULT_SYSTEM_PROMPT = "Responda de forma clara e util.";
const SYSTEM_BY_AGENT: Record<string, string> = {
  "luna-clara":
    "Voce e Luna Clara, especialista em Vendas e Atendimento. Responda de forma acolhedora, objetiva e persuasiva sem pressao.",
  "edu-ben":
    "Voce e Edu Ben, especialista em Suporte Tecnico. Responda de forma calma, tecnica e didatica, focando em diagnostico e solucao."
};

type BridgeSyncResult = {
  ok: boolean;
  mode: "sync";
  requestId: string;
  sessionKey: string;
  reply: string;
};

type BridgeAsyncResult = {
  ok: boolean;
  mode: "async";
  requestId: string;
  sessionKey: string;
  status: "accepted";
};

type BridgeResult = BridgeSyncResult | BridgeAsyncResult;

type AsyncBridgeJob = {
  requestId: string;
  customerId: string;
  agentId: string;
  sessionKey: string;
  callbackUrl: string;
  systemPrompt: string;
  message: string;
};

export class MessageService {
  private readonly asyncJobs = new Map<string, AsyncBridgeJob>();

  constructor(
    private readonly dedupRepository: MessageDedupRepository,
    private readonly queuePublisher: QueuePublisher
  ) {}

  async processInbound(
    payload: InboundWebhookInput,
    logger?: FastifyBaseLogger
  ): Promise<{ accepted: boolean; duplicate: boolean; messageId: string; sessionId?: string; messageType?: string }> {
    let normalized;

    try {
      normalized = mapInboundToAssistantPayload(payload);
    } catch (error) {
      const ids = extractPayloadIds(payload);
      logger?.error(
        {
          phase: "validate_inbound_payload",
          message_id: ids.message_id,
          session_id: ids.session_id,
          err: error instanceof Error ? error : new Error(String(error))
        },
        "Falha de validacao do payload padronizado"
      );
      throw new HttpError(422, "VALIDATION_ERROR", "Payload inbound invalido", error);
    }

    const messageId = normalized.message_id || payload.messageId || randomUUID();
    const duplicate = await this.dedupRepository.has(messageId);

    if (duplicate) {
      return {
        accepted: false,
        duplicate: true,
        messageId,
        sessionId: normalized.session_id,
        messageType: normalized.message_type
      };
    }

    await this.dedupRepository.save(messageId);
    await this.queuePublisher.publish("inbound.received", normalized);

    return {
      accepted: true,
      duplicate: false,
      messageId,
      sessionId: normalized.session_id,
      messageType: normalized.message_type
    };
  }

  async processInboundBridge(input: InboundBridgeInput): Promise<BridgeResult> {
    const mode = input.mode ?? "sync";
    const callbackUrl = (input.callbackUrl || env.CALLBACK_URL || "").trim();
    const sessionKey = this.normalizeSessionKey(input.sessionKey, input.customerId, input.agentId);
    const systemPrompt = input.systemPrompt || SYSTEM_BY_AGENT[input.agentId] || DEFAULT_SYSTEM_PROMPT;
    const dedupId = `bridge:${input.requestId}`;

    const duplicate = await this.dedupRepository.has(dedupId);
    if (duplicate) {
      if (mode === "async") {
        return { ok: true, mode: "async", requestId: input.requestId, sessionKey, status: "accepted" };
      }
      return { ok: true, mode: "sync", requestId: input.requestId, sessionKey, reply: "duplicate_request_ignored" };
    }

    if (mode === "async") {
      if (!callbackUrl) {
        throw new HttpError(422, "VALIDATION_ERROR", "callbackUrl e obrigatorio quando mode=async");
      }

      const job: AsyncBridgeJob = {
        requestId: input.requestId,
        customerId: input.customerId,
        agentId: input.agentId,
        sessionKey,
        callbackUrl,
        systemPrompt,
        message: String(input.message)
      };

      await this.dedupRepository.save(dedupId);
      this.asyncJobs.set(dedupId, job);
      void this.executeAsyncBridgeJob(dedupId);

      return { ok: true, mode: "async", requestId: input.requestId, sessionKey, status: "accepted" };
    }

    const reply = await this.requestOpenClawResponse({
      requestId: input.requestId,
      customerId: input.customerId,
      agentId: input.agentId,
      sessionKey,
      systemPrompt,
      message: String(input.message)
    });

    if (callbackUrl) {
      await this.sendCallbackWithRetry(
        callbackUrl,
        {
          requestId: input.requestId,
          customerId: input.customerId,
          agentId: input.agentId,
          sessionKey,
          status: "ok",
          reply,
          timestamp: new Date().toISOString()
        },
        input.requestId
      );
    }

    await this.dedupRepository.save(dedupId);
    return { ok: true, mode: "sync", requestId: input.requestId, sessionKey, reply };
  }

  async sendMessage(input: SendMessageInput): Promise<{ queued: boolean; messageId: string }> {
    const messageId = input.messageId ?? randomUUID();
    await this.queuePublisher.publish("messages.send", {
      ...input,
      messageId
    });

    return { queued: true, messageId };
  }

  private async executeAsyncBridgeJob(dedupId: string): Promise<void> {
    const job = this.asyncJobs.get(dedupId);
    if (!job) return;

    try {
      const reply = await this.requestOpenClawResponse(job);
      await this.sendCallbackWithRetry(
        job.callbackUrl,
        {
          requestId: job.requestId,
          customerId: job.customerId,
          agentId: job.agentId,
          sessionKey: job.sessionKey,
          status: "ok",
          reply,
          timestamp: new Date().toISOString()
        },
        job.requestId
      );
      await this.queuePublisher.publish("bridge.callback.sent", {
        requestId: job.requestId,
        sessionKey: job.sessionKey
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.queuePublisher.publish("bridge.callback.failed", {
        requestId: job.requestId,
        callbackUrl: job.callbackUrl,
        reason
      });
    } finally {
      this.asyncJobs.delete(dedupId);
    }
  }

  private async requestOpenClawResponse(input: {
    requestId: string;
    customerId: string;
    agentId: string;
    sessionKey: string;
    systemPrompt: string;
    message: string;
  }): Promise<string> {
    const gatewayToken = (env.OPENCLAW_GATEWAY_TOKEN || "").trim();
    if (!gatewayToken) {
      throw new HttpError(503, "bridge_not_configured", "OPENCLAW_GATEWAY_TOKEN nao configurado");
    }

    const model = `openclaw:${input.agentId}`;
    const user = `cust:${input.customerId}:agent:${input.agentId}`;

    const oc = await fetch(`${env.OPENCLAW_BASE_URL}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayToken}`
      },
      body: JSON.stringify({
        model,
        user,
        instructions: input.systemPrompt,
        input: input.message,
        metadata: {
          sessionKey: input.sessionKey,
          agentId: input.agentId,
          requestId: input.requestId,
          customerId: input.customerId
        }
      })
    });

    if (!oc.ok) {
      const detail = await oc.text();
      console.error("OpenClaw /v1/responses error", {
        status: oc.status,
        statusText: oc.statusText,
        body: detail
      });
      throw new HttpError(502, "openclaw_error", "Falha ao chamar /v1/responses", {
        status: oc.status,
        detail: detail.slice(0, 1500)
      });
    }

    const data = (await oc.json()) as Record<string, unknown>;
    return this.extractResponseText(data) || "Sem resposta.";
  }

  private normalizeSessionKey(sessionKey: string | undefined, customerId: string, agentId: string): string {
    const cleaned = (sessionKey || "").trim();
    if (cleaned) {
      if (cleaned.startsWith("cust:") || cleaned.startsWith("hook:")) {
        return cleaned;
      }
      return `cust:${cleaned}`;
    }
    return `cust:${customerId}:agent:${agentId}`;
  }

  private extractResponseText(data: Record<string, unknown>): string {
    const direct = typeof data.output_text === "string" ? data.output_text.trim() : "";
    if (direct) return direct;

    const output = data.output;
    if (!Array.isArray(output)) return "";

    const chunks: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const textValue = (part as { text?: unknown; value?: unknown }).text;
        if (typeof textValue === "string" && textValue.trim()) {
          chunks.push(textValue.trim());
          continue;
        }
        const value = (part as { value?: unknown }).value;
        if (typeof value === "string" && value.trim()) {
          chunks.push(value.trim());
        }
      }
    }
    return chunks.join(" ").trim();
  }

  private async sendCallbackWithRetry(url: string, payload: Record<string, unknown>, requestId: string): Promise<number> {
    const maxAttempts = 3;
    let lastStatus = 0;
    let lastDetail = "";
    const body = JSON.stringify(payload);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Idempotency-Key": requestId
      };
      if (env.CALLBACK_SIGNING_SECRET) {
        headers["x-callback-signature"] = createHmac("sha256", env.CALLBACK_SIGNING_SECRET).update(body).digest("hex");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), env.CALLBACK_TIMEOUT_MS);
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal
      }).catch((error: unknown) => {
        lastDetail = error instanceof Error ? error.message : String(error);
        return null;
      }).finally(() => clearTimeout(timeout));

      if (response && response.ok) {
        return response.status;
      }

      if (response) {
        lastStatus = response.status;
        lastDetail = (await response.text()).slice(0, 1500);
      }

      if (attempt < maxAttempts) {
        await sleep(500 * 2 ** (attempt - 1));
      }
    }

    await this.queuePublisher.publish("bridge.callback.failed", {
      requestId,
      callbackUrl: url,
      status: lastStatus,
      detail: lastDetail
    });

    throw new HttpError(502, "callback_error", "Falha ao chamar callback apos retries", {
      requestId,
      status: lastStatus,
      detail: lastDetail
    });
  }
}
