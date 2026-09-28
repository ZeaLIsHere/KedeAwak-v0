import { z } from "zod";

const requiredText = (limit: number) => z.string().trim().min(1).max(limit);

export const credentialsSchema = z.object({
  email: z.email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
});

export const shopSchema = z.object({
  shop_name: requiredText(100),
  shop_business_type: requiredText(80),
  owner_name: requiredText(100),
  owner_phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
});
