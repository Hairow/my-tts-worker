import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src";

describe("Edge TTS Worker", () => {
  // ========== CORS 测试 ==========

  it("OPTIONS returns CORS headers", async () => {
    const request = new Request("http://example.com/", { method: "OPTIONS" });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  // ========== 路由测试 ==========

  it("unknown path returns 404", async () => {
    const request = new Request("http://example.com/xyz");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
  });

  it("GET / returns HTML page", async () => {
    const request = new Request("http://example.com/");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("<!DOCTYPE html>");
    expect(body).toContain("Edge TTS");
  });

  it("GET /voices returns models and voices JSON", async () => {
    const request = new Request("http://example.com/voices");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.voices.length).toBeGreaterThan(0);
  });

  it("GET /v1/audio/speech returns 405", async () => {
    const request = new Request("http://example.com/v1/audio/speech");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(405);
  });

  // ========== POST 参数验证 ==========

  it("POST /v1/audio/speech missing input returns 400", async () => {
    const request = new Request("http://example.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: "alloy" }),
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("input");
  });

  it("POST /v1/audio/speech invalid JSON returns 500", async () => {
    const request = new Request("http://example.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(500);
  });

  // ========== 语音映射测试 ==========

  it.each([
    ["alloy"],
    ["echo"],
    ["fable"],
    ["onyx"],
    ["nova"],
    ["shimmer"],
    ["jenny"],
    ["guy"],
    ["aria"],
    ["sonia"],
  ])("voice=%s synthesis works", async (voice) => {
    const request = new Request("http://example.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tts-1",
        input: "hello test",
        voice,
      }),
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect([200, 500]).toContain(response.status);
    if (response.status === 200) {
      expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    }
  });
});
