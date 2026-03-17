import { z } from "zod";

const ticketSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.string().min(1),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  isGroup: z.boolean().optional(),
  unreadMessages: z.coerce.number().int().nonnegative().optional(),
  lastMessage: z.string().optional(),
  flowOn: z.boolean().optional(),
  tags: z.array(z.unknown()).optional().default([]),
  sectors: z.array(z.unknown()).optional().default([])
});

const contactSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().min(1),
  number: z.string().min(6),
  email: z.string().optional().default(""),
  profilePicUrl: z.string().optional().default("")
});

const whatsappSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().optional().default(""),
  number: z.string().optional().default(""),
  channel: z.string().optional().default(""),
  status: z.string().optional().default("")
});

export const createLeadWebhookSchema = z.object({
  unit_id: z.string().uuid().optional(),
  ticket: ticketSchema,
  contact: contactSchema,
  whatsapp: whatsappSchema
});

export type CreateLeadWebhookInput = z.infer<typeof createLeadWebhookSchema>;

