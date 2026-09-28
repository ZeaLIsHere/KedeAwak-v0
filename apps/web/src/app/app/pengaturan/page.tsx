import { planLabel, waNumberStatusLabel } from "@/lib/shop-profile";
import { loadShopContext } from "../context";
import { AppShell, RoleNotice, ShopErrorCard } from "../shell";
import { getOwnerContact, getShopProfile } from "./data";
import { AutoReplyForm, ShopProfileForm } from "./shop-profile-form";
import styles from "./pengaturan.module.css";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const context = await loadShopContext();
  if (!context) return <AppShell shopName="KedeAwak" active="pengaturan"><ShopErrorCard /></AppShell>;
  const { client, shopId, shopName, role } = context;

  if (role !== "owner") {
    return (
      <AppShell shopName={shopName} active="pengaturan">
        <RoleNotice feature="Pengaturan warung" />
      </AppShell>
    );
  }

  const [{ profile, error }, contactResult] = await Promise.all([
    getShopProfile(client, shopId),
    getOwnerContact(client, shopId),
  ]);
  if (error || !profile) return <AppShell shopName={shopName} active="pengaturan"><ShopErrorCard /></AppShell>;
  const contact = contactResult.contact;

  return (
    <AppShell shopName={shopName} active="pengaturan">
      <div className="content-stack">
        <div className="page-intro">
          <div><p className="eyebrow">PENGATURAN</p><h1>Profil dan koneksi warung</h1></div>
          <span className="date-chip">Paket {planLabel(profile.plan)}</span>
        </div>

        <section className={`panel ${styles.noticeBox}`} aria-labelledby="settings-status-title">
          <div className="section-heading">
            <div><p className="eyebrow">STATUS FITUR</p><h2 id="settings-status-title">Yang belum aktif</h2></div>
          </div>
          <p className="muted">
            Menyambungkan WhatsApp ke aplikasi (FR-WA-09) belum tersedia, sehingga pesan pelanggan belum masuk otomatis ke warung ini.
            Tombol balasan otomatis boleh disimpan, tetapi belum ada balasan yang benar-benar dikirim ke pelanggan.
          </p>
          <p className="field-hint">
            Nomor pemilik yang diisi saat pendaftaran belum diverifikasi. Sistem belum membuktikan bahwa nomor tersebut benar milik
            pemilik, jadi jangan mengandalkannya untuk instruksi berisiko sampai verifikasi tersedia.
          </p>
        </section>

        <section className="panel" aria-labelledby="settings-status-list-title">
          <div className="section-heading">
            <div><p className="eyebrow">STATUS SAAT INI</p><h2 id="settings-status-list-title">Hanya baca</h2></div>
            <span className="subtle-tag">Tidak dapat diubah</span>
          </div>
          <dl className={styles.statusList}>
            <div className={styles.statusRow}>
              <dt>Paket langganan</dt>
              <dd>{planLabel(profile.plan)}</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Nomor bisnis WhatsApp</dt>
              <dd>
                <span>{profile.waPhoneNumberId ?? "Belum ada"}</span>
                <span className="field-hint">{waNumberStatusLabel(profile.waPhoneNumberId)}</span>
              </dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Nomor pemilik dari pendaftaran</dt>
              <dd>
                <span>{contact?.phone ?? "Belum tercatat"}</span>
                <span className="field-hint">
                  {contact ? `${contact.name} · belum diverifikasi` : "Nomor pemilik belum diverifikasi"}
                </span>
              </dd>
            </div>
          </dl>
          <p className="field-hint">Nomor bisnis dan paket tidak dapat diubah dari halaman ini.</p>
        </section>

        <section className="panel" aria-labelledby="auto-reply-title">
          <div className="section-heading">
            <div><p className="eyebrow">BALASAN OTOMATIS</p><h2 id="auto-reply-title">Kendali pemilik</h2></div>
            <span className="subtle-tag">{profile.autoReplyEnabled ? "Aktif" : "Nonaktif"}</span>
          </div>
          <AutoReplyForm enabled={profile.autoReplyEnabled} />
        </section>

        <ShopProfileForm profile={profile} />
      </div>
    </AppShell>
  );
}
