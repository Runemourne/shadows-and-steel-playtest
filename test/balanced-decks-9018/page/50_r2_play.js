// Sprint 8 round two, package 10 (ui-frontend): page fixes from the lead's play. Staged only with a trial (numbered 50).
// What it does to play:
//  - The arrow. An attack's or an Effect's line on the table (page/20_moments.js draws them) is gone by the time the page asks
//    you for your next action. Before, a line went only when a damage, "no damage" or "cancelled" line named its target, so an
//    attack that ended any other way ("Contact is broken. The Close attack does nothing.", a target that left the table, a Hidden
//    card) left its arrow drawn for the rest of the round and beyond. Now: a new attack clears the old lines; "does nothing" is an
//    outcome (shown at the target as DOES NOTHING); and when a question is put to you, every line is cleared, except while you are
//    asked whether to react to the attack the line shows (that arrow marks the choice you are making).
//  - (patches_50_r2_play.py takes the written-out feedback form off the Debrief; its PROVIDE FEEDBACK button opens it.)
//  - The feedback form's build line names the cards and decks the game was played on (the trial's, or the released ones for
//    Basic Training). The playtest website's site.js stamps the build with the released files' versions only.
// Needs no other file; with page/20_moments.js missing, the line part has nothing to do.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var R = window.SS_R2 = { cleared: [], build: null };

  // ---------- the arrow ----------
  function lines() { var s = $("ssmSvg"); return s ? Array.prototype.slice.call(s.querySelectorAll("line")) : []; }
  function clear(why) { var ls = lines(); if (!ls.length) return; ls.forEach(function (l) { l.remove(); }); R.cleared.push({ why: why, n: ls.length, t: Date.now() }); }
  function atTarget(word) {   // the word at the attack's target, as 20_moments.js shows NO DAMAGE (same look, same time)
    var M = window.SSMoments, A = M && M.atk; if (!A || A.done) return; A.done = true;
    try { var p = window.SSMomentsAPI.screenPos(A.dstObj), fx = $("ssmFx"); if (!p || !fx) return;
      var d = document.createElement("div"); d.className = "ssmTag sMiss"; d.textContent = word; d.style.left = Math.round(p.x) + "px"; d.style.top = Math.round(p.y - 42) + "px"; fx.appendChild(d);
      var sp = (window.SS && SS.G && SS.G.speed) || 1; setTimeout(function () { d.remove(); }, Math.max(2.5, 2.5 / sp) * 1000); } catch (e) { }
  }
  if (window.SSHooks) {
    SSHooks.on("frame", function (d) {
      var f = d.frame || {}, fx = f.fx || {}, t = f.text || "";
      if (d.skipping) return clear("skip");
      if (fx.kind === "attack" && /attack/.test(t)) return clear("a new attack");   // its own line is drawn just after this
      if (/^--- /.test(t)) return clear("a new round or phase");
      if (/\battack does nothing\b/.test(t)) { atTarget("DOES NOTHING"); setTimeout(function () { clear("does nothing"); }, 600); }
    });
    SSHooks.on("pending", function (d) {
      var k = d.pending && d.pending.kind;
      if (k === "reaction") return;   // the arrow shows the attack you are choosing whether to react to
      clear("a question");
    });
    SSHooks.on("over", function () { clear("the end"); });
    SSHooks.on("pending", function () { setTimeout(keepText, 120); setTimeout(keepText, 400); });
    SSHooks.on("debrief", function (d) { setBuild(d.info); });
    SSHooks.on("pending", function (d) { setBuild(d.info); });
  }

  // ---------- "More" in the answers' row, unless that leaves the question no line ----------
  // When the answers need the whole row (four of them at 430 wide), More's place pushes them to a second row and the panel, sized
  // before, keeps its height: the question's text was squeezed to nothing. Then More goes back under the text, as before, for that
  // question only (patches_50_r2_play.py puts it in the row again for the next one).
  function keepText() {
    var el = $("prompt"), body = el && el.querySelector(".pbody"), ft = el && el.querySelector(".pfoot.pmr"), pm = ft && ft.querySelector(".pmore"), ins = body && (body.querySelector(".instr") || body.firstElementChild);
    if (!pm || !ins) return; var lh = parseFloat(getComputedStyle(ins).lineHeight) || 20;
    if (body.clientHeight + 2 >= lh) return;
    ft.classList.remove("pmr"); el.querySelector(".pwrap").appendChild(pm); R.back = (R.back || 0) + 1;
    try { var b = body; b.dataset.mh = ""; b.style.maxHeight = ""; window.SS.unslice(b, 0); } catch (e) { }
  }

  // ---------- the feedback form's build line ----------
  var base = window.SS_SITE && typeof window.SS_SITE.build === "string" ? window.SS_SITE.build : null;
  function setBuild(info) {
    if (base == null) return; var t = info && info.trial, w;
    if (t && t.on) w = "trial cards v" + t.cards_version + ", decks v" + t.decks_version;
    else { var G = window.SS && SS.G, b = ((G && G.builds) || [])[0], tr = b && b.trial; w = info ? null : tr ? "trial cards v" + tr.cards_version + ", decks v" + tr.decks_version : null; }
    var s = base; if (w) s = /cards v[0-9.]+, decks v[0-9.]+/.test(base) ? base.replace(/cards v[0-9.]+, decks v[0-9.]+/, w) : base + " · " + w;
    window.SS_SITE.build = s; R.build = s;
  }
  // before any game in this visit (Provide Feedback from the Main Menu): every game but Basic Training plays the trial
  (function first(n) { var G = window.SS && SS.G; if (G && G.builds && G.builds.length) return G.info ? null : setBuild(null); if (n < 240) setTimeout(function () { first(n + 1); }, 500); })(0);
})();
