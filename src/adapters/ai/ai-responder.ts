export type GenerateAiReplyInput = never;

export interface AiResponder {
  generateReply(_input: never): Promise<string>;
}
