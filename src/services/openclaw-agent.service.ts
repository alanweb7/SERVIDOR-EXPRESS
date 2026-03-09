import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { env } from "../config/env.js";
import { OpenClawClient, OpenClawWsError } from "../integrations/openclaw/client.js";
import type { OpenClawAgentSendInput } from "../schemas/openclaw-agent.schemas.js";
import { HttpError } from "../utils/http-error.js";

const execFileAsync = promisify(execFile);
const SAFE_TOKEN_REGEX = /^[A-Za-z0-9._:@/-]{1,120}$/;

type OpenClawAgentSendResult = {
  request: {
    sessionId: string;
    agent: string;
    container: string;
    transport: "ws" | "docker";
    message: string;
  };
  openclaw: Record<string, unknown>;
  raw: string;
};

export class OpenClawAgentService {
  async send(input: OpenClawAgentSendInput): Promise<OpenClawAgentSendResult> {
    const sessionId = this.sanitizeToken(input.sessionId ?? env.OPENCLAW_AGENT_SESSION_DEFAULT, "sessionId");
    const rawAgent = input.agent ?? env.OPENCLAW_AGENT_DEFAULT;
    const agent = rawAgent ? this.sanitizeToken(rawAgent, "agent") : null;
    const message = input.message;
    const container = await this.resolveContainer(input.container);
    const dockerUser = env.OPENCLAW_AGENT_DOCKER_USER;
    const transport = env.OPENCLAW_AGENT_TRANSPORT;

    if (transport === "ws" || transport === "auto") {
      try {
        return await this.sendViaWs(sessionId, message, agent, container);
      } catch (error) {
        const canFallbackDocker = transport === "auto" || env.OPENCLAW_AGENT_DOCKER_FALLBACK;
        if (!canFallbackDocker) {
          throw this.toHttpError(error);
        }
      }
    }

    if (transport === "docker" || transport === "auto" || env.OPENCLAW_AGENT_DOCKER_FALLBACK) {
      return this.sendViaDockerExec({
        sessionId,
        message,
        agent,
        container,
        dockerUser: this.sanitizeToken(dockerUser, "dockerUser")
      });
    }

    throw new HttpError(503, "openclaw_transport_unavailable", "Transporte OpenClaw indisponivel");
  }

  private async sendViaWs(
    sessionId: string,
    message: string,
    agent: string | null,
    container: string
  ): Promise<OpenClawAgentSendResult> {
    if (!env.OPENCLAW_GATEWAY_URL || !env.OPENCLAW_GATEWAY_TOKEN) {
      throw new HttpError(
        503,
        "openclaw_gateway_not_configured",
        "OPENCLAW_GATEWAY_URL e OPENCLAW_GATEWAY_TOKEN sao obrigatorios para transporte ws"
      );
    }

    const gatewayAgent = agent ?? env.OPENCLAW_AGENT_ID ?? "main";
    const client = new OpenClawClient({
      url: env.OPENCLAW_GATEWAY_URL,
      token: env.OPENCLAW_GATEWAY_TOKEN,
      agentId: gatewayAgent,
      deviceId: env.OPENCLAW_DEVICE_ID,
      deviceIdentityPath: env.OPENCLAW_DEVICE_IDENTITY_PATH,
      timeoutMs: env.OPENCLAW_CONNECT_TIMEOUT_MS,
      debug: env.OPENCLAW_DEBUG
    });

    try {
      const reply = await client.sendChat({
        sessionKey: sessionId,
        message,
        idempotencyKey: randomUUID(),
        agentId: agent ?? undefined
      });

      const openclawPayload: Record<string, unknown> = {
        reply_text: reply.replyText,
        agent_name: agent ?? gatewayAgent,
        provider_message_id: reply.providerMessageId ?? null,
        correlation_id: reply.correlationId ?? null
      };

      return {
        request: {
          sessionId,
          agent: agent ?? gatewayAgent,
          container,
          transport: "ws",
          message
        },
        openclaw: openclawPayload,
        raw: JSON.stringify(openclawPayload)
      };
    } finally {
      client.close();
    }
  }

