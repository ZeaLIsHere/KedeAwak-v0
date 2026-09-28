import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
// MARK: Leaf-module imports; the package barrel re-exports with .js suffixes Turbopack cannot resolve
import { parseWebhookPayload, type IncomingMessage } from "@kedeawak/whatsapp/src/parser";
import { verifyWebhookSignature } from "@kedeawak/whatsapp/src/signature";

// SECTION: Constants
export const MAX_WEBHOOK_BYTES = 1_048_576;
export const WHATSAPP_WEBHOOK_PATH = "/api/whatsapp/webhook";

const UNIQUE_VIOLATION_CODE = "23505";

// SECTION: Environment configuration
export type WhatsAppEnv = Record<string, string | undefined>;

export type WhatsAppWebhookConfig = {
  appSecret: string;
  verifyToken: string;
  supabaseUrl: string;
  serviceRoleKey: string;
};

function normalizeSupabaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const isLocal = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (isLocal) return parsed.origin;
    // MARK: Only the project API host is valid; a dashboard URL is a common mistake
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

// MARK: Reuse the public project URL so setup needs one less duplicate variable
function resolveSupabaseUrl(env: WhatsAppEnv): string | null {
  return normalizeSupabaseUrl(env.SUPABASE_URL) ?? normalizeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
}

// MARK: Server-only configuration; never expose the service role key to the client
export function getWhatsAppWebhookConfig(env: WhatsAppEnv = process.env): WhatsAppWebhookConfig | null {
  const appSecret = env.WHATSAPP_APP_SECRET?.trim();
  const verifyToken = env.WHATSAPP_VERIFY_TOKEN?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = resolveSupabaseUrl(env);
  if (!appSecret || !verifyToken || !serviceRoleKey || !supabaseUrl) return null;
  return { appSecret, verifyToken, supabaseUrl, serviceRoleKey };
}

// MARK: Names only; values must never be returned to a caller
// MARK: Names only; values must never be returned to a caller
export function getMissingWhatsAppEnvNames(env: WhatsAppEnv = process.env): string[] {
  const missing: string[] = [];
  if (!env.WHATSAPP_APP_SECRET?.trim()) missing.push("WHATSAPP_APP_SECRET");
  if (!env.WHATSAPP_VERIFY_TOKEN?.trim()) missing.push("WHATSAPP_VERIFY_TOKEN");
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!resolveSupabaseUrl(env)) missing.push("SUPABASE_URL");
  return missing;
}

// SECTION: Setup checklist for the dashboard
export type WhatsAppSetupChecklist = {
  verifyToken: boolean;
  appSecret: boolean;
  phoneNumberId: boolean;
  serviceRole: boolean;
  accessToken: boolean;
  callbackUrl: string | null;
  configured: boolean;
};

export function getWhatsAppSetupChecklist(env: WhatsAppEnv = process.env): WhatsAppSetupChecklist {
  const verifyToken = Boolean(env.WHATSAPP_VERIFY_TOKEN?.trim());
  const appSecret = Boolean(env.WHATSAPP_APP_SECRET?.trim());
  const phoneNumberId = Boolean(env.WHATSAPP_PHONE_NUMBER_ID?.trim());
  const serviceRole = Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim()) && Boolean(resolveSupabaseUrl(env));
  const accessToken = Boolean(env.WHATSAPP_ACCESS_TOKEN?.trim());
  const baseUrl = normalizeAppBaseUrl(env.APP_BASE_URL);
  return {
    verifyToken,
    appSecret,
    phoneNumberId,
    serviceRole,
    accessToken,
    callbackUrl: baseUrl ? `${baseUrl}${WHATSAPP_WEBHOOK_PATH}` : null,
    configured: verifyToken && appSecret && phoneNumberId && serviceRole && baseUrl !== null,
  };
}

function normalizeAppBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) return null;
    const isLocal = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !isLocal) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

// SECTION: GET verification handshake
export type WebhookChallengeDecision = { status: 200; challenge: string } | { status: 403; challenge: null };

