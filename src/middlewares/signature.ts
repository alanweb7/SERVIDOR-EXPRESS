import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { fail } from "../utils/response.js";

export async function verifySignature(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const signature = request.headers["x-signature"];
  const valid = typeof signature === "string" && signature === env.WEBHOOK_SIGNING_SECRET;

  if (!valid) {
    reply.code(401).send(fail("UNAUTHORIZED", "Assinatura invalida"));
  }
}
