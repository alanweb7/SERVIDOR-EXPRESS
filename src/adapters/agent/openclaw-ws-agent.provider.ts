import {
  type OpenClawAgentProvider,
  type OpenClawMessageContext,
  type OpenClawReply,
  OpenClawProviderError
} from "./openclaw-agent-provider.js";
import { OpenClawGatewayClient, OpenClawGatewayError } from "../../integrations/openclawGatewayClient.js";
import { mapToOpenClawChatInput } from "../../integrations/openclawMapper.js";

type OpenClawWsProviderOptions = {
  gatewayClient: OpenClawGatewayClient;
  sessionDefault?: string;
};

export class OpenClawWsAgentProvider implements OpenClawAgentProvider {
  readonly providerName = "openclaw" as const;

  constructor(private readonly options: OpenClawWsProviderOptions) {}

  async sendMessage(context: OpenClawMessageContext): Promise<OpenClawReply> {
    try {
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

      const response = await this.options.gatewayClient.sendChat({
        sessionKey: mapped.sessionKey,
        message: mapped.message,
        idempotencyKey: mapped.idempotencyKey
      });

      return {
        replyText: response.replyText,
        agentName: "Nolan Neo",
        providerMessageId: response.providerMessageId,
        correlationId: response.correlationId
      };
    } catch (error) {
      if (error instanceof OpenClawGatewayError) {
        throw new OpenClawProviderError("openclaw_unavailable", error.message, error.retryable);
      }
      throw new OpenClawProviderError("openclaw_unavailable", "Falha no provider OpenClaw WS", true);
    }
  }
}
