const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = process.env.DB_PATH || path.join(__dirname, "hakim.sqlite");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: path.dirname(dbPath) }),
  secret: process.env.SESSION_SECRET || "change-this-secret-before-deployment",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
const clean = (s) => String(s || "").trim();

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare("SELECT id, display_name, email FROM users WHERE id = ?").get(req.session.userId);
  res.json({ user: user || null });
});

app.post("/api/register", authLimiter, async (req, res) => {
  const name = clean(req.body.name);
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2 || name.length > 50) return res.status(400).json({ error: "الاسم يجب أن يكون بين حرفين و50 حرفاً." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "أدخل بريداً إلكترونياً صحيحاً." });
  if (password.length < 10 || password.length > 200) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 10 أحرف على الأقل." });

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare("INSERT INTO users (display_name, email, password_hash) VALUES (?, ?, ?)").run(name, email, hash);
    req.session.userId = Number(result.lastInsertRowid);
    res.json({ ok: true });
  } catch (e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({ error: "هذا البريد مسجل بالفعل." });
    res.status(500).json({ error: "حدث خطأ. حاول مرة أخرى." });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
  }
  req.session.userId = user.id;
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/posts", (req, res) => {
  const posts = db.prepare(`
    SELECT posts.id, posts.body, posts.created_at, users.display_name
    FROM posts JOIN users ON users.id = posts.user_id
    ORDER BY posts.id DESC LIMIT 50
  `).all();
  res.json({ posts });
});

app.post("/api/posts", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "سجّل الدخول أولاً." });
  const body = clean(req.body.body);
  if (!body || body.length > 1000) return res.status(400).json({ error: "اكتب منشوراً لا يتجاوز 1000 حرف." });
  db.prepare("INSERT INTO posts (user_id, body) VALUES (?, ?)").run(req.session.userId, body);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`HAKIM is running on port ${PORT}`));
