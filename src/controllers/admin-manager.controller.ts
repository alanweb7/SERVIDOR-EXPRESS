import type { FastifyReply, FastifyRequest } from "fastify";
import {
  adminAgentBindSchema,
  adminAgentCreateSchema,
  adminAgentIdentitySchema,
  adminAgentTemplateSchema,
  adminPersistentAgentSyncSchema,
  adminPersistentAgentUpsertSchema
} from "../schemas/admin-manager.schemas.js";
import type { AdminManagerService } from "../services/admin-manager.service.js";
import { ok } from "../utils/response.js";

export class AdminManagerController {
  constructor(private readonly service: AdminManagerService) {}

  async menu(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(
      ok({
        sections: [
          { id: "agents", title: "🤖 Agentes", actions: ["create", "list", "edit", "activate", "deactivate", "duplicate"] },
          { id: "prompts", title: "🧠 Prompts & Personalidade", actions: ["base_prompt", "rules", "tone", "welcome", "fallback"] },
          { id: "channels", title: "🔌 Canais e Instancias", actions: ["bind", "webhook", "test", "status", "routing"] },
          { id: "support", title: "💬 Atendimento", actions: ["menu", "handoff", "queues", "schedule", "off_hours"] },
          { id: "n8n", title: "🧩 Fluxos N8N", actions: ["ingest_status", "debounce", "retry", "logs", "reprocess"] },
          { id: "media", title: "🖼️ Midia", actions: ["image", "audio_stt", "video_document", "retention"] },
          { id: "monitoring", title: "📊 Monitoramento", actions: ["today", "response_rate", "errors", "latency", "health"] },
          { id: "security", title: "🔐 Seguranca", actions: ["api_keys", "permissions", "ip_allowlist", "audit"] }
        ]
      })
    );
  }

  async createAgent(request: FastifyRequest, reply: FastifyReply) {
    const payload = adminAgentCreateSchema.parse(request.body);
    const result = await this.service.createPersistentAgent(payload);
    return reply.code(201).send(ok(result));
  }

  async setIdentity(request: FastifyRequest, reply: FastifyReply) {
    const payload = adminAgentIdentitySchema.parse(request.body);
    const result = await this.service.setIdentity(payload);
    return reply.send(ok(result));
  }

  async bindChannel(request: FastifyRequest, reply: FastifyReply) {
    const payload = adminAgentBindSchema.parse(request.body);
    const result = await this.service.bindChannel(payload);
    return reply.send(ok(result));
  }

  async listAgents(_request: FastifyRequest, reply: FastifyReply) {
    const result = await this.service.listAgents();
    return reply.send(ok(result));
  }

  async createFromTemplate(request: FastifyRequest, reply: FastifyReply) {
    const payload = adminAgentTemplateSchema.parse(request.body);
    const result = await this.service.createFromTemplate(payload);
    return reply.code(201).send(ok(result));
  }

  async listPersistentAgents(_request: FastifyRequest, reply: FastifyReply) {
    const result = await this.service.listPersistentAgents();
    return reply.send(ok(result));
  }

  async upsertPersistentAgent(request: FastifyRequest, reply: FastifyReply) {
    const payload = adminPersistentAgentUpsertSchema.parse(request.body);
    const result = await this.service.upsertPersistentAgent(payload);
    return reply.code(201).send(ok(result));
  }

  async syncPersistentAgent(request: FastifyRequest, reply: FastifyReply) {
    const payload = adminPersistentAgentSyncSchema.parse(request.body);
    const result = await this.service.syncPersistentAgent(payload);
    return reply.send(ok(result));
  }
}
