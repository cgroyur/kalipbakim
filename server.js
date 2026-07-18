"use strict";
const express    = require("express");
const Database   = require("better-sqlite3");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const path       = require("path");
const fs         = require("fs");
const compression = require("compression");

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "cmms-v15-change-me-in-production";

// ── Render.com'da /data kalıcı disk mount noktası olarak kullanılır ──
// Render Free plan'da disk yok → /tmp kullanır (restart'ta sıfırlanır)
// Render Paid plan'da persistent disk ekleyip DB_PATH=/data/cmms.db yapın
const DB_DIR  = process.env.DB_DIR  || path.join(__dirname, "data");
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, "cmms.db");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ── VERİTABANI ──
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    role         TEXT NOT NULL CHECK(role IN('admin','leader','tech','op')),
    username     TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    active       INTEGER DEFAULT 1,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_state (
    id         INTEGER PRIMARY KEY CHECK(id=1),
    data       TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,
    user_id     TEXT,
    user_name   TEXT,
    role        TEXT,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   TEXT,
    detail      TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// İlk kurulum — admin yoksa demo kullanıcılar oluştur
const adminExists = db.prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").get();
if (!adminExists) {
  const ins = db.prepare(
    "INSERT OR IGNORE INTO users(id,name,role,username,password_hash) VALUES(?,?,?,?,?)"
  );
  const seed = [
    ["U001","Admin Yönetici","admin",  "admin",   "admin123"],
    ["U002","Mehmet Lider",  "leader", "leader1", "1234"],
    ["U003","Ali Teknisyen", "tech",   "tech1",   "1234"],
    ["U004","Veli Teknisyen","tech",   "tech2",   "1234"],
    ["U005","Kemal Tekn.",   "tech",   "tech3",   "1234"],
    ["U006","Hasan Operatör","op",     "op1",     "1234"],
    ["U007","İbrahim Oper.", "op",     "op2",     "1234"],
  ];
  seed.forEach(([id,name,role,uname,pass]) =>
    ins.run(id,name,role,uname,bcrypt.hashSync(pass,10))
  );
  console.log("✅ Demo kullanıcılar oluşturuldu");
  console.log("   Admin: admin / admin123");
}

// ── MIDDLEWARE ──
app.use(compression());
app.use(express.json({ limit: "25mb" }));   // Büyük state payload'ları için
app.use(express.urlencoded({ extended: false }));

// Güvenlik başlıkları
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// ── JWT MIDDLEWARE ──
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Token gerekli" });
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Geçersiz veya süresi dolmuş token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Sadece admin" });
  next();
}

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

// POST /api/login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Eksik bilgi" });

  const u = db.prepare("SELECT * FROM users WHERE username=? AND active=1").get(username);
  if (!u || !bcrypt.compareSync(password, u.password_hash))
    return res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı" });

  const token = jwt.sign(
    { id: u.id, username: u.username, role: u.role, name: u.name },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  // Giriş audit log
  db.prepare(
    "INSERT INTO audit_log(ts,user_id,user_name,role,action,entity_type,detail) VALUES(datetime('now'),?,?,?,'Giriş','auth',?)"
  ).run(u.id, u.name, u.role, `${u.name} sisteme giriş yaptı`);

  res.json({ token, user: { id:u.id, name:u.name, role:u.role, username:u.username } });
});

