/**
 * SnackPOS - Backend Google Apps Script
 * Database: Google Spreadsheet
 *
 * CARA SETUP:
 * 1. Buat Spreadsheet baru di Google Drive.
 * 2. Menu Extensions > Apps Script, paste seluruh kode ini.
 * 3. Jalankan fungsi setupSheets() sekali (pilih dari dropdown, klik Run) untuk membuat sheet & header.
 * 4. Deploy > New deployment > Web app:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Salin URL Web App, tempel ke API_URL di file app.js (frontend).
 *
 * Catatan: Semua request memakai metode GET (?action=...) untuk menghindari masalah CORS
 * saat dipanggil dari GitHub Pages.
 */

// =================== KONFIGURASI ===================
const SHEET_USERS = 'Users';
const SHEET_BARANG = 'Barang';
const SHEET_PENJUALAN = 'Penjualan';
const SHEET_STOK_LOG = 'StokLog';

// =================== SETUP (jalankan sekali) ===================
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Users
  let u = ss.getSheetByName(SHEET_USERS) || ss.insertSheet(SHEET_USERS);
  u.clear();
  u.appendRow(['username', 'password', 'nama', 'role']);
  u.appendRow(['admin', 'admin123', 'Administrator', 'admin']);
  u.appendRow(['kasir', 'kasir123', 'Kasir Toko', 'kasir']);

  // Barang
  let b = ss.getSheetByName(SHEET_BARANG) || ss.insertSheet(SHEET_BARANG);
  b.clear();
  b.appendRow(['kode', 'nama', 'kategori', 'harga_beli', 'harga_jual', 'stok', 'created_at']);

  // Penjualan
  let p = ss.getSheetByName(SHEET_PENJUALAN) || ss.insertSheet(SHEET_PENJUALAN);
  p.clear();
  p.appendRow(['id', 'tanggal', 'kode', 'nama', 'qty', 'harga_jual', 'total', 'kasir']);

  // Stok Log
  let s = ss.getSheetByName(SHEET_STOK_LOG) || ss.insertSheet(SHEET_STOK_LOG);
  s.clear();
  s.appendRow(['tanggal', 'kode', 'nama', 'qty_tambah', 'stok_akhir', 'user']);

  SpreadsheetApp.getUi().alert('Setup selesai! Sheet sudah dibuat.');
}

// =================== ROUTER ===================
function doGet(e) {
  const action = (e.parameter.action || '').toString();
  let result;
  try {
    switch (action) {
      case 'login':        result = login(e.parameter); break;
      case 'inputBarang':  result = inputBarang(e.parameter); break;
      case 'tambahStok':   result = tambahStok(e.parameter); break;
      case 'getBarang':    result = getBarang(); break;
      case 'jual':         result = jual(e.parameter); break;
      case 'riwayat':      result = riwayat(e.parameter); break;
      case 'dashboard':    result = dashboard(); break;
      default:             result = { ok: false, msg: 'Action tidak dikenal: ' + action };
    }
  } catch (err) {
    result = { ok: false, msg: 'Error: ' + err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// =================== HELPERS ===================
function sheetData(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name);
  const values = sh.getDataRange().getValues();
  const headers = values.shift();
  return values.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function nowStr() {
  return Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss');
}

// =================== ACTIONS ===================
function login(p) {
  const users = sheetData(SHEET_USERS);
  const found = users.find(u =>
    String(u.username) === String(p.username) &&
    String(u.password) === String(p.password));
  if (found) {
    return { ok: true, user: { username: found.username, nama: found.nama, role: found.role } };
  }
  return { ok: false, msg: 'Username atau password salah' };
}

function inputBarang(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_BARANG);
  const existing = sheetData(SHEET_BARANG);
  if (existing.some(b => String(b.kode) === String(p.kode))) {
    return { ok: false, msg: 'Kode barang sudah ada' };
  }
  sh.appendRow([
    p.kode, p.nama, p.kategori || '-',
    Number(p.harga_beli) || 0, Number(p.harga_jual) || 0,
    Number(p.stok) || 0, nowStr()
  ]);
  return { ok: true, msg: 'Barang ditambahkan' };
}

function tambahStok(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_BARANG);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const colKode = headers.indexOf('kode');
  const colStok = headers.indexOf('stok');
  const colNama = headers.indexOf('nama');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colKode]) === String(p.kode)) {
      const baru = Number(data[i][colStok]) + Number(p.qty);
      sh.getRange(i + 1, colStok + 1).setValue(baru);
      ss.getSheetByName(SHEET_STOK_LOG).appendRow([
        nowStr(), p.kode, data[i][colNama], Number(p.qty), baru, p.user || '-'
      ]);
      return { ok: true, msg: 'Stok ditambahkan', stok: baru };
    }
  }
  return { ok: false, msg: 'Kode barang tidak ditemukan' };
}

