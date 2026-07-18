# CMMS v15 — Kalıp Bakım Yönetim Sistemi
## Çok Kullanıcılı, Render.com Deployment

---

## Proje Yapısı

```
cmms-render/
├── server.js          ← Express + SQLite backend
├── package.json
├── render.yaml        ← Render.com konfigürasyonu
├── .gitignore
└── public/
    └── index.html     ← React frontend (tek dosya)
```

---

## GitHub → Render Deploy Adımları

### 1. GitHub'a yükle
```bash
cd cmms-render
git init
git add .
git commit -m "CMMS v15 initial deploy"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADI/cmms-v15.git
git push -u origin main
```

### 2. Render.com'da servis oluştur
1. [render.com](https://render.com) → New → **Web Service**
2. GitHub reposunu seç
3. Ayarlar otomatik algılanır (render.yaml'dan)
4. **Environment Variables** bölümünde `JWT_SECRET` otomatik üretilir
5. **Create Web Service** tıkla → ~3 dakika

### 3. Persistent Disk (Önemli!)
render.yaml içinde `disk` tanımlı:
- Mount path: `/data`
- DB burada saklanır, restart'larda kaybolmaz
- Disk ücreti: ~$0.25/GB/ay (1 GB = $0.25/ay)

---

## Giriş Bilgileri (İlk Kurulum)

| Kullanıcı | Şifre | Rol |
|---|---|---|
| admin | **admin123** | Admin |
| leader1 | 1234 | Lider |
| tech1 | 1234 | Teknisyen |
| tech2 | 1234 | Teknisyen |
| tech3 | 1234 | Teknisyen |
| op1 | 1234 | Operatör |
| op2 | 1234 | Operatör |

> **İlk girişte admin şifresini değiştirin:** Admin → Kullanıcılar → admin → Düzenle

---

## Veri Saklama

| Nerede | Ne |
|---|---|
| SQLite DB (`/data/cmms.db`) | Kullanıcılar, tüm uygulama verisi, audit log |
| localStorage (tarayıcı) | JWT token, küçük meta cache |

localStorage artık **sınır sorunu yok** — tüm veri sunucuda.

---

## Güvenlik Notları

- JWT token 12 saat geçerli
- Şifreler bcrypt ile hash'leniyor (10 round)
- `JWT_SECRET` Render'da otomatik üretilir
- Admin şifresini ilk girişte değiştirin
- HTTPS Render tarafından otomatik sağlanır

---

## Güncelleme

```bash
# Değişiklik yapın, sonra:
git add .
git commit -m "güncelleme açıklaması"
git push
# Render otomatik yeniden deploy eder
```
