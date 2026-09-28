import { resolveAssistantConfig } from "@/lib/assistant";
import { formatJakartaDate } from "@/lib/ledger";
import { loadShopContext } from "../context";
import { AppShell, RoleNotice, ShopErrorCard } from "../shell";
import { AsistenChat } from "./asisten-chat";
import { getTodayAiUsage } from "./data";
import styles from "./asisten.module.css";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const context = await loadShopContext();
  if (!context) return <AppShell shopName="KedeAwak" active="asisten"><ShopErrorCard /></AppShell>;
  const { client, shopId, shopName, role } = context;

  if (role !== "owner") {
    return (
      <AppShell shopName={shopName} active="asisten">
        <RoleNotice feature="Asisten" />
      </AppShell>
    );
  }

  const configured = resolveAssistantConfig(process.env) !== null;
  const now = new Date();
  const usage = await getTodayAiUsage(client, shopId, now);

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
            <div><p className="eyebrow">PEMAKAIAN AI</p><h2 id="asisten-usage-title">Catatan kuota harian</h2></div>
            <span className="subtle-tag">{formatJakartaDate(now)}</span>
          </div>
          <p className="muted">
            {usage.error
              ? "Catatan pemakaian AI belum dapat dibaca."
              : `Pemakaian AI hari ini: ${usage.aiCalls} panggilan (tercatat pada usage_counters).`}
          </p>
          <p className="field-hint">
            Pembatasan kuota harian (FR-QUOTA-01) belum aktif. Angka ini hanya tampilan; halaman asisten tidak memblokir
            permintaan dan tidak menambah kuota.
          </p>
        </section>

        <AsistenChat configured={configured} />

        <section className="panel" aria-labelledby="asisten-limits-title">
          <div className="section-heading">
            <div><p className="eyebrow">BATASAN SAAT INI</p><h2 id="asisten-limits-title">Yang belum tersedia</h2></div>
          </div>
          <ul className={styles.guardrailList}>
            <li>Asisten hanya bisa membaca lewat check_stock dan get_report.</li>
            <li>
              Membuat pesanan, pengeluaran, penjualan, atau purchase order sengaja belum tersedia karena persetujuan pemilik
              (HITL, FR-HITL-04) belum terhubung. Gunakan halaman aplikasi terkait untuk mencatat data.
            </li>
            <li>Asisten tidak mengirim pesan ke pelanggan dan tidak membaca percakapan WhatsApp.</li>
            <li>Semua angka uang dan stok dihitung oleh kode dari data warung, bukan oleh AI.</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
