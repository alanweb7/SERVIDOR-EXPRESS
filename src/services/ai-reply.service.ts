import type { AiResponder } from "../adapters/ai/ai-responder.js";
import type { AiReplyInput } from "../schemas/ai-reply.schemas.js";
import { HttpError } from "../utils/http-error.js";
import type { AiInboxRepository } from "../repositories/interfaces/ai-inbox.repository.js";
import type { ChatConversationRepository } from "../repositories/interfaces/chat-conversation.repository.js";
import type { ChatMessageRepository } from "../repositories/interfaces/chat-message.repository.js";

export type AiReplyResult = {
  success: true;
  duplicated: boolean;
  conversation_id: string;
  input_message_id: string;
  output_message_id: string | null;
  output_text: string | null;
  agent_name: string;
  provider_name: string;
  fallback_in_use: boolean;
};

export class AiReplyService {
  constructor(
    private readonly aiInboxRepository: AiInboxRepository,
    private readonly conversationRepository: ChatConversationRepository,
    private readonly chatMessageRepository: ChatMessageRepository,
    private readonly aiResponder: AiResponder,
    private readonly contextWindow: number,
    private readonly providerMaxRetries: number
  ) {}

  async process(input: AiReplyInput): Promise<AiReplyResult> {
    const outputRemoteId = this.outputRemoteId(input.conversation_id, input.message_id);

    try {
      const existing = await this.aiInboxRepository.find(input.unit_id, input.source, input.message_id);
      if (existing) {
        const duplicatedResult = await this.buildDuplicatedResult(input, existing.senderName, existing.outputMessageId, outputRemoteId);
        return duplicatedResult;
      }

      const conversation = await this.conversationRepository.findById(input.conversation_id);
      if (!conversation || conversation.unitId !== input.unit_id) {
        throw new HttpError(404, "conversation_not_found", "Conversa nao encontrada");
      }

      if (!conversation.isAiAgent) {
        throw new HttpError(409, "not_ai_conversation", "Conversa nao esta marcada como IA");
      }

      const agentName = conversation.aiAgentName || "Nolan Neo";

      if (input.sender_name === agentName || input.source === "internal_ai") {
        return {
          success: true,
          duplicated: false,
          conversation_id: input.conversation_id,
          input_message_id: input.message_id,
          output_message_id: null,
          output_text: null,
          agent_name: agentName,
          provider_name: this.aiResponder.providerName,
          fallback_in_use: this.aiResponder.isFallback
        };
      }

      const hasText = input.text.trim().length > 0;
      const attachments = input.metadata?.attachments ?? [];
      if (!hasText && attachments.length === 0) {
        throw new HttpError(422, "invalid_payload", "Mensagem sem texto ou anexo processavel");
      }

      await this.aiInboxRepository.createReceived({
        unitId: input.unit_id,
        source: input.source,
        messageId: input.message_id,
        conversationId: input.conversation_id,
        senderName: input.sender_name,
        text: input.text
      });

      const inputRemoteId = this.inputRemoteId(input.source, input.message_id);
      const existingInputMessage = await this.chatMessageRepository.findByRemoteId(
        input.conversation_id,
        input.unit_id,
        inputRemoteId
      );
      if (!existingInputMessage) {
        await this.chatMessageRepository.create({
          conversationId: input.conversation_id,
          unitId: input.unit_id,
          senderName: input.sender_name,
          content: input.text,
          isMe: input.source === "internal_panel",
          messageType: "text",
          remoteId: inputRemoteId
        });
      }

      const contextMessages = await this.chatMessageRepository.listRecentByConversation(
        input.conversation_id,
        input.unit_id,
        this.contextWindow
      );

      const aiResponse = await this.generateWithRetry({
        agentName,
        conversationId: input.conversation_id,
        unitId: input.unit_id,
        userText: input.text,
        source: input.source,
        senderName: input.sender_name,
        contextMessages
      });

      const output =
        (await this.chatMessageRepository.findByRemoteId(input.conversation_id, input.unit_id, outputRemoteId)) ??
        (await this.chatMessageRepository.create({
          conversationId: input.conversation_id,
          unitId: input.unit_id,
          senderName: agentName,
          content: aiResponse,
          isMe: false,
          messageType: "text",
          remoteId: outputRemoteId
        }));

      await this.conversationRepository.updateAfterAiReply(input.conversation_id, input.unit_id, aiResponse);
      await this.aiInboxRepository.markDone(input.unit_id, input.source, input.message_id, output.id);

      return {
        success: true,
        duplicated: false,
        conversation_id: input.conversation_id,
        input_message_id: input.message_id,
        output_message_id: output.id,
        output_text: output.content,
        agent_name: agentName,
        provider_name: this.aiResponder.providerName,
        fallback_in_use: this.aiResponder.isFallback
      };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "Erro interno";
      await this.aiInboxRepository
        .markError(input.unit_id, input.source, input.message_id, message)
        .catch(() => undefined);
      throw new HttpError(500, "internal_error", "Falha ao gerar resposta da IA", error);
    }
  }

  private async generateWithRetry(input: {
    agentName: string;
    conversationId: string;
    unitId: string;
    userText: string;
    source: string;
    senderName: string;
    contextMessages: Awaited<ReturnType<ChatMessageRepository["listRecentByConversation"]>>;
  }): Promise<string> {
    const maxAttempts = this.providerMaxRetries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.aiResponder.generateReply(input);
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `Provider ${this.aiResponder.providerName} failed after ${maxAttempts} attempts: ${
        lastError instanceof Error ? lastError.message : "unknown error"
      }`
    );
  }

  private async buildDuplicatedResult(
    input: AiReplyInput,
    agentName: string,
    outputMessageId: string | undefined,
    outputRemoteId: string
  ): Promise<AiReplyResult> {
    let resolvedOutputMessageId = outputMessageId ?? null;
    let outputText: string | null = null;

    if (resolvedOutputMessageId) {
      const outputMessage = await this.chatMessageRepository.findById(
        resolvedOutputMessageId,
        input.conversation_id,
        input.unit_id
      );
      outputText = outputMessage?.content ?? null;
    } else {
      const outputMessage = await this.chatMessageRepository.findByRemoteId(
        input.conversation_id,
        input.unit_id,
        outputRemoteId
      );
      if (outputMessage) {
        resolvedOutputMessageId = outputMessage.id;
        outputText = outputMessage.content;
        await this.aiInboxRepository
          .markDone(input.unit_id, input.source, input.message_id, outputMessage.id)
          .catch(() => undefined);
      }
    }

    return {
      success: true,
      duplicated: true,
      conversation_id: input.conversation_id,
      input_message_id: input.message_id,
      output_message_id: resolvedOutputMessageId,
      output_text: outputText,
      agent_name: agentName,
      provider_name: this.aiResponder.providerName,
      fallback_in_use: this.aiResponder.isFallback
    };
  }

  private outputRemoteId(conversationId: string, messageId: string): string {
    return `ai:${conversationId}:${messageId}`;
  }

  private inputRemoteId(source: string, messageId: string): string {
    return `in:${source}:${messageId}`;
  }
}
