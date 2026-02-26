import { beforeAll, describe, expect, it } from "vitest";
import type { OpenClawAgentProvider } from "../src/adapters/agent/openclaw-agent-provider.js";
import { OpenClawProviderError } from "../src/adapters/agent/openclaw-agent-provider.js";
import type { OutboundDispatcher } from "../src/adapters/outbound/outbound-dispatcher.js";
import { DispatchOutboundError } from "../src/adapters/outbound/outbound-dispatcher.js";

process.env.WEBHOOK_SIGNING_SECRET = "test-secret";
process.env.AI_INTERNAL_TOKEN = "test-ai-token";
process.env.NODE_ENV = "test";

let createApp: typeof import("../src/app.js").createApp;
let InMemoryAiInboxRepository: typeof import("../src/repositories/in-memory/in-memory-ai-inbox.repository.js").InMemoryAiInboxRepository;
let InMemoryChatConversationRepository: typeof import("../src/repositories/in-memory/in-memory-chat-conversation.repository.js").InMemoryChatConversationRepository;
let InMemoryChatMessageRepository: typeof import("../src/repositories/in-memory/in-memory-chat-message.repository.js").InMemoryChatMessageRepository;

beforeAll(async () => {
  ({ createApp } = await import("../src/app.js"));
  ({ InMemoryAiInboxRepository } = await import(
    "../src/repositories/in-memory/in-memory-ai-inbox.repository.js"
  ));
  ({ InMemoryChatConversationRepository } = await import(
    "../src/repositories/in-memory/in-memory-chat-conversation.repository.js"
  ));
  ({ InMemoryChatMessageRepository } = await import(
    "../src/repositories/in-memory/in-memory-chat-message.repository.js"
  ));
});

function successProvider(): OpenClawAgentProvider {
  return {
    providerName: "openclaw",
    async sendMessage() {
      return {
        replyText: "Resposta real do Nolan",
        agentName: "Nolan Neo",
        providerMessageId: "provider-1"
      };
    }
  };
}

function successDispatcher(): OutboundDispatcher {
  return {
    async dispatchReply() {
      return { dispatchId: "dispatch-1" };
    }
  };
}

