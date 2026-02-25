import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { CorrelationContext } from "../types/correlation.js";

export async function attachCorrelationContext(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const traceId =
    typeof request.headers["x-trace-id"] === "string"
      ? request.headers["x-trace-id"]
      : request.id;

  const conversationId =
    typeof request.headers["x-conversation-id"] === "string"
      ? request.headers["x-conversation-id"]
      : undefined;

  const messageId =
    typeof request.headers["x-message-id"] === "string"
      ? request.headers["x-message-id"]
      : randomUUID();

  const correlation: CorrelationContext = {
    traceId,
    conversationId,
    messageId
  };

  request.correlation = correlation;
  request.log = request.log.child(correlation);
}
