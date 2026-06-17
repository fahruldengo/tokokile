/* ============================================================
   SnackPOS — Frontend
   Ganti API_URL dengan URL Web App Google Apps Script kamu.
   ============================================================ */
const API_URL = 'https://script.google.com/macros/s/AKfycbw1e3JlROpMwtq4vgqg2av-JaonnwEfRdLMbvoC9C8NgL9tjuHn6tED0GlYsCQz9Z8pyg/exec';

let CURRENT_USER = null;
let BARANG = [];
let CART = [];
let PAY_METODE = 'tunai';
let chartOmzet = null;

/* ---------- API helper (GET, hindari CORS) ---------- */
async function api(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`${API_URL}?${qs.toString()}`);
  return res.json();
}

const $ = id => document.getElementById(id);
const rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 2600);
}

/* ---------- LOGIN ---------- */
$('btnLogin').onclick = async () => {
  const username = $('loginUser').value.trim();
  const password = $('loginPass').value.trim();
  const msg = $('loginMsg');
  if (!username || !password) { msg.className = 'msg err'; msg.textContent = 'Isi username & password'; return; }
  msg.className = 'msg'; msg.textContent = 'Memeriksa...';
  try {
    const r = await api('login', { username, password });
    if (r.ok) {
      CURRENT_USER = r.user;
      localStorage.setItem('snackpos_user', JSON.stringify(r.user));
      enterApp();
    } else { msg.className = 'msg err'; msg.textContent = r.msg; }
  } catch (e) { msg.className = 'msg err'; msg.textContent = 'Gagal terhubung ke server. Cek API_URL.'; }
};
$('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnLogin').click(); });

$('btnLogout').onclick = () => {
  localStorage.removeItem('snackpos_user');
  CURRENT_USER = null;
  $('appPage').classList.add('hidden');
  $('loginPage').classList.remove('hidden');
};

function enterApp() {
  $('loginPage').classList.add('hidden');
  $('appPage').classList.remove('hidden');
  $('userName').textContent = CURRENT_USER.nama;
  $('userRole').textContent = CURRENT_USER.role;
  $('userAvatar').textContent = CURRENT_USER.nama.charAt(0).toUpperCase();
  loadAll();
}

/* ---------- NAVIGASI ---------- */
const titles = { dashboard:'Dashboard', penjualan:'Penjualan', input:'Input Barang', stok:'Tambah Stok', riwayat:'Riwayat Penjualan', hutang:'Daftar Hutang' };
document.querySelectorAll('.nav-item').forEach(item => {
  item.onclick = () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    const page = item.dataset.page;
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    $('page-' + page).classList.remove('hidden');
    $('pageTitle').textContent = titles[page];
    document.querySelector('.sidebar').classList.remove('open');
    if (page === 'dashboard') loadDashboard();
    if (page === 'riwayat') loadRiwayat();
    if (page === 'hutang') loadHutang();
  };
});
$('menuToggle').onclick = () => document.querySelector('.sidebar').classList.toggle('open');
$('btnRefresh').onclick = () => loadAll();

/* ---------- LOAD SEMUA ---------- */
async function loadAll() { await loadBarang(); await loadDashboard(); }

/* ---------- BARANG ---------- */
async function loadBarang() {
  const r = await api('getBarang');
  if (!r.ok) return;
  BARANG = r.data;
  renderTblBarang();
  renderSelectStok();
  renderProdukJual();
}

