export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}

export function getConfirmationUrl() {
  const base = process.env.APP_BASE_URL;
  if (!base) return undefined;
  try {
    const url = new URL(base);
    if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) return undefined;
    return new URL("/auth/callback", url.origin).toString();
  } catch {
    return undefined;
  }
}
