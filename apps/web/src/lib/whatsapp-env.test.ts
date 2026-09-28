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

  it("names every missing variable without exposing any value", () => {
    const missing = getMissingWhatsAppEnvNames({});
    expect(missing).toEqual([
      "WHATSAPP_APP_SECRET",
      "WHATSAPP_VERIFY_TOKEN",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ]);
    expect(missing.join(" ")).not.toContain("synthetic");
  });

  it("treats a dashboard URL or blank values as missing", () => {
    expect(getMissingWhatsAppEnvNames({ ...completeEnv, SUPABASE_URL: "https://supabase.com/dashboard/project/abc" })).toEqual([
      "SUPABASE_URL",
    ]);
    expect(getMissingWhatsAppEnvNames({ ...completeEnv, WHATSAPP_APP_SECRET: "   " })).toEqual(["WHATSAPP_APP_SECRET"]);
    expect(getMissingWhatsAppEnvNames({ ...completeEnv, SUPABASE_SERVICE_ROLE_KEY: "" })).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
  });
});
