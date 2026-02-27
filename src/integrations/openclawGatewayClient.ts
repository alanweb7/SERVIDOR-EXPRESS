import { createHmac, randomUUID } from "node:crypto";

type GatewayFrame = Record<string, unknown>;

type ConnectOptions = {
  url: string;
  token: string;
  agentId: string;
  timeoutMs: number;
  debug: boolean;
};

type SendChatInput = {
  sessionKey: string;
  message: string;
  idempotencyKey: string;
};

type SendChatOutput = {
  replyText: string;
  providerMessageId?: string;
  correlationId?: string;
};

export class OpenClawGatewayError extends Error {
  constructor(
    public readonly code:
      | "pairing_required"
      | "missing_scope"
      | "unauthorized"
      | "invalid_request_frame"
      | "openclaw_unavailable",
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}

export class OpenClawGatewayClient {
  private socket: any | null = null;
  private readonly pending = new Map<string, (frame: GatewayFrame) => void>();
  private challengeNonce: string | null = null;
  private connectReqId: string | null = null;
  private isConnected = false;

  constructor(private readonly options: ConnectOptions) {}

  async connect(): Promise<void> {
    if (this.isConnected && this.socket) return;

    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.openSocket();
        return;
      } catch (error) {
        if (attempt >= maxAttempts) throw error;
        const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  async sendChat(input: SendChatInput): Promise<SendChatOutput> {
    await this.connect();
    const reqId = this.sendRequest("chat.send", {
        sessionKey: input.sessionKey,
        message: input.message,
        idempotencyKey: input.idempotencyKey
    });

    const response = await this.waitForFrame(
      (frame) =>
        frame["reqId"] === reqId ||
        this.readNestedString(frame, "payload", "reqId") === reqId ||
        frame["req"] === "chat.send" ||
        frame["event"] === "chat.send.ok" ||
        frame["event"] === "chat.message",
      this.options.timeoutMs
    );

    if (this.isErrorFrame(response)) {
      throw this.mapProtocolError(response);
    }

    const replyText =
      this.readString(response, "replyText") ??
      this.readNestedString(response, "payload", "replyText") ??
      this.readNestedString(response, "data", "replyText") ??
      this.readString(response, "message") ??
      this.readNestedString(response, "payload", "message") ??
      this.readNestedString(response, "data", "message") ??
      this.readNestedString(response, "result", "message") ??
      "";

    if (!replyText.trim()) {
      throw new OpenClawGatewayError("invalid_request_frame", "chat.send sem resposta textual", false);
    }

    return {
      replyText,
      providerMessageId:
        this.readString(response, "messageId") ??
        this.readNestedString(response, "payload", "messageId") ??
        this.readNestedString(response, "data", "messageId") ??
        this.readNestedString(response, "result", "messageId") ??
        undefined,
      correlationId:
        this.readString(response, "correlationId") ??
        this.readNestedString(response, "payload", "correlationId") ??
        this.readNestedString(response, "data", "correlationId") ??
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
      throw new OpenClawGatewayError("openclaw_unavailable", "WebSocket API indisponivel no runtime", false);
    }

    const socket = new WebSocketCtor(this.options.url);
    this.socket = socket;
    this.isConnected = false;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new OpenClawGatewayError("openclaw_unavailable", "Timeout ao conectar no gateway", true));
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
              this.readString(frame, "nonce") ??
              this.readNestedString(frame, "data", "nonce") ??
              this.readNestedString(frame, "payload", "nonce");
            if (nonce) this.challengeNonce = nonce;
            this.sendConnectFrame();
          }
          if (
            frame["event"] === "connect.ok" ||
            (frame["req"] === "connect" && frame["ok"] === true) ||
            (frame["type"] === "res" && frame["reqId"] === this.connectReqId && frame["ok"] === true)
          ) {
            clearTimeout(timeout);
            this.isConnected = true;
            resolve();
          }
          if (
            this.isErrorFrame(frame) &&
            (frame["req"] === "connect" ||
              frame["event"] === "connect.error" ||
              (frame["type"] === "res" && frame["reqId"] === this.connectReqId))
          ) {
            clearTimeout(timeout);
            reject(this.mapProtocolError(frame));
          }
        } catch {
          clearTimeout(timeout);
          reject(new OpenClawGatewayError("invalid_request_frame", "Frame invalido no handshake", false));
        }
      });

      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new OpenClawGatewayError("openclaw_unavailable", "Falha de rede no gateway", true));
      });

      socket.addEventListener("close", () => {
        this.debug("ws.close");
        this.isConnected = false;
      });
    });
  }

  private sendConnectFrame(): void {
    const nonce = this.challengeNonce ?? "";
    const deviceId = `lab-api:${this.options.agentId}`;
    const signature = this.signNonce(deviceId, nonce, this.options.token);
    this.connectReqId = this.sendRequest("connect", {
        token: this.options.token,
        role: "operator",
        scopes: ["operator.write"],
        client: {
          id: deviceId,
          mode: "service"
        },
        device: {
          id: deviceId,
          nonce,
          signature
        }
      });
  }

  private signNonce(deviceId: string, nonce: string, secret: string): string {
    return createHmac("sha256", secret).update(`${deviceId}:${nonce}`).digest("hex");
  }

  private sendFrame(frame: GatewayFrame): void {
    if (!this.socket || this.socket.readyState !== 1) {
      throw new OpenClawGatewayError("openclaw_unavailable", "Socket nao conectado", true);
    }
    this.debug("ws.out", frame);
    this.socket.send(JSON.stringify(frame));
  }

  private sendRequest(req: string, payload: Record<string, unknown>): string {
    const reqId = randomUUID();
    this.sendFrame({
      type: "req",
      req,
      reqId,
      payload
    });
    return reqId;
  }

  private waitForFrame(
    matcher: (frame: GatewayFrame) => boolean,
    timeoutMs: number
  ): Promise<GatewayFrame> {
    return new Promise((resolve, reject) => {
      const key = randomUUID();
      const timeout = setTimeout(() => {
        this.pending.delete(key);
        reject(new OpenClawGatewayError("openclaw_unavailable", "Timeout aguardando frame do gateway", true));
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

  private mapProtocolError(frame: GatewayFrame): OpenClawGatewayError {
    const code =
      this.readNestedString(frame, "error", "code") ??
      this.readString(frame, "code") ??
      this.readString(frame, "error") ??
      "openclaw_unavailable";
    const normalized = String(code).toLowerCase();

    if (normalized.includes("pair")) {
      return new OpenClawGatewayError("pairing_required", "Pairing necessario no OpenClaw", false);
    }
    if (normalized.includes("scope")) {
      return new OpenClawGatewayError("missing_scope", "Missing scope no OpenClaw Gateway", false);
    }
    if (normalized.includes("unauthorized") || normalized.includes("auth")) {
      return new OpenClawGatewayError("unauthorized", "Nao autorizado no OpenClaw Gateway", false);
    }
    if (normalized.includes("frame") || normalized.includes("invalid")) {
      return new OpenClawGatewayError("invalid_request_frame", "Frame invalido para OpenClaw Gateway", false);
    }
    return new OpenClawGatewayError("openclaw_unavailable", "OpenClaw indisponivel", true);
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
      console.log(`[openclaw-gateway] ${message}`, frame);
      return;
    }
    console.log(`[openclaw-gateway] ${message}`);
  }
}
