import { createHmac } from "node:crypto";

// MARK: Configuration
const DEFAULT_APP_SECRET = "synthetic-demo-secret-not-for-production";
const DEFAULT_URL = "http://localhost:3000/api/whatsapp/webhook";
const DEFAULT_PHONE_NUMBER_ID = "synthetic-phone-number-id";
const DEFAULT_SENDER = "628000000000";

// SECTION: Argument parsing
function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = "true";
    } else {
      options[key] = value;
      index += 1;
    }
  }
  return options;
}

const args = parseArgs(process.argv.slice(2));
const appSecret = process.env.WHATSAPP_APP_SECRET ?? args.secret ?? DEFAULT_APP_SECRET;
const phoneNumberId = args["phone-number-id"] ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? DEFAULT_PHONE_NUMBER_ID;
const sender = args.from ?? DEFAULT_SENDER;
const url = args.url ?? (process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/api/whatsapp/webhook` : DEFAULT_URL);

// SECTION: Synthetic payload
const run = Date.now();
const timestamp = String(Math.floor(run / 1000));
const text = args.text ?? "Pesan uji sintetis untuk pengembangan lokal";

const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{
    id: "synthetic-business-account",
    changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "synthetic-display-number", phone_number_id: phoneNumberId },
        messages: [
          { id: `synthetic-text-${run}`, from: sender, timestamp, type: "text", text: { body: text } },
          { id: `synthetic-image-${run}`, from: sender, timestamp, type: "image", image: { id: "synthetic-media-image", caption: "Struk sintetis" } },
          { id: `synthetic-audio-${run}`, from: sender, timestamp, type: "audio", audio: { id: "synthetic-media-audio" } },
          { id: `synthetic-document-${run}`, from: sender, timestamp, type: "document", document: { id: "synthetic-media-document" } },
        ],
      },
    }],
  }],
});

const signature = `sha256=${createHmac("sha256", appSecret).update(Buffer.from(body)).digest("hex")}`;

// SECTION: Request
async function main() {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    body,
  });
  const responseBody = await response.text();
  process.stdout.write(`POST ${url}\n`);
  process.stdout.write(`status: ${response.status}\n`);
  process.stdout.write(`response: ${responseBody}\n`);
  if (!response.ok) {
    process.stderr.write(
      "Webhook ditolak. Pastikan WHATSAPP_APP_SECRET di server sama dengan yang dipakai skrip ini, dan nomor bisnis " +
        `(${phoneNumberId}) sudah terdaftar pada shops.wa_phone_number_id.\n`,
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`Gagal mengirim webhook: ${error instanceof Error ? error.message : "kesalahan tidak dikenal"}\n`);
  process.exitCode = 1;
});
