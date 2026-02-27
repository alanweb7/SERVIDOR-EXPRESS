const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "ws://openclaw:18789";
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";
const OPENCLAW_SESSION_DEFAULT = process.env.OPENCLAW_SESSION_DEFAULT || "agent:main:main";
const OPENCLAW_PROTOCOL_VERSION = Number(process.env.OPENCLAW_PROTOCOL_VERSION || "3");
const TIMEOUT_MS = 15_000;

if (!OPENCLAW_GATEWAY_TOKEN) {
  console.error("OPENCLAW_GATEWAY_TOKEN ausente");
  process.exit(1);
}

const WebSocketCtor = globalThis.WebSocket;
if (!WebSocketCtor) {
  console.error("WebSocket nao disponivel no runtime");
  process.exit(1);
}

const socket = new WebSocketCtor(OPENCLAW_GATEWAY_URL);
let connectDone = false;
let chatSent = false;
let connectReqId = "";
let chatReqId = "";

const timeout = setTimeout(() => {
  console.error("[TIMEOUT] Encerrando apos 15s sem completar fluxo");
  socket.close(4000, "timeout");
}, TIMEOUT_MS);

socket.addEventListener("open", () => {
  console.log("[OPEN] websocket conectado em", OPENCLAW_GATEWAY_URL);
});

socket.addEventListener("message", (event) => {
  const frame = JSON.parse(String(event.data));
  console.log("[FRAME IN]", frame);

  if (frame.event === "connect.challenge") {
    console.log("[CHALLENGE] recebido");
    socket.send(
      JSON.stringify({
        type: "req",
        id: (connectReqId = crypto.randomUUID()),
        method: "connect",
        params: {
          minProtocol: OPENCLAW_PROTOCOL_VERSION,
          maxProtocol: OPENCLAW_PROTOCOL_VERSION,
          client: {
            id: "openclaw-control-ui",
            version: "dev",
            platform: "linux",
            mode: "ui"
          },
          auth: {
            token: OPENCLAW_GATEWAY_TOKEN
          },
          role: "operator",
          scopes: ["operator.write"]
        }
      })
    );
    return;
  }

  if (
    frame.event === "connect.ok" ||
    (frame.type === "res" && frame.id === connectReqId && frame.ok === true) ||
    (frame.method === "connect" && frame.ok === true)
  ) {
    connectDone = true;
    console.log("[CONNECT OK]");
    if (!chatSent) {
      chatSent = true;
      socket.send(
        JSON.stringify({
          type: "req",
          id: (chatReqId = crypto.randomUUID()),
          method: "chat.send",
          params: {
            sessionKey: OPENCLAW_SESSION_DEFAULT,
            message: "Teste rapido WS via lab-api",
            idempotencyKey: crypto.randomUUID()
          }
        })
      );
    }
    return;
  }

  if (
    frame.event === "chat.send.ok" ||
    (frame.type === "res" && frame.id === chatReqId && frame.ok === true) ||
    frame.method === "chat.send" ||
    frame.event === "chat.message" ||
    frame.message ||
    frame.replyText ||
    frame?.params?.message ||
    frame?.params?.replyText ||
    frame?.result?.message ||
    frame?.result?.replyText ||
    frame?.data?.message
  ) {
    console.log("[CHAT.SEND OK]");
    clearTimeout(timeout);
    socket.close(1000, "done");
    return;
  }

  if (frame.ok === false || frame.error || frame.event === "error") {
    console.error("[ERRO PROTOCOLO]", frame);
  }
});

socket.addEventListener("error", (err) => {
  console.error("[WS ERROR]", err);
});

socket.addEventListener("close", (event) => {
  clearTimeout(timeout);
  console.log("[CLOSE]", { code: event.code, reason: event.reason, connectDone, chatSent });
  process.exit(connectDone ? 0 : 1);
});
