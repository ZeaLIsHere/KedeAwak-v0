import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluateWebhookChallenge,
  getWhatsAppSetupChecklist,
  getWhatsAppWebhookConfig,
  handleWhatsAppWebhookPost,
  isDuplicateKeyError,
  mapInboundMessageToRow,
  resolveMessageTimestamp,
  type WhatsAppDbClient,
  type WhatsAppInsertBuilder,
  type WhatsAppQueryError,
  type WhatsAppSelectBuilder,
  type WhatsAppTableClient,
  type WhatsAppUpdateBuilder,
} from "./whatsapp-webhook";

const APP_SECRET = "synthetic-app-secret";
const VERIFY_TOKEN = "synthetic-verify-token";
const PHONE_NUMBER_ID = "synthetic-phone-number-id";
const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-01-02T03:04:05.000Z");

const config = {
  appSecret: APP_SECRET,
  verifyToken: VERIFY_TOKEN,
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "synthetic-service-role-key",
};

function signed(body: string, secret = APP_SECRET) {
  const rawBody = new TextEncoder().encode(body);
  const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return { rawBody, signature };
}

function payload(messages: unknown[], phoneNumberId = PHONE_NUMBER_ID) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumberId }, messages } }] }],
  });
}

type Row = Record<string, unknown>;
type QueryResult = { data?: unknown; error: WhatsAppQueryError };

function memoize(compute: () => QueryResult): () => QueryResult {
  let done = false;
  let result: QueryResult = { data: undefined, error: null };
  return () => {
    if (!done) {
      result = compute();
      done = true;
    }
    return result;
  };
}

function thenable<T extends object>(compute: () => QueryResult, extra: T): PromiseLike<QueryResult> & T {
  const then: PromiseLike<QueryResult>["then"] = (onFulfilled, onRejected) =>
    Promise.resolve(compute()).then(onFulfilled, onRejected);
  return { ...extra, then } as PromiseLike<QueryResult> & T;
}

type FakeState = {
  shops: Array<{ id: string; wa_phone_number_id: string | null }>;
  customers: Array<{ id: string; shop_id: string; phone: string }>;
  conversations: Array<{ id: string; shop_id: string; customer_id: string; last_message_at: string }>;
  messages: Row[];
};