function constantTimeEquals(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

// MARK: The verify token is compared in constant time and never logged
export function evaluateWebhookChallenge(
  params: URLSearchParams,
  verifyToken: string | null | undefined,
): WebhookChallengeDecision {
  const mode = params.get("hub.mode");
  const provided = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !verifyToken || !provided || !challenge) return { status: 403, challenge: null };
  if (!constantTimeEquals(provided, verifyToken)) return { status: 403, challenge: null };
  return { status: 200, challenge };
}

// SECTION: Minimal database surface for the service-role client
export type WhatsAppQueryError = { code?: string | null; message?: string | null } | null;
export type WhatsAppQueryResult = { data?: unknown; error: WhatsAppQueryError };

export type WhatsAppSelectBuilder = {
  eq(column: string, value: string): WhatsAppSelectBuilder;
  order(column: string, options: { ascending: boolean }): WhatsAppSelectBuilder;
  limit(count: number): WhatsAppSelectBuilder;
  maybeSingle(): PromiseLike<WhatsAppQueryResult>;
};

export type WhatsAppInsertBuilder = PromiseLike<WhatsAppQueryResult> & {
  select(columns: string): { single(): PromiseLike<WhatsAppQueryResult> };
};

export type WhatsAppUpdateBuilder = PromiseLike<WhatsAppQueryResult> & {
  eq(column: string, value: string): WhatsAppUpdateBuilder;
};

export type WhatsAppTableClient = {
  select(columns: string): WhatsAppSelectBuilder;
  insert(values: Record<string, unknown>): WhatsAppInsertBuilder;
  upsert(values: Record<string, unknown>, options: { onConflict: string }): WhatsAppInsertBuilder;
  update(values: Record<string, unknown>): WhatsAppUpdateBuilder;
};

export type WhatsAppDbClient = { from(table: string): WhatsAppTableClient };

// MARK: Service-role client is created only inside the webhook route
export function createWhatsAppDbClient(url: string, serviceRoleKey: string): WhatsAppDbClient {
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client as unknown as WhatsAppDbClient;
}

// SECTION: Row mapping
export type InboundMessageRow = {
  shop_id: string;
  conversation_id: string;
  direction: "inbound";
  wa_message_id: string;
  type: IncomingMessage["type"];
  body: string | null;
  media_path: null;
  transcript: null;
  created_at: string;
};

// MARK: Media download via Graph API is not implemented; the media id is kept in body as a reference
function inboundBody(message: IncomingMessage): string | null {
  switch (message.type) {
    case "text":
      return message.text;
    case "image":
    case "document":
      return message.caption ?? message.mediaId;
    case "audio":
      return message.mediaId;
    default:
      return null;
  }
}

export function resolveMessageTimestamp(timestamp: string, now: Date): string {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return now.toISOString();
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return now.toISOString();
  return date.toISOString();
}

export function mapInboundMessageToRow(
  message: IncomingMessage,
  shopId: string,
  conversationId: string,
  now: Date,
): InboundMessageRow {
  return {
    shop_id: shopId,
    conversation_id: conversationId,
    direction: "inbound",
    wa_message_id: message.waMessageId,
    type: message.type,
    body: inboundBody(message),
    media_path: null,
    transcript: null,
    created_at: resolveMessageTimestamp(message.timestamp, now),
  };
}

export function isDuplicateKeyError(error: WhatsAppQueryError): boolean {
  return error?.code === UNIQUE_VIOLATION_CODE;
}

// SECTION: Persistence
export type InboundPersistence = { stored: number; duplicates: number };

