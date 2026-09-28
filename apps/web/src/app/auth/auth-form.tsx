"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, signUp } from "./actions";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState(mode === "login" ? signIn : signUp, { message: "" });
  return (
    <form action={action} className="auth-form">
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
      <div className="field"><label htmlFor="password">Kata sandi</label><input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} maxLength={128} /></div>
      {state.message && <p className="auth-notice" role="status">{state.message}</p>}
      <button className="primary-button" type="submit" disabled={pending}>{pending ? "Memproses..." : mode === "signup" ? "Daftar" : "Masuk"}</button>
      <p className="auth-footnote">{mode === "signup" ? "Sudah punya akun?" : "Belum punya akun?"} <Link href={mode === "signup" ? "/login" : "/signup"}>{mode === "signup" ? "Masuk" : "Daftar"}</Link></p>
    </form>
  );
}
