import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// The real SDK is never used in tests: every GoogleGenAI instance gets this stub.
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import { GeminiProvider, isModelSkippable, isRetryableGeminiError, stripFences } from "./gemini";

const Schema = z.object({ topic: z.string() });

class ModelFallbackGemini extends GeminiProvider {
  public tried: string[] = [];
  constructor(models: string, private outcomes: Record<string, string | Error>) {
    super("fake-key", models);
  }
  protected override async callModel(model: string): Promise<string> {
    this.tried.push(model);
    const o = this.outcomes[model];
    if (o instanceof Error) throw o;
    return o ?? "";
  }
}

class FakeGemini extends GeminiProvider {
  public prompts: string[] = [];
  public jsonFlags: boolean[] = [];
  constructor(private replies: string[]) {
    super("fake-key", "m1");
  }
  protected override async raw(prompt: string, json: boolean): Promise<string> {
    this.prompts.push(prompt);
    this.jsonFlags.push(json);
    return this.replies.shift() ?? "";
  }
}

describe("helpers", () => {
  it("stripFences removes ```json fences", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("classifies errors", () => {
    expect(isRetryableGeminiError('{"code":429,"status":"RESOURCE_EXHAUSTED"}')).toBe(true);
    expect(isRetryableGeminiError('{"code":503,"message":"high demand","status":"UNAVAILABLE"}')).toBe(true);
    expect(isRetryableGeminiError('{"code":404,"status":"NOT_FOUND"}')).toBe(false);
    expect(isModelSkippable('{"code":404,"status":"NOT_FOUND"}')).toBe(true);
    expect(isModelSkippable("API key not valid. status:400 INVALID_ARGUMENT")).toBe(false);
  });
});

describe("GeminiProvider", () => {
  it("completeText asks for plain text and trims", async () => {
    const g = new FakeGemini(["  hello  "]);
    expect(await g.completeText("p")).toBe("hello");
    expect(g.jsonFlags).toEqual([false]);
  });
  it("completeText rejects empty output", async () => {
    await expect(new FakeGemini(["   "]).completeText("p")).rejects.toThrow(/empty/i);
  });
  it("completeJSON retries once with the validation error", async () => {
    const g = new FakeGemini(["nope", '```json\n{"topic":"AI"}\n```']);
    expect(await g.completeJSON("p", Schema)).toEqual({ topic: "AI" });
    expect(g.prompts[1]).toMatch(/invalid JSON/i);
    expect(g.jsonFlags).toEqual([true, true]);
  });
  it("falls back across models on overload/quota and stops on auth errors", async () => {
    const a = new ModelFallbackGemini("m1,m2,m3", { m1: new Error("503 high demand"), m2: new Error("429 RESOURCE_EXHAUSTED"), m3: "ok" });
    expect(await a.completeText("p")).toBe("ok");
    expect(a.tried).toEqual(["m1", "m2", "m3"]);
    const b = new ModelFallbackGemini("m1,m2", { m1: new Error("API key not valid 400 INVALID_ARGUMENT"), m2: "ok" });
    await expect(b.completeText("p")).rejects.toThrow(/API key not valid/);
    expect(b.tried).toEqual(["m1"]);
  });
  it("calls the (mocked) SDK with the model, and JSON mode only for completeJSON", async () => {
    generateContent.mockReset();
    generateContent.mockResolvedValueOnce({ text: " plain " }).mockResolvedValueOnce({ text: '{"topic":"x"}' });
    const g = new GeminiProvider("fake-key", "m1");
    expect(await g.completeText("hi")).toBe("plain");
    expect(await g.completeJSON("hi", Schema)).toEqual({ topic: "x" });
    expect(generateContent.mock.calls).toEqual([
      [{ model: "m1", contents: "hi" }],
      [{ model: "m1", contents: "hi", config: { responseMimeType: "application/json" } }],
    ]);
  });
});
