"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { MAX_HISTORY_MESSAGES, MAX_QUESTION_LENGTH } from "@/lib/assistant";
import { askAssistant } from "./actions";
import styles from "./asisten.module.css";

type ChatTurn = { id: string; speaker: "owner" | "assistant"; text: string };
type PendingSummary = { id: string; summary: string };

const NETWORK_ERROR = "Asisten belum dapat dihubungi saat ini. Coba lagi nanti.";

function turnId(): string {
  return crypto.randomUUID();
}

function buildHistory(turns: readonly ChatTurn[]): { role: "user" | "assistant"; content: string }[] {
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const turn of turns.slice(-MAX_HISTORY_MESSAGES)) {
    const content = turn.text.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!content) continue;
    history.push({ role: turn.speaker === "owner" ? "user" : "assistant", content });
  }
  return history;
}

export function AsistenChat({
  configured,
  canWrite,
  quota,
  initialPending,
}: {
  configured: boolean;
  canWrite: boolean;
  quota: { used: number; limit: number };
  initialPending: PendingSummary | null;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingSummary | null>(initialPending);
  const [usage, setUsage] = useState(quota);
  const [busy, startTransition] = useTransition();
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [turns, busy, pending]);

  function sendMessage(rawText: string) {
    const text = rawText.trim();
    if (!text) {
      setError("Tulis pertanyaan terlebih dahulu.");
      return;
    }
    if (text.length > MAX_QUESTION_LENGTH) {
      setError(`Pertanyaan maksimal ${MAX_QUESTION_LENGTH} karakter.`);
      return;
    }

    const history = buildHistory(turns);
    setError("");
    setQuestion("");
    setTurns((current) => [...current, { id: turnId(), speaker: "owner", text }]);

    const formData = new FormData();
    formData.set("question", text);
    formData.set("history", JSON.stringify(history));

    startTransition(async () => {
      let reply: string;
      try {
        const result = await askAssistant(formData);
        reply = result.message;
        setPending(result.pending);
        if (result.quota) setUsage(result.quota);
      } catch {
        reply = NETWORK_ERROR;
      }
      setTurns((current) => [...current, { id: turnId(), speaker: "assistant", text: reply }]);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(question);
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

      <p className={styles.quotaLine} role="status">
        Kuota AI hari ini: {usage.used} dari {usage.limit} panggilan.
      </p>

      {pending && canWrite && (
        <div className={styles.pendingCard} role="group" aria-label="Persetujuan yang menunggu">
          <p className={styles.pendingEyebrow}>MENUNGGU PERSETUJUAN</p>
          <p className={styles.pendingSummary}>{pending.summary}</p>
          <p className="field-hint">
            Balas ya untuk menyetujui, tidak untuk membatalkan, atau kirim perbaikan. Data ditulis hanya setelah disetujui.
          </p>
          <div className={styles.pendingActions}>
            <button className="primary-button" type="button" disabled={busy} onClick={() => sendMessage("ya")}>Setujui</button>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => sendMessage("tidak")}>Tolak</button>
          </div>
        </div>
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
              Belum ada pertanyaan. Contoh: berapa stok gula sekarang, atau catat pengeluaran beli gula 25000.
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
        {busy && <p className={styles.thinking} role="status">Asisten sedang menyusun jawaban...</p>}
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
            placeholder={pending && canWrite ? "Ketik ya, tidak, atau perbaikan..." : "Contoh: Berapa stok gula sekarang?"}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "asisten-question-error" : "asisten-question-hint"}
          />
          {error && <p className="field-error" id="asisten-question-error" role="alert">{error}</p>}
          <p className="field-hint" id="asisten-question-hint">
            Riwayat percakapan hanya ada di halaman ini dan tidak disimpan.
            {!canWrite && " Peran karyawan hanya dapat membaca data."}
          </p>
        </div>
        <div className="entry-actions">
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Mengirim..." : "Tanya asisten"}
          </button>
        </div>
      </form>
    </section>
  );
}
