import type { AiResponder, GenerateAiReplyInput } from "./ai-responder.js";

export class MockAiResponder implements AiResponder {
  async generateReply(input: GenerateAiReplyInput): Promise<string> {
    const preview = input.userText.trim().slice(0, 280);
    return `${input.agentName}: recebi sua mensagem "${preview}".`;
  }
}
