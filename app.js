/* ============================================================
   SnackPOS — Frontend
   Ganti API_URL dengan URL Web App Google Apps Script kamu.
   ============================================================ */
const API_URL = 'https://script.google.com/macros/s/AKfycbw1e3JlROpMwtq4vgqg2av-JaonnwEfRdLMbvoC9C8NgL9tjuHn6tED0GlYsCQz9Z8pyg/exec';

let CURRENT_USER = null;
let BARANG = [];
let CART = [];
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
const titles = { dashboard:'Dashboard', penjualan:'Penjualan', input:'Input Barang', stok:'Tambah Stok', riwayat:'Riwayat Penjualan' };
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
  if (!CART.length) { el.innerHTML = '<div class="cart-empty">Keranjang kosong</div>'; $('cartTotal').textContent='Rp0'; return; }
  el.innerHTML = CART.map(c => `
    <div class="cart-item">
      <div style="flex:1"><div class="ci-nm">${c.nama}</div><div class="ci-pr">${rp(c.harga)} × ${c.qty} = ${rp(c.harga*c.qty)}</div></div>
      <div class="qty-ctl"><button onclick="changeQty('${c.kode}',-1)">−</button><span>${c.qty}</span><button onclick="changeQty('${c.kode}',1)">+</button></div>
      <i class="ti ti-trash ci-del" onclick="delCart('${c.kode}')"></i>
    </div>`).join('');
  $('cartTotal').textContent = rp(CART.reduce((s,c)=>s+c.harga*c.qty,0));
}

$('btnCheckout').onclick = async () => {
  if (!CART.length) { toast('Keranjang kosong','err'); return; }
  $('btnCheckout').disabled = true;
  const items = CART.map(c => ({ kode:c.kode, qty:c.qty }));
  const r = await api('jual', { items: JSON.stringify(items), kasir: CURRENT_USER.nama });
  $('btnCheckout').disabled = false;
  if (r.ok) {
    toast(`Transaksi sukses · ${rp(r.total)}`, 'ok');
    CART = []; renderCart(); loadBarang();
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
  tb.innerHTML = r.data.map(x => { sum += Number(x.total); return `
    <tr><td>${x.id}</td><td>${String(x.tanggal).substring(0,16)}</td><td>${x.nama}</td>
    <td>${x.qty}</td><td>${rp(x.harga_jual)}</td><td>${rp(x.total)}</td><td>${x.kasir}</td></tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--muted)">Tidak ada data</td></tr>';
  $('rwCount').textContent = r.data.length;
  $('rwSum').textContent = rp(sum);
}
$('btnFilter').onclick = loadRiwayat;

/* ---------- AUTO LOGIN ---------- */
(function init() {
  const saved = localStorage.getItem('snackpos_user');
  if (saved) { CURRENT_USER = JSON.parse(saved); enterApp(); }
})();