// POST /api/logout
app.post("/api/logout", auth, (req, res) => {
  db.prepare(
    "INSERT INTO audit_log(ts,user_id,user_name,role,action,entity_type,detail) VALUES(datetime('now'),?,?,?,'Çıkış','auth',?)"
  ).run(req.user.id, req.user.name, req.user.role, `${req.user.name} çıkış yaptı`);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// STATE SYNC — tüm uygulama verisi
// ─────────────────────────────────────────────

// GET /api/state
app.get("/api/state", auth, (req, res) => {
  const row = db.prepare("SELECT data FROM app_state WHERE id=1").get();
  if (!row) return res.json(null);
  try {
    const state = JSON.parse(row.data);
    // Kullanıcı listesini her zaman DB'den al (şifreler frontend'e gitmesin)
    const users = db.prepare("SELECT id,name,role,username FROM users WHERE active=1").all();
    // Frontend beklediği format: {user, pass} → pass kısmını boş bırak
    state.users = users.map(u => ({ ...u, user: u.username, pass: "" }));
    res.json(state);
  } catch {
    res.json(null);
  }
});

// POST /api/state — uygulama verisini kaydet
app.post("/api/state", auth, (req, res) => {
  const state = req.body;
  if (!state || typeof state !== "object") return res.status(400).json({ error: "Geçersiz veri" });

  // Kullanıcıları state'ten çıkar — DB'de tutuluyor
  delete state.users;

  const json = JSON.stringify(state);
  db.prepare(`
    INSERT INTO app_state(id,data,updated_at) VALUES(1,?,datetime('now'))
    ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
  `).run(json);

  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// KULLANICI YÖNETİMİ
// ─────────────────────────────────────────────

// GET /api/users
app.get("/api/users", auth, adminOnly, (req, res) => {
  const users = db.prepare("SELECT id,name,role,username,active,created_at FROM users").all();
  res.json(users);
});

// POST /api/users
app.post("/api/users", auth, adminOnly, (req, res) => {
  const { id, name, role, username, password } = req.body;
  if (!id || !name || !role || !username || !password)
    return res.status(400).json({ error: "Tüm alanlar zorunlu" });
  try {
    db.prepare("INSERT INTO users(id,name,role,username,password_hash) VALUES(?,?,?,?,?)")
      .run(id, name, role, username, bcrypt.hashSync(password, 10));
    db.prepare("INSERT INTO audit_log(ts,user_id,user_name,role,action,entity_type,entity_id,detail) VALUES(datetime('now'),?,?,?,'Kullanıcı Eklendi','user',?,?)")
      .run(req.user.id, req.user.name, req.user.role, id, `${name} (${role}) eklendi`);
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes("UNIQUE")) return res.status(400).json({ error: "Bu kullanıcı adı zaten kullanılıyor" });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/users/:id
app.put("/api/users/:id", auth, adminOnly, (req, res) => {
  const { name, role, username, password } = req.body;
  if (password) {
    db.prepare("UPDATE users SET name=?,role=?,username=?,password_hash=? WHERE id=?")
      .run(name, role, username, bcrypt.hashSync(password,10), req.params.id);
  } else {
    db.prepare("UPDATE users SET name=?,role=?,username=? WHERE id=?")
      .run(name, role, username, req.params.id);
  }
  db.prepare("INSERT INTO audit_log(ts,user_id,user_name,role,action,entity_type,entity_id,detail) VALUES(datetime('now'),?,?,?,'Kullanıcı Düzenlendi','user',?,?)")
    .run(req.user.id, req.user.name, req.user.role, req.params.id, `${name} güncellendi`);
  res.json({ ok: true });
});

// DELETE /api/users/:id
app.delete("/api/users/:id", auth, adminOnly, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "Kendinizi silemezsiniz" });
  db.prepare("UPDATE users SET active=0 WHERE id=?").run(req.params.id);
  db.prepare("INSERT INTO audit_log(ts,user_id,user_name,role,action,entity_type,entity_id,detail) VALUES(datetime('now'),?,?,?,'Kullanıcı Silindi','user',?,?)")
    .run(req.user.id, req.user.name, req.user.role, req.params.id, "Kullanıcı pasif yapıldı");
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// AUDİT LOG
// ─────────────────────────────────────────────

// POST /api/audit — frontend'den log gönder
app.post("/api/audit", auth, (req, res) => {
  const { action, entity_type, entity_id, detail } = req.body;
  if (!action) return res.status(400).json({ error: "action zorunlu" });
  db.prepare("INSERT INTO audit_log(ts,user_id,user_name,role,action,entity_type,entity_id,detail) VALUES(datetime('now'),?,?,?,?,?,?,?)")
    .run(req.user.id, req.user.name, req.user.role, action, entity_type||null, entity_id||null, detail||null);
  res.json({ ok: true });
});

// GET /api/audit
app.get("/api/audit", auth, adminOnly, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || "200"), 1000);
  const offset = parseInt(req.query.offset || "0");
  const rows = db.prepare(
    "SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?"
  ).all(limit, offset);
  const total = db.prepare("SELECT COUNT(*) AS c FROM audit_log").get().c;
  res.json({ rows, total, limit, offset });
});

// ─────────────────────────────────────────────
// SİSTEM OPERASYONLARI (Admin)
// ─────────────────────────────────────────────

// POST /api/system/reset — state sıfırla
app.post("/api/system/reset", auth, adminOnly, (req, res) => {
  const { type } = req.body;
  const valid = ["wos","pm_counters","auditlog","full"];
  if (!valid.includes(type)) return res.status(400).json({ error: "Geçersiz tür" });

  if (type === "auditlog") {
    db.prepare("DELETE FROM audit_log").run();
  } else {
    // state içinde sıfırlama — frontend gönderir, biz saklarız
    // Bu endpoint sadece audit_log için DB operasyonu yapar
    // Diğerleri frontend tarafından state ile POST /api/state'e gelir
  }

  db.prepare("INSERT INTO audit_log(ts,user_id,user_name,role,action,entity_type,detail) VALUES(datetime('now'),?,?,?,'Sistem Sıfırlama','system',?)")
    .run(req.user.id, req.user.name, req.user.role, `${type} sıfırlandı`);

  res.json({ ok: true });
});

// GET /api/health — Render health check
app.get("/api/health", (req, res) => res.json({ status:"ok", version:"15.0.0" }));

// GET /api/system/info
app.get("/api/system/info", auth, adminOnly, (req, res) => {
  const dbStat = fs.statSync(DB_PATH);
  const woCount    = (() => { try { const r = JSON.parse(db.prepare("SELECT data FROM app_state WHERE id=1").get()?.data||"{}"); return (r.wos||[]).length; } catch{return 0;} })();
  const moldCount  = (() => { try { const r = JSON.parse(db.prepare("SELECT data FROM app_state WHERE id=1").get()?.data||"{}"); return (r.molds||[]).length; } catch{return 0;} })();
  const auditCount = db.prepare("SELECT COUNT(*) AS c FROM audit_log").get().c;
  const userCount  = db.prepare("SELECT COUNT(*) AS c FROM users WHERE active=1").get().c;
  res.json({
    db_size_kb: Math.round(dbStat.size / 1024),
    db_path: DB_PATH,
    wos: woCount,
    molds: moldCount,
    audit_entries: auditCount,
    active_users: userCount,
    node_version: process.version,
    uptime_sec: Math.round(process.uptime()),
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});

// ─────────────────────────────────────────────
// STATİK DOSYALAR + SPA
// ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1d",
  setHeaders(res, fp) {
    if (fp.endsWith(".html")) res.setHeader("Cache-Control", "no-cache, must-revalidate");
  }
}));

app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

// ─────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`CMMS v15 → http://0.0.0.0:${PORT}`);
  console.log(`DB       → ${DB_PATH} (${Math.round(fs.statSync(DB_PATH).size/1024)} KB)`);
});
