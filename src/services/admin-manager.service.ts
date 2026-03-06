import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../config/env.js";
import type {
  AdminAgentBindInput,
  AdminAgentCreateInput,
  AdminAgentIdentityInput,
  AdminAgentTemplateInput,
  AdminPersistentAgentSyncInput,
  AdminPersistentAgentUpsertInput
} from "../schemas/admin-manager.schemas.js";
import { HttpError } from "../utils/http-error.js";
import { SupabaseRestClient } from "../adapters/db/supabase-rest.client.js";

const execFileAsync = promisify(execFile);
const SAFE_TOKEN_REGEX = /^[A-Za-z0-9._:@/-]{1,160}$/;

type PersistentAgentRow = {
  id: string;
  slug: string;
  name: string;
  persona: string;
  identity_name: string;
  identity_emoji: string | null;
  workspace: string;
  model: string;
  channel: string;
  system_prompt: string | null;
  welcome_message: string | null;
  fallback_message: string | null;
  menu_options: string[] | null;
  transfer_to_human: boolean;
  active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
};

export class AdminManagerService {
  async createPersistentAgent(input: AdminAgentCreateInput) {
    const args = [
      "agents",
      "add",
      this.sanitize(input.agent, "agent"),
      "--workspace",
      input.workspace,
      "--model",
      input.model,
      ...(input.non_interactive ? ["--non-interactive"] : []),
      "--json"
    ];

    return this.runOpenClaw(args);
  }

  async setIdentity(input: AdminAgentIdentityInput) {
    const args = [
      "agents",
      "set-identity",
      "--agent",
      this.sanitize(input.agent, "agent"),
      "--name",
      input.name,
      ...(input.emoji ? ["--emoji", input.emoji] : [])
    ];

    return this.runOpenClaw(args);
  }

  async bindChannel(input: AdminAgentBindInput) {
    const args = [
      "agents",
      "bind",
      "--agent",
      this.sanitize(input.agent, "agent"),
      "--bind",
      this.sanitize(input.bind, "bind"),
      "--json"
    ];

    return this.runOpenClaw(args);
  }

  async listAgents() {
    return this.runOpenClaw(["agents", "list", "--json"]);
  }

  async createFromTemplate(input: AdminAgentTemplateInput) {
    const create = await this.createPersistentAgent({
      agent: input.slug,
      workspace: input.workspace,
      model: input.model,
      non_interactive: true
    });

    const identity = await this.setIdentity({
      agent: input.slug,
      name: input.name,
      emoji: "🛠️"
    });

    const bind = await this.bindChannel({
      agent: input.slug,
      bind: input.channel
    });

    return {
      agent: input.slug,
      create,
      identity,
      bind,
      template: {
        persona: input.persona,
        language: input.language,
        system_prompt: input.system_prompt,
        welcome_message: input.welcome_message,
        menu_options: input.menu_options,
        fallback_message: input.fallback_message,
        transfer_to_human: input.transfer_to_human,
        active: input.active
      }
    };
  }

  async listPersistentAgents() {
    try {
      const client = this.getDbClient();
      const params = new URLSearchParams();
      params.set("select", "*");
      params.set("order", "updated_at.desc");
      const rows = (await client.select("openclaw_agents_registry", params)) as PersistentAgentRow[];
      return rows;
    } catch (error) {
      this.throwRegistryDbError("list", error);
    }
  }

  async upsertPersistentAgent(input: AdminPersistentAgentUpsertInput) {
    try {
      const client = this.getDbClient();
      const slug = this.sanitize(input.slug, "slug");
      const nowIso = new Date().toISOString();
      const existing = await this.findPersistentBySlug(slug);

      const payload = {
        slug,
        name: input.name,
        persona: input.persona,
        identity_name: input.identity_name,
        identity_emoji: input.identity_emoji ?? null,
        workspace: input.workspace,
        model: input.model,
        channel: input.channel,
        system_prompt: input.system_prompt ?? null,
        welcome_message: input.welcome_message ?? null,
        fallback_message: input.fallback_message ?? null,
        menu_options: input.menu_options,
        transfer_to_human: input.transfer_to_human,
        active: input.active,
        metadata: input.metadata,
        updated_at: nowIso
      };

      let row: PersistentAgentRow;
      if (existing) {
        const filters = new URLSearchParams();
        filters.set("id", `eq.${existing.id}`);
        const updated = (await client.update("openclaw_agents_registry", filters, payload)) as PersistentAgentRow[];
        row = updated[0] ?? { ...existing, ...payload, updated_at: nowIso };
      } else {
        const inserted = (await client.insert("openclaw_agents_registry", payload)) as PersistentAgentRow[];
        row = inserted[0] as PersistentAgentRow;
      }

      let sync: unknown = null;
      let sync_error: { code: string; message: string; details?: unknown } | null = null;
      if (input.sync_openclaw) {
        try {
          sync = await this.syncPersistentAgent({
            slug,
            channel: input.channel,
            workspace: input.workspace,
            model: input.model
          });
        } catch (error) {
          if (error instanceof HttpError) {
            sync_error = {
              code: error.code,
              message: error.message,
              details: error.cause
            };
          } else {
            sync_error = {
              code: "openclaw_sync_failed",
              message: "Falha ao sincronizar agente no OpenClaw",
              details: error instanceof Error ? error.message : String(error)
            };
          }
        }
      }

      return {
        persisted: row,
        sync,
        sync_error
      };
    } catch (error) {
      this.throwRegistryDbError("upsert", error);
    }
  }

