-- Jalankan di Supabase: SQL Editor > New query > paste > Run

create table if not exists pengaduan (
  id bigint generated always as identity primary key,
  kode text not null unique,
  nama text not null check (char_length(nama) between 1 and 100),
  kamar text not null check (char_length(kamar) between 1 and 10),
  kategori text not null check (char_length(kategori) <= 60),
  prioritas text not null default 'Sedang' check (prioritas in ('Rendah','Sedang','Tinggi')),
  isi text not null check (char_length(isi) between 1 and 2000),
  status text not null default 'Baru' check (status in ('Baru','Diproses','Selesai')),
  balasan text,
  waktu timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists pengaduan_waktu_idx on pengaduan (waktu);

-- daftar akun yang boleh jadi staf (akun dibuat di Authentication > Users)
create table if not exists staf (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table pengaduan enable row level security;
alter table staf enable row level security;

create or replace function is_staf() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staf where user_id = auth.uid())
$$;

-- staf: boleh baca/ubah/hapus semua pengaduan. Tamu (anon): TIDAK punya akses langsung ke tabel.
drop policy if exists staf_kelola on pengaduan;
create policy staf_kelola on pengaduan for all to authenticated
  using (is_staf()) with check (is_staf());
drop policy if exists staf_baca_diri on staf;
create policy staf_baca_diri on staf for select to authenticated using (user_id = auth.uid());

-- tamu mengirim pengaduan lewat fungsi ini
create or replace function buat_pengaduan(
  p_nama text, p_kamar text, p_kategori text, p_prioritas text, p_isi text
) returns text language plpgsql security definer set search_path = public as $$
declare v_kode text;
begin
  loop
    v_kode := 'ADU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from pengaduan where kode = v_kode);
  end loop;
  insert into pengaduan (kode, nama, kamar, kategori, prioritas, isi)
  values (v_kode, trim(p_nama), trim(p_kamar), p_kategori, p_prioritas, trim(p_isi));
  return v_kode;
end $$;

-- tamu mengecek status: hanya satu tiket, tanpa nama & nomor kamar
create or replace function cek_pengaduan(p_kode text)
returns table (kode text, kategori text, prioritas text, isi text, status text, balasan text, waktu timestamptz)
language sql security definer set search_path = public as $$
  select kode, kategori, prioritas, isi, status, balasan, waktu
  from pengaduan where kode = upper(trim(p_kode)) and deleted_at is null limit 1
$$;

grant execute on function buat_pengaduan(text,text,text,text,text) to anon, authenticated;
grant execute on function cek_pengaduan(text) to anon, authenticated;

-- SETELAH membuat akun staf di Authentication > Users, daftarkan emailnya:
-- insert into staf (user_id) select id from auth.users where email = 'email-staf@contoh.com';
