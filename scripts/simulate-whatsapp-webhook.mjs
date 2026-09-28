import { createHmac } from "node:crypto";

const APP_SECRET = "synthetic-demo-secret-not-for-production";
const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{
    id: "synthetic-business-account",
    changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: "synthetic-phone-number-id" },
        messages: [{
          id: "synthetic-message-id",
          from: "synthetic-sender",
          timestamp: "1700000000",
          type: "text",
          text: { body: "Pesan uji sintetis" },
        }],
      },
    }],
  }],
});
const signature = createHmac("sha256", APP_SECRET).update(Buffer.from(body)).digest("hex");

process.stdout.write(`${JSON.stringify({
  headers: { "X-Hub-Signature-256": `sha256=${signature}` },
  body,
})}\n`);
