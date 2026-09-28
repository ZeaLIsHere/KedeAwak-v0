"use server";

import { revalidatePath } from "next/cache";
import {
  ASSISTANT_UNKNOWN_ROLE_REFUSAL,
  isAssistantRole,
  parseApprovalTtlMinutes,
  parseConversationHistory,
  parseDailyAiQuota,
  questionSchema,
  resolveAssistantConfig,
  type ConversationTurn,
} from "@/lib/assistant";
// MARK: Leaf-module import keeps the adapter free of workspace barrel resolution
import { createDeepSeekClient } from "@kedeawak/agent/src/deepseek-client";
import { getIdentity, getMembership } from "@/lib/membership";
import { createAssistantStore, getAssistantUserId } from "./data";
import { runAssistantTurn } from "./flow";

export type AssistantActionState = {
  status: "success" | "unavailable" | "error";
  message: string;
  pending: { id: string; summary: string } | null;
  quota: { used: number; limit: number } | null;
};

const MEMBERSHIP_ERROR = "Data warung belum dapat dimuat. Coba lagi nanti.";
const PROFILE_MISSING = "Profil warung belum tersedia. Selesaikan langkah awal terlebih dahulu.";

function parseHistoryField(value: FormDataEntryValue | null): ConversationTurn[] {
  if (typeof value !== "string" || !value) return [];
  try {
    return parseConversationHistory(JSON.parse(value));
  } catch {
    return [];
  }
}

// MARK: shop_id and role come from the trusted membership only, never from the client
export async function askAssistant(formData: FormData): Promise<AssistantActionState> {
  const rawQuestion = formData.get("question");
  const parsed = questionSchema.safeParse(typeof rawQuestion === "string" ? rawQuestion : "");
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Pertanyaan tidak valid.", pending: null, quota: null };
  }
  const history = parseHistoryField(formData.get("history"));

  const { client, authId } = await getIdentity();
  const { membership, error } = await getMembership(client, authId);
  if (error) return { status: "error", message: MEMBERSHIP_ERROR, pending: null, quota: null };
  if (!membership) return { status: "error", message: PROFILE_MISSING, pending: null, quota: null };
  if (!isAssistantRole(membership.role)) {
    return { status: "error", message: ASSISTANT_UNKNOWN_ROLE_REFUSAL, pending: null, quota: null };
  }
  const shopId = membership.shop_id;
  const role = membership.role;

  const { userId } = await getAssistantUserId(client, authId);
  if (!userId) return { status: "error", message: PROFILE_MISSING, pending: null, quota: null };

  const now = new Date();
  const ttlMinutes = parseApprovalTtlMinutes(process.env);
  const quotaLimit = parseDailyAiQuota(process.env);
  const config = resolveAssistantConfig(process.env);
  const model = config ? createDeepSeekClient({ apiKey: config.apiKey, model: config.model }) : null;
  const store = createAssistantStore({ client, shopId, userId, now, quotaLimit });

  const result = await runAssistantTurn({ role, message: parsed.data, history, now, ttlMinutes, model, store });

  if (result.executedWrite) {
    revalidatePath("/app");
    revalidatePath("/app/riwayat");
    revalidatePath("/app/laporan");
  }
  revalidatePath("/app/asisten");

  return { status: result.status, message: result.message, pending: result.pending, quota: result.quota };
}
