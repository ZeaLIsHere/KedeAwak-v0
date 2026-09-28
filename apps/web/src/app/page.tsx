const setupSteps = [
  {
    title: "Hubungkan warung",
    description: "Profil dan akses pemilik akan tersedia setelah autentikasi diaktifkan.",
  },
  {
    title: "Sambungkan WhatsApp",
    description: "Simulator webhook sudah tersedia; koneksi Meta belum diaktifkan.",
  },
  {
    title: "Catat transaksi",
    description: "Ringkasan akan tampil setelah data warung tersambung.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] sm:gap-8 sm:py-12">
      <header className="rounded-2xl bg-primary px-5 py-6 text-white sm:px-8 sm:py-8">
        <p className="text-sm font-semibold leading-5">KedeAwak</p>
        <h1 className="mt-3 text-2xl font-bold leading-8">Warung lebih tertata, mulai dari chat.</h1>
        <p className="mt-3 max-w-xl text-base leading-6">
          Asisten bisnis untuk membantu mencatat pesanan, memantau stok, dan menyiapkan laporan dari WhatsApp.
        </p>
      </header>

      <section aria-labelledby="setup-title" className="rounded-2xl border border-border bg-surface p-5 sm:p-8">
        <h2 id="setup-title" className="text-lg font-bold leading-6">Persiapan aplikasi</h2>
        <p className="mt-2 text-sm leading-5 text-muted">
          Aplikasi sedang disiapkan. Belum ada data transaksi atau akun yang terhubung.
        </p>
        <ol className="mt-5 flex flex-col gap-4">
          {setupSteps.map((step, index) => (
            <li key={step.title} className="flex gap-4 rounded-xl border border-border p-4">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-light text-base font-bold text-primary">
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold leading-6">{step.title}</h3>
                <p className="mt-1 text-sm leading-5 text-muted">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
