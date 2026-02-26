import {
  type OpenClawAgentProvider,
  type OpenClawMessageContext,
  type OpenClawReply,
  OpenClawProviderError
} from "./openclaw-agent-provider.js";

type OpenClawHttpConfig = {
  baseUrl: string;
  gatewayToken: string;
  agentId: string;
  timeoutMs: number;
};

type OpenClawHttpReply = {
  reply_text?: string;
  agent_name?: string;
  provider_message_id?: string;
  correlation_id?: string;
};

export class OpenClawHttpAgentProvider implements OpenClawAgentProvider {
  readonly providerName = "openclaw" as const;

  constructor(private readonly config: OpenClawHttpConfig) {}

  async sendMessage(context: OpenClawMessageContext): Promise<OpenClawReply> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const endpoint = `${this.config.baseUrl.replace(/\/$/, "")}/agents/${this.config.agentId}/reply`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.gatewayToken}`
        },
        body: JSON.stringify({
          unit_id: context.unitId,
          conversation_id: context.conversationId,
          sender_name: context.senderName,
          text: context.text,
          source: context.source,
          timestamp: context.timestamp,
          metadata: context.metadata ?? { attachments: [] },
          history: context.history.map((item) => ({
            id: item.id,
            sender_name: item.senderName,
            content: item.content,
            is_me: item.isMe,
            created_at: item.createdAt.toISOString()
          }))
        }),
        signal: controller.signal
      });

      const payload = await this.parseResponse(response);
      if (!response.ok) {
        throw new OpenClawProviderError(
          "openclaw_unavailable",
          `OpenClaw returned status ${response.status}`,
          response.status === 408 || response.status === 429 || response.status >= 500
        );
      }

      const text = payload.reply_text?.trim() ?? "";
      if (!text) {
        throw new OpenClawProviderError("openclaw_unavailable", "OpenClaw returned empty reply_text", false);
      }

      return {
        replyText: text,
        agentName: payload.agent_name?.trim() || "Nolan Neo",
        providerMessageId: payload.provider_message_id,
        correlationId: payload.correlation_id
      };
    } catch (error) {
      if (error instanceof OpenClawProviderError) {
        throw error;
      }

      const isAbort = error instanceof Error && error.name === "AbortError";
      throw new OpenClawProviderError(
        "openclaw_unavailable",
        isAbort ? "OpenClaw timeout" : "OpenClaw connection failed",
        true
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseResponse(response: Response): Promise<OpenClawHttpReply> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as OpenClawHttpReply;
    } catch {
      return {};
    }
  }
}
