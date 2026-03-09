import { z } from "zod";

export const inboundWebhookSchema = z.object({
  messageId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional()
}).passthrough();

export const inboundBridgeSchema = z.object({
  requestId: z.string().min(1),
  customerId: z.string().min(1),
  agentId: z.string().min(1),
  sessionKey: z.string().min(1).optional(),
  message: z.string().min(1),
  callbackUrl: z.string().url().optional(),
  systemPrompt: z.string().min(1).optional()
});

export const sendMessageSchema = z.object({
  to: z.string().min(3),
  content: z.string().min(1),
  messageId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional()
});

export type InboundWebhookInput = z.infer<typeof inboundWebhookSchema>;
export type InboundBridgeInput = z.infer<typeof inboundBridgeSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
