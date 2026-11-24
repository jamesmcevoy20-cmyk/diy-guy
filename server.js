const path = require("path");
const crypto = require("crypto");
const express = require("express");
const compression = require("compression");
const cfg = require("./lib/config");
const store = require("./lib/db");
const telegram = require("./lib/telegram");
const { londonNow, addDays, weekday, isIsoDate } = require("./lib/time");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(compression());
app.use(express.json({ limit: "20kb" }));

app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://i.ytimg.com; " +
      "frame-src https://www.youtube-nocookie.com; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  });
  if (req.secure) res.set("Strict-Transport-Security", "max-age=15552000");
  next();
});

// Send www and the onrender.com address to the main domain once CANONICAL_REDIRECT=1 is set.
if (process.env.CANONICAL_REDIRECT === "1") {
  const canonicalHost = new URL(cfg.baseUrl).hostname;
  app.use((req, res, next) => {
    const host = (req.hostname || "").toLowerCase();
    if (host && host !== canonicalHost && host !== "localhost" && /^(GET|HEAD)$/.test(req.method)) {
      return res.redirect(301, cfg.baseUrl + req.originalUrl);
    }
    next();
  });
}

/* ---------- customer API ---------- */
app.get("/api/slots", async (req, res) => {
  try {
    const now = londonNow();
    res.set("Cache-Control", "no-store");
    res.json({
      today: now.date, nowMinutes: now.minutes,
      taken: await store.taken(now.date), closed: await store.closedDates(),
      rules: {
        durations: cfg.durations, openHour: cfg.openHour, closeHour: cfg.closeHour,
        openDays: cfg.openDays, daysAhead: cfg.daysAhead, minNoticeMinutes: cfg.minNoticeMinutes
      },
      services: cfg.services
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load availability." });
  }
});

// Simple per-IP limit on booking attempts: 12 per hour.
const attempts = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  list.push(now);
  attempts.set(ip, list);
  return list.length > 12;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of attempts) if (!v.some((t) => now - t < 3600 * 1000)) attempts.delete(k); }, 600000).unref();

const clean = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) : "");

function validateBooking(body, closed) {
  const f = {};
  const svc = cfg.services.find((s) => s.id === body.service);
  const hours = Number(body.hours);
  const start = Number(body.start);
  if (!svc) f.service = "Choose a service.";
  const fixed = svc && svc.slots;
  if (fixed) {
    if (!fixed.some((s) => s[0] === start && s[1] === hours)) f.start = "Choose one of the time slots.";
  } else if (!cfg.durations.includes(hours)) f.hours = "Choose one or two hours.";

  const now = londonNow();
  const date = typeof body.date === "string" ? body.date : "";
  if (!isIsoDate(date) || date < now.date || date > addDays(now.date, cfg.daysAhead - 1)) f.date = "Choose a date in the next four weeks.";
  else if (!cfg.openDays.includes(weekday(date))) f.date = "I am not available on that day.";
  else if (closed.includes(date)) f.date = "I am away on that day. Pick another date.";

  if (!Number.isInteger(start) || start < cfg.openHour || start + hours > cfg.closeHour) f.start = "Choose a start time.";
  else if (!f.start && !f.date && date === now.date && start * 60 - now.minutes < cfg.minNoticeMinutes) f.start = "That time is too soon. Pick a later one.";

  const name = clean(body.name, 100);
  const phone = clean(body.phone, 30);
  const email = clean(body.email, 200);
  const address = clean(body.address, 200);
  const postcode = clean(body.postcode, 10).toUpperCase();
  const notes = clean(body.notes, 1000);
  const digits = phone.replace(/[^\d]/g, "");
  if (name.length < 2) f.name = "Enter your full name.";
  if (digits.length < 10 || digits.length > 13 || /[^\d\s+()-]/.test(phone)) f.phone = "Enter a phone number I can reach you on.";
  if (email && !/^\S+@\S+\.\S+$/.test(email)) f.email = "That email address looks incomplete.";
  if (address.length < 5) f.addr = "Enter the house number and street.";
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(postcode)) f.pc = "Enter a full UK postcode.";

  return { fields: f, svc, hours, start, date, name, phone, email, address, postcode, notes };
}

function newRef() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[crypto.randomInt(chars.length)];
  return "DG-" + s;
}

