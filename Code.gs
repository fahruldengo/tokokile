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
  b.appendRow(['kode', 'nama', 'kategori', 'harga_beli', 'harga_pcs', 'harga_jual', 'stok', 'created_at']);

  // Penjualan
  let p = ss.getSheetByName(SHEET_PENJUALAN) || ss.insertSheet(SHEET_PENJUALAN);
  p.clear();
  p.appendRow(['id', 'tanggal', 'kode', 'nama', 'qty', 'harga_jual', 'harga_pcs', 'laba', 'total', 'kasir', 'pembeli', 'metode', 'bayar', 'kembalian', 'status', 'terbayar']);

  // Stok Log
  let s = ss.getSheetByName(SHEET_STOK_LOG) || ss.insertSheet(SHEET_STOK_LOG);
  s.clear();
  s.appendRow(['tanggal', 'kode', 'nama', 'qty_tambah', 'stok_akhir', 'user']);

  SpreadsheetApp.getUi().alert('Setup selesai! Sheet sudah dibuat.');
}

/**
 * Perbaiki HEADER sheet tanpa menghapus data (untuk upgrade dari versi lama).
 * Jalankan sekali jika muncul error kolom. Ini hanya menambah kolom yang hilang
 * di sisi KANAN. Data lama tetap aman, kolom baru akan kosong (dianggap 0).
 *
 * PENTING: Jika urutan kolom data lama berbeda dari header baru, lebih aman
 * pakai cara ini daripada setupSheets (yang menghapus semua data).
 */
function repairHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const targetBarang = ['kode','nama','kategori','harga_beli','harga_pcs','harga_jual','stok','created_at'];
  const targetPenjualan = ['id','tanggal','kode','nama','qty','harga_jual','harga_pcs','laba','total','kasir','pembeli','metode','bayar','kembalian','status','terbayar'];

  addMissingCols(ss.getSheetByName(SHEET_BARANG), targetBarang);
  addMissingCols(ss.getSheetByName(SHEET_PENJUALAN), targetPenjualan);

  SpreadsheetApp.getUi().alert('Header diperbaiki. Kolom baru ditambahkan di kanan tanpa menghapus data.');
}

function addMissingCols(sh, target) {
  if (!sh) return;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  target.forEach(name => {
    if (headers.indexOf(name) === -1) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(name);
    }
  });
}

// =================== ROUTER ===================
function doGet(e) {
  const action = (e.parameter.action || '').toString();
  let result;
  try {
    switch (action) {
      case 'login':        result = login(e.parameter); break;
      case 'inputBarang':  result = inputBarang(e.parameter); break;
      case 'editBarang':   result = editBarang(e.parameter); break;
      case 'hapusBarang':  result = hapusBarang(e.parameter); break;
      case 'tambahStok':   result = tambahStok(e.parameter); break;
      case 'getBarang':    result = getBarang(); break;
      case 'jual':         result = jual(e.parameter); break;
      case 'riwayat':      result = riwayat(e.parameter); break;
      case 'hutang':       result = listHutang(); break;
      case 'bayarCicilan': result = bayarCicilan(e.parameter); break;
      case 'laba':         result = labaReport(e.parameter); break;
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
  const hargaBeli = Number(p.harga_beli) || 0;
  const stok = Number(p.stok) || 0;
  // harga modal per pcs = harga beli (total) dibagi stok awal
  const hargaPcs = Number(p.harga_pcs) || (stok > 0 ? Math.round(hargaBeli / stok) : 0);
  sh.appendRow([
    p.kode, p.nama, p.kategori || '-',
    hargaBeli, hargaPcs, Number(p.harga_jual) || 0,
    stok, nowStr()
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

function editBarang(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_BARANG);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const colKode = headers.indexOf('kode');
  const colNama = headers.indexOf('nama');
  const colKat = headers.indexOf('kategori');
  const colBeli = headers.indexOf('harga_beli');
  const colPcs = headers.indexOf('harga_pcs');
  const colJual = headers.indexOf('harga_jual');
  const colStok = headers.indexOf('stok');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colKode]) === String(p.kode)) {
      const hargaBeli = Number(p.harga_beli) || 0;
      const stok = Number(p.stok) || 0;
      const hargaPcs = Number(p.harga_pcs) || (stok > 0 ? Math.round(hargaBeli / stok) : 0);
      if (colNama >= 0) sh.getRange(i + 1, colNama + 1).setValue(p.nama);
      if (colKat >= 0)  sh.getRange(i + 1, colKat + 1).setValue(p.kategori || '-');
      if (colBeli >= 0) sh.getRange(i + 1, colBeli + 1).setValue(hargaBeli);
      if (colPcs >= 0)  sh.getRange(i + 1, colPcs + 1).setValue(hargaPcs);
      if (colJual >= 0) sh.getRange(i + 1, colJual + 1).setValue(Number(p.harga_jual) || 0);
      if (colStok >= 0) sh.getRange(i + 1, colStok + 1).setValue(stok);
      return { ok: true, msg: 'Barang diperbarui' };
    }
  }
  return { ok: false, msg: 'Kode barang tidak ditemukan' };
}