  async syncPersistentAgent(input: AdminPersistentAgentSyncInput) {
    try {
      const slug = this.sanitize(input.slug, "slug");
      const current = await this.findPersistentBySlug(slug);
      if (!current) {
        throw new HttpError(404, "agent_not_found", `Agente persistente nao encontrado: ${slug}`);
      }

      const workspace = input.workspace ?? current.workspace;
      const model = input.model ?? current.model;
      const channel = input.channel ?? current.channel;

      const create = await this.runCreateWithTolerance({
        agent: slug,
        workspace,
        model
      });

      const identity = await this.setIdentity({
        agent: slug,
        name: current.identity_name || current.name,
        emoji: current.identity_emoji ?? undefined
      });

      const bind = await this.bindChannel({
        agent: slug,
        bind: channel
      });

      const client = this.getDbClient();
      const filters = new URLSearchParams();
      filters.set("id", `eq.${current.id}`);
      const nowIso = new Date().toISOString();
      await client.update("openclaw_agents_registry", filters, {
        workspace,
        model,
        channel,
        last_synced_at: nowIso,
        updated_at: nowIso
      });

      return {
        slug,
        create,
        identity,
        bind,
        synced_at: nowIso
      };
    } catch (error) {
      this.throwRegistryDbError("sync", error);
    }
  }

  private async runOpenClaw(openclawArgs: string[]) {
    const dockerArgs = [
      "exec",
      "-u",
      this.sanitize(env.OPENCLAW_AGENT_DOCKER_USER, "OPENCLAW_AGENT_DOCKER_USER"),
      this.sanitize(env.OPENCLAW_AGENT_CONTAINER_NAME, "OPENCLAW_AGENT_CONTAINER_NAME"),
      "openclaw",
      ...openclawArgs
    ];

    try {
      const { stdout, stderr } = await execFileAsync("docker", dockerArgs, {
        timeout: env.OPENCLAW_AGENT_COMMAND_TIMEOUT_MS,
        maxBuffer: 1024 * 1024
      });

      return {
        command: ["docker", ...dockerArgs].join(" "),
        output: this.parse(stdout),
        raw: stdout,
        stderr: stderr?.trim() || null
      };
    } catch (error) {
      const err = error as { stderr?: string; stdout?: string; message?: string };
      throw new HttpError(502, "admin_manager_command_failed", "Falha no comando administrativo OpenClaw", {
        reason: err.message ?? "erro desconhecido",
        stderr: err.stderr?.slice(0, 1500) ?? "",
        stdout: err.stdout?.slice(0, 1500) ?? ""
      });
    }
  }

  private parse(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }

  private sanitize(value: string, field: string): string {
    const cleaned = value.trim();
    if (!SAFE_TOKEN_REGEX.test(cleaned)) {
      throw new HttpError(422, "invalid_parameter", `Parametro invalido: ${field}`);
    }
    return cleaned;
  }

  private getDbClient(): SupabaseRestClient {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new HttpError(503, "supabase_unavailable", "Persistencia indisponivel: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
    }
    return new SupabaseRestClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }

  private async findPersistentBySlug(slug: string): Promise<PersistentAgentRow | null> {
    try {
      const client = this.getDbClient();
      const params = new URLSearchParams();
      params.set("select", "*");
      params.set("slug", `eq.${slug}`);
      params.set("limit", "1");
      const rows = (await client.select("openclaw_agents_registry", params)) as PersistentAgentRow[];
      return rows[0] ?? null;
    } catch (error) {
      this.throwRegistryDbError("find_by_slug", error);
    }
  }

  private async runCreateWithTolerance(input: { agent: string; workspace: string; model: string }) {
    try {
      return await this.createPersistentAgent({
        agent: input.agent,
        workspace: input.workspace,
        model: input.model,
        non_interactive: true
      });
    } catch (error) {
      if (error instanceof HttpError) {
        const reason = JSON.stringify(error.cause ?? "").toLowerCase();
        if (reason.includes("already") || reason.includes("exists") || reason.includes("duplicate")) {
          return {
            skipped: true,
            reason: "agent_already_exists"
          };
        }
      }
      throw error;
    }
  }

  private throwRegistryDbError(operation: string, error: unknown): never {
    if (error instanceof HttpError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();

    if (normalized.includes("openclaw_agents_registry") && normalized.includes("does not exist")) {
      throw new HttpError(
        503,
        "admin_registry_missing",
        "Tabela openclaw_agents_registry nao existe. Execute a migration no banco.",
        { operation, reason: message.slice(0, 1500) }
      );
    }

    throw new HttpError(
      502,
      "admin_registry_db_error",
      "Falha ao acessar persistencia de agentes",
      { operation, reason: message.slice(0, 1500) }
    );
  }
}