function renderTblBarang() {
  const tb = $('tblBarang').querySelector('tbody');
  tb.innerHTML = BARANG.map(b => `
    <tr>
      <td>${b.kode}</td><td>${b.nama}</td><td>${b.kategori}</td>
      <td>${rp(b.harga_beli)}</td><td>${rp(b.harga_jual)}</td>
      <td><span class="badge-stok ${Number(b.stok)<=5?'low':'ok'}">${b.stok}</span></td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Belum ada barang</td></tr>';
}

function renderSelectStok() {
  $('tsKode').innerHTML = '<option value="">— pilih barang —</option>' +
    BARANG.map(b => `<option value="${b.kode}">${b.kode} · ${b.nama} (stok: ${b.stok})</option>`).join('');
}

/* ---------- INPUT BARANG ---------- */
$('btnInputBarang').onclick = async () => {
  const p = {
    kode: $('ibKode').value.trim(), nama: $('ibNama').value.trim(),
    kategori: $('ibKategori').value.trim(), harga_beli: $('ibBeli').value,
    harga_jual: $('ibJual').value, stok: $('ibStok').value
  };
  const msg = $('ibMsg');
  if (!p.kode || !p.nama || !p.harga_jual) { msg.className='msg err'; msg.textContent='Kode, nama & harga jual wajib diisi'; return; }
  msg.className='msg'; msg.textContent='Menyimpan...';
  const r = await api('inputBarang', p);
  if (r.ok) {
    toast('Barang ditambahkan', 'ok'); msg.className='msg ok'; msg.textContent=r.msg;
    ['ibKode','ibNama','ibKategori','ibBeli','ibJual','ibStok'].forEach(i=>$(i).value='');
    loadBarang();
  } else { msg.className='msg err'; msg.textContent=r.msg; }
};

/* ---------- TAMBAH STOK ---------- */
$('btnTambahStok').onclick = async () => {
  const kode = $('tsKode').value, qty = $('tsQty').value;
  const msg = $('tsMsg');
  if (!kode || !qty || Number(qty)<=0) { msg.className='msg err'; msg.textContent='Pilih barang & isi jumlah'; return; }
  msg.className='msg'; msg.textContent='Menyimpan...';
  const r = await api('tambahStok', { kode, qty, user: CURRENT_USER.nama });
  if (r.ok) {
    toast('Stok diperbarui', 'ok'); msg.className='msg ok'; msg.textContent=`${r.msg}. Stok sekarang: ${r.stok}`;
    $('tsQty').value=''; loadBarang();
  } else { msg.className='msg err'; msg.textContent=r.msg; }
};

/* ---------- PENJUALAN ---------- */
function renderProdukJual(filter='') {
  const f = filter.toLowerCase();
  const list = BARANG.filter(b =>
    b.nama.toLowerCase().includes(f) || String(b.kode).toLowerCase().includes(f));
  $('produkList').innerHTML = list.map(b => `
    <div class="produk-item ${Number(b.stok)<=0?'out':''}" onclick="addCart('${b.kode}')">
      <div class="pn">${b.nama}</div>
      <div class="pp">${rp(b.harga_jual)}</div>
      <div class="ps">Stok: ${b.stok}</div>
    </div>`).join('') || '<p style="color:var(--muted)">Tidak ada barang</p>';
}
$('searchJual').oninput = e => renderProdukJual(e.target.value);

window.addCart = (kode) => {
  const b = BARANG.find(x => String(x.kode)===String(kode));
  const ex = CART.find(c => c.kode===kode);
  if (ex) { if (ex.qty < Number(b.stok)) ex.qty++; else { toast('Stok tidak cukup','err'); return; } }
  else CART.push({ kode, nama:b.nama, harga:Number(b.harga_jual), qty:1, stok:Number(b.stok) });
  renderCart();
};
window.changeQty = (kode, d) => {
  const c = CART.find(x=>x.kode===kode); if(!c) return;
  c.qty += d;
  if (c.qty<=0) CART = CART.filter(x=>x.kode!==kode);
  else if (c.qty>c.stok){ c.qty=c.stok; toast('Stok maksimal','err'); }
  renderCart();
};
window.delCart = (kode) => { CART = CART.filter(x=>x.kode!==kode); renderCart(); };

function renderCart() {
  const el = $('cartList');
  if (!CART.length) {
    el.innerHTML = '<div class="cart-empty">Keranjang kosong</div>';
    $('cartTotal').textContent='Rp0';
    hitungKembalian();
    return;
  }
  el.innerHTML = CART.map(c => `
    <div class="cart-item">
      <div style="flex:1"><div class="ci-nm">${c.nama}</div><div class="ci-pr">${rp(c.harga)} × ${c.qty} = ${rp(c.harga*c.qty)}</div></div>
      <div class="qty-ctl"><button onclick="changeQty('${c.kode}',-1)">−</button><span>${c.qty}</span><button onclick="changeQty('${c.kode}',1)">+</button></div>
      <i class="ti ti-trash ci-del" onclick="delCart('${c.kode}')"></i>
    </div>`).join('');
  $('cartTotal').textContent = rp(cartTotal());
  hitungKembalian();
}

function cartTotal() { return CART.reduce((s,c)=>s+c.harga*c.qty,0); }

function hitungKembalian() {
  const bayar = Number($('jualBayar').value) || 0;
  const total = cartTotal();
  const kembali = bayar - total;
  const el = $('jualKembalian');
  if (bayar === 0) {
    el.textContent = 'Rp0';
    el.style.color = 'var(--muted)';
  } else if (kembali < 0) {
    el.textContent = '− ' + rp(Math.abs(kembali)) + ' (kurang)';
    el.style.color = 'var(--red)';
  } else {
    el.textContent = rp(kembali);
    el.style.color = 'var(--green)';
  }
}
$('jualBayar').addEventListener('input', hitungKembalian);
$('jualBayar').addEventListener('keyup', hitungKembalian);

/* pilih metode bayar */
document.querySelectorAll('.pay-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    PAY_METODE = btn.dataset.metode;
    $('bayarWrap').style.display = PAY_METODE === 'tunai' ? '' : 'none';
  };
});

$('btnCheckout').onclick = async () => {
  if (!CART.length) { toast('Keranjang kosong','err'); return; }
  const total = cartTotal();
  const pembeli = $('jualPembeli').value.trim() || 'Umum';
  const bayar = Number($('jualBayar').value) || 0;

  if (PAY_METODE === 'tunai' && bayar < total) { toast('Uang bayar kurang dari total','err'); return; }

  // snapshot keranjang untuk struk (sebelum dikosongkan)
  const snapshot = CART.map(c => ({ nama:c.nama, qty:c.qty, harga:c.harga, sub:c.harga*c.qty }));

  $('btnCheckout').disabled = true;
  const items = CART.map(c => ({ kode:c.kode, qty:c.qty }));
  const r = await api('jual', {
    items: JSON.stringify(items),
    kasir: CURRENT_USER.nama,
    pembeli, metode: PAY_METODE,
    bayar: PAY_METODE === 'tunai' ? bayar : total
  });
  $('btnCheckout').disabled = false;
  if (r.ok) {
    toast('Transaksi sukses', 'ok');
    tampilStruk({
      id: r.id, tanggal: new Date(), pembeli, metode: PAY_METODE,
      items: snapshot, total: r.total,
      bayar: r.bayar, kembalian: r.kembalian, kasir: CURRENT_USER.nama
    });
    CART = []; renderCart();
    $('jualPembeli').value=''; $('jualBayar').value='';
    PAY_METODE = 'tunai';
    document.querySelectorAll('.pay-btn').forEach(b => b.classList.toggle('active', b.dataset.metode === 'tunai'));
    $('bayarWrap').style.display = '';
    loadBarang();
  } else toast(r.msg, 'err');
};

/* ---------- DASHBOARD ---------- */
async function loadDashboard() {
  const r = await api('dashboard'); if (!r.ok) return;
  const d = r.data;
  $('dOmzetHari').textContent = rp(d.omzetHariIni);
  $('dOmzetTotal').textContent = rp(d.omzetTotal);
  $('dTrxHari').textContent = d.trxHariIni;
  $('dBarang').textContent = d.totalBarang;

  $('topProduk').innerHTML = d.topProduk.length ? d.topProduk.map((p,i)=>`
    <div class="top-item"><span class="rank">${i+1}</span><span class="nm">${p.nama}</span><span class="qt">${p.qty}x</span></div>
  `).join('') : '<p style="color:var(--muted)">Belum ada penjualan</p>';

  $('stokMenipis').innerHTML = d.stokMenipis.length ?
    d.stokMenipis.map(s=>`<span class="chip">${s.nama}: ${s.stok}</span>`).join('') :
    '<span class="chip empty">Semua stok aman</span>';

  drawChart(d.grafik);
}

function drawChart(grafik) {
  const ctx = $('chartOmzet');
  const labels = grafik.map(g => g.tanggal.substring(5));
  const data = grafik.map(g => g.total);
  if (chartOmzet) chartOmzet.destroy();
  chartOmzet = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{
      data, borderColor:'#4f46e5', backgroundColor:'rgba(79,70,229,.1)',
      fill:true, tension:.35, pointBackgroundColor:'#4f46e5', pointRadius:4, borderWidth:2.5
    }]},
    options: {
      plugins:{ legend:{display:false} },
      scales:{ y:{ beginAtZero:true, ticks:{ callback:v=>'Rp'+(v/1000)+'k' }, grid:{color:'#eef0f5'} },
               x:{ grid:{display:false} } },
      maintainAspectRatio:false
    }
  });
}

/* ---------- RIWAYAT ---------- */
async function loadRiwayat() {
  const params = {};
  if ($('rwFrom').value) params.from = $('rwFrom').value;
  if ($('rwTo').value) params.to = $('rwTo').value;
  if ($('rwQ').value.trim()) params.q = $('rwQ').value.trim();
  const r = await api('riwayat', params); if (!r.ok) return;
  const tb = $('tblRiwayat').querySelector('tbody');
  let sum = 0;
  tb.innerHTML = r.data.map(x => { sum += Number(x.total); 
    const m = String(x.metode||'tunai').toLowerCase();
    const badge = `<span class="badge-metode ${m}">${m}</span>`;
    return `
    <tr><td>${x.id}</td><td>${String(x.tanggal).substring(0,16)}</td><td>${x.pembeli||'Umum'}</td>
    <td>${x.nama}</td><td>${x.qty}</td><td>${rp(x.total)}</td><td>${badge}</td><td>${x.kasir}</td></tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted)">Tidak ada data</td></tr>';
  $('rwCount').textContent = r.data.length;
  $('rwSum').textContent = rp(sum);
}
$('btnFilter').onclick = loadRiwayat;