app.post("/api/bookings", async (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ error: "Too many attempts." });
  const body = req.body || {};

  // Hidden field only bots fill in. Pretend it worked.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return res.status(201).json({ booking: { ref: newRef(), service_name: "", date: body.date || "", start: 9, hours: 1, price: 0 } });
  }

  let closed = [];
  try { closed = await store.closedDates(); } catch (e) { console.error(e); return res.status(500).json({ error: "Could not save." }); }
  const v = validateBooking(body, closed);
  if (Object.keys(v.fields).length) return res.status(400).json({ error: "Check the highlighted fields.", fields: v.fields });

  const booking = {
    ref: newRef(), service: v.svc.id, service_name: v.svc.name, date: v.date, start: v.start, hours: v.hours,
    name: v.name, phone: v.phone, email: v.email, address: v.address, postcode: v.postcode, notes: v.notes,
    status: "new", price: v.svc.rate ? v.svc.rate * v.hours : 0, created: new Date().toISOString()
  };

  try {
    await store.create(booking);
  } catch (e) {
    if (e.code === "taken") return res.status(409).json({ error: "That time has just been booked. Pick another." });
    if (e.code === "23505") { // reference clash: very unlikely, retry once
      booking.ref = newRef();
      try { await store.create(booking); } catch (e2) { console.error(e2); return res.status(500).json({ error: "Could not save." }); }
    } else {
      console.error(e);
      return res.status(500).json({ error: "Could not save." });
    }
  }

  telegram.notify(booking); // not awaited: the customer should not wait on Telegram
  res.status(201).json({ booking });
});

/* ---------- owner pages (password protected) ---------- */
const failures = new Map(); // ip -> { n, until }
setInterval(() => { const t = Date.now(); for (const [k, v] of failures) if (v.until < t && v.n < 8) failures.delete(k); }, 10 * 60 * 1000).unref();
function adminAuth(req, res, next) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return res.status(503).type("text/plain").send("Admin is switched off. Set ADMIN_PASSWORD to turn it on.");
  const f = failures.get(req.ip);
  if (f && f.n >= 8 && f.until > Date.now()) return res.status(429).type("text/plain").send("Too many wrong passwords. Try again in 15 minutes.");
  const header = req.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const given = Buffer.from(encoded, "base64").toString("utf8");
    const supplied = given.slice(given.indexOf(":") + 1);
    const a = crypto.createHash("sha256").update(supplied).digest();
    const b = crypto.createHash("sha256").update(pw).digest();
    if (crypto.timingSafeEqual(a, b)) { failures.delete(req.ip); return next(); }
    const cur = failures.get(req.ip);
    const n = cur && cur.until > Date.now() ? cur.n + 1 : 1;
    failures.set(req.ip, { n, until: Date.now() + 15 * 60 * 1000 });
  }
  res.set("WWW-Authenticate", 'Basic realm="Bookings"').status(401).send("Sign in required.");
}

const adminFiles = path.join(__dirname, "admin");
app.get("/admin", adminAuth, (req, res) => res.sendFile(path.join(adminFiles, "admin.html")));
app.get("/admin.js", adminAuth, (req, res) => res.sendFile(path.join(adminFiles, "admin.js")));

app.get("/api/admin/bookings", adminAuth, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ today: londonNow().date, bookings: await store.list(), closed: await store.closedDates() });
  } catch (e) { console.error(e); res.status(500).json({ error: "Could not load." }); }
});

app.patch("/api/admin/bookings/:ref", adminAuth, async (req, res) => {
  const status = req.body && req.body.status;
  if (!["new", "confirmed", "done", "cancelled"].includes(status)) return res.status(400).json({ error: "Bad status." });
  try {
    const ok = await store.setStatus(req.params.ref, status);
    if (!ok) return res.status(404).json({ error: "Not found." });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === "taken") return res.status(409).json({ error: "That time is taken by another booking." });
    console.error(e);
    res.status(500).json({ error: "Could not update." });
  }
});

app.post("/api/admin/closed", adminAuth, async (req, res) => {
  const date = req.body && req.body.date;
  if (!isIsoDate(date)) return res.status(400).json({ error: "Bad date." });
  try { await store.closeDate(date); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: "Could not save." }); }
});
app.delete("/api/admin/closed/:date", adminAuth, async (req, res) => {
  if (!isIsoDate(req.params.date)) return res.status(400).json({ error: "Bad date." });
  try { await store.openDate(req.params.date); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: "Could not save." }); }
});

/* ---------- site ---------- */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/robots.txt", (req, res) => res.type("text/plain").send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${cfg.baseUrl}/sitemap.xml\n`));
app.get("/sitemap.xml", (req, res) => res.type("application/xml").send(
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${cfg.baseUrl}/</loc></url>\n</urlset>\n`));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "5m", index: false, setHeaders: (res, f) => { if (/\.(css|js)$/.test(f)) res.set("Cache-Control", "no-cache"); } }));
app.use((req, res) => res.status(404).type("html").send(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | ${cfg.name}</title><p style="font-family:system-ui;padding:24px">That page does not exist. <a href="/">Back to DIY Guy</a> or phone ${cfg.phoneDisplay}.</p>`));

app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") return res.status(400).json({ error: "Bad request." });
  if (err && err.type === "entity.too.large") return res.status(413).json({ error: "Too large." });
  console.error(err && err.message);
  res.status(500).type("text/plain").send("Something went wrong.");
});

const port = process.env.PORT || 3000;
store.init().then(() => {
  app.listen(port, () => console.log(`${cfg.name} on port ${port} (storage: ${store.kind})`));
}).catch((e) => { console.error("Could not start storage:", e); process.exit(1); });