function createFakeDb(options: { duplicateWaIds?: readonly string[] } = {}) {
  const state: FakeState = { shops: [], customers: [], conversations: [], messages: [] };
  const duplicates = new Set(options.duplicateWaIds ?? []);

  const resolveSelect = (table: string, filters: Array<[string, string]>, limit: number): QueryResult => {
    if (table === "shops") {
      const phoneNumberId = filters.find(([column]) => column === "wa_phone_number_id")?.[1];
      const shop = state.shops.find((item) => item.wa_phone_number_id === phoneNumberId);
      return { data: shop ? { id: shop.id } : null, error: null };
    }
    if (table === "conversations") {
      const shopId = filters.find(([column]) => column === "shop_id")?.[1];
      const customerId = filters.find(([column]) => column === "customer_id")?.[1];
      const matches = state.conversations
        .filter((item) => item.shop_id === shopId && item.customer_id === customerId)
        .sort((left, right) => (left.last_message_at < right.last_message_at ? 1 : -1))
        .slice(0, limit < 0 ? undefined : limit);
      return { data: matches[0] ? { id: matches[0].id } : null, error: null };
    }
    return { data: null, error: null };
  };

  const resolveInsert = (table: string, values: Row): QueryResult => {
    if (table === "customers") {
      const shopId = String(values.shop_id);
      const phone = String(values.phone);
      const existing = state.customers.find((item) => item.shop_id === shopId && item.phone === phone);
      if (existing) return { data: { id: existing.id }, error: null };
      const id = `customer-${state.customers.length + 1}`;
      state.customers.push({ id, shop_id: shopId, phone });
      return { data: { id }, error: null };
    }
    if (table === "conversations") {
      const id = `conversation-${state.conversations.length + 1}`;
      state.conversations.push({
        id,
        shop_id: String(values.shop_id),
        customer_id: String(values.customer_id),
        last_message_at: "1970-01-01T00:00:00.000Z",
      });
      return { data: { id }, error: null };
    }
    if (table === "messages") {
      const waMessageId = String(values.wa_message_id);
      if (duplicates.has(waMessageId) || state.messages.some((row) => row.wa_message_id === waMessageId)) {
        return { error: { code: "23505" } };
      }
      state.messages.push(values);
      return { error: null };
    }
    return { error: null };
  };

  const resolveUpdate = (table: string, values: Row, filters: Array<[string, string]>): QueryResult => {
    if (table === "conversations") {
      const shopId = filters.find(([column]) => column === "shop_id")?.[1];
      const id = filters.find(([column]) => column === "id")?.[1];
      const target = state.conversations.find((item) => item.shop_id === shopId && item.id === id);
      if (target) target.last_message_at = String(values.last_message_at);
    }
    return { error: null };
  };

  const makeSelect = (table: string): WhatsAppSelectBuilder => {
    const filters: Array<[string, string]> = [];
    let limit = -1;
    const build = (): WhatsAppSelectBuilder => ({
      eq: (column, value) => {
        filters.push([column, value]);
        return build();
      },
      order: () => build(),
      limit: (count) => {
        limit = count;
        return build();
      },
      maybeSingle: () => Promise.resolve(resolveSelect(table, filters, limit)),
    });
    return build();
  };

  const makeInsert = (table: string, values: Row): WhatsAppInsertBuilder => {
    const compute = memoize(() => resolveInsert(table, values));
    return thenable(compute, { select: () => ({ single: () => Promise.resolve(compute()) }) });
  };

  const makeUpdate = (table: string, values: Row): WhatsAppUpdateBuilder => {
    const filters: Array<[string, string]> = [];
    const build = (): WhatsAppUpdateBuilder =>
      thenable(() => resolveUpdate(table, values, filters), {
        eq: (column: string, value: string) => {
          filters.push([column, value]);
          return build();
        },
      });
    return build();
  };

  const from = vi.fn((table: string): WhatsAppTableClient => ({
    select: () => makeSelect(table),
    insert: (values: Row) => makeInsert(table, values),
    upsert: (values: Row) => makeInsert(table, values),
    update: (values: Row) => makeUpdate(table, values),
  }));

  return { client: { from } as unknown as WhatsAppDbClient, state, from };
}

function dbWithShop(options: { duplicateWaIds?: readonly string[] } = {}) {
  const fake = createFakeDb(options);
  fake.state.shops.push({ id: SHOP_ID, wa_phone_number_id: PHONE_NUMBER_ID });
  return fake;
}

afterEach(() => vi.restoreAllMocks());

describe("getWhatsAppWebhookConfig", () => {
  it("returns null unless every server-only variable is present and the URL is safe", () => {
    expect(getWhatsAppWebhookConfig({})).toBeNull();
    expect(
      getWhatsAppWebhookConfig({
        WHATSAPP_APP_SECRET: APP_SECRET,
        WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
        SUPABASE_SERVICE_ROLE_KEY: "key",
      }),
    ).toBeNull();
    expect(
      getWhatsAppWebhookConfig({
        WHATSAPP_APP_SECRET: APP_SECRET,
        WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
        SUPABASE_URL: "http://evil.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "key",
      }),
    ).toBeNull();
  });

  it("returns the trimmed configuration when valid", () => {
    const result = getWhatsAppWebhookConfig({
      WHATSAPP_APP_SECRET: ` ${APP_SECRET} `,
      WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
      SUPABASE_URL: "https://example.supabase.co/rest/v1",
      SUPABASE_SERVICE_ROLE_KEY: " service-role-key ",
    });
    expect(result).toEqual({
      appSecret: APP_SECRET,
      verifyToken: VERIFY_TOKEN,
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role-key",
    });
  });
});

describe("getWhatsAppSetupChecklist", () => {
  it("derives presence without exposing values and builds the callback URL", () => {
    const checklist = getWhatsAppSetupChecklist({
      WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
      WHATSAPP_APP_SECRET: APP_SECRET,
      WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      APP_BASE_URL: "https://warung.example.com",
    });
    expect(checklist).toEqual({
      verifyToken: true,
      appSecret: true,
      phoneNumberId: true,
      serviceRole: true,
      accessToken: false,
      callbackUrl: "https://warung.example.com/api/whatsapp/webhook",
      configured: true,
    });
    expect(Object.values(checklist)).not.toContain("service-role-key");
    expect(Object.values(checklist)).not.toContain(APP_SECRET);
  });

  it("is not configured when a required variable is missing", () => {
    const checklist = getWhatsAppSetupChecklist({ WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN });
    expect(checklist.configured).toBe(false);
    expect(checklist.callbackUrl).toBeNull();
  });
});

