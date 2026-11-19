// Shadows & Steel: the playtest website (GitHub Pages). Loaded only on the website, before battle.js; the claude.ai page and the
// Workbench never load it. Two things live here:
//   window.SS_SITE     where Send notes posts (the project lead's Google Form) and the welcome text. build_site.py stamps BUILD.
//   window.SS_LOCALDB  a stand-in for the claude.ai game store: games, notes and saved replays stay in this browser (IndexedDB).
// Version 0.1, 15 November 2026 (Shareable Build Brief v0.2, RD-144, RD-150 (6)).
(function () {
"use strict";
var FORM = "1FAIpQLScLoaIfdtlwpAwo2e8hO7lLPttbrRoM4LbSxtEXnTW0DMSyqg";
window.SS_SITE = {
  build: "TEST PAGE first-look, unlisted, 2026-11-19 · Battlefield v0.20 (playtest website, 2026-11-16) · Basic Training v0.3.4 · cards v0.17.1, decks v0.17.1",
  form: {
    action: "https://docs.google.com/forms/d/e/" + FORM + "/formResponse",
    view: "https://docs.google.com/forms/d/e/" + FORM + "/viewform",
    // the form's fields, in form order (Playtest Website Setup v0.1; titles confirmed against the answers Sheet, 15 Nov)
    name: "entry.34619924", build: "entry.90262889", overall: "entry.471770139", mode: "entry.1085585192", fair: "entry.1167658390",
    pacing: "entry.1584703091", unbalanced: "entry.842879544", notes: "entry.1329073961", code: "entry.1661233936",
    pages: "0,1"   // the form has two pages since 18 Nov 2026 (page 2 is Game Balance); Google needs this to keep page 2's answers
  },
  // the answer choices, copied word for word from the form as the project lead edited it on 18 Nov 2026 (a choice that differs from the form voids the whole answer)
  modeChoices: ["Tutorial (Basic Training or AIT)", "Game against the bot (Skirmish or another single player mode)", "Game against a person"],
  fairChoices: ["Well balanced: Game systems felt right. I felt like I had a reasonable chance to win when playing.", "Mixed: most things feel about right. A little bit of swing and a few over/underpowered cards.", "Unbalanced: Felt too swingy, many aspects were over or underpowered, costs were all over the place."],
  unbalancedChoices: ["User Interface (UI) / User Experience (UX)", "Capabilities Cards / Unit Costs", "Effects Cards / Class Abilities", "Damage Output / Scaling", "Resources (Generation and Costs)"],
  ends: {"overall": ["Poor", "Excellent"], "pacing": ["Too Slow", "Too Fast"]},   // the words at each end of the 1 to 5 scales
  required: []
};

/* ---- the game store in this browser: the same calls as the claude.ai store (doc().get/set/delete, collection().orderBy().limit().get()) ---- */
var mem = {}, dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise(function (ok) {
    try { var r = indexedDB.open("shadows-and-steel", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("docs"); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ok(null); }; r.onblocked = function () { ok(null); };
    } catch (e) { ok(null); } });
  return dbp;
}
function tx(mode, fn) { return open().then(function (db) {
  if (!db) return fn(null);
  return new Promise(function (ok, no) { var t = db.transaction("docs", mode), s = t.objectStore("docs"), out = fn(s); t.oncomplete = function () { ok(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { no(t.error); }; t.onabort = function () { no(t.error || new Error("quota_exceeded")); }; }); }); }
function snap(id, v) { return { id: id, exists: v !== undefined && v !== null, data: function () { return v; }, metadata: {} }; }
function doc(p) { var id = p.split("/").pop(); return { id: id, path: p,
  get: function () { return tx("readonly", function (s) { if (!s) return { result: mem[p] }; return s.get(p); }).then(function (v) { return snap(id, v); }); },
  set: function (d) { var v = JSON.parse(JSON.stringify(d)); return tx("readwrite", function (s) { if (!s) { mem[p] = v; return; } s.put(v, p); }).then(function () { }, function (e) { var er = new Error("The browser's storage is full."); er.code = "quota_exceeded"; throw er; }); },
  delete: function () { return tx("readwrite", function (s) { if (!s) { delete mem[p]; return; } s.delete(p); }).then(function () { }); } }; }
function coll(p, ord, lim) { return { doc: function (id) { return doc(p + "/" + id); }, orderBy: function (f, dir) { return coll(p, [f, dir], lim); }, limit: function (n) { return coll(p, ord, n); },
  get: function () { var depth = p.split("/").length + 1;
    return open().then(function (db) { return new Promise(function (ok) {
      var out = [];
      if (!db) { Object.keys(mem).forEach(function (k) { if (k.indexOf(p + "/") === 0 && k.split("/").length === depth) out.push([k, mem[k]]); }); return ok(out); }
      var s = db.transaction("docs", "readonly").objectStore("docs"), r = s.openCursor(IDBKeyRange.bound(p + "/", p + "/￿"));
      r.onsuccess = function () { var c = r.result; if (!c) return ok(out); if (String(c.key).split("/").length === depth) out.push([c.key, c.value]); c.continue(); };
      r.onerror = function () { ok(out); }; }); }).then(function (kv) {
      var ds = kv.map(function (x) { return snap(String(x[0]).split("/").pop(), x[1]); });
      if (ord) ds.sort(function (a, b) { var x = a.data()[ord[0]], y = b.data()[ord[0]]; return (x < y ? -1 : x > y ? 1 : 0) * (ord[1] === "desc" ? -1 : 1); });
      if (lim) ds = ds.slice(0, lim); return { docs: ds, size: ds.length, empty: !ds.length }; }); } }; }
window.SS_LOCALDB = { doc: doc, collection: function (p) { return coll(p); }, local: true };
})();
