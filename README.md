# Hotel Bahari - Pengaduan & Layanan Tamu (HTML + Supabase)

## 1. Siapkan Supabase
1. Buat project di supabase.com.
2. SQL Editor > New query > tempel isi `database/schema.sql` > Run.
3. Authentication > Users > Add user (email + kata sandi, centang Auto Confirm).
4. Daftarkan akun itu sebagai staf (SQL Editor):
   `insert into staf (user_id) select id from auth.users where email = 'email-staf@contoh.com';`
5. Authentication > Sign In / Providers > matikan "Allow new users to sign up".
6. Project Settings > API: salin Project URL dan kunci **anon/publishable**.

## 2. Isi config.js
Tempel URL dan anon key. Jangan pernah memakai kunci service_role/secret.

## 3. Deploy ke GitHub Pages
Unggah semua file ke repository publik (index.html di root), lalu Settings > Pages >
Deploy from a branch > main > / (root).
