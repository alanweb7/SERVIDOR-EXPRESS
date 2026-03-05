import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../config/env.js";
import type { OpenClawAgentSendInput } from "../schemas/openclaw-agent.schemas.js";
import { HttpError } from "../utils/http-error.js";

const execFileAsync = promisify(execFile);
const SAFE_TOKEN_REGEX = /^[A-Za-z0-9._:@/-]{1,120}$/;

type OpenClawAgentSendResult = {
  request: {
    sessionId: string;
    agent: string;
    container: string;
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
    const container = this.sanitizeToken(input.container ?? env.OPENCLAW_AGENT_CONTAINER_NAME, "container");
    const dockerUser = this.sanitizeToken(env.OPENCLAW_AGENT_DOCKER_USER, "dockerUser");
    const message = input.message;

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
}