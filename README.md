# em_t_pc
# EM T PC

Rust + Tauri ve React ile hazırlanmış siber güvenlik eğitim uygulaması başlangıç arayüzü.

## Gereksinimler

- macOS (Apple Silicon desteklenir)
- Node.js 18+
- Rust (rustup ile)
- Tauri v2 için macOS geliştirme araçları

## Kurulum ve çalıştırma

```bash
npm install
npm run tauri dev
```

Tarayıcıdaki React arayüzünü tek başına görmek için:

```bash
npm run dev
```

## Giriş akışı

- **Öğrenci Girişi** şifre sormadan öğrenci görev panelini açar.
- **Admin Girişi** Rust tarafındaki `authenticate_admin` komutunu çağırır.
- Demo admin şifresi: `admin123`

## Gerçek terminal

Admin Dashboard içindeki **Gerçek Terminali Aç** düğmesi xterm.js terminalini açar.
Terminal `/bin/zsh -lc` üzerinden macOS komutlarını çalıştırır. `cd` dizin
değişikliğini terminal oturumunda korur. Uzun süren işlemler 30 saniye sonra
otomatik olarak durdurulur.

Örnekler:

```text
ls
whoami
ping -c 3 127.0.0.1
cd ~/Desktop
pwd
```

## Öğrenci görevleri ve bayrak olayı

Öğrenci panelinde görev terminali açılabilir. Rust komut çıktısında
`FLAG{` ile `}` arasında bir değer bulunursa `flag-found` Tauri olayı gönderilir:

```text
FLAG{ornek_bayrak}
```

Frontend `@tauri-apps/api/event` modülündeki `listen("flag-found", ...)`
dinleyicisi olayın `payload.flag` alanını alır ve tamamlandı bildirimini açar.

`src/App.jsx` ekran durumunu yönetir, `src/style.css` koyu temayı içerir ve
`src-tauri/src/lib.rs` Tauri komutlarını tanımlar. Demo şifre gerçek bir
üründe sabit tutulmamalı; hash'lenmiş ve güvenli bir kimlik doğrulama servisi
kullanılmalıdır.