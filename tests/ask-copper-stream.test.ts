import type { LanguageModelV4StreamPart as ModelStreamPart } from "@ai-sdk/provider";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalValue, readLive } from "@/lib/ai/live";
import type { Progress } from "@/lib/copper/assistant/progress";

let model: MockLanguageModelV4;
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => model,
}));

const usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};
const stop = {
  type: "finish" as const,
  finishReason: { unified: "stop" as const, raw: undefined },
  usage,
};
const question = [{ role: "user" as const, content: "Hi" }];

async function loadAsk() {
  vi.resetModules();
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key");
  vi.spyOn(console, "info").mockImplementation(() => {});
  return import("@/lib/copper/assistant/ask");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("askCopper edge cases", () => {
  it("apologizes, but still finishes as done, when the reply is empty", async () => {
    model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream<ModelStreamPart>([stop]),
      }),
    });
    const { askCopper } = await loadAsk();
    const result = await finalValue(
      (await askCopper({ messages: question, useTools: false })).progress,
    );
    expect(result.status).toBe("done");
    expect(result.reply).toMatch(/sorry/i);
  });

  it("finishes as error with an apology when the model throws", async () => {
    model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("model is down");
      },
    });
    const { askCopper } = await loadAsk();
    const result = await finalValue(
      (await askCopper({ messages: question, useTools: true })).progress,
    );
    expect(result.status).toBe("error");
    expect(result.reply).toMatch(/sorry/i);
  });

  it("hands out a fresh copy with every update", async () => {
    model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream<ModelStreamPart>([
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "Hello" },
          { type: "text-delta", id: "t", delta: " there" },
          { type: "text-end", id: "t" },
          stop,
        ]),
      }),
    });
    const { askCopper } = await loadAsk();
    const updates: Progress[] = [];
    for await (const update of readLive(
      (await askCopper({ messages: question, useTools: false })).progress,
    ))
      updates.push(update);
    expect(new Set(updates).size).toBe(updates.length);
    expect(new Set(updates.map((u) => u.steps)).size).toBe(updates.length);
    expect(updates.at(-1)?.reply).toBe("Hello there");
  });

  it("rejects a request that isn't a conversation", async () => {
    const { askCopper } = await loadAsk();
    await expect(askCopper({ messages: [], useTools: true })).rejects.toThrow();
    await expect(
      askCopper({
        messages: [{ role: "system", content: "x" }],
        useTools: true,
      } as never),
    ).rejects.toThrow();
  });
});
