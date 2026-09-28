import { parseDailyAiQuota, resolveAssistantConfig } from "@/lib/assistant";
import { formatJakartaDate } from "@/lib/ledger";
import { getIdentity } from "@/lib/membership";
import { loadShopContext } from "../context";
import { AppShell, RoleNotice, ShopErrorCard } from "../shell";
import { AsistenChat } from "./asisten-chat";
import { getAssistantUserId, getOpenPendingAction, getTodayAiUsage } from "./data";
import styles from "./asisten.module.css";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const context = await loadShopContext();
  if (!context) return <AppShell shopName="KedeAwak" active="asisten"><ShopErrorCard /></AppShell>;
  const { client, shopId, shopName, role } = context;

  // MARK: Owner gets write tools; staff is read-only; anything else is refused (FR-AI-01/04)
  if (role !== "owner" && role !== "staff") {
    return (
      <AppShell shopName={shopName} active="asisten">
        <RoleNotice feature="Asisten" />
      </AppShell>
    );
  }

  const canWrite = role === "owner";
  const configured = resolveAssistantConfig(process.env) !== null;
  const quotaLimit = parseDailyAiQuota(process.env);
  const now = new Date();

  const { authId } = await getIdentity();
  const { userId } = await getAssistantUserId(client, authId);
  const [usage, pending] = await Promise.all([
    getTodayAiUsage(client, shopId, now),
    userId ? getOpenPendingAction(client, shopId, userId, now) : Promise.resolve(null),
  ]);

  const used = usage.used ?? 0;
  const initialPending = pending ? { id: pending.id, summary: pending.summary } : null;

  return (
    <AppShell shopName={shopName} active="asisten">
      <div className="content-stack">
        <div className="page-intro">
          <div><p className="eyebrow">ASISTEN AI</p><h1>Asisten warung</h1></div>
          <span className="date-chip">{configured ? "Siap dipakai" : "Belum dikonfigurasi"}</span>
        </div>

        {!configured && (
          <section className="panel" aria-labelledby="asisten-setup-title">
            <div className="section-heading">
              <div><p className="eyebrow">PENGATURAN</p><h2 id="asisten-setup-title">Asisten belum aktif</h2></div>
              <span className="status-pill warning">Perlu pengaturan</span>
            </div>
            <p className="muted">
              Asisten belum dapat menjawab karena kunci AI belum diatur di server. Aplikasi tidak akan menampilkan jawaban
              palsu selama belum dikonfigurasi.
            </p>
            <p className="field-hint">
              Isi <code>LLM_API_KEY</code> dan <code>LLM_MODEL</code> pada berkas <code>apps/web/.env.local</code> di server
              (tanpa awalan <code>NEXT_PUBLIC_</code>), lalu mulai ulang aplikasi. Nilai kunci tidak pernah ditampilkan di sini.
            </p>
          </section>
        )}

        <section className="panel" aria-labelledby="asisten-usage-title">
          <div className="section-heading">
            <div><p className="eyebrow">PEMAKAIAN AI</p><h2 id="asisten-usage-title">Kuota harian</h2></div>
            <span className="subtle-tag">{formatJakartaDate(now)}</span>
          </div>
          <p className="muted">
            {usage.error
              ? "Catatan pemakaian AI belum dapat dibaca."
              : `Pemakaian AI hari ini: ${used} dari ${quotaLimit} panggilan.`}
          </p>
          <p className="field-hint">
            Kuota ini ditegakkan di server (FR-QUOTA-01/02). Saat habis, asisten berhenti memanggil AI sampai besok. Kuota
            diatur lewat <code>DAILY_AI_QUOTA_FREE</code> (bawaan {quotaLimit}).
          </p>
        </section>

        <AsistenChat configured={configured} canWrite={canWrite} quota={{ used, limit: quotaLimit }} initialPending={initialPending} />

        <section className="panel" aria-labelledby="asisten-limits-title">
          <div className="section-heading">
            <div><p className="eyebrow">BATASAN SAAT INI</p><h2 id="asisten-limits-title">Yang perlu diketahui</h2></div>
          </div>
          <ul className={styles.guardrailList}>
            {canWrite ? (
              <>
                <li>Pemilik dapat membaca stok dan laporan, serta mengajukan pencatatan pengeluaran dan penjualan.</li>
                <li>
                  Pencatatan pengeluaran dan penjualan tidak langsung tersimpan. Asisten meminta persetujuan lebih dahulu;
                  data ditulis hanya setelah Anda menyetujui.
                </li>
              </>
            ) : (
              <li>Peran karyawan hanya dapat membaca stok dan laporan. Pencatatan transaksi hanya untuk pemilik.</li>
            )}
            <li>
              Pembuatan purchase order dan balasan otomatis ke pelanggan tetap memerlukan alur persetujuan dan belum tersedia
              di halaman ini (FR-HITL-04).
            </li>
            <li>Asisten tidak mengirim pesan ke pelanggan dan tidak membaca percakapan WhatsApp.</li>
            <li>Semua angka uang dan stok dihitung oleh kode dari data warung, bukan oleh AI.</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
