import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { fail } from "../utils/response.js";

export async function verifyInternalAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const validBearer = bearerToken.length > 0 && bearerToken === env.AI_INTERNAL_TOKEN;

  if (!validBearer) {
    request.log.warn({ phase: "auth" }, "Internal authentication failed");
    reply.code(401).send(fail("UNAUTHORIZED", "Credencial interna invalida"));
    return;
  }

  request.log.info({ phase: "auth" }, "Internal authentication succeeded");
}
