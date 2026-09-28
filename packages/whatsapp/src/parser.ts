import { z } from "zod";

const nonEmpty = z.string().min(1);
const messageSchema = z.object({
  id: nonEmpty,
  from: nonEmpty,
  timestamp: z.string().regex(/^\d+$/),
  type: nonEmpty,
  text: z.object({ body: nonEmpty }).optional(),
  image: z.object({ id: nonEmpty, caption: z.string().optional() }).optional(),
  audio: z.object({ id: nonEmpty }).optional(),
  document: z.object({ id: nonEmpty, caption: z.string().optional() }).optional(),
});
const changeSchema = z.object({
  field: z.literal("messages"),
  value: z.object({
    metadata: z.object({ phone_number_id: nonEmpty }),
    messages: z.array(messageSchema).optional(),
    statuses: z.array(z.unknown()).optional(),
  }).refine((value) => value.messages !== undefined || value.statuses !== undefined),
});
const webhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({ changes: z.array(changeSchema).min(1) })).min(1),
});

export type IncomingMessage =
  | { waMessageId: string; from: string; timestamp: string; type: "text"; text: string }
  | { waMessageId: string; from: string; timestamp: string; type: "image" | "document"; mediaId: string; caption?: string }
  | { waMessageId: string; from: string; timestamp: string; type: "audio"; mediaId: string };

export type ParsedWebhook = {
  phoneNumberIds: string[];
  messages: IncomingMessage[];
};

export function parseWebhookPayload(rawBody: Uint8Array): ParsedWebhook {
  const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  const webhook = webhookSchema.parse(payload);
  const messages: IncomingMessage[] = [];
  const phoneNumberIds: string[] = [];

  for (const entry of webhook.entry) {
    for (const change of entry.changes) {
      phoneNumberIds.push(change.value.metadata.phone_number_id);
      for (const message of change.value.messages ?? []) {
        const shared = { waMessageId: message.id, from: message.from, timestamp: message.timestamp };
        switch (message.type) {
          case "text":
            if (!message.text) throw new Error("Missing text body");
            messages.push({ ...shared, type: "text", text: message.text.body });
            break;
          case "image":
          case "document": {
            const media = message[message.type];
            if (!media) throw new Error("Missing media ID");
            messages.push({ ...shared, type: message.type, mediaId: media.id, ...(media.caption === undefined ? {} : { caption: media.caption }) });
            break;
          }
          case "audio":
            if (!message.audio) throw new Error("Missing media ID");
            messages.push({ ...shared, type: "audio", mediaId: message.audio.id });
            break;
        }
      }
    }
  }

  return { phoneNumberIds, messages };
}