function hapusBarang(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_BARANG);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const colKode = headers.indexOf('kode');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colKode]) === String(p.kode)) {
      sh.deleteRow(i + 1);
      return { ok: true, msg: 'Barang dihapus' };
    }
  }
  return { ok: false, msg: 'Kode barang tidak ditemukan' };
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
  const colPcs = headers.indexOf('harga_pcs');

  const items = JSON.parse(p.items); // [{kode, qty}]
  const penjualan = ss.getSheetByName(SHEET_PENJUALAN);
  const id = 'TRX' + new Date().getTime();
  const tgl = nowStr();
  const pembeli = p.pembeli || 'Umum';
  const metode = p.metode || 'tunai';
  let grand = 0;

  // validasi stok dulu
  for (const it of items) {
    const row = data.find((r, idx) => idx > 0 && String(r[colKode]) === String(it.kode));
    if (!row) return { ok: false, msg: 'Barang ' + it.kode + ' tidak ada' };
    if (Number(row[colStok]) < Number(it.qty))
      return { ok: false, msg: 'Stok ' + row[colNama] + ' tidak cukup' };
  }

  // hitung grand total dulu untuk uang bayar & kembalian per transaksi
  for (const it of items) {
    const row = data.find((r, idx) => idx > 0 && String(r[colKode]) === String(it.kode));
    grand += Number(row[colJual]) * Number(it.qty);
  }
  const uangBayar = metode === 'tunai' ? (Number(p.bayar) || grand) : grand;
  const kembalian = metode === 'tunai' ? Math.max(0, uangBayar - grand) : 0;

  if (metode === 'tunai' && uangBayar < grand) {
    return { ok: false, msg: 'Uang bayar kurang dari total' };
  }

  // proses (uang bayar & kembalian dicatat di baris pertama saja)
  let first = true;
  for (const it of items) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colKode]) === String(it.kode)) {
        const harga = Number(data[i][colJual]);
        const modal = colPcs >= 0 ? Number(data[i][colPcs]) : 0;
        const qty = Number(it.qty);
        const total = harga * qty;
        const laba = (harga - modal) * qty;
        const sisa = Number(data[i][colStok]) - qty;
        sh.getRange(i + 1, colStok + 1).setValue(sisa);
        data[i][colStok] = sisa;
        // kolom: id,tanggal,kode,nama,qty,harga_jual,harga_pcs,laba,total,kasir,pembeli,metode,bayar,kembalian,status,terbayar
        penjualan.appendRow([
          id, tgl, it.kode, data[i][colNama], qty, harga, modal, laba, total,
          p.kasir || '-', pembeli, metode,
          first ? uangBayar : '', first ? kembalian : '',
          metode === 'hutang' ? 'belum' : 'lunas',
          metode === 'hutang' ? 0 : total
        ]);
        first = false;
      }
    }
  }
  return { ok: true, msg: 'Transaksi sukses', id: id, total: grand, bayar: uangBayar, kembalian: kembalian };
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

function listHutang() {
  const data = sheetData(SHEET_PENJUALAN);
  // gabung per transaksi (id), hanya metode hutang
  const trx = {};
  data.forEach(r => {
    if (String(r.metode).toLowerCase() !== 'hutang') return;
    const id = r.id;
    if (!trx[id]) {
      trx[id] = {
        id: id, tanggal: r.tanggal, pembeli: r.pembeli || 'Umum',
        kasir: r.kasir, status: r.status || 'belum',
        total: 0, terbayar: 0, items: []
      };
    }
    trx[id].total += Number(r.total);
    trx[id].terbayar += Number(r.terbayar) || 0;
    trx[id].items.push({ nama: r.nama, qty: Number(r.qty), harga: Number(r.harga_jual), sub: Number(r.total) });
    if (String(r.status).toLowerCase() === 'lunas') trx[id].status = 'lunas';
  });

  const all = Object.values(trx).map(t => {
    t.sisa = Math.max(0, t.total - t.terbayar);
    if (t.sisa <= 0) t.status = 'lunas';
    return t;
  });
  const list = all.filter(t => t.status !== 'lunas');
  list.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  const totalHutang = list.reduce((s, t) => s + t.sisa, 0);

  // rekap per pembeli (hanya yang belum lunas)
  const perPembeli = {};
  list.forEach(t => {
    if (!perPembeli[t.pembeli]) perPembeli[t.pembeli] = { pembeli: t.pembeli, total: 0, terbayar: 0, sisa: 0, jml: 0 };
    perPembeli[t.pembeli].total += t.total;
    perPembeli[t.pembeli].terbayar += t.terbayar;
    perPembeli[t.pembeli].sisa += t.sisa;
    perPembeli[t.pembeli].jml += 1;
  });
  const rekap = Object.values(perPembeli).sort((a, b) => b.sisa - a.sisa);

  return { ok: true, data: list, totalHutang: totalHutang, rekap: rekap };
}

