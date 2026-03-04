import type { FastifyInstance } from "fastify";
import { verifyInternalAuth } from "../middlewares/internal-auth.js";
import { OpenClawAgentController } from "../controllers/openclaw-agent.controller.js";
import { OpenClawAgentService } from "../services/openclaw-agent.service.js";

export async function openClawAgentRoutes(app: FastifyInstance): Promise<void> {
  const controller = new OpenClawAgentController(new OpenClawAgentService());

  app.post(
    "/v1/webhook/agent/send",
    {
      preHandler: verifyInternalAuth
    },
    controller.sendWebhook.bind(controller)
  );

  app.post(
    "/api/v1/openclaw/agent/send",
    {
      preHandler: verifyInternalAuth
    },
    controller.send.bind(controller)
  );
}
