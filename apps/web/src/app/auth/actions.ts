"use server";

import { redirect } from "next/navigation";
import { credentialsSchema } from "@/lib/auth-schema";
import { createClient } from "@/lib/supabase/server";
import { getConfirmationUrl } from "@/lib/supabase/config";

export type AuthState = { message: string };

export async function signIn(_state: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { message: "Periksa email dan kata sandi Anda." };
  const client = await createClient();
  if (!client) return { message: "Layanan masuk belum tersedia." };
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error) return { message: "Tidak dapat masuk. Periksa akun Anda dan coba lagi." };
  redirect("/app");
}

export async function signUp(_state: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { message: "Masukkan email yang valid dan kata sandi minimal 8 karakter." };
  const emailRedirectTo = getConfirmationUrl();
  if (!emailRedirectTo) return { message: "Pendaftaran belum tersedia. Atur APP_BASE_URL yang valid terlebih dahulu." };
  const client = await createClient();
  if (!client) return { message: "Layanan pendaftaran belum tersedia." };
  const { error } = await client.auth.signUp({ ...parsed.data, options: { emailRedirectTo } });
  if (error) return { message: "Pendaftaran belum berhasil. Coba lagi nanti." };
  return { message: "Jika pendaftaran diterima, periksa email untuk konfirmasi, lalu masuk. Jika konfirmasi tidak diwajibkan, Anda dapat langsung masuk." };
}

export async function signOut() {
  const client = await createClient();
  if (client) await client.auth.signOut();
  redirect("/");
}
