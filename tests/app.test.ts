import { beforeAll, describe, expect, it } from "vitest";
import type { AiResponder } from "../src/adapters/ai/ai-responder.js";

process.env.WEBHOOK_SIGNING_SECRET = "test-secret";
process.env.AI_INTERNAL_TOKEN = "test-ai-token";
process.env.NODE_ENV = "test";
process.env.AI_PROVIDER = "mock";
process.env.AI_PROVIDER_MAX_RETRIES = "1";

let createApp: typeof import("../src/app.js").createApp;
let InMemoryAiInboxRepository: typeof import("../src/repositories/in-memory/in-memory-ai-inbox.repository.js").InMemoryAiInboxRepository;
let InMemoryChatConversationRepository: typeof import("../src/repositories/in-memory/in-memory-chat-conversation.repository.js").InMemoryChatConversationRepository;
let InMemoryChatMessageRepository: typeof import("../src/repositories/in-memory/in-memory-chat-message.repository.js").InMemoryChatMessageRepository;
let MockAiResponder: typeof import("../src/adapters/ai/mock-ai.responder.js").MockAiResponder;

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
  ({ MockAiResponder } = await import("../src/adapters/ai/mock-ai.responder.js"));
});

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

  it("deve processar mensagem humana valida em conversa IA", async () => {
    const app = createApp({
      aiInboxRepository: new InMemoryAiInboxRepository(),
      chatConversationRepository: new InMemoryChatConversationRepository(),
      chatMessageRepository: new InMemoryChatMessageRepository(),
      aiResponder: new MockAiResponder()
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
    expect(response.json().data.output_text).toContain("recebi sua mensagem");
    expect(response.json().data.provider_name).toBe("mock");

    await app.close();
  });

  it("deve prevenir loop quando remetente ja for o agente", async () => {
    const app = createApp();

    const response = await app.inject({
      method: "POST",
      url: "/ai/reply",
      headers: {
        authorization: "Bearer test-ai-token"
      },
      payload: {
        unit_id: "unit-1",
        conversation_id: "conv-ai-1",
        message_id: "msg-loop-1",
        text: "teste",
        sender_name: "Nolan Neo",
        source: "internal_panel"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
    expect(response.json().data.output_message_id).toBeNull();

    await app.close();
  });

  it("deve responder duplicata com duplicated=true", async () => {
    const app = createApp();
    const payload = {
      unit_id: "unit-1",
      conversation_id: "conv-ai-1",
      message_id: "msg-dup-1",
      text: "mensagem unica",
      sender_name: "Alan",
      source: "internal_panel"
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
    const app = createApp();

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
        source: "internal_panel"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("conversation_not_found");

    await app.close();
  });

  it("deve retornar 409 para conversa nao IA", async () => {
    const app = createApp();

    const response = await app.inject({
      method: "POST",
      url: "/ai/reply",
      headers: {
        authorization: "Bearer test-ai-token"
      },
      payload: {
        unit_id: "unit-1",
        conversation_id: "conv-human-1",
        message_id: "msg-human-2",
        text: "oi",
        sender_name: "Alan",
        source: "internal_panel"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().ok).toBe(false);

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
        source: "internal_panel"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");

    await app.close();
  });

  it("deve falhar apos retries do provider e manter idempotencia no reenvio", async () => {
    let calls = 0;
    const failingResponder: AiResponder = {
      providerName: "test-failing",
      isFallback: false,
      async generateReply() {
        calls += 1;
        throw new Error("provider down");
      }
    };

    const app = createApp({
      aiInboxRepository: new InMemoryAiInboxRepository(),
      chatConversationRepository: new InMemoryChatConversationRepository(),
      chatMessageRepository: new InMemoryChatMessageRepository(),
      aiResponder: failingResponder
    });

    const payload = {
      unit_id: "unit-1",
      conversation_id: "conv-ai-1",
      message_id: "msg-fail-retry-1",
      text: "oi",
      sender_name: "Alan",
      source: "internal_panel"
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

    expect(first.statusCode).toBe(500);
    expect(first.json().error.code).toBe("internal_error");
    expect(calls).toBe(2);

    expect(second.statusCode).toBe(200);
    expect(second.json().data.duplicated).toBe(true);

    await app.close();
  });
});
