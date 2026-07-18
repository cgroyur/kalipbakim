# CMMS v15 — Kalıp Bakım Yönetim Sistemi

Enjeksiyon kalıp atölyeleri için web tabanlı bakım yönetim sistemi.

## Render.com Deployment — Adım Adım

### 1. GitHub'a Yükle

```bash
git init
git add .
git commit -m "CMMS v15 initial"
git remote add origin https://github.com/KULLANICI/cmms-v15.git
git push -u origin main
```

### 2. Render.com'da Servis Oluştur

1. [render.com](https://render.com) → **New** → **Web Service**
2. GitHub reponuzu bağlayın
3. Ayarlar:
   - **Name:** `cmms-kalip-bakim`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free` (başlangıç için yeterli)
4. **Create Web Service** butonuna tıklayın
5. Deployment otomatik başlar (~2 dakika)
6. Verilen URL ile sisteme erişin

### Demo Giriş Bilgileri

| Kullanıcı Adı | Şifre | Rol |
|---|---|---|
| admin | 1234 | Admin |
| leader1 | 1234 | Lider |
| tech1 | 1234 | Teknisyen |
| tech2 | 1234 | Teknisyen |
| tech3 | 1234 | Teknisyen |
| op1 | 1234 | Operatör |
| op2 | 1234 | Operatör |

## Teknik Bilgiler

- **Frontend:** React 18 (CDN), pre-compiled JS
- **Backend:** Express.js (statik dosya sunucusu)
- **Veri saklama:** localStorage (tarayıcı bazlı)
- **Bağımlılık:** Sadece `express`

## Önemli Not

Sistem localStorage kullandığı için her kullanıcı kendi tarayıcısında bağımsız veri görür.
Çok kullanıcılı gerçek ortam için backend + veritabanı entegrasyonu gerekir.

## Güncelleme

`public/index.html` dosyasını yeni versiyonla değiştirip GitHub'a push edin.
Render otomatik yeniden deploy eder.
