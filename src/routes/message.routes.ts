import type { FastifyInstance } from "fastify";
import { MessageController } from "../controllers/message.controller.js";
import { MessageService } from "../services/message.service.js";
import { verifySignature } from "../middlewares/signature.js";

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  const controller = new MessageController(
    new MessageService(app.deps.dedupRepository, app.deps.queuePublisher)
  );

  app.post(
    "/api/v1/webhooks/inbound",
    {
      preHandler: verifySignature
    },
    controller.inbound.bind(controller)
  );

  app.post(
    "/api/v1/messages/send",
    {
      preHandler: verifySignature
    },
    controller.send.bind(controller)
  );
}
