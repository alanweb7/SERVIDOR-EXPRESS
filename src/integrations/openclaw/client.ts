import { randomUUID, sign as signPayload } from "node:crypto";
import { OpenClawDeviceIdentityStore, type DeviceIdentity } from "./deviceIdentity.js";

type GatewayFrame = Record<string, unknown>;

export type OpenClawWsErrorCode =
  | "missing_scope_operator_write"
  | "pairing_required"
  | "origin_not_allowed"
  | "invalid_request_frame"
  | "unauthorized"
  | "openclaw_unavailable";

export class OpenClawWsError extends Error {
  constructor(
    public readonly code: OpenClawWsErrorCode,
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}

export type OpenClawWsClientOptions = {
  url: string;
  token: string;
  agentId: string;
  deviceId: string;
  deviceIdentityPath: string;
  timeoutMs: number;
  debug: boolean;
  protocolVersion?: number;
};

export type SendChatInput = {
  sessionKey: string;
  message: string;
  idempotencyKey: string;
};

export type SendChatOutput = {
  replyText: string;
  providerMessageId?: string;
  correlationId?: string;
};

export class OpenClawClient {
  private socket: any | null = null;
  private readonly pending = new Map<string, (frame: GatewayFrame) => void>();
  private connectReqId: string | null = null;
  private isConnected = false;
  private challengeNonce: string | null = null;
  private deviceIdentity: DeviceIdentity | null = null;
  private readonly identityStore: OpenClawDeviceIdentityStore;

  constructor(private readonly options: OpenClawWsClientOptions) {
    this.identityStore = new OpenClawDeviceIdentityStore(options.deviceIdentityPath);
  }

  async connect(): Promise<void> {
    if (this.isConnected && this.socket) return;
    await this.ensureDeviceIdentity();

    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.openSocket();
        return;
      } catch (error) {
        if (attempt >= maxAttempts) throw error;
        const backoffMs = Math.min(250 * 2 ** (attempt - 1), 5000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  async sendChat(input: SendChatInput): Promise<SendChatOutput> {
    await this.connect();
    const requestId = this.sendRequest("chat.send", {
      sessionKey: input.sessionKey,
      message: input.message,
      idempotencyKey: input.idempotencyKey
    });

    const response = await this.waitForFrame(
      (frame) =>
        frame["id"] === requestId ||
        frame["reqId"] === requestId ||
        (frame["type"] === "res" && frame["method"] === "chat.send") ||
        frame["event"] === "chat.send.ok" ||
        frame["event"] === "chat.message",
      this.options.timeoutMs
    );

    if (this.isErrorFrame(response)) {
      throw this.mapProtocolError(response);
    }

    return {
      replyText:
        this.readString(response, "replyText") ??
        this.readNestedString(response, "result", "replyText") ??
        this.readNestedString(response, "payload", "replyText") ??
        this.readString(response, "message") ??
        this.readNestedString(response, "result", "message") ??
        this.readNestedString(response, "payload", "message") ??
        "",
      providerMessageId:
        this.readString(response, "messageId") ??
        this.readNestedString(response, "result", "messageId") ??
        this.readNestedString(response, "payload", "messageId") ??
        undefined,
      correlationId:
        this.readString(response, "correlationId") ??
        this.readNestedString(response, "result", "correlationId") ??
        this.readNestedString(response, "payload", "correlationId") ??
        undefined
    };
  }

  close(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.pending.clear();
    this.isConnected = false;
    this.challengeNonce = null;
  }

  private async openSocket(): Promise<void> {
    const WebSocketCtor = (globalThis as any).WebSocket;
    if (!WebSocketCtor) {
      throw new OpenClawWsError("openclaw_unavailable", "WebSocket API indisponivel no runtime", false);
    }

    const socket = new WebSocketCtor(this.options.url);
    this.socket = socket;
    this.isConnected = false;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new OpenClawWsError("openclaw_unavailable", "Timeout ao conectar no gateway", true));
      }, this.options.timeoutMs);

      socket.addEventListener("open", () => {
        this.debug("ws.open");
      });

