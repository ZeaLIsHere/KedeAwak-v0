"use server";

import {
  ASSISTANT_SETUP_GUIDANCE,
  ASSISTANT_SYSTEM_PROMPT,
  ASSISTANT_TOOL_ROUND_LIMIT,
  READ_ONLY_ASSISTANT_TOOLS,
  parseToolArguments,
  questionSchema,
  resolveAssistantConfig,
  summarizeToolResult,
} from "@/lib/assistant";
// MARK: Leaf-module import keeps the adapter free of workspace barrel resolution
import { DeepSeekClientError, createDeepSeekClient } from "@kedeawak/agent/src/deepseek-client";
import type { ChatMessage } from "@kedeawak/agent/src/deepseek-client";
import { getIdentity, getMembership } from "@/lib/membership";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { runCheckStock, runGetReport } from "./data";

export type AssistantActionState = {
  status: "success" | "unavailable" | "error";
  message: string;
};

const MEMBERSHIP_ERROR = "Data warung belum dapat dimuat. Coba lagi nanti.";
const PROFILE_MISSING = "Profil warung belum tersedia. Selesaikan langkah awal terlebih dahulu.";
const OWNER_ONLY = "Hanya pemilik warung yang dapat memakai asisten.";
const NO_ANSWER = "Asisten belum menemukan jawaban dari data warung. Coba tanyakan dengan lebih spesifik.";
const LOOP_EXHAUSTED = "Asisten belum dapat menyelesaikan permintaan ini. Coba tanyakan dengan lebih spesifik.";

// SECTION: Tool execution (read-only only)
async function executeToolCall(
  client: SupabaseServerClient,
  shopId: string,
  name: string,
  rawArguments: string,
  now: Date,
): Promise<string> {
  const parsed = parseToolArguments(name, rawArguments);
  if (parsed.status === "ignored") {
    return `Tool "${parsed.name}" tidak tersedia. Asisten hanya boleh memakai check_stock dan get_report.`;
  }
  if (parsed.status === "invalid") {
    return `Argumen untuk ${parsed.name} tidak valid. Kirim argumen sesuai skema.`;
  }
  if (parsed.name === "check_stock") {
    return summarizeToolResult(await runCheckStock(client, shopId, parsed.args.query));
  }
  return summarizeToolResult(await runGetReport(client, shopId, parsed.args.period, now));
}

function describeModelError(error: unknown): string {
  if (error instanceof DeepSeekClientError) {
    if (error.code === "TIMEOUT") return "Asisten tidak merespons tepat waktu. Coba lagi.";
    if (error.code === "CONFIG") return ASSISTANT_SETUP_GUIDANCE;
    return "Layanan asisten sedang tidak dapat dihubungi. Coba lagi nanti.";
  }
  return "Asisten belum dapat menjawab saat ini. Coba lagi nanti.";
}

// MARK: shop_id and role come from the trusted membership only, never from the client
export async function askAssistant(formData: FormData): Promise<AssistantActionState> {
  const rawQuestion = formData.get("question");
  const parsed = questionSchema.safeParse(typeof rawQuestion === "string" ? rawQuestion : "");
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Pertanyaan tidak valid." };
  }

  const { client, authId } = await getIdentity();
  const { membership, error } = await getMembership(client, authId);
  if (error) return { status: "error", message: MEMBERSHIP_ERROR };
  if (!membership) return { status: "error", message: PROFILE_MISSING };
  if (membership.role !== "owner") return { status: "error", message: OWNER_ONLY };
  const shopId = membership.shop_id;

  // MARK: Refuse to call the model when configuration is missing; never fake an answer
  const config = resolveAssistantConfig(process.env);
  if (!config) return { status: "unavailable", message: ASSISTANT_SETUP_GUIDANCE };

  const now = new Date();
  const messages: ChatMessage[] = [
    { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
    { role: "user", content: parsed.data },
  ];
  const modelClient = createDeepSeekClient({ apiKey: config.apiKey, model: config.model });

  try {
    let toolRounds = 0;
    for (;;) {
      const result = await modelClient.complete({ messages, tools: [...READ_ONLY_ASSISTANT_TOOLS] });
      if (result.finishReason === "stop") {
        return { status: "success", message: result.content?.trim() || NO_ANSWER };
      }
      if (toolRounds >= ASSISTANT_TOOL_ROUND_LIMIT) return { status: "error", message: LOOP_EXHAUSTED };

      toolRounds += 1;
      messages.push({ role: "assistant", content: null, tool_calls: result.toolCalls });
      for (const call of result.toolCalls) {
        const content = await executeToolCall(client, shopId, call.function.name, call.function.arguments, now);
        messages.push({ role: "tool", content, tool_call_id: call.id });
      }
    }
  } catch (caught) {
    return { status: "error", message: describeModelError(caught) };
  }
}
