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
    const agent = this.sanitizeToken(input.agent ?? env.OPENCLAW_AGENT_DEFAULT, "agent");
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
      "--agent",
      agent,
      "--message",
      message,
      "--json"
    ];

    try {
      const { stdout } = await execFileAsync("docker", args, {
        timeout: env.OPENCLAW_AGENT_COMMAND_TIMEOUT_MS,
        maxBuffer: 1024 * 1024
      });

      return {
        request: {
          sessionId,
          agent,
          container,
          message
        },
        openclaw: this.parseJson(stdout),
        raw: stdout
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const details = this.extractErrorDetails(error);

      if (details.timedOut) {
        throw new HttpError(
          504,
          "openclaw_command_timeout",
          "Timeout ao executar comando OpenClaw",
          {
            reason,
            ...details
          }
        );
      }

      throw new HttpError(
        502,
        "openclaw_command_failed",
        "Falha ao executar comando OpenClaw",
        {
          reason,
          ...details
        }
      );
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
}
