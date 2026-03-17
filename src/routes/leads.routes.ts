import type { FastifyInstance } from "fastify";
import { verifySignature } from "../middlewares/signature.js";
import { LeadsController } from "../controllers/leads.controller.js";
import { LeadsService } from "../services/leads.service.js";

export async function leadsRoutes(app: FastifyInstance): Promise<void> {
  const controller = new LeadsController(new LeadsService());

  app.post(
    "/api/v1/webhooks/leads",
    {
      preHandler: verifySignature
    },
    controller.upsertFromWebhook.bind(controller)
  );
}

