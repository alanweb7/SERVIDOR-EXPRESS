import type { FastifyInstance } from "fastify";
import { HealthController } from "../controllers/health.controller.js";
import { HealthService } from "../services/health.service.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const controller = new HealthController(
    new HealthService(app.deps.cacheProvider, app.deps.queuePublisher)
  );

  app.get("/healthz", controller.healthz.bind(controller));
  app.get("/readyz", controller.readyz.bind(controller));
}