function readId(data: unknown): string | null {
  if (data && typeof data === "object" && "id" in data) {
    const value = (data as { id: unknown }).id;
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export async function findShopIdByPhoneNumberId(db: WhatsAppDbClient, phoneNumberId: string): Promise<string | null> {
  const { data, error } = await db
    .from("shops")
    .select("id")
    .eq("wa_phone_number_id", phoneNumberId)
    .maybeSingle();
  if (error) throw new Error("Failed to resolve shop for phone number");
  return readId(data);
}

async function upsertCustomerId(db: WhatsAppDbClient, shopId: string, phone: string): Promise<string> {
  const { data, error } = await db
    .from("customers")
    .upsert({ shop_id: shopId, phone }, { onConflict: "shop_id,phone" })
    .select("id")
    .single();
  const id = readId(data);
  if (error || !id) throw new Error("Failed to upsert customer");
  return id;
}

async function findOrCreateConversationId(db: WhatsAppDbClient, shopId: string, customerId: string): Promise<string> {
  const existing = await db
    .from("conversations")
    .select("id")
    .eq("shop_id", shopId)
    .eq("customer_id", customerId)
    .eq("channel", "whatsapp")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error("Failed to read conversation");
  const existingId = readId(existing.data);
  if (existingId) return existingId;

  const created = await db
    .from("conversations")
    .insert({ shop_id: shopId, customer_id: customerId, channel: "whatsapp" })
    .select("id")
    .single();
  const createdId = readId(created.data);
  if (created.error || !createdId) throw new Error("Failed to create conversation");
  return createdId;
}

export async function persistInboundMessages(
  db: WhatsAppDbClient,
  shopId: string,
  messages: readonly IncomingMessage[],
  now: Date,
): Promise<InboundPersistence> {
  let stored = 0;
  let duplicates = 0;
  const customers = new Map<string, string>();
  const conversations = new Map<string, string>();
  const latestAt = new Map<string, string>();

  for (const message of messages) {
    let customerId = customers.get(message.from);
    if (!customerId) {
      customerId = await upsertCustomerId(db, shopId, message.from);
      customers.set(message.from, customerId);
    }
    let conversationId = conversations.get(customerId);
    if (!conversationId) {
      conversationId = await findOrCreateConversationId(db, shopId, customerId);
      conversations.set(customerId, conversationId);
    }

    const row = mapInboundMessageToRow(message, shopId, conversationId, now);
    const { error } = await db.from("messages").insert(row);
    if (!error) {
      stored++;
      const previous = latestAt.get(conversationId);
      if (!previous || row.created_at > previous) latestAt.set(conversationId, row.created_at);
    } else if (isDuplicateKeyError(error)) {
      duplicates++;
    } else {
      throw new Error("Failed to store inbound message");
    }
  }

  for (const [conversationId, at] of latestAt) {
    const { error } = await db
      .from("conversations")
      .update({ last_message_at: at })
      .eq("shop_id", shopId)
      .eq("id", conversationId);
    if (error) throw new Error("Failed to update conversation timestamp");
  }

  return { stored, duplicates };
}

// SECTION: POST request decision
export type WebhookPostResult = { status: number; body: Record<string, unknown> };

export type WebhookPostDeps = { config: WhatsAppWebhookConfig | null; db: WhatsAppDbClient | null };

const NOT_CONFIGURED_BODY: Record<string, unknown> = {
  error: "not_configured",
  message:
    "WhatsApp webhook belum siap. Atur WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, SUPABASE_URL, dan SUPABASE_SERVICE_ROLE_KEY di lingkungan server.",
};

export async function handleWhatsAppWebhookPost(
  rawBody: Uint8Array,
  signature: string | null,
  deps: WebhookPostDeps,
  now: Date = new Date(),
): Promise<WebhookPostResult> {
  if (deps.config === null || deps.db === null) return { status: 503, body: NOT_CONFIGURED_BODY };
  if (rawBody.byteLength > MAX_WEBHOOK_BYTES) return { status: 413, body: { error: "payload_too_large" } };
  if (!verifyWebhookSignature(rawBody, signature, deps.config.appSecret)) {
    return { status: 401, body: { error: "invalid_signature" } };
  }

  let parsed;
  try {
    parsed = parseWebhookPayload(rawBody);
  } catch {
    return { status: 400, body: { error: "invalid_payload" } };
  }

  const phoneNumberIds = [...new Set(parsed.phoneNumberIds)];
  if (phoneNumberIds.length > 1) return { status: 400, body: { error: "mixed_phone_numbers" } };
  const phoneNumberId = phoneNumberIds[0];
  if (!phoneNumberId) return { status: 200, body: { received: true, stored: 0, duplicates: 0 } };

  try {
    const shopId = await findShopIdByPhoneNumberId(deps.db, phoneNumberId);
    if (!shopId) return { status: 400, body: { error: "unknown_phone_number" } };
    const outcome = await persistInboundMessages(deps.db, shopId, parsed.messages, now);
    return { status: 200, body: { received: true, stored: outcome.stored, duplicates: outcome.duplicates } };
  } catch {
    return { status: 500, body: { error: "storage_failed" } };
  }
}
