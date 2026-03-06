import { z } from "zod";

export const openClawAgentSendSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  agent: z.string().min(1).optional(),
  container: z.string().min(1).optional()
});

export const openClawWebhookSendSchema = z.object({
  message: z.string().optional(),
  sessionId: z.string().min(1).optional(),
  agent: z.string().min(1).optional(),
  container: z.string().min(1).optional(),
  session_id: z.string().min(1).optional(),
  user_id: z.string().min(1).optional(),
  channel: z.string().min(1).optional(),
  message_id: z.string().min(1).optional(),
  timestamp: z.string().optional(),
  message_type: z.enum(["text", "image", "audio", "video", "document"]).optional(),
  media: z
    .object({
      url: z.string().optional().nullable(),
      mime_type: z.string().optional().nullable(),
      caption: z.string().optional().nullable(),
      filename: z.string().optional().nullable(),
      duration_sec: z.number().optional().nullable()
    })
    .optional(),
  metadata: z
    .object({
      provider: z.string().optional(),
      instance: z.string().optional(),
      raw_event: z.record(z.string(), z.unknown()).optional()
    })
    .optional()
});

export type OpenClawAgentSendInput = z.infer<typeof openClawAgentSendSchema>;
export type OpenClawWebhookSendInput = z.infer<typeof openClawWebhookSendSchema>;