describe("evaluateWebhookChallenge", () => {
  it("returns the challenge for a matching subscribe request", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "challenge-123",
    });
    expect(evaluateWebhookChallenge(params, VERIFY_TOKEN)).toEqual({ status: 200, challenge: "challenge-123" });
  });

  it("rejects wrong token, wrong mode, missing challenge, and missing configuration", () => {
    const base = { "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "c" };
    expect(evaluateWebhookChallenge(new URLSearchParams({ ...base, "hub.verify_token": "nope" }), VERIFY_TOKEN).status).toBe(403);
    expect(evaluateWebhookChallenge(new URLSearchParams({ ...base, "hub.mode": "unsubscribe" }), VERIFY_TOKEN).status).toBe(403);
    expect(
      evaluateWebhookChallenge(new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN }), VERIFY_TOKEN).status,
    ).toBe(403);
    expect(evaluateWebhookChallenge(new URLSearchParams(base), null).status).toBe(403);
  });
});

describe("mapInboundMessageToRow", () => {
  it("maps text messages with a UTC timestamp derived from the WhatsApp seconds", () => {
    expect(
      mapInboundMessageToRow(
        { waMessageId: "text-1", from: "628000000000", timestamp: "1700000000", type: "text", text: "Halo" },
        SHOP_ID,
        "conversation-1",
        NOW,
      ),
    ).toEqual({
      shop_id: SHOP_ID,
      conversation_id: "conversation-1",
      direction: "inbound",
      wa_message_id: "text-1",
      type: "text",
      body: "Halo",
      media_path: null,
      transcript: null,
      created_at: "2023-11-14T22:13:20.000Z",
    });
  });

  it("keeps media_path null and stores caption or media reference", () => {
    const image = mapInboundMessageToRow(
      { waMessageId: "image-1", from: "628000000000", timestamp: "1700000001", type: "image", mediaId: "media-image", caption: "Struk" },
      SHOP_ID,
      "conversation-1",
      NOW,
    );
    expect(image.media_path).toBeNull();
    expect(image.body).toBe("Struk");

    const document = mapInboundMessageToRow(
      { waMessageId: "doc-1", from: "628000000000", timestamp: "1700000002", type: "document", mediaId: "media-doc" },
      SHOP_ID,
      "conversation-1",
      NOW,
    );
    expect(document.media_path).toBeNull();
    expect(document.body).toBe("media-doc");

    const audio = mapInboundMessageToRow(
      { waMessageId: "audio-1", from: "628000000000", timestamp: "1700000003", type: "audio", mediaId: "media-audio" },
      SHOP_ID,
      "conversation-1",
      NOW,
    );
    expect(audio.media_path).toBeNull();
    expect(audio.body).toBe("media-audio");
    expect(audio.transcript).toBeNull();
  });

  it("falls back to now for an unusable timestamp", () => {
    expect(resolveMessageTimestamp("0", NOW)).toBe(NOW.toISOString());
    expect(resolveMessageTimestamp("9999999999999999", NOW)).toBe(NOW.toISOString());
  });
});

describe("isDuplicateKeyError", () => {
  it("recognises only the unique violation code", () => {
    expect(isDuplicateKeyError({ code: "23505" })).toBe(true);
    expect(isDuplicateKeyError({ code: "42501" })).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });
});

