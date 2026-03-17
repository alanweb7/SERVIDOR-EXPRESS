import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class OpenClawFallbackError extends Error {
  constructor(
    public readonly code: "openclaw_fallback_failed",
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}

export type OpenClawFallbackOptions = {
  enabled: boolean;
  containerName: string;
  timeoutMs: number;
};

export type OpenClawFallbackInput = {
  sessionKey: string;
  message: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  trustedInboundMeta?: Record<string, unknown>;
};

export type OpenClawFallbackOutput = {
  providerMessageId?: string;
  correlationId?: string;
  raw: Record<string, unknown>;
};

export class OpenClawFallbackCliExecutor {
  constructor(private readonly options: OpenClawFallbackOptions) {}

  async sendChat(input: OpenClawFallbackInput): Promise<OpenClawFallbackOutput> {
    if (!this.options.enabled) {
      throw new OpenClawFallbackError("openclaw_fallback_failed", "Fallback CLI desabilitado", false);
    }

    const params = JSON.stringify({
      sessionKey: input.sessionKey,
      message: input.message,
      idempotencyKey: input.idempotencyKey,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.trustedInboundMeta
        ? {
            inbound_meta: input.trustedInboundMeta,
            inboundMeta: input.trustedInboundMeta,
          }
        : {})
    });

    try {
      const { stdout } = await execFileAsync(
        "docker",
        [
          "exec",
          "-i",
          this.options.containerName,
          "openclaw",
          "gateway",
          "call",
          "chat.send",
          "--json",
          "--params",
          params
        ],
        {
          timeout: this.options.timeoutMs
        }
      );

      const parsed = this.parseJson(stdout);
      return {
        providerMessageId: this.readString(parsed, "runId") ?? input.idempotencyKey,
        correlationId: this.readString(parsed, "runId") ?? undefined,
        raw: parsed
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new OpenClawFallbackError(
        "openclaw_fallback_failed",
        `Falha no fallback CLI: ${reason}`.slice(0, 400),
        true
      );
    }
  }

  private parseJson(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { raw };
    }
  }

  private readString(data: Record<string, unknown>, key: string): string | null {
    const value = data[key];
    return typeof value === "string" ? value : null;
  }
}
