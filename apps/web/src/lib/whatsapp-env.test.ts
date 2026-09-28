import { describe, expect, it } from "vitest";
import { getMissingWhatsAppEnvNames, getWhatsAppWebhookConfig } from "./whatsapp-webhook";

const completeEnv = {
  WHATSAPP_APP_SECRET: "synthetic-secret",
  WHATSAPP_VERIFY_TOKEN: "synthetic-token",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
  SUPABASE_URL: "https://example.supabase.co",
};

describe("whatsapp webhook environment", () => {
  it("accepts a complete configuration", () => {
    expect(getWhatsAppWebhookConfig(completeEnv)).toEqual({
      appSecret: "synthetic-secret",
      verifyToken: "synthetic-token",
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "synthetic-service-key",
    });
    expect(getMissingWhatsAppEnvNames(completeEnv)).toEqual([]);
  });

  it("reuses the public project URL instead of requiring a duplicate variable", () => {
    const env = {
      WHATSAPP_APP_SECRET: completeEnv.WHATSAPP_APP_SECRET,
      WHATSAPP_VERIFY_TOKEN: completeEnv.WHATSAPP_VERIFY_TOKEN,
      SUPABASE_SERVICE_ROLE_KEY: completeEnv.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    };
    expect(getMissingWhatsAppEnvNames(env)).toEqual([]);
    expect(getWhatsAppWebhookConfig(env)?.supabaseUrl).toBe("https://example.supabase.co");
  });

  it("accepts the current secret key and still accepts the legacy service role key", () => {
    const { SUPABASE_SERVICE_ROLE_KEY: legacy, ...rest } = completeEnv;
    expect(getMissingWhatsAppEnvNames({ ...rest, SUPABASE_SECRET_KEY: "sb_secret_synthetic" })).toEqual([]);
    expect(getWhatsAppWebhookConfig({ ...rest, SUPABASE_SECRET_KEY: "sb_secret_synthetic" })?.serviceRoleKey).toBe("sb_secret_synthetic");
    expect(getWhatsAppWebhookConfig({ ...rest, SUPABASE_SERVICE_ROLE_KEY: legacy })?.serviceRoleKey).toBe(legacy);
  });

  it("names every missing variable without exposing any value", () => {
    const missing = getMissingWhatsAppEnvNames({});
    expect(missing).toEqual(["WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "SUPABASE_SECRET_KEY", "SUPABASE_URL"]);
    expect(missing.join(" ")).not.toContain("synthetic");
  });

  it("treats a dashboard URL or blank values as missing", () => {
    expect(getMissingWhatsAppEnvNames({ ...completeEnv, SUPABASE_URL: "https://supabase.com/dashboard/project/abc" })).toEqual([
      "SUPABASE_URL",
    ]);
    expect(getMissingWhatsAppEnvNames({ ...completeEnv, SUPABASE_URL: "https://supabase.com/dashboard/project/abc", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" })).toEqual([]);
    expect(getMissingWhatsAppEnvNames({ ...completeEnv, WHATSAPP_APP_SECRET: "   " })).toEqual(["WHATSAPP_APP_SECRET"]);
    expect(getMissingWhatsAppEnvNames({ ...completeEnv, SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" })).toEqual([
      "SUPABASE_SECRET_KEY",
    ]);
  });
});
