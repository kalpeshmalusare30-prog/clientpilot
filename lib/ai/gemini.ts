import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";

export const DEFAULT_MODELS = "gemini-flash-lite-latest,gemini-3.6-flash,gemini-flash-latest,gemini-3.5-flash";

export interface LLM {
  completeText(prompt: string): Promise<string>;
  completeJSON<T>(prompt: string, schema: z.ZodType<T>): Promise<T>;
}

export function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Free-tier rate limits (429) and temporary capacity errors (503 "high demand"). */
export function isRetryableGeminiError(msg: string): boolean {
  return msg.includes("429") || msg.includes("503") || /rate|quota|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|high demand/i.test(msg);
}

/** Skip to the next model on overload/quota or an unavailable model id (404); auth/invalid errors fail fast. */
export function isModelSkippable(msg: string): boolean {
  return isRetryableGeminiError(msg) || /\b404\b|NOT_FOUND/i.test(msg);
}

export class GeminiProvider implements LLM {
  private ai: GoogleGenAI;
  private models: string[];

  constructor(apiKey: string, models: string = process.env.GEMINI_MODEL || DEFAULT_MODELS) {
    this.ai = new GoogleGenAI({ apiKey });
    this.models = models.split(",").map((m) => m.trim()).filter(Boolean);
    if (this.models.length === 0) this.models = DEFAULT_MODELS.split(",");
  }

  async completeText(prompt: string): Promise<string> {
    const t = (await this.raw(prompt, false)).trim();
    if (!t) throw new Error("LLM returned empty text");
    return t;
  }

  async completeJSON<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const p = attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous reply was invalid JSON for the required shape (${lastErr}). Reply with ONLY the corrected JSON.`;
      const raw = await this.raw(p, true);
      try {
        return schema.parse(JSON.parse(stripFences(raw)));
      } catch (e) {
        lastErr = String(e).slice(0, 300);
      }
    }
    throw new Error(`LLM returned invalid JSON after retry: ${lastErr}`);
  }

  /** One generation against one model. Overridden in tests. */
  protected async callModel(model: string, prompt: string, json: boolean): Promise<string> {
    const res = await this.ai.models.generateContent({
      model,
      contents: prompt,
      ...(json ? { config: { responseMimeType: "application/json" } } : {}),
    });
    return res.text ?? "";
  }

  /** Tries each model in order; a second pass after 4 s; only unskippable errors fail fast. */
  protected async raw(prompt: string, json: boolean): Promise<string> {
    let lastError: unknown;
    for (let pass = 0; pass < 2; pass++) {
      for (const model of this.models) {
        try {
          return await this.callModel(model, prompt, json);
        } catch (e) {
          lastError = e;
          if (!isModelSkippable(String((e as Error)?.message ?? e))) throw e;
        }
      }
      if (pass === 0) await sleep(4000);
    }
    throw lastError as Error;
  }
}
