import { describe, expect, it, vi } from "vitest";
import { createDeepSeekClient, DeepSeekClientError } from "../src/index.js";
import type { CompletionRequest, ToolDefinition } from "../src/index.js";

const apiKey = "synthetic-api-key";
const model = "deepseek-flash";
const request: CompletionRequest = { messages: [{ role: "user", content: "Synthetic question" }] };
const tools: ToolDefinition[] = [{
  type: "function",
  function: { name: "check_stock", description: "Check synthetic stock", parameters: { type: "object" } },
}];

function completion(message: unknown, finishReason = "stop") {
  return { choices: [{ finish_reason: finishReason, message }] };
}

describe("createDeepSeekClient", () => {
  it("posts a non-streaming chat request using supplied credentials and model", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(completion({ role: "assistant", content: "Available" })));
    const client = createDeepSeekClient({ apiKey, model, fetchImpl });

    await expect(client.complete(request)).resolves.toEqual({
      content: "Available", toolCalls: [], finishReason: "stop",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init).toMatchObject({
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(String(init?.body))).toEqual({ model, messages: request.messages, stream: false });
  });

  it("returns only offered tool calls with untrusted arguments left as strings", async () => {
    const call = { id: "synthetic-call", type: "function", function: { name: "check_stock", arguments: "{untrusted input" } };
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(completion({
      role: "assistant", content: null, tool_calls: [call],
    }, "tool_calls")));
    const client = createDeepSeekClient({ apiKey, model: "deepseek-v4-pro", fetchImpl });

    await expect(client.complete({ ...request, tools })).resolves.toEqual({
      content: null, toolCalls: [call], finishReason: "tool_calls",
    });
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "deepseek-v4-pro", messages: request.messages, tools, stream: false,
    });
  });

  it("rejects malformed, incomplete, and unauthorized tool responses", async () => {
    const invalid = [
      {},
      completion({ role: "assistant", content: 123 }),
      completion({ role: "assistant", content: null }),
      completion({ role: "assistant", content: "partial" }, "length"),
      completion({ role: "assistant", content: null, tool_calls: [{
        id: "synthetic-call", type: "function", function: { name: "send_purchase_order", arguments: "{}" },
      }] }, "tool_calls"),
      completion({ role: "assistant", content: null, tool_calls: [{
        id: "synthetic-call", type: "function", function: { name: "check_stock", arguments: {} },
      }] }, "tool_calls"),
    ];
    for (const payload of invalid) {
      const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(payload));
      const client = createDeepSeekClient({ apiKey, model, fetchImpl });
      await expect(client.complete({ ...request, tools })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("does not surface the provider error body, secret, or customer text", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("synthetic-api-key Synthetic question", { status: 429 }));
    const client = createDeepSeekClient({ apiKey, model, fetchImpl });
    const error = await client.complete(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DeepSeekClientError);
    expect(error).toMatchObject({ code: "REQUEST_FAILED" });
    expect(String(error)).not.toMatch(/synthetic-api-key|Synthetic question/);
  });

  it("safely reports timeout and network failures", async () => {
    const timeoutFetch = vi.fn<typeof fetch>(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("synthetic-api-key", "TimeoutError")), { once: true });
    }));
    const client = createDeepSeekClient({ apiKey, model, timeoutMs: 25, fetchImpl: timeoutFetch });
    const error = await client.complete(request).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "TIMEOUT" });
    expect(String(error)).not.toContain(apiKey);
    const [, init] = timeoutFetch.mock.calls[0] ?? [];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const failed = createDeepSeekClient({ apiKey, model, fetchImpl: vi.fn<typeof fetch>(async () => {
      throw new Error("Synthetic question");
    }) });
    await expect(failed.complete(request)).rejects.toMatchObject({ code: "REQUEST_FAILED" });
  });

  it("rejects missing credentials, invalid timeout, empty messages, and duplicate tools", async () => {
    expect(() => createDeepSeekClient({ apiKey: undefined, model })).toThrow(DeepSeekClientError);
    expect(() => createDeepSeekClient({ apiKey, model: " " })).toThrow(DeepSeekClientError);
    expect(() => createDeepSeekClient({ apiKey, model, timeoutMs: 0 })).toThrow(DeepSeekClientError);
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createDeepSeekClient({ apiKey, model, fetchImpl });
    await expect(client.complete({ messages: [] })).rejects.toMatchObject({ code: "CONFIG" });
    await expect(client.complete({ ...request, tools: [...tools, ...tools] })).rejects.toMatchObject({ code: "CONFIG" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON responses without exposing the response body", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("Synthetic question"));
    const client = createDeepSeekClient({ apiKey, model, fetchImpl });
    await expect(client.complete(request)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
