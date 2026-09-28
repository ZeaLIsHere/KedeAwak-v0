import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_FORMAT = /^sha256=([a-f0-9]{64})$/;

export function verifyWebhookSignature(
  rawBody: Uint8Array,
  signature: string | null | undefined,
  appSecret: string,
): boolean {
  if (!appSecret || !signature) return false;

  const match = SIGNATURE_FORMAT.exec(signature);
  if (!match?.[1]) return false;

  const received = Buffer.from(match[1], "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return timingSafeEqual(received, expected);
}
