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
  agent_name: string;
};

export class AiReplyService {
  constructor(
    private readonly aiInboxRepository: AiInboxRepository,
    private readonly conversationRepository: ChatConversationRepository,
    private readonly chatMessageRepository: ChatMessageRepository,
    private readonly aiResponder: AiResponder,
    private readonly contextWindow: number
  ) {}

  async process(input: AiReplyInput): Promise<AiReplyResult> {
    try {
      const existing = await this.aiInboxRepository.find(input.unit_id, input.source, input.message_id);
      if (existing) {
        return {
          success: true,
          duplicated: true,
          conversation_id: input.conversation_id,
          input_message_id: input.message_id,
          output_message_id: existing.outputMessageId ?? null,
          agent_name: existing.senderName
        };
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
          agent_name: agentName
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

      const contextMessages = await this.chatMessageRepository.listRecentByConversation(
        input.conversation_id,
        input.unit_id,
        this.contextWindow
      );

      const aiResponse = await this.aiResponder.generateReply({
        agentName,
        conversationId: input.conversation_id,
        unitId: input.unit_id,
        userText: input.text,
        contextMessages
      });

      const output = await this.chatMessageRepository.create({
        conversationId: input.conversation_id,
        unitId: input.unit_id,
        senderName: agentName,
        content: aiResponse,
        isMe: false,
        messageType: "text",
        remoteId: `ai:${input.conversation_id}:${input.message_id}`
      });

      await this.conversationRepository.updateAfterAiReply(input.conversation_id, aiResponse);
      await this.aiInboxRepository.markDone(input.unit_id, input.source, input.message_id, output.id);

      return {
        success: true,
        duplicated: false,
        conversation_id: input.conversation_id,
        input_message_id: input.message_id,
        output_message_id: output.id,
        agent_name: agentName
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
}
