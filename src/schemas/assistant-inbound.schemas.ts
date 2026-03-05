import { z } from "zod";

export const assistantInboundMessageTypeSchema = z.enum(["text", "image", "audio", "video", "document"]);

export const assistantInboundPayloadSchema = z
  .object({
    session_id: z.string().min(1),
    user_id: z.string().min(1),
    channel: z.string().min(1),
    message_id: z.string().min(1),
    timestamp: z.string().min(1),
    message_type: assistantInboundMessageTypeSchema,
    message: z.string(),
    media: z.object({
      url: z.string().min(1).nullable(),
      mime_type: z.string().min(1).nullable(),
      caption: z.string().nullable(),
      filename: z.string().nullable(),
      duration_sec: z.number().nullable()
    }),
    metadata: z.object({
      provider: z.string().min(1),
      instance: z.string().min(1),
      raw_event: z.record(z.string(), z.unknown())
    })
  })
  .superRefine((value, ctx) => {
    if (value.message_type === "text") {
      if (value.message.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["message"],
          message: "message e obrigatoria para message_type=text"
        });
      }

      if (value.media.url !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["media", "url"],
          message: "media.url deve ser null para message_type=text"
        });
      }
    }

    if (value.message_type !== "text") {
      if (!value.media.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["media", "url"],
          message: "media.url e obrigatoria para tipos de midia"
        });
      }
      if (!value.media.mime_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["media", "mime_type"],
          message: "media.mime_type e obrigatoria para tipos de midia"
        });
      }
    }
  });

export type AssistantInboundPayload = z.infer<typeof assistantInboundPayloadSchema>;