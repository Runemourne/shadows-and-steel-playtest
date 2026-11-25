// Sprint 7, package 7: the operation's screens (owner: the operation's screens lane, ui-frontend).
// The way in (a Main Menu entry), the operation screen, a mission's order, the start of a mission, the orders during the
// mission (an entry in the ☰ menu) and the after-action part of the Debrief. Built on the hooks (page/00_hooks.js) and the
// globals the page already gives (window.SS); battle.js is not patched. Package 12: PLAY on the Main Menu opens a choice of CAMPAIGN (this operation)
// or SKIRMISH (the page's own Play screen, unchanged); a mission opens only when the one before it has been won, and keeps its best result.
// Every word these screens show comes from campaign/operation.json (the narrative lane's file), the labels from copy.labels;
// the one exception is the back button, which reads the page's own Main Menu button.
(function () {
  "use strict";
  var OP = null, CUR = null, PENDING = null, AFTER_MENU = null, FROM_PLAY = false, MEM = {}, KEY = "ss.s7ops.progress";
    var LABELS = { situation: "", mission: "", execution: "", sustainment: "", command: "", intent: "", you: "", bot: "", close: "", learn: "" };   // every label is copy.labels in the data
  var PARAS = ["situation", "mission", "execution", "sustainment", "command"];
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  function lab(k) { var c = (OP && OP.copy && OP.copy.labels) || {}; return c[k] != null ? c[k] : LABELS[k]; }
  function copy(k) { return (OP && OP.copy && OP.copy[k]) || ""; }
  function paras(t) { return String(t || "").split(/\n\s*\n/).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join(""); }
  function missions() { return (OP && OP.missions) || []; }
  function byId(id) { return missions().filter(function (m) { return m.id === id; })[0] || null; }
  function nextOf(m) { var ms = missions(), i = ms.indexOf(m); return i >= 0 && i + 1 < ms.length ? ms[i + 1] : null; }

  // ---- what the player has completed: in the browser when it allows, else for this open page only ----
  function progress() { try { var raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw) || {}; } catch (e) { } return MEM; }
  // package 12 (the lead, 25 Nov): a mission opens only when the one before it has been won; a mission keeps its best result,
  // so a win once made is never lost by a later replay (the three victories first, then the even results, then the defeats)
  var RANK = { decisive: 9, pyrrhic: 8, points: 7, stalemate: 5, protraction: 5, draw: 5, defeat_points: 3, defeat_pyrrhic: 2, defeat_decisive: 1 };
  function won(key) { return /^(decisive|pyrrhic|points)$/.test(key || ""); }
  function record(id, key) { var p = progress(), old = p[id]; if (!old || (RANK[key] || 0) >= (RANK[old] || 0)) p[id] = key; MEM = p; try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { } }
  function stateOf(m) { var ms = missions(), i = ms.indexOf(m), p = progress();
    if (i > 0 && !won(p[ms[i - 1].id])) return { locked: true, after: ms[i - 1] };   // locked comes first: a result kept from an older page does not open it
    if (p[m.id]) return { done: true, key: p[m.id] };
    return { ready: true }; }
  function fill(t, o) { return String(t || "").replace(/\{(\w+)\}/g, function (x, k) { return o[k] != null ? o[k] : ""; }); }

  // ---- the result from the player's side (seat 0 is the player) ----
  function resultKey(r) { if (!r || !r.kind) return "";
    if (r.winner === 1 && /^(decisive|pyrrhic|points)$/.test(r.kind)) return "defeat_" + r.kind;
    return r.kind; }
  function resultName(key) { var n = (OP && OP.copy && OP.copy.result_names) || {}; return n[key] || ""; }

  // ---- the overlay that holds the operation screen and the orders ----
  function layer() { var el = $("s7ops"); if (!el) { el = document.createElement("div"); el.id = "s7ops"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.hidden = true; document.body.appendChild(el); el.addEventListener("click", onClick); } return el; }
  function close() { var el = $("s7ops"); if (el) { el.hidden = true; el.innerHTML = ""; } }
  function backWord() { var b = $("suBack"); return b ? b.textContent : "‹"; }
  function show(html, label, focusSel) { var el = layer(); el.innerHTML = html; el.setAttribute("aria-label", label || ""); el.hidden = false;
    var sc = el.querySelector(".s7scroll"); if (sc) sc.scrollTop = 0; try { (el.querySelector(focusSel || "button") || el).focus({ preventScroll: true }); } catch (e) { } }

  function forces(m) { return '<p class="s7f"><span class="fr"><i aria-hidden="true">▲</i> ' + esc(m.you) + " <small>" + esc(lab("you")) + '</small></span> <span class="ho"><i aria-hidden="true">◆</i> ' + esc(m.bot) + " <small>" + esc(lab("bot")) + "</small></span></p>"; }
  function headLine(m) { return esc(lab("mission")) + " " + esc(m.number) + ": " + esc(m.title); }

  function showOperation() {
    var h = '<div class="s7scroll"><div class="s7in">' + (FROM_PLAY ? '<button class="ghost s7back" data-s7="play">' + esc(copy("play_back")) + "</button>" : '<button class="ghost s7back" data-s7="menu">' + esc(backWord()) + "</button>") +
      '<h2 class="s7t" id="s7h">' + esc(copy("list_heading") || OP.name) + '</h2><p class="s7tag">' + esc(OP.tagline) + "</p>" + paras(OP.intro) + '<ol class="s7ms">';
    missions().forEach(function (m) { var st = stateOf(m);
      var body = '<span class="s7n" aria-hidden="true">' + esc(m.number) + '</span><span class="s7mb"><b>' + esc(m.title) + "</b><span>" + esc(m.place) + "</span>" + forces(m).replace(/<p class="s7f">|<\/p>/g, "") +
        '<span class="s7st">' + (st.done ? '<i aria-hidden="true">' + (won(st.key) ? "✓" : "·") + "</i> " + esc(resultName(st.key)) : st.locked ? esc(fill(copy("locked"), { prev: st.after.title })) : "") + "</span></span>" + (st.locked ? "" : '<i class="s7go" aria-hidden="true">→</i>');
      h += "<li>" + (st.locked ? '<div class="s7m locked" aria-disabled="true">' + body + "</div>" : '<button class="s7m' + (st.ready ? " ready" : " done") + '" data-s7="order" data-m="' + esc(m.id) + '">' + body + "</button>") + "</li>"; });
    show(h + "</ol></div></div>", copy("list_heading") || OP.name, ".s7m.ready, .s7m.done, .s7back");
  }

  // ---- package 12: PLAY opens a choice of CAMPAIGN (the operation) or SKIRMISH (the page's own Play screen, as it is) ----
  function showPlay() { FROM_PLAY = false;
    var opt = function (k, cls) { return '<li><button class="s7m s7c ' + cls + '" data-s7="' + k + '" aria-labelledby="s7c_' + k + '" aria-describedby="s7cl_' + k + '"><span class="s7mb"><b id="s7c_' + k + '">' + esc(copy(k)) + '</b><span id="s7cl_' + k + '">' + esc(copy(k + "_line")) + '</span></span><i class="s7go" aria-hidden="true">→</i></button></li>'; };
    show('<div class="s7scroll"><div class="s7in s7play"><button class="ghost s7back" data-s7="menu" data-f="play">' + esc(backWord()) + "</button>" +
      '<h2 class="s7t" id="s7h">' + esc(copy("play_title")) + '</h2><ul class="s7ms" aria-labelledby="s7h">' + opt("campaign", "ready") + opt("skirmish", "") + "</ul></div></div>", copy("play_title"), "[data-s7=campaign]"); }
  function playButton() { return document.querySelector("#suBody [data-go=play]"); }
  function openSkirmish() { var host = $("suBody"), t = document.createElement("button"); if (!host) return; close();
    t.dataset.go = "play"; t.dataset.s7pass = "1"; t.hidden = true; host.appendChild(t); t.click(); if (t.parentNode) t.remove(); }   // the cover's own handler draws its Play screen, as from the old PLAY

  function orderBody(m) {
    var o = m.order || {}, h = '<header class="s7oh"><p>' + esc(OP.name) + '</p><h2 class="s7t" id="s7h">' + headLine(m) + '</h2><p>' + esc(m.place) + "</p>" + forces(m) + "</header>";
    if (m.handicap && String(m.handicap).trim()) h += '<div class="s7hc" role="note"><i aria-hidden="true">⚠</i><p>' + esc(m.handicap) + "</p></div>";
    // the commander's intent opens paragraph 3, as an operation order carries it
    h += '<ol class="s7o">' + PARAS.map(function (k, i) { var intent = k === "execution" && m.intent ? '<div class="s7int"><h4>' + esc(lab("intent")) + "</h4>" + paras(m.intent) + "</div>" : "";
      return o[k] || intent ? "<li><h3>" + (i + 1) + ". " + esc(lab(k)) + "</h3>" + intent + paras(o[k]) + "</li>" : ""; }).join("") + "</ol>";
    if (m.learn && m.learn.text) h += '<div class="s7learn">' + (lab("learn") ? "<h3>" + esc(lab("learn")) + "</h3>" : "") + "<blockquote>" + paras(m.learn.text) + "</blockquote>" + (m.learn.source ? "<cite>" + esc(m.learn.source) + "</cite>" : "") + "</div>";
    return h;
  }
  function openCampaign() { FROM_PLAY = true; showOperation(); }
  function showOrder(m) {
    var h = '<div class="s7scroll"><div class="s7in"><button class="ghost s7back" data-s7="op">' + esc("‹ " + (copy("list_heading") || OP.name)) + "</button>" + orderBody(m) + "</div></div>" +
      '<div class="s7foot"><button class="big s7start" data-s7="start" data-m="' + esc(m.id) + '">' + esc(copy("brief_button")) + "</button></div>";
    show(h, headLine(m).replace(/&amp;/g, "&"), ".s7start");
  }

  // ---- the start: the page's own Play screen and Start button, with the mission's choices for this one start ----
  function startMission(m) {
    var S = window.SS && window.SS.set, cover = $("cover"); if (!S || !cover) return;
    var keep = { you: S.you, bot: S.bot, terrain: S.terrain, first: S.first, mode: S.mode, trial: S.trial, screen: S.screen || "menu" };
    PENDING = { m: m, keep: keep };
    S.mode = "bot"; S.trial = "0"; S.you = m.you; S.bot = m.bot; S.terrain = m.terrain || ""; S.first = m.first === "bot" ? "bot" : m.first === "you" ? "you" : "";
    var t = document.createElement("button"); t.dataset.go = "play"; t.dataset.s7pass = "1"; t.hidden = true; ($("suBody") || cover).appendChild(t); t.click();   // the cover's own handler draws the Play screen
    var go = $("pgo"); if (!go || go.disabled) { PENDING = null; Object.assign(S, keep); return; }
    var sb = document.querySelector("#s7ops .s7start"); if (sb) sb.disabled = true;
    go.click();
    var n = 0, iv = setInterval(function () { var er = $("serr"); n++;
      if (cover.style.display === "none") { clearInterval(iv); close(); }
      else if ((er && er.textContent) || n > 600) { clearInterval(iv); close(); window.S7Mission = null; } }, 200);   // a start that failed shows the page's own error and Back
  }

  // ---- the orders during the mission: an entry in the ☰ menu ----
  function menuEntry() { var mn = $("menu"), b = $("s7Orders"); if (!mn) return;
    if (!CUR) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("button"); b.className = "ghost"; b.id = "s7Orders"; var first = mn.querySelector("button"); mn.insertBefore(b, first); }
    b.textContent = headLine(CUR).replace(/&amp;/g, "&"); }
  function showOrdersInGame() { if (!CUR) return; var o = CUR.order || {};
    var h = '<div class="s7scroll"><div class="s7in"><header class="s7oh"><p>' + esc(OP.name) + '</p><h2 class="s7t" id="s7h">' + headLine(CUR) + "</h2></header>" +
      (o.mission ? "<h3>2. " + esc(lab("mission")) + "</h3>" + paras(o.mission) : "") + (CUR.intent ? '<div class="s7int"><h3>' + esc(lab("intent")) + "</h3>" + paras(CUR.intent) + "</div>" : "") + "</div></div>" +
      '<div class="s7foot"><button class="big" data-s7="close">' + esc(lab("close")) + "</button></div>";
    show(h, headLine(CUR).replace(/&amp;/g, "&"), "[data-s7=close]"); }

  function leaveDebrief(then) { var S = window.SS && window.SS.set, b = $("dNew"); if (!b) return; if (S) S.screen = "menu"; AFTER_MENU = then; b.click(); }

  function onClick(e) { var b = e.target.closest("button[data-s7]"); if (!b) return; var a = b.dataset.s7, m = byId(b.dataset.m);
    if (a === "menu" || a === "close") { close(); FROM_PLAY = false; try { var t = a === "menu" ? (b.dataset.f === "play" ? playButton() : $("s7Op")) : $("bMenu"); if (t) t.focus({ preventScroll: true }); } catch (x) { } return; }
    if (a === "play") return showPlay();
    if (a === "campaign") return openCampaign();
    if (a === "skirmish") return openSkirmish();
    if (a === "op") return showOperation();
    if (a === "order" && m) return showOrder(m);
    if (a === "start" && m) return startMission(m); }

  document.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b || !OP) return;
    if (b.id === "s7Op") { e.stopPropagation(); FROM_PLAY = false; return showOperation(); }
    if (b.dataset.go === "play" && !b.dataset.s7pass && b.closest("#suBody")) { e.stopPropagation(); return showPlay(); }
    if (b.id === "s7Orders") { e.stopPropagation(); var mn = $("menu"); if (mn) mn.hidden = true; return showOrdersInGame(); }
    if (b.dataset.s7d) { e.stopPropagation(); var m = byId(b.dataset.m); if (!m) return;
      if (b.dataset.s7d === "again") return leaveDebrief(function () { startMission(m); });
      if (b.dataset.s7d === "next") return leaveDebrief(function () { showOrder(m); });
      return leaveDebrief(showOperation); } }, true);
  addEventListener("keydown", function (e) { var el = $("s7ops"); if (e.key !== "Escape" || !el || el.hidden) return; e.preventDefault(); e.stopImmediatePropagation();
    var b = el.querySelector(".s7back, [data-s7=close]"); if (b) b.click(); }, true);

  // ---- the hooks ----
  function menuHook(d) { if (!OP || !d.el) return; var nav = d.el.querySelector("nav.mm"); if (!nav || $("s7Op")) return;
    var old = nav.querySelector(".mprim"), line = old && old.nextElementSibling;
    if (old) { old.className = "ghost mi"; var ar = old.querySelector("i"); if (ar) ar.textContent = "→"; var list = nav.querySelector(".mlist"); if (line && line.classList.contains("mline")) { line.className = "sr"; } if (list) { list.insertBefore(old, list.firstChild); if (line) old.after(line); } }
    nav.insertAdjacentHTML("afterbegin", '<button class="big mprim" id="s7Op" aria-describedby="md_s7op"><span>' + esc(copy("menu_title")) + '</span><i aria-hidden="true">↗</i></button><p class="mline" id="md_s7op">' + esc(copy("menu_line")) + "</p>");
    try { dispatchEvent(new Event("resize")); } catch (x) { }   // the page fits the key-art band to the menu's new height
    if (AFTER_MENU) { var f = AFTER_MENU; AFTER_MENU = null; setTimeout(f, 0); } }
  function startHook(d) { var r = d.request || {};
    if (!PENDING || r.tutorial) { PENDING = null; CUR = null; menuEntry(); window.S7Mission = null; return; }
    var m = PENDING.m, S = window.SS && window.SS.set; r.you = m.you; r.bot = m.bot; r.terrain = m.terrain || ""; r.spectate = "";
    r.first = m.first === "bot" ? "bot" : m.first === "you" ? "you" : ""; r.scenario = JSON.parse(JSON.stringify(m.scenario || {}));
    if (S) Object.assign(S, PENDING.keep);   // an ordinary game from PLAY afterwards keeps the player's own choices
    CUR = m; PENDING = null; menuEntry(); window.S7Mission = { id: m.id, title: m.title }; }
  function overHook(d) { var G = window.SS && window.SS.G; if (!CUR || (G && G.replay)) return;
    var r = d.over && d.over.result; record(CUR.id, resultKey(r) || "draw"); }
  function debriefHook(d) { var G = window.SS && window.SS.G; if (d.el) d.el.classList.toggle("s7mdb", !!(CUR && !(G && G.replay)));   // a mission's review: its small print at 16 px (30_ops.css)
    if (!CUR || !d.el || (G && G.replay)) return; var m = CUR, db = d.el.querySelector(".db"); if (!db) return;
    var old = $("s7-deb"); if (old) old.remove(); var oi = $("s7-intent"); if (oi) oi.remove();
    var r = d.over && d.over.result, key = resultKey(r), nx = nextOf(m), sec = document.createElement("section"); sec.id = "s7-deb";
    // package 12: after a win, as before; otherwise FIGHT IT AGAIN leads, NEXT MISSION shows only if an earlier win opened it,
    // and the line about the next mission gives way to one that says what opens it
    var win = won(key), open = nx && !stateOf(nx).locked, nextLine = !nx || win ? m.next : open ? "" : fill(copy("locked_after"), { next: nx.title, prev: m.title });
    var buttons = '<div class="s7db">' + (open && win ? '<button class="big" data-s7d="next" data-m="' + esc(nx.id) + '">' + esc(copy("onward")) + "</button>" : "") +
      '<button class="' + (open && win ? "ghost" : "big") + '" data-s7d="again" data-m="' + esc(m.id) + '">' + esc(copy("again")) + "</button>" + (open && !win ? '<button class="ghost" data-s7d="next" data-m="' + esc(nx.id) + '">' + esc(copy("onward")) + "</button>" : "") + '<button class="ghost" data-s7d="op" data-m="' + esc(m.id) + '">' + esc("‹ " + (copy("list_heading") || OP.name)) + "</button></div>";
    var res = db.querySelector("#s7-result") || $("s7-result"), slot = res && db.contains(res) && res.querySelector(".s7r-mission");   // the Debrief's own block: the end strip under the Debrief carries a block with the same id
    if (slot) {   // the table lane's block says the result once: its name from the data, the mission's ending in the slot, the intent in one small line
      var nm = res.querySelector(".s7r-name"); if (nm && resultName(key)) nm.textContent = resultName(key);
      slot.textContent = (m.endings || {})[key] || ""; slot.hidden = !slot.textContent;
      if (m.intent) { var il = document.createElement("p"); il.id = "s7-intent"; il.className = "s7r-intent"; il.textContent = lab("intent") + ": " + m.intent; slot.after(il); }
      sec.className = "s7after"; sec.innerHTML = (nextLine ? '<p class="s7next">' + esc(nextLine) + "</p>" : "") + buttons; res.after(sec);
    } else {
    sec.setAttribute("aria-labelledby", "s7dk");
    sec.innerHTML = '<p class="s7dh">' + esc(copy("debrief_heading")) + " · " + headLine(m) + '</p><h2 class="s7dk" id="s7dk">' + esc(resultName(key)) + "</h2>" +
      '<div class="s7cmp"><div class="s7was">' + paras((m.endings || {})[key]) + (r && r.words ? '<p class="s7w">' + esc(r.words) + "</p>" : "") + "</div>" +
      '<div class="s7int"><h3>' + esc(lab("intent")) + "</h3>" + paras(m.intent) + "</div></div>" + (nextLine ? '<p class="s7next">' + esc(nextLine) + "</p>" : "") + buttons;
    if (res && db.contains(res)) res.after(sec); else db.insertBefore(sec, db.firstChild); }
    var rd = $("dRedeploy"); if (rd) rd.hidden = true;   // in a mission, the "again" button (copy.again) takes Redeploy's place (Redeploy would start the Play screen's own matchup)
    db.scrollTop = 0; }

  // window.S7Mission ({id, title}) lasts from a mission's start request until the player leaves that game: the setup screens
  // (Main Menu, Play, Training) coming back means the game was left, whether by the Debrief's buttons or by abandoning it
  window.S7Mission = null;
  if (window.SS_TEST_NAME) document.documentElement.classList.add("s7test");
  (function watchCover() { var cv = $("cover"); if (!cv || !window.MutationObserver) return setTimeout(watchCover, 500);
    new MutationObserver(function () { if (cv.style.display !== "none" && !PENDING) window.S7Mission = null; }).observe(cv, { attributes: true, attributeFilter: ["style"] }); })();
  if (window.SSHooks) { SSHooks.on("menu", menuHook); SSHooks.on("start", startHook); SSHooks.on("over", overHook); SSHooks.on("debrief", debriefHook); }
  // a mission whose enemy has its own words (enemy_alternates, keyed by the enemy's name) reads them in place of the general ones
  function withEnemy(m) { var a = m && m.enemy_alternates && m.enemy_alternates[m.bot]; if (!a) return m; var out = Object.assign({}, m), o = Object.assign({}, m.order || {}), e = Object.assign({}, m.endings || {});
    Object.keys(a).forEach(function (k) { if (k === "endings") Object.assign(e, a.endings); else if (PARAS.indexOf(k) >= 0) o[k] = a[k]; else if (k !== "order") out[k] = a[k]; else Object.assign(o, a.order); });
    out.order = o; out.endings = e; return out; }
  fetch("campaign/operation.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) { j.missions = (j.missions || []).map(withEnemy); OP = j;
    var el = document.querySelector("#suBody nav.mm"); if (el) menuHook({ el: $("suBody") }); }, function () { OP = null; });
  window.S7OPS = { withEnemy: withEnemy, resultKey: resultKey, resultName: resultName, progress: progress, op: function () { return OP; }, current: function () { return CUR; }, key: KEY };
})();