  private async sendViaDockerExec(input: {
    sessionId: string;
    message: string;
    agent: string | null;
    container: string;
    dockerUser: string;
  }): Promise<OpenClawAgentSendResult> {
    const { sessionId, message, agent, container, dockerUser } = input;

    const args = [
      "exec",
      "-u",
      dockerUser,
      container,
      "openclaw",
      "agent",
      "--session-id",
      sessionId,
      "--message",
      message,
      "--json"
    ];

    if (agent) {
      args.splice(8, 0, "--agent", agent);
    }

    try {
      const { stdout } = await this.execute(args);

      return {
        request: {
          sessionId,
          agent: agent ?? "",
          container,
          transport: "docker",
          message
        },
        openclaw: this.parseJson(stdout),
        raw: stdout
      };
    } catch (error) {
      let finalError: unknown = error;

      if (agent) {
        const details = this.extractErrorDetails(error);
        const stderr = details.stderr.toLowerCase();
        const shouldRetryWithoutAgent =
          stderr.includes("unknown option") ||
          stderr.includes("unknown flag") ||
          stderr.includes("unexpected argument") ||
          stderr.includes("--agent") ||
          stderr.includes("too many arguments");

        if (shouldRetryWithoutAgent) {
          const fallbackArgs = [
            "exec",
            "-u",
            dockerUser,
            container,
            "openclaw",
            "agent",
            "--session-id",
            sessionId,
            "--message",
            message,
            "--json"
          ];

          try {
            const { stdout } = await this.execute(fallbackArgs);
            return {
              request: {
                sessionId,
                agent: "",
                container,
                transport: "docker",
                message
              },
              openclaw: this.parseJson(stdout),
              raw: stdout
            };
          } catch (fallbackError) {
            finalError = fallbackError;
          }
        }
      }

      const reason = finalError instanceof Error ? finalError.message : String(finalError);
      const details = this.extractErrorDetails(finalError);

      if (details.timedOut) {
        throw new HttpError(504, "openclaw_command_timeout", "Timeout ao executar comando OpenClaw", {
          reason,
          ...details
        });
      }

      throw new HttpError(502, "openclaw_command_failed", "Falha ao executar comando OpenClaw", {
        reason,
        ...details
      });
    }
  }

  private execute(args: string[]): Promise<{ stdout: string }> {
    return execFileAsync("docker", args, {
      timeout: env.OPENCLAW_AGENT_COMMAND_TIMEOUT_MS,
      maxBuffer: 1024 * 1024
    });
  }

  private async resolveContainer(containerOverride?: string): Promise<string> {
    if (containerOverride?.trim()) {
      return this.sanitizeToken(containerOverride, "container");
    }

    if (!env.OPENCLAW_AGENT_CONTAINER_DISCOVERY) {
      return this.sanitizeToken(env.OPENCLAW_AGENT_CONTAINER_NAME, "OPENCLAW_AGENT_CONTAINER_NAME");
    }

    const filter = this.sanitizeToken(env.OPENCLAW_AGENT_CONTAINER_FILTER, "OPENCLAW_AGENT_CONTAINER_FILTER");
    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["ps", "--filter", `name=${filter}`, "--format", "{{.ID}}"],
        {
          timeout: 5000,
          maxBuffer: 1024 * 1024
        }
      );
      const id = stdout
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean);

      if (!id) {
        throw new HttpError(
          503,
          "openclaw_container_not_found",
          `Nenhum container encontrado com filtro name=${filter}`
        );
      }
      return this.sanitizeToken(id, "containerId");
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new HttpError(503, "openclaw_container_discovery_failed", "Falha ao descobrir container OpenClaw", {
        reason
      });
    }
  }

  private sanitizeToken(value: string, field: string): string {
    const trimmed = value.trim();
    if (!SAFE_TOKEN_REGEX.test(trimmed)) {
      throw new HttpError(422, "invalid_parameter", `Parametro invalido: ${field}`);
    }
    return trimmed;
  }

  private parseJson(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {
        parseError: "stdout nao e JSON valido",
        text: raw
      };
    }
  }

  private extractErrorDetails(error: unknown): {
    exitCode: number | null;
    stderr: string;
    stdout: string;
    timedOut: boolean;
  } {
    const err = error as {
      code?: string | number;
      killed?: boolean;
      signal?: string | null;
      stderr?: string;
      stdout?: string;
    };

    return {
      exitCode: typeof err.code === "number" ? err.code : null,
      stderr: typeof err.stderr === "string" ? err.stderr.slice(0, 1500) : "",
      stdout: typeof err.stdout === "string" ? err.stdout.slice(0, 1500) : "",
      timedOut: err.killed === true || err.signal === "SIGTERM"
    };
  }

  private toHttpError(error: unknown): HttpError {
    if (error instanceof HttpError) return error;
    if (error instanceof OpenClawWsError) {
      if (error.code === "openclaw_unavailable") {
        return new HttpError(503, "openclaw_unavailable", error.message, {
          code: error.code,
          retryable: error.retryable
        });
      }
      return new HttpError(502, "openclaw_gateway_error", error.message, {
        code: error.code,
        retryable: error.retryable
      });
    }

    const reason = error instanceof Error ? error.message : String(error);
    return new HttpError(502, "openclaw_gateway_error", "Falha ao chamar OpenClaw via gateway", {
      reason
    });
  }
}
