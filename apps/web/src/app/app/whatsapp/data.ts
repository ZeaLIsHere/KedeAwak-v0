import { z } from "zod";
import type { SupabaseServerClient } from "@/lib/supabase/server";

export const CONVERSATION_LIMIT = 50;
export const MESSAGE_LIMIT = 200;

// SECTION: Types
export type WhatsAppConversation = {
  id: string;
  customerPhone: string;
  status: string;
  handledBy: string;
  lastMessageAt: string;
};

export type WhatsAppMessage = {
  id: string;
  direction: "inbound" | "outbound";
  type: string;
  body: string | null;
  transcript: string | null;
  createdAt: string;
};

type ConversationRow = {
  id: string;
  customer_id: string;
  status: string;
  handled_by: string;
  last_message_at: string;
};

type CustomerRow = { id: string; phone: string };

type MessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  type: string;
  body: string | null;
  transcript: string | null;
  created_at: string;
};

const conversationIdSchema = z.string().uuid();

export function parseConversationIdParam(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const parsed = conversationIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// MARK: shop_id comes from the trusted membership only, never from the client
export async function getWhatsAppConversations(client: SupabaseServerClient, shopId: string) {
  const { data, error } = await client
    .from("conversations")
    .select("id, customer_id, status, handled_by, last_message_at")
    .eq("shop_id", shopId)
    .eq("channel", "whatsapp")
    .order("last_message_at", { ascending: false })
    .limit(CONVERSATION_LIMIT);
  if (error || !data) return { conversations: null, error: true } as const;

  const rows = data as ConversationRow[];
  const customerIds = [...new Set(rows.map((row) => row.customer_id))];
  const phones = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customers, error: customerError } = await client
      .from("customers")
      .select("id, phone")
      .eq("shop_id", shopId)
      .in("id", customerIds);
    if (customerError) return { conversations: null, error: true } as const;
    for (const customer of (customers ?? []) as CustomerRow[]) phones.set(customer.id, customer.phone);
  }

  const conversations: WhatsAppConversation[] = rows.map((row) => ({
    id: row.id,
    customerPhone: phones.get(row.customer_id) ?? "Nomor tidak dikenal",
    status: row.status,
    handledBy: row.handled_by,
    lastMessageAt: row.last_message_at,
  }));
  return { conversations, error: false } as const;
}

// MARK: shop_id comes from the trusted membership only, never from the client
export async function getConversationMessages(client: SupabaseServerClient, shopId: string, conversationId: string) {
  const { data, error } = await client
    .from("messages")
    .select("id, direction, type, body, transcript, created_at")
    .eq("shop_id", shopId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(MESSAGE_LIMIT);
  if (error || !data) return { messages: null, error: true } as const;
  const messages: WhatsAppMessage[] = (data as MessageRow[]).map((row) => ({
    id: row.id,
    direction: row.direction,
    type: row.type,
    body: row.body,
    transcript: row.transcript,
    createdAt: row.created_at,
  }));
  return { messages, error: false } as const;
}

export async function getShopPhoneNumberId(client: SupabaseServerClient, shopId: string) {
  const { data, error } = await client.from("shops").select("wa_phone_number_id").eq("id", shopId).single();
  if (error || !data) return { phoneNumberId: null, error: true } as const;
  const value = (data as { wa_phone_number_id: string | null }).wa_phone_number_id;
  return { phoneNumberId: value, error: false } as const;
}
