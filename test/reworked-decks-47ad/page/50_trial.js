// Sprint 8, package 7 (ui-frontend): the test page plays the reworked decks. Staged only with a trial (stage.py --cards, --decks).
// What it adds, all from data: a line on the Main Menu saying these are the reworked decks (with the trial's versions, read from the
// staged game), and "What changed": one screen a deck, titled with the deck's name, with its identity in two lines and its changes in
// a short list (page/50_deck_notes.json, for the Studio Lead's final words). The way in: the Main Menu line, the LIBRARY screen and the
// Card library. battle.js is not patched; nothing here touches the game.
// Package 7d (the Review Council's Major 5): every card name in a line of "What changed" opens that card in the Library's own reader
// (SS.zoom with the build's own face, as the Card library does), found by the page from the build's card list, longest name first,
// so the deck notes' words stay free to edit. The reader sits above this screen; closing it leaves the screen where it was.
(function () {
  "use strict";
  var NOTES = null, CUR = 0, BACK = null;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function trial() { var G = window.SS && window.SS.G, b = ((G && G.builds) || [])[0]; return (b && b.trial) || null; }
  function decks() { return (NOTES && NOTES.decks) || []; }
  function faces() { return (window.SS && window.SS.G && window.SS.G.faces) || {}; }

  // ---- card names in a line: every card of the build named in it, longest name first, whole words only ----
  var RX = null, RXN = "";
  function namesRx() { var F = faces(), ns = Object.keys(F).filter(function (n) { return n && F[n] && F[n].name; }), key = ns.length + ":" + ns[0];
    if (!ns.length) return null; if (RX && RXN === key) return RX;
    ns.sort(function (a, b) { return b.length - a.length || (a < b ? -1 : 1); });
    RXN = key; RX = new RegExp("(^|[^A-Za-z0-9-])(" + ns.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")(?![A-Za-z0-9-])", "g"); return RX; }
  function linked(line) { var rx = namesRx(), s = String(line == null ? "" : line); if (!rx) return esc(s);
    var out = "", at = 0, m; rx.lastIndex = 0;
    while ((m = rx.exec(s))) { var st = m.index + m[1].length; out += esc(s.slice(at, st)) + '<a href="#" class="s8card" data-s8="card" data-card="' + esc(m[2]) + '" aria-haspopup="dialog">' + esc(m[2]) + "</a>"; at = st + m[2].length; rx.lastIndex = at; }
    return out + esc(s.slice(at)); }
  function readCard(a) { var f = faces()[a.dataset.card]; if (!f || !window.SS || !window.SS.zoom) return;
    try { a.focus({ preventScroll: true }); } catch (e) { }   // the reader gives focus back to the name that opened it
    window.SS.zoom(f, {}); }

  // ---- the Main Menu line ----
  function menuLine() { var t = trial();
    return '<div class="s8m" id="s8Menu"><p><b>REWORKED DECKS</b> SPEARHEAD, BULWARK, SPECTRUM and KILL CHAIN play their reworked cards' + (t ? " (trial cards v" + esc(t.cards_version) + ", decks v" + esc(t.decks_version) + ")" : "") +
      ". Basic Training plays the released cards.</p>" + (NOTES ? '<button class="ghost" data-s8="open">WHAT CHANGED <i aria-hidden="true">→</i></button>' : "") + "</div>"; }
  function onMenu(d) { var el = (d && d.el) || $("suBody"); if (!el) return; var nav = el.querySelector("nav.mm:not(.lib)"); if (!nav) return;
    var old = $("s8Menu"); if (old) old.remove(); nav.insertAdjacentHTML("beforeend", menuLine());
    try { dispatchEvent(new Event("resize")); } catch (x) { } }

  // ---- the way in from the LIBRARY screen and the Card library ----
  function libRow() { return '<button class="ghost mi" id="s8Lib" data-s8="open"><span>WHAT CHANGED<small>The four reworked decks, deck by deck.</small></span><i aria-hidden="true">→</i></button>'; }
  function watch() {
    var lb = document.querySelector("nav.mm.lib .mlist"); if (NOTES && lb && !$("s8Lib")) lb.insertAdjacentHTML("beforeend", libRow());
    var gr = $("libGrid"); if (NOTES && gr && !$("s8LibCards")) gr.insertAdjacentHTML("beforebegin", '<div class="s8lc" id="s8LibCards"><button class="ghost" data-s8="open">WHAT CHANGED IN THE REWORKED DECKS <i aria-hidden="true">→</i></button></div>');
    var nav = document.querySelector("#suBody nav.mm:not(.lib)"); if (nav && !$("s8Menu")) onMenu({ el: $("suBody") });
  }

  // ---- the screen: one deck at a time ----
  function layer() { var el = $("s8dk"); if (!el) { el = document.createElement("div"); el.id = "s8dk"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.hidden = true; document.body.appendChild(el); el.addEventListener("click", onClick); el.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); }); } return el; }
  function open(i) { if (!NOTES) return; if (!$("s8dk") || $("s8dk").hidden) BACK = document.activeElement; CUR = Math.max(0, Math.min(decks().length - 1, i || 0)); draw(); }
  function close() { var el = $("s8dk"); if (el) { el.hidden = true; el.innerHTML = ""; } try { if (BACK && BACK.focus) BACK.focus({ preventScroll: true }); } catch (e) { } BACK = null; }
  function draw() { var d = decks()[CUR], el = layer(); if (!d) return;
    var tabs = '<div class="s8tabs" role="tablist" aria-label="Decks">' + decks().map(function (x, i) { return '<button role="tab" data-s8="deck" data-i="' + i + '" aria-selected="' + (i === CUR) + '"' + (i === CUR ? ' class="on"' : "") + ">" + esc(x.deck) + "</button>"; }).join("") + "</div>";
    el.innerHTML = '<div class="s8scroll"><div class="s8in"><button class="ghost s8back" data-s8="close">‹ Back</button>' +
      '<p class="s8k">' + esc(NOTES.heading || "What changed") + "</p>" + tabs +
      '<h2 class="s8t" id="s8h">' + esc(d.deck) + "</h2>" + '<div class="s8id">' + (d.identity || []).map(function (l) { return "<p>" + linked(l) + "</p>"; }).join("") + "</div>" +
      '<h3>WHAT CHANGED</h3>' + (namesRx() ? '<p class="s8hint">Underlined names are cards: tap one to read the card.</p>' : "") + '<ul class="s8ch">' + (d.changes || []).map(function (l) { return "<li>" + linked(l) + "</li>"; }).join("") + "</ul>" +
      '<div class="s8nav">' + (CUR > 0 ? '<button class="ghost" data-s8="deck" data-i="' + (CUR - 1) + '">‹ ' + esc(decks()[CUR - 1].deck) + "</button>" : "<span></span>") +
      (CUR + 1 < decks().length ? '<button class="ghost" data-s8="deck" data-i="' + (CUR + 1) + '">' + esc(decks()[CUR + 1].deck) + " ›</button>" : "") + "</div></div></div>";
    el.setAttribute("aria-labelledby", "s8h"); el.hidden = false; var sc = el.querySelector(".s8scroll"); if (sc) sc.scrollTop = 0;
    try { (el.querySelector(".s8tabs .on") || el.querySelector("button")).focus({ preventScroll: true }); } catch (e) { } }
  function onClick(e) { var b = e.target.closest("[data-s8]"); if (!b) return; var k = b.dataset.s8;
    if (k === "card") { e.preventDefault(); readCard(b); } else if (k === "close") close(); else if (k === "deck") { CUR = +b.dataset.i || 0; draw(); } }
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest('[data-s8="open"]'); if (!b) return; e.preventDefault(); e.stopPropagation(); open(0); }, true);

  if (window.SSHooks) SSHooks.on("menu", onMenu);
  fetch("page/50_deck_notes.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) { NOTES = j; watch(); var m = $("s8Menu"); if (m) onMenu({ el: $("suBody") }); }, function () { NOTES = null; });
  try { new MutationObserver(function () { watch(); }).observe(document.body, { childList: true, subtree: true }); } catch (e) { }
  window.S8TRIAL = { open: open, close: close, notes: function () { return NOTES; }, trial: trial };
})();
