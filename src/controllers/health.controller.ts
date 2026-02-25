import type { FastifyReply, FastifyRequest } from "fastify";
import { ok } from "../utils/response.js";
import { HealthService } from "../services/health.service.js";

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  async healthz(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(
      ok({
        status: "up",
        timestamp: new Date().toISOString()
      })
    );
  }

  async readyz(_request: FastifyRequest, reply: FastifyReply) {
    const readiness = await this.healthService.readiness();
    const statusCode = readiness.status === "ready" ? 200 : 503;
    return reply.code(statusCode).send(ok(readiness));
  }
}
