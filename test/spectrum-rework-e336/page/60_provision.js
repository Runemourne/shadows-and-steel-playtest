// Sprint 8, package 7b (ui-frontend): a printed balance provision for a pairing (RD-207 item 5), from data (page/60_provisions.json).
// What it does: when the two decks chosen on the Play screen have a provision in force, its sentence shows above START THE GAME under
// "BALANCE PROVISION"; a Skirmish or watched game of that pairing starts with it (the start request's scenario, written by deck name in
// the data and turned to seats here: seat 0 is the Play screen's first deck); the sentence can be read again in the game's ☰ menu, and
// it travels in the game's info and record (session/60_provision.py). A mission (its own scenario) and Basic Training are left alone.
// battle.js is not patched; the engine is not touched.
(function () {
  "use strict";
  var ZONES = 5;   // the route's Zones (the engine's rule "zones"); a provision's marker is counted from that deck's own end
  var LIST = [];
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var copy = function (o) { return JSON.parse(JSON.stringify(o == null ? {} : o)); };

  function usable(e) {
    var ok = e && e.in_force === true && Array.isArray(e.decks) && e.decks.length === 2 && typeof e.decks[0] === "string" && typeof e.decks[1] === "string" &&
      e.decks[0] !== e.decks[1] && typeof e.words === "string" && e.words.trim() && (!e.starts || typeof e.starts === "object");
    if (e && e.in_force === true && !ok) try { console.warn("60_provisions.json: a provision in force is not complete (two different decks and its words are needed); it is not used.", e && e.id); } catch (x) { }
    return ok;
  }
  function find(a, b) {
    for (var i = 0; i < LIST.length; i++) { var d = LIST[i].decks; if ((d[0] === a && d[1] === b) || (d[0] === b && d[1] === a)) return LIST[i]; }
    return null;
  }
  // the provision as the engine's scenario: sides by seat (seat 0 is "you", or South when watching), "first" by seat
  function seatSide(start, seat) {
    var s = copy(start || {});
    if (seat === 1 && typeof s.marker === "number") s.marker = ZONES + 1 - s.marker;
    return s;
  }
  function scenarioFor(e, you, bot) {
    var st = e.starts || {}, sc = { sides: [seatSide(st[you], 0), seatSide(st[bot], 1)] };
    if (e.first === you) sc.first = 0; else if (e.first === bot) sc.first = 1;
    if (typeof e.last === "number") sc.last = e.last;
    return sc;
  }

  // ---- the start: a Skirmish or watched game of the pairing ----
  function onStart(d) {
    var r = d && d.request; if (!r || r.tutorial || window.S7Mission || r.scenario) return;   // Basic Training, a mission (30_ops sets its own scenario first)
    var e = find(r.you, r.bot); if (!e) return;
    r.scenario = scenarioFor(e, r.you, r.bot);
    r.provision = { id: String(e.id || ""), decks: e.decks.slice(), words: e.words.trim() };
  }

  // ---- the Play screen: the sentence above START THE GAME, for the decks chosen now ----
  function playBlock(e) {
    return '<div class="s60" id="s60Play" role="note" aria-labelledby="s60PlayK" data-k="' + esc(e.decks.join("|")) + '"><p class="s60k" id="s60PlayK">BALANCE PROVISION</p><p class="s60w">' + esc(e.words.trim()) + "</p></div>";
  }
  function syncPlay() {
    var S = window.SS && window.SS.set, go = document.querySelector("#suBody .go"), old = $("s60Play");
    var onPlay = !!(S && go && document.querySelector("#suBody .forces.you") && S.mode !== "train");
    var e = onPlay ? find(S.you, S.bot) : null;
    if (!e) { if (old) old.remove(); return; }
    if (old && old.parentNode === go && old.dataset.k === e.decks.join("|")) return;
    if (old) old.remove();
    go.insertAdjacentHTML("afterbegin", playBlock(e));
  }

  // ---- in the game: the ☰ menu, under "This game" (from the game's own info, so a replay shows it too) ----
  function syncMenu() {
    var mn = $("menu"), G = window.SS && window.SS.G, pv = G && G.info && G.info.provision, old = $("s60Menu");
    if (!mn) return;
    if (!pv || !pv.words) { if (old) old.remove(); return; }
    if (old && old.dataset.w === pv.words) return;
    if (old) old.remove();
    var el = document.createElement("div"); el.id = "s60Menu"; el.className = "s60 s60m"; el.setAttribute("role", "note"); el.dataset.w = pv.words;
    el.innerHTML = '<p class="s60k">BALANCE PROVISION</p><p class="s60w">' + esc(pv.words) + "</p>";
    var head = mn.querySelector("p.mh"); if (head) head.after(el); else mn.insertBefore(el, mn.firstChild);
  }

  var queued = false;
  function sync() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; syncPlay(); syncMenu(); }); }

  if (window.SSHooks) { SSHooks.on("start", onStart); SSHooks.on("pending", sync); }
  fetch("page/60_provisions.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) { LIST = ((j && j.provisions) || []).filter(usable); sync(); }, function () { LIST = []; });
  try { new MutationObserver(sync).observe(document.body, { childList: true, subtree: true }); } catch (e) { }
  window.S60Provision = { list: function () { return LIST.slice(); }, find: find, scenarioFor: scenarioFor };
})();
