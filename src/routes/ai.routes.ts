import type { FastifyInstance } from "fastify";
import { verifyInternalAuth } from "../middlewares/internal-auth.js";
import { AiReplyController } from "../controllers/ai-reply.controller.js";
import { AiReplyService } from "../services/ai-reply.service.js";
import { env } from "../config/env.js";

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const controller = new AiReplyController(
    new AiReplyService(
      app.deps.aiInboxRepository,
      app.deps.chatConversationRepository,
      app.deps.chatMessageRepository,
      app.deps.openClawProvider,
      app.deps.outboundDispatcher,
      env.AI_CONTEXT_WINDOW,
      env.AI_TRANSIENT_MAX_RETRIES
    )
  );

  app.post(
    "/ai/reply",
    {
      preHandler: verifyInternalAuth
    },
    controller.reply.bind(controller)
  );

  app.post(
    "/api/v1/ai/reply",
    {
      preHandler: verifyInternalAuth
    },
    controller.reply.bind(controller)
  );
}
