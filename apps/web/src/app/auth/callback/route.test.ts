import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../../lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "../../../lib/supabase/server";
import { GET } from "./route";

const previousBase = process.env.APP_BASE_URL;
afterEach(() => {
  if (previousBase === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = previousBase;
  vi.resetAllMocks();
});

describe("email confirmation callback", () => {
  it("returns 503 without configured origin and does not exchange the code", async () => {
    delete process.env.APP_BASE_URL;
    const response = await GET(new NextRequest("https://untrusted.test/auth/callback?code=sample"));
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("redirects successful confirmations only to the configured origin", async () => {
    process.env.APP_BASE_URL = "https://app.example.com/other";
    vi.mocked(createClient).mockResolvedValue({ auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) } } as never);
    const response = await GET(new NextRequest("https://untrusted.test/auth/callback?code=sample&next=https://untrusted.test"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.com/app");
  });

  it("redirects failed confirmations to the fixed login path", async () => {
    process.env.APP_BASE_URL = "http://localhost:3000";
    vi.mocked(createClient).mockResolvedValue(null);
    const response = await GET(new NextRequest("https://untrusted.test/auth/callback?next=https://untrusted.test"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?confirmation=failed");
  });
});