      socket.addEventListener("message", (event: any) => {
        try {
          const frame = JSON.parse(String(event.data)) as GatewayFrame;
          this.debug("ws.in", frame);
          this.handleIncomingFrame(frame);

          if (frame["event"] === "connect.challenge") {
            const nonce =
              this.readNestedString(frame, "payload", "nonce") ??
              this.readNestedString(frame, "data", "nonce") ??
              this.readString(frame, "nonce");
            this.challengeNonce = nonce;
            this.sendConnectFrame();
          }

          if (
            frame["event"] === "connect.ok" ||
            (frame["type"] === "res" &&
              (frame["id"] === this.connectReqId || frame["reqId"] === this.connectReqId) &&
              frame["ok"] === true)
          ) {
            clearTimeout(timeout);
            this.isConnected = true;
            resolve();
          }

          if (
            this.isErrorFrame(frame) &&
            (frame["event"] === "connect.error" ||
              frame["method"] === "connect" ||
              (frame["type"] === "res" &&
                (frame["id"] === this.connectReqId || frame["reqId"] === this.connectReqId)))
          ) {
            clearTimeout(timeout);
            reject(this.mapProtocolError(frame));
          }
        } catch {
          clearTimeout(timeout);
          reject(new OpenClawWsError("invalid_request_frame", "Frame invalido no handshake", false));
        }
      });

      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new OpenClawWsError("openclaw_unavailable", "Falha de rede no gateway", true));
      });

      socket.addEventListener("close", () => {
        this.debug("ws.close");
        this.isConnected = false;
      });
    });
  }

  private sendConnectFrame(): void {
    const protocolVersion = this.options.protocolVersion ?? 3;
    const identity = this.deviceIdentity;
    const nonce = this.challengeNonce ?? "";
    const signedAt = Date.now();
    const signature =
      identity && nonce
        ? signPayload(null, Buffer.from(`${nonce}:${signedAt}`, "utf8"), identity.privateKeyPem).toString("base64")
        : "";

    this.connectReqId = this.sendRequest("connect", {
      minProtocol: protocolVersion,
      maxProtocol: protocolVersion,
      client: {
        id: "gateway-client",
        version: this.options.agentId || "dev",
        platform: "linux",
        mode: "backend"
      },
      auth: {
        token: this.options.token
      },
      device:
        identity && nonce
          ? {
              id: identity.deviceId,
              nonce,
              publicKey: identity.publicKeyPem,
              signature,
              signedAt
            }
          : undefined,
      role: "operator",
      scopes: ["operator.write"]
    });
  }

  private async ensureDeviceIdentity(): Promise<void> {
    if (this.deviceIdentity) return;
    this.deviceIdentity = await this.identityStore.loadOrCreate(this.options.deviceId);
  }

  private sendFrame(frame: GatewayFrame): void {
    if (!this.socket || this.socket.readyState !== 1) {
      throw new OpenClawWsError("openclaw_unavailable", "Socket nao conectado", true);
    }
    this.debug("ws.out", frame);
    this.socket.send(JSON.stringify(frame));
  }

  private sendRequest(method: string, params: Record<string, unknown>): string {
    const id = randomUUID();
    this.sendFrame({
      type: "req",
      id,
      method,
      params
    });
    return id;
  }

  private waitForFrame(
    matcher: (frame: GatewayFrame) => boolean,
    timeoutMs: number
  ): Promise<GatewayFrame> {
    return new Promise((resolve, reject) => {
      const key = randomUUID();
      const timeout = setTimeout(() => {
        this.pending.delete(key);
        reject(new OpenClawWsError("openclaw_unavailable", "Timeout aguardando frame do gateway", true));
      }, timeoutMs);

      this.pending.set(key, (frame) => {
        if (!matcher(frame)) return;
        clearTimeout(timeout);
        this.pending.delete(key);
        resolve(frame);
      });
    });
  }

  private handleIncomingFrame(frame: GatewayFrame): void {
    for (const handler of this.pending.values()) {
      handler(frame);
    }
  }

  private isErrorFrame(frame: GatewayFrame): boolean {
    return (
      frame["ok"] === false ||
      frame["event"] === "error" ||
      typeof frame["error"] === "string" ||
      typeof this.readNestedString(frame, "error", "code") === "string"
    );
  }

  private mapProtocolError(frame: GatewayFrame): OpenClawWsError {
    const code = this.readNestedString(frame, "error", "code") ?? this.readString(frame, "code") ?? "";
    const message =
      this.readNestedString(frame, "error", "message") ??
      this.readString(frame, "message") ??
      this.readString(frame, "error") ??
      "OpenClaw indisponivel";
    const normalized = `${code} ${message}`.toLowerCase();

    if (normalized.includes("missing scope") && normalized.includes("operator.write")) {
      return new OpenClawWsError("missing_scope_operator_write", message, false);
    }
    if (normalized.includes("pairing")) {
      return new OpenClawWsError("pairing_required", message, false);
    }
    if (normalized.includes("origin not allowed")) {
      return new OpenClawWsError("origin_not_allowed", message, false);
    }
    if (normalized.includes("unauthorized") || normalized.includes("auth")) {
      return new OpenClawWsError("unauthorized", message, false);
    }
    if (normalized.includes("frame") || normalized.includes("invalid request")) {
      return new OpenClawWsError("invalid_request_frame", message, false);
    }
    if (normalized.includes("invalid connect params")) {
      return new OpenClawWsError("invalid_request_frame", message, false);
    }

    return new OpenClawWsError("openclaw_unavailable", message, true);
  }

  private readString(frame: GatewayFrame, key: string): string | null {
    const value = frame[key];
    return typeof value === "string" ? value : null;
  }

  private readNestedString(frame: GatewayFrame, outer: string, inner: string): string | null {
    const parent = frame[outer];
    if (!parent || typeof parent !== "object") return null;
    const value = (parent as Record<string, unknown>)[inner];
    return typeof value === "string" ? value : null;
  }

  private debug(message: string, frame?: GatewayFrame): void {
    if (!this.options.debug) return;
    if (frame) {
      console.log(`[openclaw-ws] ${message}`, frame);
      return;
    }
    console.log(`[openclaw-ws] ${message}`);
  }
}
