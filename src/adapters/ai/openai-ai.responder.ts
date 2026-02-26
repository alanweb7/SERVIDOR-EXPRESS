import type { AiResponder, GenerateAiReplyInput } from "./ai-responder.js";

export type OpenAiResponderConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  systemPrompt?: string;
};

type OpenAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAiResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export class OpenAiAiResponder implements AiResponder {
  readonly providerName = "openai";
  readonly isFallback = false;

  constructor(private readonly config: OpenAiResponderConfig) {}

  async generateReply(input: GenerateAiReplyInput): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const messages = this.buildMessages(input);
    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.4,
          messages
        }),
        signal: controller.signal
      });

      const rawText = await response.text();
      let body: OpenAiResponse | string | null = null;
      if (rawText) {
        try {
          body = JSON.parse(rawText) as OpenAiResponse;
        } catch {
          body = rawText;
        }
      }

      if (!response.ok) {
        throw new Error(
          `LLM provider failed: ${response.status} ${typeof body === "string" ? body : JSON.stringify(body)}`
        );
      }

      const content = typeof body === "string" ? body : body?.choices?.[0]?.message?.content;
      const text = typeof content === "string" ? content.trim() : "";
      if (!text) {
        throw new Error("LLM provider returned empty content");
      }
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildMessages(input: GenerateAiReplyInput): OpenAiMessage[] {
    const system = this.config.systemPrompt?.trim().length
      ? this.config.systemPrompt.trim()
      : "Voce eh Nolan, um agente de atendimento objetivo, educado e claro. Responda em portugues-BR.";

    const history = input.contextMessages.map((message) => ({
      role: message.senderName === input.agentName ? "assistant" : "user",
      content: `[${message.senderName}] ${message.content}`
    })) as OpenAiMessage[];

    return [
      {
        role: "system",
        content:
          `${system}\n` +
          `Contexto: unit_id=${input.unitId}, conversation_id=${input.conversationId}, source=${input.source}.`
      },
      ...history,
      {
        role: "user",
        content: `[${input.senderName}] ${input.userText}`
      }
    ];
  }
}
