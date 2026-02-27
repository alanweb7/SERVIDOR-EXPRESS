import type { FastifyInstance } from "fastify";
import { registerAiReplyRoutes } from "./ai-reply.js";

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  registerAiReplyRoutes(app);
}