describe("API", () => {
  it("deve responder /healthz", async () => {
    const app = createApp();
    const response = await app.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);

    await app.close();
  });

  it("deve bloquear sem x-signature", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/messages/send",
      payload: { to: "+5511999999999", content: "oi" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().ok).toBe(false);

    await app.close();
  });

  it("deve aceitar envio com assinatura valida", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/messages/send",
      headers: {
        "x-signature": "test-secret"
      },
      payload: { to: "+5511999999999", content: "oi" }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().ok).toBe(true);

    await app.close();
  });

  it("deve processar mensagem humana valida com OpenClaw", async () => {
    const app = createApp({
      aiInboxRepository: new InMemoryAiInboxRepository(),
      chatConversationRepository: new InMemoryChatConversationRepository(),
      chatMessageRepository: new InMemoryChatMessageRepository(),
      openClawProvider: successProvider(),
      outboundDispatcher: successDispatcher()
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/reply",
      headers: {
        authorization: "Bearer test-ai-token"
      },
      payload: {
        unit_id: "unit-1",
        conversation_id: "conv-ai-1",
        message_id: "msg-human-1",
        text: "Oi, agente",
        sender_name: "Alan",
        source: "internal_panel",
        timestamp: new Date().toISOString(),
        metadata: { channel: "internal", attachments: [] }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
    expect(response.json().data.output_message_id).toBeTruthy();
    expect(response.json().data.agent_name).toBe("Nolan Neo");

    await app.close();
  });

  it("deve responder duplicata com duplicated=true", async () => {
    const app = createApp({
      aiInboxRepository: new InMemoryAiInboxRepository(),
      chatConversationRepository: new InMemoryChatConversationRepository(),
      chatMessageRepository: new InMemoryChatMessageRepository(),
      openClawProvider: successProvider(),
      outboundDispatcher: successDispatcher()
    });

    const payload = {
      unit_id: "unit-1",
      conversation_id: "conv-ai-1",
      message_id: "msg-dup-1",
      text: "mensagem unica",
      sender_name: "Alan",
      source: "internal_panel",
      timestamp: new Date().toISOString(),
      metadata: { channel: "internal", attachments: [] }
    };

    const first = await app.inject({
      method: "POST",
      url: "/ai/reply",
      headers: { authorization: "Bearer test-ai-token" },
      payload
    });

    const second = await app.inject({
      method: "POST",
      url: "/ai/reply",
      headers: { authorization: "Bearer test-ai-token" },
      payload
    });

    expect(first.statusCode).toBe(200);
    expect(first.json().data.duplicated).toBe(false);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.duplicated).toBe(true);
    expect(second.json().data.output_message_id).toBe(first.json().data.output_message_id);

    await app.close();
  });

  it("deve retornar 404 para conversa inexistente", async () => {
    const app = createApp({
      openClawProvider: successProvider(),
      outboundDispatcher: successDispatcher()
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/reply",
      headers: {
        authorization: "Bearer test-ai-token"
      },
      payload: {
        unit_id: "unit-1",
        conversation_id: "conv-nao-existe",
        message_id: "msg-missing-conv",
        text: "oi",
        sender_name: "Alan",
        source: "internal_panel",
        timestamp: new Date().toISOString(),
        metadata: { channel: "internal", attachments: [] }
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("conversation_not_found");

    await app.close();
  });

  it("deve retornar unauthorized em /ai/reply sem credencial", async () => {
    const app = createApp();

    const response = await app.inject({
      method: "POST",
      url: "/ai/reply",
      payload: {
        unit_id: "unit-1",
        conversation_id: "conv-ai-1",
        message_id: "msg-no-auth",
        text: "oi",
        sender_name: "Alan",
        source: "internal_panel",
        timestamp: new Date().toISOString(),
        metadata: { channel: "internal", attachments: [] }
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");

    await app.close();
  });

  it("deve retornar openclaw_unavailable quando provider falhar", async () => {
    const failingProvider: OpenClawAgentProvider = {
      providerName: "openclaw",
      async sendMessage() {
        throw new OpenClawProviderError("openclaw_unavailable", "connection refused", true);
      }
    };

    const app = createApp({
      aiInboxRepository: new InMemoryAiInboxRepository(),
      chatConversationRepository: new InMemoryChatConversationRepository(),
      chatMessageRepository: new InMemoryChatMessageRepository(),
      openClawProvider: failingProvider,
      outboundDispatcher: successDispatcher()
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/reply",
      headers: { authorization: "Bearer test-ai-token" },
      payload: {
        unit_id: "unit-1",
        conversation_id: "conv-ai-1",
        message_id: "msg-provider-fail",
        text: "oi",
        sender_name: "Alan",
        source: "internal_panel",
        timestamp: new Date().toISOString(),
        metadata: { channel: "internal", attachments: [] }
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("openclaw_unavailable");

    await app.close();
  });

  it("deve aplicar retry controlado para falha transitoria do OpenClaw", async () => {
    let calls = 0;
    const flakyProvider: OpenClawAgentProvider = {
      providerName: "openclaw",
      async sendMessage() {
        calls += 1;
        if (calls === 1) {
          throw new OpenClawProviderError("openclaw_unavailable", "temporary outage", true);
        }
        return {
          replyText: "Resposta apos retry",
          agentName: "Nolan Neo"
        };
      }
    };

    const app = createApp({
      aiInboxRepository: new InMemoryAiInboxRepository(),
      chatConversationRepository: new InMemoryChatConversationRepository(),
      chatMessageRepository: new InMemoryChatMessageRepository(),
      openClawProvider: flakyProvider,
      outboundDispatcher: successDispatcher()
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/reply",
      headers: { authorization: "Bearer test-ai-token" },
      payload: {
        unit_id: "unit-1",
        conversation_id: "conv-ai-1",
        message_id: "msg-provider-retry",
        text: "oi",
        sender_name: "Alan",
        source: "internal_panel",
        timestamp: new Date().toISOString(),
        metadata: { channel: "internal", attachments: [] }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(calls).toBe(2);

    await app.close();
  });

  it("deve retornar dispatch_failed quando dispatch outbound falhar", async () => {
    const failingDispatcher: OutboundDispatcher = {
      async dispatchReply() {
        throw new DispatchOutboundError("dispatch_failed", "queue down", true);
      }
    };

    const app = createApp({
      aiInboxRepository: new InMemoryAiInboxRepository(),
      chatConversationRepository: new InMemoryChatConversationRepository(),
      chatMessageRepository: new InMemoryChatMessageRepository(),
      openClawProvider: successProvider(),
      outboundDispatcher: failingDispatcher
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/reply",
      headers: { authorization: "Bearer test-ai-token" },
      payload: {
        unit_id: "unit-1",
        conversation_id: "conv-ai-1",
        message_id: "msg-dispatch-fail",
        text: "oi",
        sender_name: "Alan",
        source: "internal_panel",
        timestamp: new Date().toISOString(),
        metadata: { channel: "internal", attachments: [] }
      }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("dispatch_failed");

    await app.close();
  });
});
