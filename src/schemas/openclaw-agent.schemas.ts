import { z } from "zod";

export const openClawAgentSendSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  agent: z.string().min(1).optional(),
  container: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  trustedInboundMeta: z
    .object({
      schema: z.literal("openclaw.inbound_meta.v1"),
      channel: z.string().min(1),
      provider: z.string().min(1),
      surface: z.string().min(1),
      chat_type: z.enum(["direct", "group"])
    })
    .optional()
});

export const openClawWebhookSendSchema = z.object({
  mode: z.enum(["sync", "async"]).optional().default("sync"),
  callback: z
    .object({
      url: z.string().url(),
      auth_header: z.string().min(1).optional()
    })
    .optional(),
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
}).superRefine((value, ctx) => {
  if (value.mode === "async" && !value.callback?.url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["callback", "url"],
      message: "callback.url e obrigatorio quando mode=async"
    });
  }
});

export type OpenClawAgentSendInput = z.infer<typeof openClawAgentSendSchema>;
export type OpenClawWebhookSendInput = z.infer<typeof openClawWebhookSendSchema>;
