import { z } from "zod";

export const aiReplySchema = z.object({
  unit_id: z.string().min(1),
  conversation_id: z.string().min(1),
  message_id: z.string().min(1),
  text: z.string().min(1),
  sender_name: z.string().min(1),
  source: z.enum(["internal_panel", "external_fastify", "internal_ai"]).default("internal_panel"),
  timestamp: z.string().datetime(),
  metadata: z
    .object({
      channel: z.string().optional(),
      attachments: z.array(z.unknown()).optional().default([])
    })
    .optional()
    .default({ attachments: [] })
});

export type AiReplyInput = z.infer<typeof aiReplySchema>;
