import { z } from "zod";

const ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_TIMEOUT_MS = 10_000;

const toolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string(),
  }),
});

const completionSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.string(),
    message: z.object({
      role: z.literal("assistant"),
      content: z.string().nullable(),
      tool_calls: z.array(toolCallSchema).optional(),
    }),
  })).min(1),
});

export type ToolCall = z.infer<typeof toolCallSchema>;
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type CompletionRequest = {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
};

export type CompletionResult = {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool_calls";
};

export type DeepSeekClientConfig = {
  apiKey: string | undefined;
  model: string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type DeepSeekErrorCode = "CONFIG" | "TIMEOUT" | "REQUEST_FAILED" | "INVALID_RESPONSE";

export class DeepSeekClientError extends Error {
  constructor(readonly code: DeepSeekErrorCode) {
    super(`DeepSeek ${code.toLowerCase().replaceAll("_", " ")}`);
    this.name = "DeepSeekClientError";
  }
}

export function createDeepSeekClient({
  apiKey,
  model,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
}: DeepSeekClientConfig) {
  if (!apiKey?.trim() || !model?.trim() || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new DeepSeekClientError("CONFIG");
  }

  return {
    async complete({ messages, tools }: CompletionRequest): Promise<CompletionResult> {
      if (!messages.length) {
        throw new DeepSeekClientError("CONFIG");
      }
      const allowedTools = new Set<string>();
      for (const tool of tools ?? []) {
        if (tool.type !== "function" || !/^[a-zA-Z0-9_-]{1,128}$/.test(tool.function.name) || allowedTools.has(tool.function.name)) {
          throw new DeepSeekClientError("CONFIG");
        }
        allowedTools.add(tool.function.name);
      }

      let response: Response;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model, messages, ...(tools?.length ? { tools } : {}), stream: false }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
          throw new DeepSeekClientError("TIMEOUT");
        }
        throw new DeepSeekClientError("REQUEST_FAILED");
      }

      if (!response.ok) {
        throw new DeepSeekClientError("REQUEST_FAILED");
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new DeepSeekClientError("INVALID_RESPONSE");
      }
      const parsed = completionSchema.safeParse(payload);
      if (!parsed.success) {
        throw new DeepSeekClientError("INVALID_RESPONSE");
      }
      const choice = parsed.data.choices[0];
      if (!choice) {
        throw new DeepSeekClientError("INVALID_RESPONSE");
      }
      const { message, finish_reason: finishReason } = choice;
      const toolCalls = message.tool_calls ?? [];
      if (
        (finishReason !== "stop" && finishReason !== "tool_calls") ||
        (finishReason === "tool_calls") !== (toolCalls.length > 0) ||
        (finishReason === "stop" && message.content === null) ||
        toolCalls.some((call) => !allowedTools.has(call.function.name))
      ) {
        throw new DeepSeekClientError("INVALID_RESPONSE");
      }
      return { content: message.content, toolCalls, finishReason };
    },
  };
}
