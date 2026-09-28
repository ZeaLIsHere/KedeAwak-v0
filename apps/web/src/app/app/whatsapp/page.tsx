import Link from "next/link";
import { formatJakartaDateTime } from "@/lib/ledger";
import { getMissingWhatsAppEnvNames, getWhatsAppSetupChecklist } from "@/lib/whatsapp-webhook";
import { loadShopContext } from "../context";
import { AppShell, RoleNotice, ShopErrorCard } from "../shell";
import { WhatsAppNumberForm } from "./number-form";
import {
  CONVERSATION_LIMIT,
  getConversationMessages,
  getShopPhoneNumberId,
  getWhatsAppConversations,
  parseConversationIdParam,
  type WhatsAppMessage,
} from "./data";
import styles from "./whatsapp.module.css";

export const dynamic = "force-dynamic";

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  text: "Teks",
  image: "Gambar",
  audio: "Audio",
  document: "Dokumen",
  template: "Template",
};

function messageTypeLabel(type: string): string {
  return MESSAGE_TYPE_LABELS[type] ?? type;
}

function messageBodyLabel(message: WhatsAppMessage): string {
  if (message.transcript) return message.transcript;
  if (message.body) return message.body;
  return "Tanpa teks tersimpan.";
}

function ChecklistItem({ label, hint, done }: { label: string; hint: string; done: boolean }) {
  return (
    <li className={styles.checklistItem}>
      <div>
        <strong>{label}</strong>
        <span className="field-hint">{hint}</span>
      </div>
      <span className={`status-pill ${done ? "good" : "warning"}`}>{done ? "Terisi" : "Belum"}</span>
    </li>
  );
}

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ percakapan?: string | string[] }> }) {
  const context = await loadShopContext();
  if (!context) return <AppShell shopName="KedeAwak" active="whatsapp"><ShopErrorCard /></AppShell>;
  const { client, shopId, shopName, role } = context;

  if (role !== "owner") {
    return (
      <AppShell shopName={shopName} active="whatsapp">
        <RoleNotice feature="Integrasi WhatsApp" />
      </AppShell>
    );
  }

  const { percakapan } = await searchParams;
  const selectedId = parseConversationIdParam(percakapan);
  const checklist = getWhatsAppSetupChecklist();
  const missingEnv = getMissingWhatsAppEnvNames();
  const [{ conversations, error }, phoneResult] = await Promise.all([
    getWhatsAppConversations(client, shopId),
    getShopPhoneNumberId(client, shopId),
  ]);
  if (error || !conversations) return <AppShell shopName={shopName} active="whatsapp"><ShopErrorCard /></AppShell>;

  const selected = selectedId ? conversations.find((conversation) => conversation.id === selectedId) ?? null : null;
  const messagesResult = selected ? await getConversationMessages(client, shopId, selected.id) : null;
  if (messagesResult?.error) return <AppShell shopName={shopName} active="whatsapp"><ShopErrorCard /></AppShell>;

  return (
    <AppShell shopName={shopName} active="whatsapp">
      <div className="content-stack">
        <div className="page-intro">
          <div><p className="eyebrow">INTEGRASI WHATSAPP</p><h1>Pesan pelanggan</h1></div>
          <span className="date-chip">{checklist.configured ? "Webhook terkonfigurasi" : "Webhook belum siap"}</span>
        </div>

        <section className="panel" aria-labelledby="wa-status-title">
          <div className="section-heading">
            <div><p className="eyebrow">STATUS KONEKSI</p><h2 id="wa-status-title">Penerimaan pesan masuk</h2></div>
            <span className={`status-pill ${checklist.configured ? "good" : "warning"}`}>
              {checklist.configured ? "Siap" : "Perlu pengaturan"}
            </span>
          </div>
          <dl className={styles.statusList}>
            <div className={styles.statusRow}>
              <dt>Nomor bisnis tersimpan</dt>
              <dd>{phoneResult.phoneNumberId ?? "Belum ada"}</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Arah pesan didukung</dt>
              <dd>
                <span>Hanya pesan masuk</span>
                <span className="field-hint">Pengiriman keluar belum aktif</span>
              </dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Penyimpanan pesan</dt>
              <dd>
                <span>{checklist.serviceRole ? "Tersambung" : "Belum tersambung"}</span>
                <span className="field-hint">Memakai kredensial server, bukan kunci publik</span>
              </dd>
            </div>
          </dl>
          {missingEnv.length > 0 && (
            <p className="field-error">
              Variabel yang belum terbaca: {missingEnv.join(", ")}. Isi di apps/web/.env.local (bukan .env di akar), lalu hentikan dan jalankan ulang server. Alamat Supabase memakai NEXT_PUBLIC_SUPABASE_URL bila ada.
            </p>
          )}
          <p className="field-hint">Status ini hanya membaca keberadaan konfigurasi. Nilai rahasia tidak pernah ditampilkan di aplikasi.</p>
        </section>

        <section className="panel" aria-labelledby="wa-number-title">
          <div className="section-heading">
            <div><p className="eyebrow">NOMOR BISNIS</p><h2 id="wa-number-title">Sambungkan nomor WhatsApp warung</h2></div>
          </div>
          <p className="muted">
            Pesan masuk hanya disimpan jika ID nomor di Meta sama dengan ID yang tersimpan di warung ini.
          </p>
          <WhatsAppNumberForm current={phoneResult.phoneNumberId} />
        </section>

        <section className="panel" aria-labelledby="wa-checklist-title">
          <div className="section-heading">
            <div><p className="eyebrow">PANDUAN ONBOARDING</p><h2 id="wa-checklist-title">Checklist pengaturan Meta</h2></div>
          </div>
          <ul className={styles.checklist}>
            <ChecklistItem
              label="Verify token (WHATSAPP_VERIFY_TOKEN)"
              hint="Dipakai Meta saat memverifikasi webhook."
              done={checklist.verifyToken}
            />
            <ChecklistItem
              label="App secret (WHATSAPP_APP_SECRET)"
              hint="Dipakai memverifikasi tanda tangan X-Hub-Signature-256."
              done={checklist.appSecret}
            />
            <ChecklistItem
              label="Phone number ID (WHATSAPP_PHONE_NUMBER_ID)"
              hint="Harus sama dengan penanda nomor di webhook Meta dan kolom wa_phone_number_id warung."
              done={checklist.phoneNumberId}
            />
            <ChecklistItem
              label="Penyimpanan server (SUPABASE_SECRET_KEY)"
              hint="Kunci rahasia server, bukan kunci publik. Kunci lama SUPABASE_SERVICE_ROLE_KEY masih diterima."
              done={checklist.serviceRole}
            />
            <ChecklistItem
              label="Callback URL (APP_BASE_URL)"
              hint="Alamat yang didaftarkan sebagai webhook di aplikasi Meta."
              done={checklist.callbackUrl !== null}
            />
          </ul>
          <p className={styles.callbackValue}>
            Callback URL: {checklist.callbackUrl ?? "APP_BASE_URL belum diatur"}
          </p>
          <p className="field-hint">
            Daftarkan URL tersebut di Meta, isi verify token yang sama, lalu langganan kejadian pesan. Access token belum dipakai
            karena pengiriman keluar belum aktif.
          </p>
        </section>

        <section className="panel" aria-labelledby="wa-limits-title">
          <div className="section-heading">
            <div><p className="eyebrow">BATASAN SAAT INI</p><h2 id="wa-limits-title">Yang belum aktif</h2></div>
          </div>
          <p className="muted">
            Balasan otomatis belum aktif dan belum dapat diatur per percakapan (FR-CS-02). Aplikasi hanya menyimpan pesan masuk,
            belum membalas pelanggan.
          </p>
          <p className="muted">
            Pengiriman pesan keluar dan pengambilan alih percakapan belum tersedia (FR-WA-06). Unduhan media juga belum tersedia
            (FR-WA-05), sehingga gambar, audio, dan dokumen hanya menyimpan referensi id dari WhatsApp.
          </p>
          <p className="field-hint">
            Nomor telepon pelanggan adalah data pribadi. Gunakan hanya untuk layanan warung dan kelola sesuai UU Perlindungan Data Pribadi.
          </p>
        </section>

        <section className="panel" aria-labelledby="wa-conv-title">
          <div className="section-heading">
            <div><p className="eyebrow">DAFTAR PERCAKAPAN</p><h2 id="wa-conv-title">Pelanggan yang pernah menghubungi</h2></div>
            <span className="subtle-tag">{conversations.length} percakapan</span>
          </div>
          {conversations.length === 0
            ? (
              <p className="empty-state">
                Belum ada percakapan tersimpan. Setelah webhook aktif dan ada pelanggan mengirim pesan, percakapan akan muncul di sini.
              </p>
            )
            : (
              <ul className={styles.conversationList}>
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      className={styles.conversationLink}
                      href={{ pathname: "/app/whatsapp", query: { percakapan: conversation.id } }}
                      aria-current={selected?.id === conversation.id ? "true" : undefined}
                    >
                      <span className={styles.conversationMain}>
                        <strong>{conversation.customerPhone}</strong>
                        <span>{conversation.handledBy === "owner" ? "Ditangani pemilik" : "Menunggu pemilik"}</span>
                      </span>
                      <span className={styles.conversationTime}>{formatJakartaDateTime(conversation.lastMessageAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          <p className="field-hint">Waktu ditampilkan dalam zona Asia/Jakarta. Daftar menampilkan hingga {CONVERSATION_LIMIT} percakapan terbaru.</p>
        </section>

        {selectedId && !selected
          ? (
            <section className="panel" aria-labelledby="wa-missing-title">
              <h2 id="wa-missing-title">Percakapan tidak ditemukan</h2>
              <p className="muted">Percakapan yang dipilih tidak ada di warung ini.</p>
              <Link className="secondary-button" href="/app/whatsapp">Kembali ke daftar</Link>
            </section>
          )
          : null}

        {selected
          ? (
            <section className="panel" aria-labelledby="wa-msg-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PESAN PERCAKAPAN</p>
                  <h2 id="wa-msg-title">{selected.customerPhone}</h2>
                </div>
                <Link className="secondary-button" href="/app/whatsapp">Tutup</Link>
              </div>
              {!messagesResult?.messages || messagesResult.messages.length === 0
                ? <p className="empty-state">Belum ada pesan tersimpan pada percakapan ini.</p>
                : (
                  <ul className={styles.messageList}>
                    {messagesResult.messages.map((message) => (
                      <li
                        key={message.id}
                        className={`${styles.messageItem} ${message.direction === "outbound" ? styles.outbound : ""}`}
                      >
                        <div className={styles.messageMeta}>
                          <span className="status-pill good">{message.direction === "inbound" ? "Masuk" : "Keluar"}</span>
                          <span>{messageTypeLabel(message.type)}</span>
                          <span>{formatJakartaDateTime(message.createdAt)}</span>
                        </div>
                        <p className={styles.messageBody}>{messageBodyLabel(message)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              <p className="field-hint">
                Media belum diunduh. Untuk gambar, audio, atau dokumen, teks di atas dapat berupa caption atau referensi id media.
              </p>
            </section>
          )
          : null}
      </div>
    </AppShell>
  );
}
