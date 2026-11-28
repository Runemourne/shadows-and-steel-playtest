// Sprint 9 round two (ui-frontend, number 70), mark 2: step between the cards in play without closing the card reader.
// With a card in play open in the reader (tapped on the table), a row under the reader's title offers "‹ Previous" and "Next ›" (44 px
// or more) and says where the card is: "Your Frontline · 2 of 7 cards in play". The order is the table's: your Frontline, your Rear Area,
// the enemy's Frontline, the enemy's Rear Area, each as the view lists it. A swipe left or right on the card does the same; so do the
// arrow keys. The card opens exactly as a tap on it would (patches_70_round_two.py lends the table's inspectObj). The reader's words and
// the card face are not changed; Close returns to the table as before. Needs patches_70_round_two.py; without it, it stays out of the way.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var S = window.SSStep = { steps: 0, swipes: 0 };
  var ROWS = [["you", "front", "Your Frontline"], ["you", "rear", "Your Rear Area"], ["bot", "front", "Enemy Frontline"], ["bot", "rear", "Enemy Rear Area"]];
  function G() { return window.SS && SS.G; }
  function order() {   // [{uid, where}] for every card in play that the table shows
    var g = G(), v = g && g.view, O = (window.SS && SS.objs && SS.objs()) || {}, out = [];
    if (!v) return out;
    ROWS.forEach(function (r) { ((v[r[0]] || {})[r[1]] || []).forEach(function (u) { if (u && u.uid && O[u.uid] && O[u.uid].type !== "base") out.push({ uid: u.uid, where: r[2] }); }); });
    return out;
  }
  var bar = document.createElement("div"); bar.id = "zStep"; bar.hidden = true;
  bar.innerHTML = '<button type="button" class="ghost" id="zPrev" aria-label="Previous card in play">‹ Previous</button><span id="zStepAt" aria-live="polite"></span><button type="button" class="ghost" id="zNext" aria-label="Next card in play">Next ›</button>';
  function mount() { var h = $("zHead"); if (h && !bar.parentNode) h.parentNode.insertBefore(bar, h.nextSibling); }
  S.opened = function () {   // called by zoom() each time the reader shows a card
    mount(); var g = G(), uid = g && g.zoomUid, list = uid ? order() : [], i = list.map(function (x) { return x.uid; }).indexOf(uid);
    if (i < 0 || list.length < 2) { bar.hidden = true; S.at = null; return; }
    S.at = { i: i, n: list.length, uid: uid }; bar.hidden = false;
    $("zStepAt").textContent = list[i].where + " · " + (i + 1) + " of " + list.length + " cards in play";
  };
  function step(d, how) {
    var g = G(), list = order(), uid = g && g.zoomUid, i = list.map(function (x) { return x.uid; }).indexOf(uid); if (i < 0 || list.length < 2) return false;
    var nx = list[(i + d + list.length) % list.length], o = (SS.objs() || {})[nx.uid]; if (!o) return false;
    SS.inspectObj(o); S.steps++; if (how === "swipe") S.swipes++; return true;
  }
  S.step = step;
  bar.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; e.stopPropagation(); var id = b.id; if (step(id === "zPrev" ? -1 : 1, "button")) try { $(id).focus({ preventScroll: true }); } catch (x) { } });
  // a swipe on the card: at least 60 px sideways, more sideways than up or down
  var x0 = null, y0 = 0;
  function onBody(e) { return !bar.hidden && $("zoom") && $("zoom").style.display === "flex" && e.target.closest && e.target.closest("#zBody"); }
  addEventListener("pointerdown", function (e) { x0 = onBody(e) ? e.clientX : null; y0 = e.clientY; }, true);
  addEventListener("pointerup", function (e) { if (x0 == null) return; var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null; if (Math.abs(dx) >= 60 && Math.abs(dy) < Math.abs(dx) / 2) step(dx < 0 ? 1 : -1, "swipe"); }, true);
  addEventListener("pointercancel", function () { x0 = null; }, true);
  document.addEventListener("keydown", function (e) { if (bar.hidden || !$("zoom") || $("zoom").style.display !== "flex") return; if (e.key === "ArrowRight" || e.key === "ArrowLeft") { var t = e.target; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return; e.preventDefault(); step(e.key === "ArrowRight" ? 1 : -1, "key"); } });
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount); else mount();
})();
