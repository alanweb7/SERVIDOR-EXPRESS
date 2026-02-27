import { type OpenClawAgentProvider, OpenClawProviderError } from "../adapters/agent/openclaw-agent-provider.js";
import { DispatchOutboundError, type OutboundDispatcher } from "../adapters/outbound/outbound-dispatcher.js";
import type { AiReplyInput } from "../schemas/ai-reply.schemas.js";
import { HttpError } from "../utils/http-error.js";
import type { AiInboxRepository } from "../repositories/interfaces/ai-inbox.repository.js";
import type { ChatConversationRepository } from "../repositories/interfaces/chat-conversation.repository.js";
import type { ChatMessageRepository } from "../repositories/interfaces/chat-message.repository.js";

type Phase =
  | "auth"
  | "validate"
  | "persist_in"
  | "resolve_context"
  | "openclaw_call"
  | "persist_out"
  | "dispatch_out";

type LoggerLike = {
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
};

export type AiReplyResult = {
  success: true;
  duplicated: boolean;
  delivery_mode: "ws" | "fallback-cli";
  deliveryMode: "ws" | "fallback-cli";
  conversation_id: string;
  input_message_id: string;
  output_message_id: string | null;
  agent_name: string;
  reply_text: string;
};

export class AiReplyService {
  constructor(
    private readonly aiInboxRepository: AiInboxRepository,
    private readonly conversationRepository: ChatConversationRepository,
    private readonly chatMessageRepository: ChatMessageRepository,
    private readonly openClawProvider: OpenClawAgentProvider,
    private readonly outboundDispatcher: OutboundDispatcher,
    private readonly contextWindow: number,
    private readonly transientMaxRetries: number
  ) {}

