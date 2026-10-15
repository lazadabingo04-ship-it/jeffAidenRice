(function () {
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  let uid = ls("aiden_uid");
  if (!uid) { uid = "c" + Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2); ls("aiden_uid", uid); }
  const tok = () => sessionStorage.getItem("aiden_tok") || "";
  const post = async body => { const r = await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "error"); return j; };
  const api = (op, path, data) => post({ op, path, data, token: tok() });
  const sd = (id, d) => ({ id, exists: d != null, data: () => d || undefined });
  const qs = j => ({ docs: j.docs.map(d => sd(d.id, d.data)), size: j.docs.length, empty: !j.docs.length });
  const pollers = new Set(), kick = () => pollers.forEach(f => f());
  function poll(fn, cb, err) {
    let on = true, last = null, t = null;
    const run = async () => { if (!on) return; clearTimeout(t); try { const s = await fn(); const j = JSON.stringify(s.docs ? s.docs.map(d => [d.id, d.data()]) : s.data()); if (j !== last) { last = j; cb(s); } } catch (e) { err && err(e); } if (on) t = setTimeout(run, 5000); };
    pollers.add(run); run(); return () => { on = false; pollers.delete(run); };
  }
  const docRef = p => { const id = p.split("/").pop(); const get = async () => sd(id, (await api("get", p)).data);
    return { id, path: p, get, set: async d => { await api("set", p, d); kick(); }, update: async d => { await api("update", p, d); kick(); }, delete: async () => { await api("delete", p); kick(); }, onSnapshot: (cb, er) => poll(get, cb, er) }; };
  const colRef = p => { const get = async () => qs(await api("list", p));
    return { path: p, doc: id => docRef(p + "/" + id), add: async d => { const j = await api("add", p, d); kick(); return docRef(p + "/" + j.id); }, get, onSnapshot: (cb, er) => poll(get, cb, er) }; };
  window.claude = { use: async n => n === "db" ? { doc: docRef, collection: colRef } : n === "user" ? { canEdit: async () => !!tok(), isOwner: async () => !!tok(), id: async () => uid } : null };
  document.addEventListener("DOMContentLoaded", () => { const a = document.getElementById("staff"); if (a && tok()) a.textContent = "Log out"; });
  document.addEventListener("click", async e => {
    if (e.target.id !== "staff") return; e.preventDefault();
    if (tok()) { sessionStorage.removeItem("aiden_tok"); location.reload(); return; }
    const pw = prompt("Staff password"); if (!pw) return;
    const j = await post({ op: "login", password: pw });
    if (j.ok) { sessionStorage.setItem("aiden_tok", j.token); location.reload(); } else alert("Wrong password");
  });
  // let screens refresh right after a button press, and show real errors instead of failing silently
  document.addEventListener("click", e => { if (e.target.tagName === "BUTTON") { try { document.activeElement.blur(); } catch (x) {} } }, true);
  window.addEventListener("unhandledrejection", e => { const m = e.reason && e.reason.message || e.reason; if (m) alert("Something went wrong: " + m); });
})();
