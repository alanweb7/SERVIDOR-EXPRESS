export type CorrelationContext = {
  traceId: string;
  conversationId?: string;
  messageId?: string;
};
