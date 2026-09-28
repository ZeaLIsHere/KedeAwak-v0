"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { MAX_QUESTION_LENGTH } from "@/lib/assistant";
import { askAssistant } from "./actions";
import styles from "./asisten.module.css";

type ChatTurn = { id: string; speaker: "owner" | "assistant"; text: string };

const NETWORK_ERROR = "Asisten belum dapat dihubungi saat ini. Coba lagi nanti.";

function turnId(): string {
  return crypto.randomUUID();
}

export function AsistenChat({ configured }: { configured: boolean }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [turns, pending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text) {
      setError("Tulis pertanyaan terlebih dahulu.");
      return;
    }
    if (text.length > MAX_QUESTION_LENGTH) {
      setError(`Pertanyaan maksimal ${MAX_QUESTION_LENGTH} karakter.`);
      return;
    }

    setError("");
    setQuestion("");
    setTurns((current) => [...current, { id: turnId(), speaker: "owner", text }]);

    const formData = new FormData();
    formData.set("question", text);
    startTransition(async () => {
      let reply: string;
      try {
        const result = await askAssistant(formData);
        reply = result.message;
      } catch {
        reply = NETWORK_ERROR;
      }
      setTurns((current) => [...current, { id: turnId(), speaker: "assistant", text: reply }]);
    });
  }

  return (
    <section className="panel" aria-labelledby="asisten-chat-title">
      <div className="section-heading">
        <div><p className="eyebrow">TANYA ASISTEN</p><h2 id="asisten-chat-title">Percakapan</h2></div>
        <span className={`status-pill ${configured ? "good" : "warning"}`}>{configured ? "Aktif" : "Belum aktif"}</span>
      </div>

      {!configured && (
        <p className="auth-notice" role="status">Asisten belum aktif karena kunci AI belum diatur di server. Lihat panduan di atas.</p>
      )}

      <div
        className={styles.chatLog}
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Percakapan dengan asisten"
      >
        {turns.length === 0
          ? (
            <p className="empty-state">
              Belum ada pertanyaan. Contoh: berapa stok gula sekarang, atau minta laporan hari ini.
            </p>
          )
          : turns.map((turn) => (
            <article
              key={turn.id}
              className={`${styles.turn} ${turn.speaker === "owner" ? styles.turnOwner : styles.turnAssistant}`}
            >
              <p className={styles.turnSpeaker}>{turn.speaker === "owner" ? "Anda" : "Asisten"}</p>
              <p className={styles.turnText}>{turn.text}</p>
            </article>
          ))}
        {pending && <p className={styles.thinking} role="status">Asisten sedang menyusun jawaban...</p>}
      </div>

      <form className={styles.composer} onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="asisten-question">Pertanyaan Anda</label>
          <textarea
            id="asisten-question"
            name="question"
            rows={3}
            maxLength={MAX_QUESTION_LENGTH}
            value={question}
            onChange={(event) => { setQuestion(event.target.value); if (error) setError(""); }}
            placeholder="Contoh: Berapa stok gula sekarang?"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "asisten-question-error" : "asisten-question-hint"}
          />
          {error && <p className="field-error" id="asisten-question-error" role="alert">{error}</p>}
          <p className="field-hint" id="asisten-question-hint">
            Riwayat percakapan hanya ada di halaman ini dan tidak disimpan.
          </p>
        </div>
        <div className="entry-actions">
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? "Mengirim..." : "Tanya asisten"}
          </button>
        </div>
      </form>
    </section>
  );
}
