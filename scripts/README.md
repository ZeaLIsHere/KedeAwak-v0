# Skrip pengembangan

Semua skrip memakai data sintetis. Jangan menaruh token asli, nomor telepon asli, atau bukti transaksi asli di dalam repo.

## `simulate-whatsapp-webhook.mjs`

Menghasilkan satu payload webhook sintetis beserta header `X-Hub-Signature-256` yang sudah ditandatangani, lalu mencetaknya sebagai JSON. Skrip ini tidak mengirim permintaan apa pun dan tidak butuh server berjalan.

```
node scripts/simulate-whatsapp-webhook.mjs
```

Keluaran berisi `headers` dan `body` yang dapat ditempel ke perkakas uji webhook (mis. `curl`).

## `send-simulated-webhook.mjs`

Mengirim payload webhook sintetis bertanda tangan ke route lokal `POST /api/whatsapp/webhook` memakai `fetch`. Gunakan untuk menguji penerimaan dan penyimpanan pesan masuk tanpa memverifikasi akun Meta.

Prasyarat:

- Server web berjalan (mis. `pnpm --filter web dev`).
- `WHATSAPP_APP_SECRET` di lingkungan server sama dengan yang dipakai skrip (default skrip memakai rahasia demo sintetis).
- Nomor bisnis pada payload sudah terdaftar di kolom `shops.wa_phone_number_id`.

```
node scripts/send-simulated-webhook.mjs
node scripts/send-simulated-webhook.mjs --url http://localhost:3000/api/whatsapp/webhook --secret <rahasia-demo>
node scripts/send-simulated-webhook.mjs --text "Pesan lain" --from 628000000001 --phone-number-id synthetic-phone-number-id
```

Opsi:

| Opsi | Keterangan |
|---|---|
| `--url` | URL route webhook. Default `http://localhost:3000/api/whatsapp/webhook` atau `<APP_BASE_URL>/api/whatsapp/webhook`. |
| `--secret` | App secret untuk menandatangani payload. Default `WHATSAPP_APP_SECRET` lalu rahasia demo. |
| `--phone-number-id` | `phone_number_id` pada payload. Default `WHATSAPP_PHONE_NUMBER_ID` lalu nilai sintetis. |
| `--from` | Nomor pengirim sintetis. Default `628000000000`. |
| `--text` | Isi pesan teks sintetis. |

Skrip mencetak status HTTP dan body respons. Kode keluar bukan nol bila server menolak permintaan, misalnya karena tanda tangan tidak cocok atau nomor belum terdaftar. Rahasia tidak pernah dicetak.