/* ---------- STRUK / RECEIPT ---------- */
const metodeLabel = { tunai:'TUNAI', transfer:'TRANSFER', hutang:'HUTANG' };

function tampilStruk(t) {
  const tgl = new Date(t.tanggal);
  const tglStr = tgl.toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' });
  const baris = t.items.map(i =>
    `<tr><td>${i.nama}<br><span class="sk-sub">${i.qty} × ${rp(i.harga)}</span></td><td class="sk-r">${rp(i.sub)}</td></tr>`
  ).join('');

  let bayarHtml = '';
  if (t.metode === 'tunai') {
    bayarHtml = `<div class="sk-line"><span>Bayar</span><span>${rp(t.bayar)}</span></div>
                 <div class="sk-line"><span>Kembali</span><span>${rp(t.kembalian)}</span></div>`;
  } else if (t.metode === 'hutang') {
    bayarHtml = `<div class="sk-line sk-hutang"><span>Status</span><span>BELUM LUNAS</span></div>`;
  } else {
    bayarHtml = `<div class="sk-line"><span>Pembayaran</span><span>TRANSFER</span></div>`;
  }

  $('strukContent').innerHTML = `
    <div class="sk-head">
      <h2>SnackPOS</h2>
      <p>Toko Snack</p>
    </div>
    <div class="sk-meta">
      <div><span>No</span><span>${t.id}</span></div>
      <div><span>Tanggal</span><span>${tglStr}</span></div>
      <div><span>Pembeli</span><span>${t.pembeli}</span></div>
      <div><span>Kasir</span><span>${t.kasir}</span></div>
      <div><span>Metode</span><span>${metodeLabel[t.metode]}</span></div>
    </div>
    <table class="sk-table"><tbody>${baris}</tbody></table>
    <div class="sk-line sk-total"><span>TOTAL</span><span>${rp(t.total)}</span></div>
    ${bayarHtml}
    <div class="sk-foot">Terima kasih telah berbelanja</div>
  `;
  $('strukOverlay').classList.remove('hidden');
}
window.tutupStruk = () => $('strukOverlay').classList.add('hidden');
window.cetakStruk = () => {
  const isi = $('strukContent').innerHTML;
  const w = window.open('', '', 'width=320,height=600');
  w.document.write(`<html><head><title>Struk</title><style>
    body{font-family:'Courier New',monospace;font-size:12px;color:#000;padding:10px;width:280px}
    h2{font-size:18px;text-align:center;margin:0}
    .sk-head{text-align:center;margin-bottom:8px} .sk-head p{margin:2px 0}
    .sk-meta div{display:flex;justify-content:space-between;font-size:11px}
    .sk-meta{border-top:1px dashed #000;border-bottom:1px dashed #000;padding:6px 0;margin:6px 0}
    table{width:100%;border-collapse:collapse} td{padding:3px 0;vertical-align:top;font-size:12px}
    .sk-r{text-align:right} .sk-sub{font-size:10px;color:#444}
    .sk-line{display:flex;justify-content:space-between;font-size:12px;margin:3px 0}
    .sk-total{border-top:1px dashed #000;padding-top:6px;font-weight:bold;font-size:14px;margin-top:6px}
    .sk-hutang span:last-child{font-weight:bold}
    .sk-foot{text-align:center;margin-top:10px;border-top:1px dashed #000;padding-top:8px;font-size:11px}
  </style></head><body>${isi}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 300);
};

/* ---------- DAFTAR HUTANG ---------- */
async function loadHutang() {
  const r = await api('hutang'); if (!r.ok) return;
  $('hTotal').textContent = rp(r.totalHutang);
  $('hCount').textContent = r.data.length;
  const el = $('hutangList');
  if (!r.data.length) { el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px">Tidak ada hutang. Semua lunas!</p>'; return; }
  el.innerHTML = r.data.map(t => {
    const tglStr = new Date(t.tanggal).toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' });
    const detail = t.items.map(i => `${i.nama} (${i.qty}×)`).join(', ');
    return `
    <div class="hutang-item">
      <div class="hutang-main">
        <div class="hutang-name"><i class="ti ti-user"></i> ${t.pembeli}</div>
        <div class="hutang-detail">${detail}</div>
        <div class="hutang-meta">${t.id} · ${tglStr} · kasir ${t.kasir}</div>
      </div>
      <div class="hutang-right">
        <div class="hutang-amount">${rp(t.total)}</div>
        <button class="btn btn-primary btn-sm" onclick="lunasi('${t.id}','${t.pembeli.replace(/'/g,'')}')"><i class="ti ti-check"></i> Lunasi</button>
      </div>
    </div>`;
  }).join('');
}

window.lunasi = async (id, pembeli) => {
  if (!confirm(`Tandai hutang ${pembeli} (${id}) sebagai LUNAS?`)) return;
  const r = await api('lunasiHutang', { id });
  if (r.ok) { toast('Hutang lunas', 'ok'); loadHutang(); loadDashboard(); }
  else toast(r.msg, 'err');
};

/* ---------- AUTO LOGIN ---------- */
(function init() {
  const saved = localStorage.getItem('snackpos_user');
  if (saved) { CURRENT_USER = JSON.parse(saved); enterApp(); }
})();
