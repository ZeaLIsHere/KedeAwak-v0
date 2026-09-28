import { describe, expect, it } from "vitest";
import { credentialsSchema, shopSchema } from "./auth-schema";

const validShop = { shop_name: "Warung Pagi", shop_business_type: "Makanan", owner_name: "Pemilik Contoh", owner_phone: "+6281234567890" };

describe("auth validation", () => {
  it("normalizes a valid email and rejects weak credentials", () => {
    expect(credentialsSchema.parse({ email: "Owner@Example.com", password: "password123" }).email).toBe("owner@example.com");
    expect(credentialsSchema.safeParse({ email: "invalid", password: "123" }).success).toBe(false);
  });
  it("validates all onboarding values and international phone format", () => {
    expect(shopSchema.safeParse(validShop).success).toBe(true);
    expect(shopSchema.safeParse({ ...validShop, owner_phone: "081234567890" }).success).toBe(false);
    expect(shopSchema.safeParse({ ...validShop, shop_name: "  " }).success).toBe(false);
    expect(shopSchema.safeParse({ ...validShop, owner_name: "a".repeat(101) }).success).toBe(false);
  });
});
