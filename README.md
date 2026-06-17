# SnackPOS — Sistem Penjualan Toko Snack

Aplikasi POS toko snack berbasis HTML/JS dengan Google Spreadsheet sebagai database.
Frontend bisa di-host gratis di **GitHub Pages**, backend pakai **Google Apps Script**.

## Fitur
- Form login (role admin & kasir)
- Input barang baru
- Tambah stok barang (+ log)
- Penjualan dengan keranjang & validasi stok
- Riwayat penjualan dengan filter tanggal & pencarian
- Dashboard: omzet, transaksi, produk terlaris, grafik 7 hari, alert stok menipis

## Arsitektur
```
GitHub Pages (HTML/CSS/JS)  →  Google Apps Script (API)  →  Google Spreadsheet (DB)
```

## Setup Backend (Google Apps Script)
1. Buka [Google Sheets](https://sheets.google.com), buat spreadsheet baru.
2. Menu **Extensions → Apps Script**.
3. Hapus kode default, paste isi `Code.gs`.
4. Pilih fungsi `setupSheets` di dropdown, klik **Run** (izinkan akses). Sheet otomatis dibuat + 2 akun demo.
5. Klik **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Salin **Web App URL**.

## Setup Frontend
1. Buka `app.js`, ganti baris:
   ```js
   const API_URL = 'GANTI_DENGAN_URL_WEB_APP_KAMU';
   ```
   dengan URL Web App tadi.
2. Upload `index.html`, `style.css`, `app.js` ke repo GitHub.
3. Repo → **Settings → Pages → Source: main / root**. Tunggu beberapa menit.

## Akun Demo
| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | admin |
| kasir | kasir123 | kasir |

> Ganti password lewat sheet **Users** di spreadsheet.

## Upload ke GitHub via terminal
```bash
git init
git add .
git commit -m "SnackPOS"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```
