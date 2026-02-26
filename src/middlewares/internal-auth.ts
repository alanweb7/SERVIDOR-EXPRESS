import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { fail } from "../utils/response.js";

export async function verifyInternalAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const signature = request.headers["x-signature"];

  const validBearer = bearerToken.length > 0 && bearerToken === env.AI_INTERNAL_TOKEN;
  const validSignature = typeof signature === "string" && signature === env.WEBHOOK_SIGNING_SECRET;

  if (!validBearer && !validSignature) {
    reply.code(401).send(fail("UNAUTHORIZED", "Credencial interna invalida"));
  }
}
