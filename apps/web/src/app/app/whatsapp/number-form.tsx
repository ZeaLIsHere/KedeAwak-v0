"use client";

import { useActionState } from "react";
import { saveWhatsAppNumber, type WhatsAppNumberState } from "./actions";

const initialState: WhatsAppNumberState = { status: "idle", message: "" };

export function WhatsAppNumberForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState(saveWhatsAppNumber, initialState);
  return (
    <form action={action} className="entry-form">
      <div className="field">
        <label htmlFor="wa-number">ID nomor bisnis (phone number ID)</label>
        <input
          id="wa-number"
          name="phone_number_id"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={current ?? ""}
          placeholder="Contoh: 123456789012345"
          aria-describedby="wa-number-hint"
        />
        <p id="wa-number-hint" className="field-hint">
          Salin dari WhatsApp &gt; API Setup pada Meta App Anda. Ini ID angka, bukan nomor telepon. Kosongkan untuk melepas.
        </p>
      </div>
      {state.status === "error" && <p className="field-error" role="alert">{state.message}</p>}
      {state.status === "success" && <p className="notice" role="status">{state.message}</p>}
      <div className="entry-actions">
        <button className="primary-button" type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan nomor bisnis"}</button>
      </div>
    </form>
  );
}
