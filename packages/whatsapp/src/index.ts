import { parseWebhookPayload } from "./parser.js";
import { verifyWebhookSignature } from "./signature.js";
import type { InMemoryMessageStore } from "./store.js";

export { parseWebhookPayload } from "./parser.js";
export type { IncomingMessage, ParsedWebhook } from "./parser.js";
export { verifyWebhookSignature } from "./signature.js";
export { createInMemoryMessageStore } from "./store.js";
export type { InMemoryMessageStore } from "./store.js";

const MAX_WEBHOOK_BYTES = 1_048_576;

type TrustedShop = { shopId: string; phoneNumberId: string };
type WebhookDecision =
  | { status: 200; accepted: number; duplicates: number }
  | { status: 400 | 401; accepted: 0; duplicates: 0 };

export function acceptWebhook(
  rawBody: Uint8Array,
  signature: string | null | undefined,
  appSecret: string,
  trustedShop: TrustedShop,
  store: InMemoryMessageStore,
): WebhookDecision {
  if (!trustedShop.shopId || !trustedShop.phoneNumberId) {
    throw new Error("Trusted shop ID and phone number ID are required");
  }
  if (rawBody.byteLength > MAX_WEBHOOK_BYTES) {
    return { status: 400, accepted: 0, duplicates: 0 };
  }
  if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
    return { status: 401, accepted: 0, duplicates: 0 };
  }

  let payload;
  try {
    payload = parseWebhookPayload(rawBody);
  } catch {
    return { status: 400, accepted: 0, duplicates: 0 };
  }
  if (payload.phoneNumberIds.some((id) => id !== trustedShop.phoneNumberId)) {
    return { status: 400, accepted: 0, duplicates: 0 };
  }
  return { status: 200, ...store.accept(trustedShop.shopId, payload.messages) };
}