describe("handleWhatsAppWebhookPost", () => {
  it("returns 503 and does not touch the store when configuration is missing", async () => {
    const { rawBody, signature } = signed(payload([]));
    const missing = createFakeDb();
    const result = await handleWhatsAppWebhookPost(rawBody, signature, { config: null, db: null });
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("not_configured");
    expect(missing.from).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies before parsing", async () => {
    const { signature } = signed(payload([]));
    const fake = dbWithShop();
    const result = await handleWhatsAppWebhookPost(new Uint8Array(1_048_577), signature, { config, db: fake.client });
    expect(result.status).toBe(413);
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature before parsing or storing", async () => {
    const { rawBody } = signed(payload([]));
    const fake = dbWithShop();
    const result = await handleWhatsAppWebhookPost(rawBody, "sha256=" + "ab".repeat(32), { config, db: fake.client });
    expect(result.status).toBe(401);
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("rejects a signed but malformed payload", async () => {
    const { rawBody, signature } = signed("{");
    const fake = dbWithShop();
    const result = await handleWhatsAppWebhookPost(rawBody, signature, { config, db: fake.client });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("invalid_payload");
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("stores a text message once with the trusted shop and inbound direction", async () => {
    const body = payload([{ id: "message-1", from: "628000000000", timestamp: "1700000000", type: "text", text: { body: "Halo" } }]);
    const { rawBody, signature } = signed(body);
    const fake = dbWithShop();

    const result = await handleWhatsAppWebhookPost(rawBody, signature, { config, db: fake.client }, NOW);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ received: true, stored: 1, duplicates: 0 });
    expect(fake.state.customers).toEqual([{ id: "customer-1", shop_id: SHOP_ID, phone: "628000000000" }]);
    expect(fake.state.messages).toHaveLength(1);
    expect(fake.state.messages[0]).toEqual({
      shop_id: SHOP_ID,
      conversation_id: "conversation-1",
      direction: "inbound",
      wa_message_id: "message-1",
      type: "text",
      body: "Halo",
      media_path: null,
      transcript: null,
      created_at: "2023-11-14T22:13:20.000Z",
    });
    expect(fake.state.conversations[0]?.last_message_at).toBe("2023-11-14T22:13:20.000Z");
  });

  it("treats a unique violation as already processed and still returns 200", async () => {
    const body = payload([{ id: "message-1", from: "628000000000", timestamp: "1700000000", type: "text", text: { body: "Halo" } }]);
    const { rawBody, signature } = signed(body);
    const fake = dbWithShop({ duplicateWaIds: ["message-1"] });

    const result = await handleWhatsAppWebhookPost(rawBody, signature, { config, db: fake.client }, NOW);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ received: true, stored: 0, duplicates: 1 });
    expect(fake.state.messages).toHaveLength(0);
  });

  it("persists a media message with a null media path", async () => {
    const body = payload([{ id: "audio-1", from: "628111111111", timestamp: "1700000005", type: "audio", audio: { id: "media-audio" } }]);
    const { rawBody, signature } = signed(body);
    const fake = dbWithShop();

    const result = await handleWhatsAppWebhookPost(rawBody, signature, { config, db: fake.client }, NOW);

    expect(result.status).toBe(200);
    expect(fake.state.messages[0]).toMatchObject({ type: "audio", media_path: null, transcript: null, body: "media-audio" });
  });

  it("rejects a payload mixing different phone numbers", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        { changes: [{ field: "messages", value: { metadata: { phone_number_id: PHONE_NUMBER_ID }, messages: [] } }] },
        { changes: [{ field: "messages", value: { metadata: { phone_number_id: "other-number" }, messages: [] } }] },
      ],
    });
    const { rawBody, signature } = signed(body);
    const fake = dbWithShop();
    const result = await handleWhatsAppWebhookPost(rawBody, signature, { config, db: fake.client }, NOW);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("mixed_phone_numbers");
  });

  it("rejects an unknown phone number", async () => {
    const { rawBody, signature } = signed(payload([], "unknown-number"));
    const fake = dbWithShop();
    const result = await handleWhatsAppWebhookPost(rawBody, signature, { config, db: fake.client }, NOW);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("unknown_phone_number");
  });

  it("acknowledges status-only events without storing", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: PHONE_NUMBER_ID }, statuses: [{ id: "s" }] } }] }],
    });
    const { rawBody, signature } = signed(body);
    const fake = dbWithShop();
    const result = await handleWhatsAppWebhookPost(rawBody, signature, { config, db: fake.client }, NOW);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ received: true, stored: 0, duplicates: 0 });
    expect(fake.state.messages).toHaveLength(0);
  });
});
