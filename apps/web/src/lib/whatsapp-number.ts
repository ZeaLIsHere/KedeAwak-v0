import { z } from "zod";

// MARK: Meta phone number ids are numeric; an empty value unlinks the shop
export const whatsappNumberSchema = z.object({
  phone_number_id: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[0-9]{5,32}$/.test(value), "Gunakan ID angka dari Meta, tanpa spasi."),
});

export type WhatsAppNumberInput = z.infer<typeof whatsappNumberSchema>;
