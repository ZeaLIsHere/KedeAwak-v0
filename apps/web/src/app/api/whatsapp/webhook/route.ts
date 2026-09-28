import {
  createWhatsAppDbClient,
  evaluateWebhookChallenge,
  getWhatsAppWebhookConfig,
  handleWhatsAppWebhookPost,
  MAX_WEBHOOK_BYTES,
} from "@/lib/whatsapp-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEXT_HEADERS = { "content-type": "text/plain; charset=utf-8" };

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// MARK: Meta verification handshake; the verify token is never logged
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const config = getWhatsAppWebhookConfig();
  const decision = evaluateWebhookChallenge(params, config?.verifyToken ?? null);
  if (decision.status === 200) return new Response(decision.challenge, { status: 200, headers: TEXT_HEADERS });
  return new Response("Forbidden", { status: 403, headers: TEXT_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
      return jsonResponse({ error: "payload_too_large" }, 413);
    }

    const rawBody = new TextEncoder().encode(await request.text());
    const config = getWhatsAppWebhookConfig();
    const db = config ? createWhatsAppDbClient(config.supabaseUrl, config.serviceRoleKey) : null;
    const result = await handleWhatsAppWebhookPost(rawBody, request.headers.get("x-hub-signature-256"), {
      config,
      db,
    });
    return jsonResponse(result.body, result.status);
  } catch {
    // MARK: Never leak internal errors to Meta; a non-200 lets Meta retry delivery
    return jsonResponse({ error: "unexpected" }, 500);
  }
}
