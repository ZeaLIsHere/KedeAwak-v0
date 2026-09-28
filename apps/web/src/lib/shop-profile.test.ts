import { describe, expect, it } from "vitest";
import {
  autoReplySchema,
  mapShopProfileRow,
  parseCheckboxValue,
  planLabel,
  shopProfileSchema,
  toNullableText,
  waNumberStatusLabel,
} from "./shop-profile";

describe("shop profile row mapping", () => {
  it("maps a row into the view model", () => {
    expect(
      mapShopProfileRow({
        id: "shop-1",
        name: "Warung Bu Sari",
        business_type: "Warung makan",
        opening_hours: "07.00 - 21.00",
        address: "Jl. Melati 3",
        wa_phone_number_id: "123456789",
        plan: "free",
        auto_reply_enabled: true,
      }),
    ).toEqual({
      id: "shop-1",
      name: "Warung Bu Sari",
      businessType: "Warung makan",
      openingHours: "07.00 - 21.00",
      address: "Jl. Melati 3",
      waPhoneNumberId: "123456789",
      plan: "free",
      autoReplyEnabled: true,
    });
  });

  it("falls back to false for a null auto reply flag", () => {
    const profile = mapShopProfileRow({
      id: "shop-1",
      name: "Warung",
      business_type: "Kelontong",
      opening_hours: null,
      address: null,
      wa_phone_number_id: null,
      plan: "free",
      auto_reply_enabled: null as unknown as boolean,
    });
    expect(profile.autoReplyEnabled).toBe(false);
  });
});

describe("read only status labels", () => {
  it("labels known plans and keeps unknown plan codes", () => {
    expect(planLabel("free")).toBe("Gratis");
    expect(planLabel("pro")).toBe("Pro");
    expect(planLabel("enterprise")).toBe("enterprise");
  });

  it("explains the WhatsApp number status", () => {
    expect(waNumberStatusLabel("123456789")).toContain("belum terhubung");
    expect(waNumberStatusLabel(null)).toBe("Belum ada nomor bisnis");
  });

  it("converts blank optional text into null", () => {
    expect(toNullableText("   ")).toBeNull();
    expect(toNullableText("  Jl. Melati 3 ")).toBe("Jl. Melati 3");
  });
});

describe("checkbox parsing", () => {
  it("treats common checked values as true", () => {
    for (const value of ["on", "true", "1", "yes", " ON "]) {
      expect(parseCheckboxValue(value), value).toBe(true);
    }
    expect(parseCheckboxValue(true)).toBe(true);
  });

  it("treats missing or unchecked values as false", () => {
    for (const value of ["off", "false", "0", "", null, undefined]) {
      expect(parseCheckboxValue(value), String(value)).toBe(false);
    }
    expect(parseCheckboxValue(false)).toBe(false);
  });
});

describe("shop profile input schema", () => {
  it("accepts a valid profile", () => {
    const result = shopProfileSchema.safeParse({ name: " Warung Bu Sari ", business_type: "Warung makan", opening_hours: "07.00-21.00", address: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Warung Bu Sari", business_type: "Warung makan", opening_hours: "07.00-21.00", address: "" });
    }
  });

  it("requires a name and a business type within the length limits", () => {
    const valid = { name: "Warung Bu Sari", business_type: "Warung makan", opening_hours: "", address: "" };
    expect(shopProfileSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(shopProfileSchema.safeParse({ ...valid, name: "x".repeat(81) }).success).toBe(false);
    expect(shopProfileSchema.safeParse({ ...valid, business_type: "" }).success).toBe(false);
    expect(shopProfileSchema.safeParse({ ...valid, business_type: "x".repeat(61) }).success).toBe(false);
  });

  it("allows free text opening hours and address within a safe length", () => {
    const valid = { name: "Warung Bu Sari", business_type: "Warung makan", opening_hours: "", address: "" };
    expect(shopProfileSchema.safeParse({ ...valid, opening_hours: "07.00 - 21.00, Jumat tutup" }).success).toBe(true);
    expect(shopProfileSchema.safeParse({ ...valid, opening_hours: "x".repeat(121) }).success).toBe(false);
    expect(shopProfileSchema.safeParse({ ...valid, address: "x".repeat(201) }).success).toBe(false);
    expect(shopProfileSchema.safeParse({ ...valid, address: "x".repeat(200) }).success).toBe(true);
  });
});

describe("auto reply schema", () => {
  it("parses a checked switch into boolean true", () => {
    const result = autoReplySchema.safeParse({ enabled: "on" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.enabled).toBe(true);
  });

  it("parses an unchecked switch into boolean false", () => {
    const result = autoReplySchema.safeParse({ enabled: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.enabled).toBe(false);
  });
});
