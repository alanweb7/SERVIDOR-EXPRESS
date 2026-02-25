import { beforeAll, describe, expect, it } from "vitest";

process.env.WEBHOOK_SIGNING_SECRET = "test-secret";
process.env.NODE_ENV = "test";

let createApp: typeof import("../src/app.js").createApp;

beforeAll(async () => {
  ({ createApp } = await import("../src/app.js"));
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
});
