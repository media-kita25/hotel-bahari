/* Lapisan data Supabase (menggantikan localStorage). Antarmuka sama: Api.handle(api, action, params) */
const Api = (() => {
  const cfg = window.SUPABASE_CONFIG || {};
  const siap = !!(cfg.url && cfg.anonKey && !String(cfg.url).includes('GANTI'));
  const sb = siap ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
  const err = m => ({ok: false, error: m});
  const ORD = {Tinggi: 0, Sedang: 1, Rendah: 2};
  const bln = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const count = (a, f) => a.filter(f).length;
  const sesi = async () => (await sb.auth.getSession()).data.session;
  const stafOk = async () => { if (!(await sesi())) return false; const {data} = await sb.from('staf').select('user_id').maybeSingle(); return !!data; };
  async function semua() {
    const {data, error} = await sb.from('pengaduan').select('*').is('deleted_at', null).order('waktu', {ascending: false}).limit(5000);
    if (error) throw error; return data;
  }
  const sum = x => ({total: x.length, baru: count(x, d => d.status === 'Baru'), diproses: count(x, d => d.status === 'Diproses'), selesai: count(x, d => d.status === 'Selesai'), tinggi: count(x, d => d.prioritas === 'Tinggi'), sedang: count(x, d => d.prioritas === 'Sedang'), rendah: count(x, d => d.prioritas === 'Rendah')});

  async function handle(api, action, p = {}) {
    if (!siap) return err('Supabase belum dikonfigurasi. Isi config.js terlebih dahulu.');
    try { return await jalan(api, action, p); }
    catch (e) { console.error(e); return err('Gagal terhubung ke database. Coba lagi.'); }
  }
  async function jalan(api, action, p) {
    if (api === 'auth') {
      if (action === 'login') {
        const {error} = await sb.auth.signInWithPassword({email: p.username, password: p.pin});
        if (error) return err('Email atau kata sandi salah');
        if (!(await stafOk())) { await sb.auth.signOut(); return err('Akun ini belum terdaftar sebagai staf'); }
        return {ok: true};
      }
      if (action === 'logout') { await sb.auth.signOut(); return {ok: true}; }
      return (await stafOk()) ? {ok: true} : err('Belum login');
    }
    if (api === 'pengaduan' && action === 'kirim') {
      const nama = (p.nama || '').trim(), kamar = (p.kamar || '').trim(), isi = (p.isi || '').trim();
      if (!nama || !kamar || !isi) return err('Isi nama, nomor kamar, dan detail pengaduan.');
      if (nama.length > 100 || kamar.length > 10 || isi.length > 2000) return err('Teks terlalu panjang');
      const {data, error} = await sb.rpc('buat_pengaduan', {p_nama: nama, p_kamar: kamar, p_kategori: p.kategori, p_prioritas: p.prioritas, p_isi: isi});
      if (error) { console.error(error); return err('Pengaduan gagal dikirim. Periksa isian Anda.'); }
      return {ok: true, kode: data};
    }
    if (api === 'pengaduan' && action === 'cek') {
      const {data, error} = await sb.rpc('cek_pengaduan', {p_kode: String(p.kode || '')});
      if (error) throw error;
      return data && data.length ? {ok: true, data: data[0]} : err('Tiket tidak ditemukan');
    }
    if (!(await sesi())) return err('Silakan login terlebih dahulu');
    if (api === 'pengaduan') {
      if (action === 'stats') { const s = sum(await semua()); return {ok: true, data: s}; }
      if (action === 'list') {
        const q = (p.q || '').toLowerCase();
        const r = (await semua()).filter(d => (!p.status || d.status === p.status) && (!p.prioritas || d.prioritas === p.prioritas) &&
          (!q || [d.nama, d.kamar, d.kode].some(x => String(x).toLowerCase().includes(q))))
          .sort((x, y) => ORD[x.prioritas] - ORD[y.prioritas] || new Date(y.waktu) - new Date(x.waktu));
        return {ok: true, data: r};
      }
      if (action === 'update') {
        if (!['Baru', 'Diproses', 'Selesai'].includes(p.status)) return err('Status tidak valid');
        const patch = {status: p.status}; if ((p.balasan || '').trim()) patch.balasan = p.balasan.trim();
        const {data, error} = await sb.from('pengaduan').update(patch).eq('kode', String(p.kode).toUpperCase()).is('deleted_at', null).select('kode');
        if (error) throw error;
        return data.length ? {ok: true} : err('Tiket tidak ditemukan atau tidak ada izin');
      }
      if (action === 'hapus') {
        const {error} = await sb.from('pengaduan').update({deleted_at: new Date().toISOString()}).eq('kode', String(p.kode).toUpperCase()).is('deleted_at', null);
        if (error) throw error; return {ok: true};
      }
      if (action === 'hapus_selesai') {
        const {data, error} = await sb.from('pengaduan').update({deleted_at: new Date().toISOString()}).eq('status', 'Selesai').is('deleted_at', null).select('kode');
        if (error) throw error; return {ok: true, terhapus: data.length};
      }
    }
    if (api === 'rekap') {
      const a = await semua(), b = p.bulan || bln(Date.now()), m = a.filter(d => bln(d.waktu) === b);
      if (action === 'ringkasan') return {ok: true, data: sum(m)};
      if (action === 'kategori') { const c = {}; m.forEach(d => c[d.kategori] = (c[d.kategori] || 0) + 1); return {ok: true, data: Object.entries(c).map(([kategori, jumlah]) => ({kategori, jumlah})).sort((x, y) => y.jumlah - x.jumlah)}; }
      if (action === 'prioritas') { const c = {}; m.forEach(d => c[d.prioritas] = (c[d.prioritas] || 0) + 1); return {ok: true, data: Object.entries(c).map(([prioritas, jumlah]) => ({prioritas, jumlah}))}; }
      if (action === 'tabel12') {
        const n = new Date(), awal = new Date(n.getFullYear(), n.getMonth() - 11, 1), g = {};
        a.filter(d => new Date(d.waktu) >= awal).forEach(d => (g[bln(d.waktu)] = g[bln(d.waktu)] || []).push(d));
        return {ok: true, data: Object.keys(g).sort().reverse().map(k => ({bulan: k, ...sum(g[k])}))};
      }
    }
    return err('Action tidak dikenal');
  }

  async function exportCSV(b) {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = (await semua()).filter(d => bln(d.waktu) === b).sort((x, y) => new Date(x.waktu) - new Date(y.waktu));
    const head = ['Kode', 'Nama', 'Kamar', 'Kategori', 'Prioritas', 'Status', 'Isi', 'Balasan', 'Waktu'];
    const csv = '\uFEFF' + [head.map(q).join(',')].concat(rows.map(d => [d.kode, d.nama, d.kamar, d.kategori, d.prioritas, d.status, d.isi, d.balasan, d.waktu].map(q).join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
    a.download = 'rekap-aduan-' + b + '.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
  function subscribe(cb) {   // notifikasi realtime saat ada pengaduan baru
    if (!sb) return null;
    return sb.channel('aduan-baru').on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'pengaduan'}, p => cb(p.new)).subscribe();
  }
  return {handle, exportCSV, subscribe};
})();
