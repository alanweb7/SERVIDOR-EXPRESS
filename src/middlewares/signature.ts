import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { fail } from "../utils/response.js";

const usedNonces = new Map<string, number>();

export async function verifySignature(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const signature = request.headers["x-signature"];
  const valid = typeof signature === "string" && signature === env.WEBHOOK_SIGNING_SECRET;

  if (!valid) {
    reply.code(401).send(fail("UNAUTHORIZED", "Assinatura invalida"));
    return;
  }

  const requiresReplayProtection = request.url.startsWith("/api/v1/webhooks/inbound");
  if (!requiresReplayProtection) {
    return;
  }

  const timestampHeader = request.headers["x-timestamp"];
  const nonceHeader = request.headers["x-nonce"];

  if (typeof timestampHeader !== "string" || typeof nonceHeader !== "string") {
    reply.code(401).send(fail("UNAUTHORIZED", "Headers x-timestamp e x-nonce sao obrigatorios"));
    return;
  }

  const parsed = Number(timestampHeader);
  if (!Number.isFinite(parsed)) {
    reply.code(401).send(fail("UNAUTHORIZED", "x-timestamp invalido"));
    return;
  }

  const tsMs = parsed > 10_000_000_000 ? parsed : parsed * 1000;
  const now = Date.now();
  const maxSkew = env.WEBHOOK_REPLAY_WINDOW_SECONDS * 1000;
  if (Math.abs(now - tsMs) > maxSkew) {
    reply.code(401).send(fail("UNAUTHORIZED", "x-timestamp fora da janela permitida"));
    return;
  }

  if (usedNonces.has(nonceHeader)) {
    reply.code(401).send(fail("UNAUTHORIZED", "nonce ja utilizado"));
    return;
  }

  usedNonces.set(nonceHeader, tsMs + maxSkew);

  for (const [nonce, expiresAt] of usedNonces.entries()) {
    if (expiresAt < now) {
      usedNonces.delete(nonce);
    }
  }
}