  async process(input: AiReplyInput, logger: LoggerLike, requestId: string): Promise<AiReplyResult> {
    const outputRemoteId = this.outputRemoteId(input.conversation_id, input.message_id);
    let currentPhase: Phase = "validate";
    const logBase = {
      request_id: requestId,
      unit_id: input.unit_id,
      conversation_id: input.conversation_id,
      message_id: input.message_id,
      sender_name: input.sender_name,
      source: input.source,
      timestamp: input.timestamp,
      metadata: input.metadata,
      provider: this.openClawProvider.providerName
    };

    logger.info({ ...logBase, phase: currentPhase }, "AI reply validation complete");

    const existing = await this.aiInboxRepository.find(input.unit_id, input.message_id);
    if (existing?.status === "processed") {
      logger.info({ ...logBase, phase: "persist_in" satisfies Phase }, "Inbound already processed");
      const duplicatedText = existing.outputMessageId
        ? (
            await this.chatMessageRepository.findById(
              existing.outputMessageId,
              input.conversation_id,
              input.unit_id
            )
          )?.content ?? ""
        : "";
      return {
        success: true,
        duplicated: true,
        delivery_mode: existing.outputMessageId ? "ws" : "fallback-cli",
        deliveryMode: existing.outputMessageId ? "ws" : "fallback-cli",
        conversation_id: input.conversation_id,
        input_message_id: input.message_id,
        output_message_id: existing.outputMessageId ?? null,
        agent_name: "Nolan Neo",
        reply_text: duplicatedText
      };
    }

    const conversation = await this.conversationRepository.findById(input.conversation_id);
    if (!conversation || conversation.unitId !== input.unit_id) {
      throw new HttpError(404, "conversation_not_found", "Conversa nao encontrada");
    }

    if (!conversation.isAiAgent) {
      throw new HttpError(409, "not_ai_conversation", "Conversa nao esta marcada como IA");
    }

    if (!existing) {
      await this.aiInboxRepository.createReceived({
        unitId: input.unit_id,
        source: input.source,
        messageId: input.message_id,
        conversationId: input.conversation_id,
        senderName: input.sender_name,
        text: input.text
      });
    }

    try {
      currentPhase = "persist_in";
      logger.info({ ...logBase, phase: currentPhase }, "Persisting inbound message");
      await this.persistInboundIfNeeded(input);

      currentPhase = "resolve_context";
      logger.info({ ...logBase, phase: currentPhase }, "Loading conversation context");
      const contextMessages = await this.chatMessageRepository.listRecentByConversation(
        input.conversation_id,
        input.unit_id,
        this.contextWindow
      );

      currentPhase = "openclaw_call";
      logger.info({ ...logBase, phase: currentPhase }, "Calling OpenClaw provider");
      const providerReply = await this.withRetries(
        () =>
          this.openClawProvider.sendMessage({
            unitId: input.unit_id,
            conversationId: input.conversation_id,
            messageId: input.message_id,
            senderName: input.sender_name,
            text: input.text,
            source: input.source,
            timestamp: input.timestamp,
            metadata: input.metadata,
            history: contextMessages
          }),
        (error) => error instanceof OpenClawProviderError && error.retryable
      );

      currentPhase = "persist_out";
      logger.info(
        { ...logBase, phase: currentPhase, delivery_mode: providerReply.deliveryMode },
        "Persisting outbound message"
      );
      let outputId: string | null = null;
      if (providerReply.replyText.trim().length > 0) {
        const output =
          (await this.chatMessageRepository.findByRemoteId(input.conversation_id, input.unit_id, outputRemoteId)) ??
          (await this.chatMessageRepository.create({
            conversationId: input.conversation_id,
            unitId: input.unit_id,
            senderName: providerReply.agentName,
            content: providerReply.replyText,
            isMe: true,
            messageType: "text",
            remoteId: outputRemoteId
          }));

        outputId = output.id;
        await this.conversationRepository.updateAfterAiReply(input.conversation_id, input.unit_id, providerReply.replyText);

        currentPhase = "dispatch_out";
        logger.info(
          { ...logBase, phase: currentPhase, delivery_mode: providerReply.deliveryMode },
          "Dispatching outbound message"
        );
        await this.withRetries(
          () =>
            this.outboundDispatcher.dispatchReply({
              unitId: input.unit_id,
              conversationId: input.conversation_id,
              inputMessageId: input.message_id,
              outputMessageId: output.id,
              source: input.source,
              text: providerReply.replyText,
              metadata: input.metadata
            }),
          (error) => error instanceof DispatchOutboundError && error.retryable
        );
      }

      await this.aiInboxRepository.markProcessed(input.unit_id, input.message_id, outputId);

      return {
        success: true,
        duplicated: false,
        delivery_mode: providerReply.deliveryMode,
        deliveryMode: providerReply.deliveryMode,
        conversation_id: input.conversation_id,
        input_message_id: input.message_id,
        output_message_id: outputId,
        agent_name: providerReply.agentName,
        reply_text: providerReply.replyText
      };
    } catch (error) {
      const sanitized = this.sanitizeError(error);
      await this.aiInboxRepository.markFailed(input.unit_id, input.message_id, sanitized).catch(() => undefined);

      logger.error(
        {
          ...logBase,
          phase: currentPhase,
          code: this.errorCode(error),
          err: error instanceof Error ? error : new Error(String(error))
        },
        "AI reply processing failed"
      );

      if (error instanceof OpenClawProviderError) {
        throw new HttpError(503, "openclaw_unavailable", "OpenClaw indisponivel", error);
      }
      if (error instanceof DispatchOutboundError) {
        throw new HttpError(502, "dispatch_failed", "Falha no envio da resposta", error);
      }
      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError(500, "INTERNAL_SERVER_ERROR", "Erro interno do servidor", error);
    }
  }

  private async persistInboundIfNeeded(input: AiReplyInput): Promise<void> {
    const inputRemoteId = this.inputRemoteId(input.source, input.message_id);
    const existingInputMessage = await this.chatMessageRepository.findByRemoteId(
      input.conversation_id,
      input.unit_id,
      inputRemoteId
    );

    if (existingInputMessage) {
      return;
    }

    await this.chatMessageRepository.create({
      conversationId: input.conversation_id,
      unitId: input.unit_id,
      senderName: input.sender_name,
      content: input.text,
      isMe: false,
      messageType: "text",
      remoteId: inputRemoteId
    });
  }

  private async withRetries<T>(operation: () => Promise<T>, isRetryable: (error: unknown) => boolean): Promise<T> {
    const maxAttempts = this.transientMaxRetries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt >= maxAttempts) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private sanitizeError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***").slice(0, 400);
  }

  private errorCode(error: unknown): string {
    if (error instanceof OpenClawProviderError) return error.code;
    if (error instanceof DispatchOutboundError) return error.code;
    if (error instanceof HttpError) return error.code;
    return "INTERNAL_SERVER_ERROR";
  }

  private outputRemoteId(conversationId: string, messageId: string): string {
    return `ai:${conversationId}:${messageId}`;
  }

  private inputRemoteId(source: string, messageId: string): string {
    return `in:${source}:${messageId}`;
  }
}
