const crypto = require("crypto");
const U = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const T = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const r = (...c) => fetch(U, { method: "POST", headers: { Authorization: "Bearer " + T }, body: JSON.stringify(c) })
  .then(x => x.json()).then(j => { if (j.error) throw new Error(j.error); return j.result; });
const tok = () => crypto.createHash("sha256").update("aiden|" + process.env.ADMIN_PASSWORD).digest("hex");
const PUB = ["products", "orderStatus"]; // anyone can read these

module.exports = async (req, res) => {
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const pw = process.env.ADMIN_PASSWORD;
    if (b.op === "login") return res.json(pw && b.password === pw ? { ok: true, token: tok() } : { ok: false });
    const admin = !!pw && b.token === tok();
    const path = String(b.path || "");
    if (!/^[A-Za-z0-9_\-.~:@+\/]{1,200}$/.test(path)) return res.status(400).json({ error: "bad path" });
    const seg = path.split("/"), col = seg[0], isDoc = seg.length === 2;
    const canRead = admin || (isDoc ? (PUB.includes(col) || col === "orders") : PUB.includes(col));
    const canWrite = admin || (isDoc && col === "orders" && seg[1].length >= 10);
    const key = "d:" + path;
    if (["get", "list"].includes(b.op) && !canRead) return res.status(403).json({ error: "not allowed" });
    if (["set", "update", "delete", "add"].includes(b.op) && !canWrite) return res.status(403).json({ error: "not allowed" });
    if (b.op === "add" && !admin) return res.status(403).json({ error: "not allowed" });

    if (b.op === "get") { const v = await r("GET", key); return res.json({ data: v ? JSON.parse(v) : null }); }
    if (b.op === "list") {
      const ids = (await r("SMEMBERS", "i:" + path)) || [];
      const vals = ids.length ? await r("MGET", ...ids.map(i => "d:" + path + "/" + i)) : [];
      return res.json({ docs: ids.map((id, i) => ({ id, data: vals[i] ? JSON.parse(vals[i]) : null })).filter(d => d.data) });
    }
    let id = seg[seg.length - 1], colPath = seg.slice(0, -1).join("/"), k = key;
    if (b.op === "add") { id = crypto.randomBytes(8).toString("hex"); colPath = path; k = "d:" + path + "/" + id; }
    let d = b.data || {};
    if (!admin && ["set", "update"].includes(b.op)) { // customers can only place "New" orders
      const list = Array.isArray(d.orders) ? d.orders.slice(-50) : [];
      d = { orders: list.map(o => { const x = { ...o, status: "New" }; delete x.stockOut; delete x.paidAt; delete x.prev; return x; }) };
    }
    if (b.op === "delete") { await r("DEL", k); await r("SREM", "i:" + colPath, id); return res.json({ ok: true }); }
    if (b.op === "update") { const old = await r("GET", k); d = { ...(old ? JSON.parse(old) : {}), ...d }; }
    await r("SET", k, JSON.stringify(d));
    await r("SADD", "i:" + colPath, id);
    return res.json({ ok: true, id });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
};
