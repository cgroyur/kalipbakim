const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Güvenlik başlıkları ──
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Statik dosyalar ──
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',            // HTML: 1 saat cache (güncelleme için kısa)
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // HTML dosyası her zaman güncel kalsın
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

// ── Tüm rotalar index.html'e yönlensin (SPA) ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Sunucuyu başlat ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`CMMS v15 çalışıyor: http://0.0.0.0:${PORT}`);
  console.log(`Ortam: ${process.env.NODE_ENV || 'development'}`);
});
