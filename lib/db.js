// Storage for bookings. Uses Postgres when DATABASE_URL is set (on Render),
// otherwise keeps bookings in memory so the site can be tried on a laptop.
// Tables are prefixed diy_ so this can safely share a database with another site.
// A booking blocks the hours from start to start+hours. Bookings may not overlap.

const COLS = ["ref", "service", "service_name", "date", "start", "hours", "name", "phone", "email",
  "address", "postcode", "notes", "status", "price", "created"];

const overlaps = (a, b) => a.date === b.date && a.start < b.start + b.hours && b.start < a.start + a.hours;
const takenErr = () => { const e = new Error("taken"); e.code = "taken"; return e; };

function memoryStore() {
  const rows = [];
  const closed = new Set();
  const live = (r) => r.status !== "cancelled";
  const clash = (b, exceptRef) => rows.some((r) => live(r) && r.ref !== exceptRef && overlaps(r, b));
  return {
    kind: "memory",
    async init() {},
    async taken(fromDate) {
      return rows.filter((r) => live(r) && r.date >= fromDate).map((r) => ({ date: r.date, start: r.start, hours: r.hours }));
    },
    async create(b) {
      if (clash(b)) throw takenErr();
      rows.push({ ...b });
    },
    async list() {
      return rows.slice().sort((a, b) => (a.date + String(a.start).padStart(2, "0")).localeCompare(b.date + String(b.start).padStart(2, "0"))).map((r) => ({ ...r }));
    },
    async setStatus(ref, status) {
      const r = rows.find((x) => x.ref === ref);
      if (!r) return false;
      if (status !== "cancelled" && clash(r, ref)) throw takenErr();
      r.status = status;
      return true;
    },
    async closedDates() { return [...closed].sort(); },
    async closeDate(d) { closed.add(d); },
    async openDate(d) { closed.delete(d); }
  };
}

function postgresStore(url) {
  const { Pool } = require("pg");
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
  const toRow = (r) => ({ ...r, created: r.created instanceof Date ? r.created.toISOString() : r.created });
  return {
    kind: "postgres",
    async init() {
      await pool.query("CREATE TABLE IF NOT EXISTS diy_closed_dates (date TEXT PRIMARY KEY)");
      await pool.query(`
        CREATE TABLE IF NOT EXISTS diy_bookings (
          ref TEXT PRIMARY KEY,
          service TEXT NOT NULL,
          service_name TEXT NOT NULL,
          date TEXT NOT NULL,
          start INTEGER NOT NULL,
          hours INTEGER NOT NULL,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL,
          postcode TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'new',
          price INTEGER NOT NULL,
          created TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
    },
    async taken(fromDate) {
      const { rows } = await pool.query(
        "SELECT date, start, hours FROM diy_bookings WHERE status <> 'cancelled' AND date >= $1", [fromDate]);
      return rows;
    },
    async create(b) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(918273)");
        const { rows } = await c.query(
          "SELECT 1 FROM diy_bookings WHERE status <> 'cancelled' AND date = $1 AND start < $2 AND $3 < start + hours",
          [b.date, b.start + b.hours, b.start]);
        if (rows.length) { await c.query("ROLLBACK"); throw takenErr(); }
        await c.query(
          `INSERT INTO diy_bookings (${COLS.join(",")}) VALUES (${COLS.map((_, i) => "$" + (i + 1)).join(",")})`,
          COLS.map((k) => b[k]));
        await c.query("COMMIT");
      } catch (e) {
        if (e.code !== "taken") { try { await c.query("ROLLBACK"); } catch (_) { /* ignore */ } }
        throw e;
      } finally { c.release(); }
    },
    async list() {
      const { rows } = await pool.query("SELECT * FROM diy_bookings ORDER BY date, start");
      return rows.map(toRow);
    },
    async setStatus(ref, status) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(918273)");
        const cur = (await c.query("SELECT * FROM diy_bookings WHERE ref = $1", [ref])).rows[0];
        if (!cur) { await c.query("ROLLBACK"); return false; }
        if (status !== "cancelled") {
          const { rows } = await c.query(
            "SELECT 1 FROM diy_bookings WHERE status <> 'cancelled' AND ref <> $1 AND date = $2 AND start < $3 AND $4 < start + hours",
            [ref, cur.date, cur.start + cur.hours, cur.start]);
          if (rows.length) { await c.query("ROLLBACK"); throw takenErr(); }
        }
        await c.query("UPDATE diy_bookings SET status = $1 WHERE ref = $2", [status, ref]);
        await c.query("COMMIT");
        return true;
      } catch (e) {
        if (e.code !== "taken") { try { await c.query("ROLLBACK"); } catch (_) { /* ignore */ } }
        throw e;
      } finally { c.release(); }
    },
    async closedDates() {
      const { rows } = await pool.query("SELECT date FROM diy_closed_dates ORDER BY date");
      return rows.map((r) => r.date);
    },
    async closeDate(d) { await pool.query("INSERT INTO diy_closed_dates (date) VALUES ($1) ON CONFLICT DO NOTHING", [d]); },
    async openDate(d) { await pool.query("DELETE FROM diy_closed_dates WHERE date = $1", [d]); }
  };
}

// Safety: on the live site, never fall back to memory (bookings would be lost on restart).
if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production") {
  console.error("DATABASE_URL is not set. In Render open the web service > Environment, add DATABASE_URL, then redeploy.");
  process.exit(1);
}

module.exports = process.env.DATABASE_URL ? postgresStore(process.env.DATABASE_URL) : memoryStore();
