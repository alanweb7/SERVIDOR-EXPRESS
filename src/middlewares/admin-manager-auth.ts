import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { fail } from "../utils/response.js";

export async function verifyAdminManagerAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const xKey = request.headers["x-admin-key"];
  const authHeader = request.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  const validByHeader = typeof xKey === "string" && xKey === env.ADMIN_MANAGER_TOKEN;
  const validByBearer = bearerToken.length > 0 && bearerToken === env.ADMIN_MANAGER_TOKEN;

  if (!validByHeader && !validByBearer) {
    request.log.warn({ phase: "admin_auth" }, "Admin manager authentication failed");
    reply.code(401).send(fail("UNAUTHORIZED", "Credencial admin invalida"));
    return;
  }
}