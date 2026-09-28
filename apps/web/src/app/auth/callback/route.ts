import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { getConfirmationUrl } from "../../../lib/supabase/config";

export async function GET(request: NextRequest) {
  const confirmationUrl = getConfirmationUrl();
  if (!confirmationUrl) return new Response("Layanan konfirmasi belum tersedia.", { status: 503, headers: { "Cache-Control": "no-store" } });
  const code = request.nextUrl.searchParams.get("code");
  const client = await createClient();
  if (code && client) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/app", confirmationUrl));
  }
  return NextResponse.redirect(new URL("/login?confirmation=failed", confirmationUrl));
}