// Bayar cicilan: tambahkan p.jumlah ke kolom terbayar (di baris pertama transaksi).
// Jika total terbayar >= total hutang, semua baris transaksi ditandai lunas.
// Pastikan kolom ada di header; jika belum, tambahkan di kolom paling kanan.
// Mengembalikan index kolom (0-based).
function ensureColumn(sh, headers, name) {
  let idx = headers.indexOf(name);
  if (idx === -1) {
    idx = headers.length;
    sh.getRange(1, idx + 1).setValue(name);
    headers.push(name);
  }
  return idx;
}

function bayarCicilan(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_PENJUALAN);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const colId = headers.indexOf('id');
  const colTotal = headers.indexOf('total');
  // kolom ini mungkin belum ada di sheet versi lama -> buat otomatis
  const colStatus = ensureColumn(sh, headers, 'status');
  const colTerbayar = ensureColumn(sh, headers, 'terbayar');

  if (colId === -1 || colTotal === -1) {
    return { ok: false, msg: 'Struktur sheet Penjualan tidak valid (kolom id/total hilang)' };
  }

  const jumlah = Number(p.jumlah) || 0;
  if (jumlah <= 0) return { ok: false, msg: 'Jumlah cicilan tidak valid' };

  // kumpulkan baris transaksi & total hutang
  let rowsIdx = [], totalHutang = 0, terbayarLama = 0, firstRow = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][colId]) === String(p.id)) {
      rowsIdx.push(i);
      totalHutang += Number(values[i][colTotal]) || 0;
      terbayarLama += Number(values[i][colTerbayar]) || 0;
      if (firstRow === -1) firstRow = i;
    }
  }
  if (firstRow === -1) return { ok: false, msg: 'Transaksi tidak ditemukan' };

  const sisaSebelum = totalHutang - terbayarLama;
  if (jumlah > sisaSebelum) return { ok: false, msg: 'Cicilan melebihi sisa hutang (' + sisaSebelum + ')' };

  // tambahkan ke baris pertama
  const terbayarBaru = terbayarLama + jumlah;
  sh.getRange(firstRow + 1, colTerbayar + 1).setValue(terbayarBaru);

  const sisaBaru = totalHutang - terbayarBaru;
  const lunas = sisaBaru <= 0;
  if (lunas) {
    rowsIdx.forEach(i => sh.getRange(i + 1, colStatus + 1).setValue('lunas'));
  }
  return {
    ok: true, msg: lunas ? 'Hutang LUNAS' : 'Cicilan tercatat',
    terbayar: terbayarBaru, sisa: Math.max(0, sisaBaru), lunas: lunas, total: totalHutang
  };
}

function labaReport(p) {
  let data = sheetData(SHEET_PENJUALAN);
  const from = p.from ? new Date(p.from + ' 00:00:00') : null;
  const to = p.to ? new Date(p.to + ' 23:59:59') : null;
  data = data.filter(r => {
    const t = new Date(r.tanggal);
    if (from && t < from) return false;
    if (to && t > to) return false;
    return true;
  });

  const perProduk = {};
  let totalLaba = 0, totalOmzet = 0, totalModal = 0, totalQty = 0;
  data.forEach(r => {
    const nama = r.nama;
    const laba = Number(r.laba) || 0;
    const total = Number(r.total) || 0;
    const qty = Number(r.qty) || 0;
    const modal = (Number(r.harga_pcs) || 0) * qty;
    if (!perProduk[nama]) perProduk[nama] = { nama: nama, qty: 0, omzet: 0, modal: 0, laba: 0 };
    perProduk[nama].qty += qty;
    perProduk[nama].omzet += total;
    perProduk[nama].modal += modal;
    perProduk[nama].laba += laba;
    totalLaba += laba; totalOmzet += total; totalModal += modal; totalQty += qty;
  });
  const list = Object.values(perProduk).sort((a, b) => b.laba - a.laba);
  return {
    ok: true,
    data: list,
    summary: { totalLaba, totalOmzet, totalModal, totalQty, margin: totalOmzet > 0 ? (totalLaba / totalOmzet * 100) : 0 }
  };
}

function dashboard() {
  const penjualan = sheetData(SHEET_PENJUALAN);
  const barang = sheetData(SHEET_BARANG);
  const today = Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd');

  let omzetTotal = 0, omzetHariIni = 0, trxHariIni = {}, qtyTotal = 0;
  let labaTotal = 0, labaHariIni = 0;
  const perProduk = {};
  const perTanggal = {};

  penjualan.forEach(r => {
    omzetTotal += Number(r.total);
    labaTotal += Number(r.laba) || 0;
    qtyTotal += Number(r.qty);
    const tgl = String(r.tanggal).substring(0, 10);
    perTanggal[tgl] = (perTanggal[tgl] || 0) + Number(r.total);
    perProduk[r.nama] = (perProduk[r.nama] || 0) + Number(r.qty);
    if (tgl === today) {
      omzetHariIni += Number(r.total);
      labaHariIni += Number(r.laba) || 0;
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
      omzetTotal, omzetHariIni, labaTotal, labaHariIni,
      trxHariIni: Object.keys(trxHariIni).length,
      totalBarang: barang.length,
      qtyTotal, topProduk, grafik, stokMenipis
    }
  };
}
