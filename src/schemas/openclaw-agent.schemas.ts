import { z } from "zod";

export const openClawAgentSendSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  agent: z.string().min(1).optional(),
  container: z.string().min(1).optional()
});

export type OpenClawAgentSendInput = z.infer<typeof openClawAgentSendSchema>;