function getBarang() {
  return { ok: true, data: sheetData(SHEET_BARANG) };
}

function jual(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_BARANG);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const colKode = headers.indexOf('kode');
  const colStok = headers.indexOf('stok');
  const colNama = headers.indexOf('nama');
  const colJual = headers.indexOf('harga_jual');

  const items = JSON.parse(p.items); // [{kode, qty}]
  const penjualan = ss.getSheetByName(SHEET_PENJUALAN);
  const id = 'TRX' + new Date().getTime();
  const tgl = nowStr();
  let grand = 0;

  // validasi stok dulu
  for (const it of items) {
    const row = data.find((r, idx) => idx > 0 && String(r[colKode]) === String(it.kode));
    if (!row) return { ok: false, msg: 'Barang ' + it.kode + ' tidak ada' };
    if (Number(row[colStok]) < Number(it.qty))
      return { ok: false, msg: 'Stok ' + row[colNama] + ' tidak cukup' };
  }

  // proses
  for (const it of items) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colKode]) === String(it.kode)) {
        const harga = Number(data[i][colJual]);
        const total = harga * Number(it.qty);
        grand += total;
        const sisa = Number(data[i][colStok]) - Number(it.qty);
        sh.getRange(i + 1, colStok + 1).setValue(sisa);
        data[i][colStok] = sisa;
        penjualan.appendRow([id, tgl, it.kode, data[i][colNama], Number(it.qty), harga, total, p.kasir || '-']);
      }
    }
  }
  return { ok: true, msg: 'Transaksi sukses', id: id, total: grand };
}

function riwayat(p) {
  let data = sheetData(SHEET_PENJUALAN);
  const from = p.from ? new Date(p.from + ' 00:00:00') : null;
  const to = p.to ? new Date(p.to + ' 23:59:59') : null;
  const q = (p.q || '').toString().toLowerCase();

  data = data.filter(r => {
    const t = new Date(r.tanggal);
    if (from && t < from) return false;
    if (to && t > to) return false;
    if (q && !(String(r.nama).toLowerCase().includes(q) ||
               String(r.kode).toLowerCase().includes(q) ||
               String(r.id).toLowerCase().includes(q))) return false;
    return true;
  });
  data.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  return { ok: true, data: data };
}

function dashboard() {
  const penjualan = sheetData(SHEET_PENJUALAN);
  const barang = sheetData(SHEET_BARANG);
  const today = Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd');

  let omzetTotal = 0, omzetHariIni = 0, trxHariIni = {}, qtyTotal = 0;
  const perProduk = {};
  const perTanggal = {};

  penjualan.forEach(r => {
    omzetTotal += Number(r.total);
    qtyTotal += Number(r.qty);
    const tgl = String(r.tanggal).substring(0, 10);
    perTanggal[tgl] = (perTanggal[tgl] || 0) + Number(r.total);
    perProduk[r.nama] = (perProduk[r.nama] || 0) + Number(r.qty);
    if (tgl === today) {
      omzetHariIni += Number(r.total);
      trxHariIni[r.id] = true;
    }
  });

  const topProduk = Object.entries(perProduk)
    .map(([nama, qty]) => ({ nama, qty }))
    .sort((a, b) => b.qty - a.qty).slice(0, 5);

  const grafik = Object.entries(perTanggal)
    .map(([tanggal, total]) => ({ tanggal, total }))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal)).slice(-7);

  const stokMenipis = barang
    .filter(b => Number(b.stok) <= 5)
    .map(b => ({ nama: b.nama, stok: Number(b.stok) }));

  return {
    ok: true,
    data: {
      omzetTotal, omzetHariIni,
      trxHariIni: Object.keys(trxHariIni).length,
      totalBarang: barang.length,
      qtyTotal, topProduk, grafik, stokMenipis
    }
  };
}
