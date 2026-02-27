import {
  type OpenClawAgentProvider,
  type OpenClawMessageContext,
  type OpenClawReply,
  OpenClawProviderError
} from "./openclaw-agent-provider.js";
import { OpenClawClient, OpenClawWsError } from "../../integrations/openclaw/client.js";
import { OpenClawFallbackCliExecutor, OpenClawFallbackError } from "../../integrations/openclaw/fallback.js";
import { mapToOpenClawChatInput } from "../../integrations/openclaw/mapper.js";

type OpenClawWsProviderOptions = {
  gatewayClient: OpenClawClient;
  fallbackExecutor?: OpenClawFallbackCliExecutor;
  sessionDefault?: string;
};

export class OpenClawWsAgentProvider implements OpenClawAgentProvider {
  readonly providerName = "openclaw" as const;

  constructor(private readonly options: OpenClawWsProviderOptions) {}

  async sendMessage(context: OpenClawMessageContext): Promise<OpenClawReply> {
    const mapped = mapToOpenClawChatInput(
      {
        unit_id: context.unitId,
        conversation_id: context.conversationId,
        message_id: context.messageId,
        text: context.text,
        sender_name: context.senderName,
        source: context.source,
        timestamp: context.timestamp,
        metadata: {
          channel: context.metadata?.channel,
          remote_jid: context.metadata?.remote_jid,
          attachments: context.metadata?.attachments ?? []
        }
      },
      context.history,
      this.options.sessionDefault
    );

    try {
      const response = await this.options.gatewayClient.sendChat({
        sessionKey: mapped.sessionKey,
        message: mapped.message,
        idempotencyKey: mapped.idempotencyKey
      });

      return {
        replyText: response.replyText,
        agentName: "Nolan Neo",
        deliveryMode: "ws",
        providerMessageId: response.providerMessageId,
        correlationId: response.correlationId
      };
    } catch (error) {
      if (error instanceof OpenClawWsError && this.shouldFallback(error)) {
        const fallback = this.options.fallbackExecutor;
        if (!fallback) {
          throw new OpenClawProviderError("openclaw_unavailable", error.message, error.retryable);
        }

        try {
          const fallbackResult = await fallback.sendChat({
            sessionKey: mapped.sessionKey,
            message: mapped.message,
            idempotencyKey: mapped.idempotencyKey
          });
          return {
            replyText: "",
            agentName: "Nolan Neo",
            deliveryMode: "fallback-cli",
            providerMessageId: fallbackResult.providerMessageId,
            correlationId: fallbackResult.correlationId
          };
        } catch (fallbackError) {
          if (fallbackError instanceof OpenClawFallbackError) {
            throw new OpenClawProviderError("openclaw_unavailable", fallbackError.message, fallbackError.retryable);
          }
          throw new OpenClawProviderError("openclaw_unavailable", "Falha no fallback CLI OpenClaw", true);
        }
      }

      if (error instanceof OpenClawWsError) {
        throw new OpenClawProviderError("openclaw_unavailable", error.message, error.retryable);
      }
      throw new OpenClawProviderError("openclaw_unavailable", "Falha no provider OpenClaw WS", true);
    }
  }

  private shouldFallback(error: OpenClawWsError): boolean {
    return (
      error.code === "missing_scope_operator_write" ||
      error.code === "pairing_required" ||
      error.code === "origin_not_allowed" ||
      error.code === "invalid_request_frame"
    );
  }
}
