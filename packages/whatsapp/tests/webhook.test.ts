import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  acceptWebhook,
  createInMemoryMessageStore,
  parseWebhookPayload,
  verifyWebhookSignature,
} from "../src/index.js";

const secret = "synthetic-test-secret";
const shop = { shopId: "shop-a", phoneNumberId: "synthetic-number-a" };

function signed(payload: unknown) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return { rawBody, signature };
}

function webhook(messages: unknown[] = [
  { id: "message-1", from: "synthetic-sender", timestamp: "1700000000", type: "text", text: { body: "Halo" } },
]) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{
      field: "messages",
      value: { metadata: { phone_number_id: shop.phoneNumberId }, messages },
    }] }],
  };
}

describe("verifyWebhookSignature", () => {
  it("accepts the HMAC of the exact raw bytes", () => {
    const { rawBody, signature } = signed(webhook());
    expect(verifyWebhookSignature(rawBody, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from(`${rawBody.toString()} `), signature, secret)).toBe(false);
  });

  it("rejects absent, malformed, wrong, or truncated signatures", () => {
    const { rawBody, signature } = signed(webhook());
    expect(verifyWebhookSignature(rawBody, null, secret)).toBe(false);
    expect(verifyWebhookSignature(rawBody, signature, "other-secret")).toBe(false);
    expect(verifyWebhookSignature(rawBody, signature, "")).toBe(false);
    expect(verifyWebhookSignature(rawBody, signature.slice(0, -1), secret)).toBe(false);
    expect(verifyWebhookSignature(rawBody, signature.replace("sha256=", "sha1="), secret)).toBe(false);
    expect(verifyWebhookSignature(rawBody, "sha256=" + "gg".repeat(32), secret)).toBe(false);
  });
});

describe("parseWebhookPayload", () => {
  it("extracts only text and supported media fields", () => {
    const payload = webhook([
      { id: "text-1", from: "synthetic-sender", timestamp: "1700000000", type: "text", text: { body: "Pesan" } },
      { id: "image-1", from: "synthetic-sender", timestamp: "1700000001", type: "image", image: { id: "synthetic-image", caption: "Struk" } },
      { id: "audio-1", from: "synthetic-sender", timestamp: "1700000002", type: "audio", audio: { id: "synthetic-audio" } },
      { id: "document-1", from: "synthetic-sender", timestamp: "1700000003", type: "document", document: { id: "synthetic-document" } },
      { id: "reaction-1", from: "synthetic-sender", timestamp: "1700000004", type: "reaction" },
    ]);
    expect(parseWebhookPayload(signed(payload).rawBody).messages).toEqual([
      { waMessageId: "text-1", from: "synthetic-sender", timestamp: "1700000000", type: "text", text: "Pesan" },
      { waMessageId: "image-1", from: "synthetic-sender", timestamp: "1700000001", type: "image", mediaId: "synthetic-image", caption: "Struk" },
      { waMessageId: "audio-1", from: "synthetic-sender", timestamp: "1700000002", type: "audio", mediaId: "synthetic-audio" },
      { waMessageId: "document-1", from: "synthetic-sender", timestamp: "1700000003", type: "document", mediaId: "synthetic-document" },
    ]);
  });

  it("rejects malformed JSON, invalid UTF-8, and missing required message fields", () => {
    expect(() => parseWebhookPayload(Buffer.from("{"))).toThrow();
    expect(() => parseWebhookPayload(Uint8Array.from([0xff]))).toThrow();
    expect(() => parseWebhookPayload(signed(webhook([{ id: "message-1", type: "text", text: { body: "Halo" } }])).rawBody)).toThrow();
    expect(() => parseWebhookPayload(signed(webhook([{ id: "message-1", from: "synthetic-sender", timestamp: "1700000000", type: "image" }])).rawBody)).toThrow();
  });
});

describe("acceptWebhook", () => {
  it("queues new messages once per trusted shop and acknowledges duplicates", () => {
    const store = createInMemoryMessageStore();
    const { rawBody, signature } = signed(webhook());
    expect(acceptWebhook(rawBody, signature, secret, shop, store)).toEqual({ status: 200, accepted: 1, duplicates: 0 });
    expect(acceptWebhook(rawBody, signature, secret, shop, store)).toEqual({ status: 200, accepted: 0, duplicates: 1 });
    expect(store.takePending(shop.shopId)).toEqual([
      { waMessageId: "message-1", from: "synthetic-sender", timestamp: "1700000000", type: "text", text: "Halo" },
    ]);
    expect(store.takePending(shop.shopId)).toEqual([]);
    expect(acceptWebhook(rawBody, signature, secret, { ...shop, shopId: "shop-b" }, store)).toEqual({ status: 200, accepted: 1, duplicates: 0 });
    expect(store.takePending("shop-b")).toHaveLength(1);
  });

  it("rejects unauthenticated and malformed payloads without queuing", () => {
    const store = createInMemoryMessageStore();
    const { rawBody, signature } = signed(webhook());
    expect(acceptWebhook(rawBody, null, secret, shop, store).status).toBe(401);
    const invalidJson = Buffer.from("{");
    const invalidJsonSignature = `sha256=${createHmac("sha256", secret).update(invalidJson).digest("hex")}`;
    expect(acceptWebhook(invalidJson, invalidJsonSignature, secret, shop, store).status).toBe(400);
    const malformed = signed({ object: "whatsapp_business_account", entry: [] });
    expect(acceptWebhook(malformed.rawBody, malformed.signature, secret, shop, store).status).toBe(400);
    expect(store.takePending(shop.shopId)).toEqual([]);
    expect(acceptWebhook(rawBody, signature, secret, shop, store).accepted).toBe(1);
  });

  it("rejects a signed payload for another phone number, including mixed batches", () => {
    const store = createInMemoryMessageStore();
    const payload = webhook();
    payload.entry.push({ changes: [{
      field: "messages",
      value: { metadata: { phone_number_id: "another-number" }, messages: [] },
    }] });
    const { rawBody, signature } = signed(payload);
    expect(acceptWebhook(rawBody, signature, secret, shop, store).status).toBe(400);
    expect(store.takePending(shop.shopId)).toEqual([]);
  });

  it("acknowledges status-only events without queuing or running a worker", () => {
    const store = createInMemoryMessageStore();
    const payload = webhook();
    const value = payload.entry[0]?.changes[0]?.value;
    if (!value) throw new Error("Missing test fixture value");
    const { rawBody, signature } = signed({
      object: payload.object,
      entry: [{ changes: [{ field: "messages", value: { metadata: value.metadata, statuses: [{ id: "synthetic-status" }] } }] }],
    });
    expect(acceptWebhook(rawBody, signature, secret, shop, store)).toEqual({ status: 200, accepted: 0, duplicates: 0 });
    expect(store.takePending(shop.shopId)).toEqual([]);
  });
});
