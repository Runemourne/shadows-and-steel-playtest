// Sprint 7 package 6: card and H-Hour moments (owner: the moments lane). Loaded by the staged page after battle.js.
// What it does to play:
//  - A card moment: when either side plays an Effect, uses an ability, reacts, or a card goes off at H-Hour, the card is shown
//    on an opaque panel with its name, whose it is and the line that is happening, for about one second per three words of that
//    line (2 to 15 s, Speed scales it). A bar shows the time. A tap anywhere lets it go; a press and hold keeps it while held.
//    Settings, "Card moments": Quick (the old pace), Read (the default), Wait for a tap. SKIP TO MY TURN still skips.
//  - LAST CARD: a control in the hand's handle bar, left of its arrow, opens the last card shown in the card reader, with the four
//    before it one tap away.
//  - On the table: an attack draws a line from the attacker to its target, an impact ring, then the damage (or NO DAMAGE,
//    CANCELLED) at the target for 2.5 s; damage from an Effect or an H-Hour card is drawn from the Mission Track to the target.
//    H-Hour starts with a short stinger on the Mission Track.
//  - Reduced motion: nothing of this moves; the same facts are still marks and words. Without it: no full-screen flash,
//    at most three small flashes a second, none red.
// Needs patches_20_moments.py for SSMoments.show / SSMoments.gate and window.SSMomentsAPI; with neither, it stays out of the way.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var M = window.SSMoments = {
    stats: { frames: { effect: 0, ability: 0, reaction: 0, hhour: 0 }, shown: { effect: 0, ability: 0, reaction: 0, hhour: 0 }, held: [], anims: 0, flashes: [], attacks: [], effectLines: 0, stingers: 0 },
    recent: [], active: null, pend: null, cur: null, atk: null, card: null
  };
  function G() { return window.SS && window.SS.G; }
  function rm() { return document.documentElement.classList.contains("rm"); }
  function pace() { var p = window.SS && SS.PREF && SS.PREF.moments; return p === "quick" || p === "tap" ? p : "read"; }
  function names() { var g = G(); return (g && g.info && g.info.names) || ["You", "The bot"]; }
  function spect() { var g = G(); return !!(g && g.info && g.info.spectate); }
  function anim() { M.stats.anims++; }

  // the stored setting (battle.js keeps only its own keys, so the moments read theirs back here)
  (function () { try { var st = JSON.parse(localStorage.getItem("ss.settings") || "null"); if (window.SS && SS.PREF) SS.PREF.moments = st && /^(quick|read|tap)$/.test(st.moments) ? st.moments : "read"; } catch (e) { if (window.SS && SS.PREF) SS.PREF.moments = "read"; } })();

  // ---------- reading a frame ----------
  var RX_REACT = /^(.+?)(?:'s)? ([A-Z0-9][A-Z0-9 '\-]+?) (covers the target|intercepts|cancels the action|counterfires)/, RX_EVAC = /^(Your|.+?'s) .+ is destroyed but evacuated to hand by ([A-Z0-9][A-Z0-9 '\-]+?)\./;
  function classify(f) {   // what kind of card moment this frame is, if any: {kind, name, owner, verb}
    var t = f.text || "", fx = f.fx || {}, m;
    if (/^--- /.test(t) || /^step/.test(fx.kind || "")) return null;
    if ((m = t.match(/^H-Hour: (.+?)'s ([A-Z0-9][A-Z0-9 '\-]+?) (resolves|ends|completes)/))) return { kind: "hhour", name: m[2], owner: m[1], verb: m[3] };
    if (fx.kind === "ability" && /\buses?\b/.test(t)) { var o = (SS.objs() || {})[fx.src], am = t.match(/^(.+?) uses? ([A-Z0-9][A-Z0-9 '\-]*[A-Z0-9])/); return { kind: "ability", name: o && o.u ? o.u.name : am ? am[2] : "", ability: am ? am[2] : "", owner: am ? am[1] : "" }; }
    if ((m = t.match(/^(.+?) fires? ([A-Z0-9][A-Z0-9 '\-]+?):/))) return { kind: "reaction", name: m[2], owner: m[1], verb: "fires" };
    if ((m = t.match(RX_REACT))) return { kind: "reaction", name: m[2], owner: m[1], verb: m[3] };
    if ((m = t.match(RX_EVAC))) return { kind: "reaction", name: m[2], owner: m[1].replace(/'s$/, ""), verb: "evacuated" };
    if ((m = t.match(/^(.+?) plays? ([A-Z0-9][A-Z0-9 '\-]+?)[:.]/))) return { kind: "effect", name: m[2], owner: m[1], verb: "plays" };
    if ((m = t.match(/^(.+?) puts? ([A-Z0-9][A-Z0-9 '\-]+?) on the Mission Track \((\d+) round/))) return { kind: "effect", name: m[2], owner: m[1], verb: "puts", rounds: m[3], puts: true };
    return null;
  }
  function parse(l) { var m = String(l).match(/^([^:]{2,60}?):\s*(.*)$/), head = m ? m[1] : "", parts = head.split(" · "); return { timing: (parts[0] || "").replace(/\s*\[[^\]]*\]/g, "").trim(), name: parts.slice(1).join(" · "), body: m ? m[2] : String(l), head: head }; }
  function linesOf(c) {   // the line(s) that are happening, as {head, body}
    var f = (G().faces || {})[c.name] || {}, ls = (f.lines || []).map(parse);
    if (!ls.length) return f.text ? [{ head: "", body: String(f.text) }] : [];
    var pick = [];
    if (c.kind === "ability") pick = ls.filter(function (l) { return c.ability && l.name && l.name.toUpperCase() === c.ability; });
    if (c.kind === "reaction") { var want = /cancel|intercept/.test(c.verb) ? /INTERCEPT|Cancel/i : /cover/.test(c.verb) ? /COVER/i : /counterfire/.test(c.verb) ? /COUNTERFIRE/i : /evacuat/.test(c.verb) ? /CASEVAC|return it to hand/i : /./, rs = ls.filter(function (l) { return /^REACTION/.test(l.timing); }); pick = rs.filter(function (l) { return want.test(l.head + " " + l.body); }).slice(0, 1); if (!pick.length) pick = rs.slice(0, 1); }
    if (c.kind === "ability" && !pick.length) pick = usedLine(c, ls);   // Sprint 9 round two: the ACTION or INFILTRATE line that was used, never a SUPPORT or ABILITY line beside it
    if (c.kind === "ability" && !pick.length) pick = ls.filter(function (l) { return !/^(ATTACK|REACTION|PASSIVE)/.test(l.timing); }).slice(0, 1);
    if (!pick.length) pick = ls.filter(function (l) { return !/^REACTION/.test(l.timing); });
    if (!pick.length) pick = ls;
    return pick.slice(0, 3).map(function (l) { return { head: l.name || l.timing, body: l.body, timing: l.timing }; });
  }
  // Sprint 9 round two (mark 1): an "ability" moment ("You use AUGUR.") is always a card's ACTION or INFILTRATE line (the engine marks it only
  // in do_ability). Which one: the choice that led to it, as the page holds it (the person's answer just given, or the bot's own pick in the
  // frame's "why"): "Send X to infiltrate ..." is the INFILTRATE line, "Use X ..." an ACTION line. A card with two ACTION lines (THE SILENT)
  // is told apart by the words of that choice, the question that follows and the next log lines (each line's name and words, by their first
  // six letters). When the words still cannot tell, every such line is shown, never a line of another kind.
  var stem = function (w) { return w.toLowerCase().slice(0, 6); };
  function wordsOf(s) { return String(s || "").split(/[^A-Za-z]+/).filter(function (w) { return w.length >= 4; }).map(stem); }
  function hintFor(c) {   // the words that say which line was used: {pick: the choice's label, more: what follows}
    var g = G(), pick = "", more = [], nm = String(c.name || ""), own = sideOf(c.owner) === "own" && !spect();
    var has = function (t) { return String(t || "").indexOf(nm) >= 0; };
    if (own && g.lastChosen && has(g.lastChosen.label) && /^(Use|Send|Reveal) /.test(g.lastChosen.label)) pick = g.lastChosen.label;
    else if (M.whyLast && M.cur && (M.cur.n || 0) - (M.whyLast.n || 0) <= 3 && has(M.whyLast.pick) && /^(Use|Send|Reveal) /.test(M.whyLast.pick)) pick = M.whyLast.pick;
    (g.queue || []).slice(0, 6).some(function (f) { var t = f.text || ""; if (/^--- |\buses? /.test(t)) return true; more.push(t); return false; });
    if (own && g.pend && g.pend.prompt) more.push(g.pend.prompt);
    M.lastHint = { card: nm, pick: pick, more: more.slice() }; return { pick: pick, more: more.join(" ") };
  }
  function usedLine(c, ls) {
    var act = ls.filter(function (l) { return /^(ACTION|INFILTRATE)\b/.test(l.timing); }); if (!act.length) return [];
    var h = hintFor(c), p = h.pick.replace(/^Reveal .*?, then: /, "");
    var kind = /^send .+ to infiltrate/i.test(p) ? "INFILTRATE" : /^use /i.test(p) ? "ACTION" : "";
    var one = kind ? act.filter(function (l) { return l.timing.indexOf(kind) === 0; }) : act; if (!one.length) one = act;
    if (one.length < 2) return one;
    var hw = wordsOf(p + " " + h.more), set = {}; hw.forEach(function (w) { set[w] = 1; });
    var score = one.map(function (l) { var n = wordsOf(l.name.replace(/\s+\d+$/, "")), b = wordsOf(l.body), sc = 0;
      if (n.length && n.every(function (w) { return set[w]; })) sc += 10; b.forEach(function (w, i) { if (set[w] && b.indexOf(w) === i) sc++; }); return sc; });
    var top = Math.max.apply(null, score), best = one.filter(function (l, i) { return score[i] === top; });
    return top > 0 && best.length === 1 ? best : one;
  }
  function usedHead(c) { var ls = linesOf(c), l = ls[0]; return l && /^INFILTRATE/.test(l.timing || "") ? "Sent to infiltrate" : l && /^ACTION/.test(l.timing || "") ? "Action used" : "Ability used"; }
  function whose(owner) { var nm = names(), o = String(owner || "").replace(/'s$/, ""); if (spect()) return o === "Your" ? nm[0] : o; if (o === "You" || o === "Your" || o === nm[0]) return "You"; if (o === nm[1] || o === "The bot") return "Enemy"; return o; }
  function sideOf(owner) { var nm = names(), o = String(owner || "").replace(/'s$/, ""); return (o === "You" || o === "Your" || o === nm[0]) ? "own" : "foe"; }
  function words(s) { return String(s).split(/\s+/).filter(Boolean).length; }

  // ---------- the panel ----------
  var P = document.createElement("div"); P.id = "ssm"; P.className = "ssm"; P.hidden = true; P.setAttribute("role", "status"); P.setAttribute("aria-live", "polite");
  P.innerHTML = '<img id="ssmImg" alt=""><div class="tx" id="ssmTx"><div class="hd"><span class="who" id="ssmWho"></span> · <span class="lab" id="ssmLab"></span></div><div class="nm" id="ssmName"></div><div class="ln" id="ssmLn"></div>' +
    '<div class="more" id="ssmMore">▼ Scroll for the rest · it waits for you</div><div class="sbar" aria-hidden="true"><i id="ssmBar"></i></div><div class="hint" id="ssmHint">Tap to go on · hold to keep it</div></div>';
  var FX = document.createElement("div"); FX.id = "ssmFx"; FX.setAttribute("aria-hidden", "true");
  FX.innerHTML = '<svg id="ssmSvg" width="100%" height="100%"><defs><marker id="ssmArr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L10,5L0,10z" fill="#ffd27a"/></marker></defs></svg>';
  var LC = document.createElement("button"); LC.id = "ssmLast"; LC.type = "button"; LC.hidden = true; LC.innerHTML = "LAST CARD"; LC.setAttribute("aria-label", "Last card shown: read it again");
  function mount() { if (!P.parentNode) { document.body.appendChild(FX); document.body.appendChild(P); document.body.appendChild(LC); } }
  if (document.body) mount(); else addEventListener("DOMContentLoaded", mount);

  function rect(id) { var e = $(id); if (!e || e.offsetParent === null && getComputedStyle(e).position !== "fixed") return null; var r = e.getBoundingClientRect(); return r.width || r.height ? r : null; }
  function placeLast() {   // in the hand's handle bar, at its right, just left of the handle's arrow (the table lane keeps that space free)
    var g = G(), cov = $("cover"), on = !!(g && g.info && g.view) && !(cov && cov.style.display !== "none" && getComputedStyle(cov).display !== "none");
    var hh = document.querySelector("#hand .hhandle"), hr = hh && hh.getBoundingClientRect(); if (!hr || !hr.width || !hr.height) on = false;
    LC.hidden = !on; if (!on) return null;
    var ar = hh.querySelector("i"), arR = ar && ar.getBoundingClientRect(), x1 = Math.round(arR && arR.width ? arR.left - 6 : hr.right - 40), h = Math.max(44, Math.round(hr.height)), y = Math.round(hr.top + (hr.height - h) / 2);
    LC.style.top = y + "px"; LC.style.left = (x1 - 100) + "px"; LC.style.height = h + "px"; LC.disabled = !M.recent.length; return { left: x1 - 100, top: y, right: x1, bottom: y + h };
  }
  function placePanel() {   // grows to fit the line; first above the prompt panel's buttons, then down to the hand's handle bar (a tap releases it); never over the top bar or the handle bar
    var top = rect("top"), y0 = Math.round((top ? top.bottom : 0) + 4), pr = $("prompt"), W = innerWidth, hh = document.querySelector("#hand .hhandle"), hr = hh && hh.getBoundingClientRect();
    var yMax = (hr && hr.height ? hr.top : innerHeight) - 6, yb = yMax;
    if (pr) { var bs = Array.prototype.filter.call(pr.querySelectorAll("button"), function (b) { var r = b.getBoundingClientRect(); return r.width && r.height; }); var pt = pr.getBoundingClientRect(); yb = Math.min(yMax, bs.length ? Math.min.apply(null, bs.map(function (b) { return b.getBoundingClientRect().top; })) - 6 : (pt.height ? pt.top - 6 : yMax)); }
    var lc = placeLast(), x0 = 8, x1 = W - 8, rt = rect("route"); if (rt && rt.top < yMax && rt.bottom > y0 && rt.left > W / 2) x1 = Math.min(x1, Math.round(rt.left - 6));   // the Zone track stays in view
    var wd = Math.min(x1 - x0, 640), room = yb - y0, sh = room < 220;
    P.style.left = Math.round(x0 + (x1 - x0 - wd) / 2) + "px"; P.style.width = wd + "px"; P.style.top = y0 + "px"; P.style.height = "auto";
    P.classList.toggle("short", sh); var imgH = Math.max(60, Math.min(Math.max(room, 120) - 16, (wd * (sh ? .28 : .42)) * 480 / 280, 420)); $("ssmImg").style.height = imgH + "px";
    P.style.maxHeight = room + "px"; var ln = $("ssmTx"); ln.scrollTop = 0;
    if (ln.scrollHeight > ln.clientHeight + 1 || P.scrollHeight > P.clientHeight + 1) { P.style.maxHeight = (yMax - y0) + "px"; }   // does not fit above the buttons: grow down to the handle bar
    var over = ln.scrollHeight > ln.clientHeight + 1;
    if (over) { P.classList.add("noimg"); over = ln.scrollHeight > ln.clientHeight + 1; } else P.classList.remove("noimg");   // still too long: the words take the picture's place (LAST CARD shows the printed card)
    P.classList.toggle("scroll", over); M.scrollNeeded = over;
    if (room > 0 && P.getBoundingClientRect().height < room && !over) P.style.top = Math.round(y0 + (room - P.getBoundingClientRect().height) / 2) + "px";
    return { y0: y0, yMax: yMax, room: room, over: over };
  }
  function atEnd() { var ln = $("ssmTx"); return ln.scrollTop + ln.clientHeight >= ln.scrollHeight - 2; }
  addEventListener("resize", function () { placeLast(); if (M.active) placePanel(); });
  setInterval(placeLast, 700);

  function record(c, label) {
    M.recent.unshift({ name: c.name, label: label, who: whose(c.owner), round: G().view && G().view.round }); M.recent = M.recent.slice(0, 5); placeLast();
  }
  M.show = function (name, label, hot) {   // battle.js's showcase(): the moment is shown at the end of this frame (gate)
    var g = G(); if (!g || g.skip) return null; if (!(g.faces || {})[name]) return 0; M.pend = { name: name, label: label, hot: hot }; return 1.35;
  };

  // ---------- holding the frame ----------
  var clock = null;
  function hide() { P.hidden = true; P.classList.remove("in"); M.active = null; if (clock) { clearInterval(clock); clock = null; } }
  function release(why) { var a = M.active; if (!a) return; a.out = why; a.shown = Date.now() - a.t0 - a.frozenMs; M.stats.held.push({ kind: a.kind, name: a.name, need: Math.round(a.need), shown: a.shown, out: why, pace: a.pace }); hide(); a.go(); }
  function startMoment(c, go, engineWait, label, hot) {
    var g = G(), ls = linesOf(c), body = ls.map(function (l) { return (l.head ? l.head + ": " : "") + l.body; }).join(" "), sp = g.speed || 1, p = pace();
    var read = Math.min(15, Math.max(2, words(body) / 3)) / sp, need = p === "quick" ? Math.max(engineWait, 1.35 / sp) : p === "tap" ? Infinity : Math.max(read, engineWait);
    var f = (g.faces || {})[c.name]; try { $("ssmImg").src = f ? SS.drawCard(f, 1.4).toDataURL("image/jpeg", .88) : ""; $("ssmImg").style.display = f ? "" : "none"; } catch (e) { $("ssmImg").style.display = "none"; }
    $("ssmImg").alt = c.name; $("ssmWho").textContent = whose(c.owner); $("ssmName").textContent = c.name; $("ssmLab").textContent = label;
    $("ssmLn").innerHTML = ls.length ? ls.map(function (l) { return "<p>" + (l.head ? "<b>" + esc(l.head) + ":</b> " : "") + esc(l.body) + "</p>"; }).join("") : "<p>" + esc(g.caption || "") + "</p>";
    $("ssmHint").textContent = p === "tap" ? "Tap to go on · Settings: Card moments" : "Tap to go on · hold to keep it";
    P.className = "ssm " + sideOf(c.owner) + (hot ? " hot" : "") + (p === "tap" ? " tap" : ""); placePanel(); P.hidden = false;
    if (!rm()) { void P.offsetWidth; P.classList.add("in"); anim(); } else P.classList.add("in");
    M.stats.shown[c.kind]++; record(c, label); (M.stats.log = M.stats.log || []).push({ kind: c.kind, name: c.name, label: label, lines: ls.map(function (l) { return l.head; }) }); M.stats.log = M.stats.log.slice(-60);
    M.active = { kind: c.kind, name: c.name, go: go, need: need * 1000, t0: Date.now(), frozenMs: 0, frozeAt: 0, pace: p, gen: g.pgen };
    var smooth = !rm(); if (smooth && isFinite(need)) anim();
    clock = setInterval(function () {
      var a = M.active, gg = G(); if (!a) return;
      if (!gg || gg.pgen !== a.gen) { hide(); return; }   // a new game, a replay jump, an Undo
      if (gg.skip) return release("skip");
      var now = Date.now(), held = a.frozeAt ? now - a.frozeAt : 0, el = now - a.t0 - a.frozenMs - held;
      if (!isFinite(a.need)) { $("ssmBar").style.transform = "scaleX(1)"; return; }
      var left = Math.max(0, 1 - el / a.need); $("ssmBar").style.transform = "scaleX(" + (smooth ? left : Math.ceil(left * Math.ceil(a.need / 1000)) / Math.ceil(a.need / 1000)).toFixed(3) + ")";
      var unread = M.scrollNeeded && !atEnd(); $("ssmMore").style.visibility = unread ? "visible" : "hidden"; if (el >= a.need && !a.frozeAt && !unread) release("time");
    }, smooth ? 50 : 250);
  }
  // a tap anywhere lets it go; a press and hold keeps it while held
  // A tap anywhere lets the moment go and does nothing else: while a moment is up, and for a moment after the tap that released it,
  // every press, tap and click is kept from the page under it (the card reader, the buttons, the table, the hand). A press and hold keeps it.
  var downXY = null, swallowUntil = 0;
  function inScroll(e) { return M.scrollNeeded && P.contains(e.target); }
  function swallow(e, keepDefault) { e.stopImmediatePropagation(); e.stopPropagation(); if (!keepDefault && e.cancelable) e.preventDefault(); }
  function busy() { return !!M.active || Date.now() < swallowUntil; }
  window.addEventListener("pointerdown", function (e) { var a = M.active; if (!a) { if (busy()) swallow(e); return; } downXY = [e.clientX, e.clientY]; a.frozeAt = Date.now(); P.classList.add("frozen"); swallow(e, inScroll(e)); }, true);
  window.addEventListener("pointerup", function (e) { var a = M.active; if (!a) { if (busy()) swallow(e); return; } var sc = inScroll(e); swallow(e, sc); if (!a.frozeAt) return;
    var d = Date.now() - a.frozeAt, mv = downXY ? Math.abs(e.clientX - downXY[0]) + Math.abs(e.clientY - downXY[1]) : 0; a.frozenMs += d; a.frozeAt = 0; P.classList.remove("frozen");
    if (d < 350 && mv < 10 && (!sc || atEnd())) { swallowUntil = Date.now() + 700; M.stats.swallowed = (M.stats.swallowed || 0) + 1; release("tap"); } }, true);
  window.addEventListener("pointercancel", function () { var a = M.active; if (!a || !a.frozeAt) return; a.frozenMs += Date.now() - a.frozeAt; a.frozeAt = 0; P.classList.remove("frozen"); }, true);
  ["click", "dblclick", "mousedown", "mouseup", "touchstart", "touchend", "contextmenu"].forEach(function (t) { window.addEventListener(t, function (e) { if (busy()) swallow(e, (t === "touchstart") && inScroll(e)); }, { capture: true, passive: false }); });
  document.addEventListener("keydown", function (e) { if (M.active && /^(Enter| |Escape)$/.test(e.key)) { e.preventDefault(); release("key"); } }, true);

  M.measure = function (c, label) {   // for the proof: the panel as a moment would show it, measured; nothing is held or timed
    var ls = linesOf(c); $("ssmName").textContent = c.name; $("ssmWho").textContent = "Enemy"; $("ssmLab").textContent = label || c.kind; var f = (G().faces || {})[c.name];
    $("ssmLn").innerHTML = ls.map(function (l) { return "<p>" + (l.head ? "<b>" + esc(l.head) + ":</b> " : "") + esc(l.body) + "</p>"; }).join(""); $("ssmImg").style.display = f ? "" : "none";
    P.className = "ssm foe"; P.hidden = false; var pp = placePanel(), ln = $("ssmTx"), pr = P.getBoundingClientRect(), tb = rect("top"), hh = document.querySelector("#hand .hhandle"), hr = hh && hh.getBoundingClientRect();
    var r = { name: c.name, kind: c.kind, words: words(ls.map(function (l) { return (l.head ? l.head + ": " : "") + l.body; }).join(" ")), textH: ln.scrollHeight, boxH: ln.clientHeight, scroll: pp.over, panel: [pr.top, pr.bottom].map(Math.round),
      overTop: !!(tb && pr.top < tb.bottom - .5), overHandle: !!(hr && hr.height && pr.bottom > hr.top + .5) };
    var bars = $("ssmMore"); P.hidden = true; return r; };
  M.lines = function (c) { return linesOf(c); };
  M.usedHead = function (c) { return usedHead(c); };   // for the proof: the label an "ability" moment carries
  // ---------- the table: what happened to what ----------
  var marks = [];
  function objByName(name, side) { var O = SS.objs() || {}, r = null; Object.keys(O).forEach(function (k) { var o = O[k], u = o && o.u; if (r || !u) return; if ((u.name === name || u.kind === name) && (!side || o.side === side)) r = o; }); return r; }
  function pos(o) { try { return SSMomentsAPI.screenPos(o); } catch (e) { return null; } }
  function svgLine(a, b, cls) { var s = $("ssmSvg"), l = document.createElementNS("http://www.w3.org/2000/svg", "line"); l.setAttribute("x1", a.x); l.setAttribute("y1", a.y); l.setAttribute("x2", b.x); l.setAttribute("y2", b.y); l.setAttribute("class", cls + (rm() ? "" : " mv")); l.setAttribute("marker-end", "url(#ssmArr)"); s.appendChild(l); if (!rm()) anim(); return l; }
  function tag(p, txt, cls, sec) { var d = document.createElement("div"); d.className = "ssmTag " + (cls || ""); d.textContent = txt; d.style.left = Math.round(p.x) + "px"; d.style.top = Math.round(p.y) + "px"; FX.appendChild(d); if (!rm()) anim(); marks.push(d); setTimeout(function () { d.remove(); }, sec * 1000); return d; }
  var flashT = [];
  function ring(p) {   // the impact: a small ring at the place hit; a flash only without Reduced motion, at most three a second
    var d = document.createElement("div"); d.className = "ssmRing"; d.style.left = Math.round(p.x) + "px"; d.style.top = Math.round(p.y) + "px"; FX.appendChild(d); setTimeout(function () { d.remove(); }, 1600);
    if (rm()) return; var now = Date.now(); flashT = flashT.filter(function (t) { return now - t < 1000; }); if (flashT.length >= 3) return; flashT.push(now); d.classList.add("fl"); anim();
    M.stats.flashes.push({ t: now, area: Math.round(Math.PI * 40 * 40) / (innerWidth * innerHeight) });
  }
  function clearLines(sec) { var s = $("ssmSvg"), ls = Array.prototype.slice.call(s.querySelectorAll("line")); setTimeout(function () { ls.forEach(function (l) { l.remove(); }); }, sec * 1000); }
  function onAttack(f) {
    var fx = f.fx || {}, O = SS.objs() || {}, a = O[fx.src], b = O[fx.dst]; if (!b) return;
    var pb = pos(b), pa = a ? pos(a) : null; if (!pb) return;
    if (pa) svgLine(pa, pb, "atk");
    ring(pb); tag({ x: pb.x, y: pb.y - 46 }, "TARGET", "sTg", 1.4);
    if (M.atk && !M.atk.done) M.stats.attacks.push({ attacker: M.atk.src, target: M.atk.dst, shown: "(no result line before the next attack)", log: "" });
    M.atk = { src: a && a.u ? a.u.name : "?", dst: b.u ? (b.u.name || b.u.kind) : String(fx.dst), dstObj: b, n: f.n, text: f.text, done: false };
    if ((b.u || {}).name == null && /^b:/.test(fx.dst)) M.atk.dst = fx.dst.slice(2);
  }
  function outcome(f) {   // a line after an attack or a card: the damage at its target, or NO DAMAGE / CANCELLED
    var t = f.text || "", sp = (G().speed || 1), stay = Math.max(2.5, 2.5 / sp), m;
    if (M.atk && !M.atk.done) {
      var A = M.atk;
      if ((m = t.match(/^(?:.+?'s )?(.+?) takes (\d+) damage/)) && m[1] === A.dst) { var p = pos(A.dstObj); if (p) tag({ x: p.x, y: p.y - 42 }, "−" + m[2] + " " + A.dst, "sDmg", stay); A.done = true; A.shown = +m[2]; M.stats.attacks.push({ attacker: A.src, target: A.dst, shown: "−" + m[2], log: t }); clearLines(.6); if (/^b:/.test(String((f.fx || {}).dst || "")) || (A.dstObj && A.dstObj.base)) SSMomentsAPI.shake(.2); return; }
      if (/The attack does no damage|intercepts\. The action is canceled|cancels the action| is canceled\./.test(t)) { var p2 = pos(A.dstObj), what = /no damage/.test(t) ? "NO DAMAGE" : "CANCELLED"; if (p2) tag({ x: p2.x, y: p2.y - 42 }, what, "sMiss", stay); A.done = true; M.stats.attacks.push({ attacker: A.src, target: A.dst, shown: what, log: t }); clearLines(.6); return; }
    }
    if (M.card && (m = t.match(/^(?:(.+?)'s )?(.+?) takes (\d+) damage/))) {   // an Effect or an H-Hour card: from the Mission Track to the target
      var side = m[1] ? sideOf(m[1]) : null, o = objByName(m[2], side) || objByName(m[2]), po = o && pos(o), mt = rect("mtrack");
      if (po) { if (mt) { svgLine({ x: mt.right + 2, y: mt.top + mt.height / 2 }, po, "eff"); clearLines(stay * .8); M.stats.effectLines++; } ring(po); tag({ x: po.x, y: po.y - 30 }, "−" + m[3] + " " + m[2], "sDmg", stay); tag({ x: po.x, y: po.y - 56 }, M.card.name, "sSrc", stay); M.stats.effects = (M.stats.effects || []).concat([{ card: M.card.name, target: m[2], shown: "−" + m[3], log: t }]); if (o.base) SSMomentsAPI.shake(.2); }
    }
  }
  function stinger(sec) {   // H-Hour: a short stinger on the Mission Track
    var mt = rect("mtrack"); if (!mt) return; M.stats.stingers++;
    var d = document.createElement("div"); d.className = "ssmSting"; d.textContent = "H-HOUR"; d.style.left = Math.round(mt.right + 4) + "px"; d.style.top = Math.round(mt.top + mt.height / 2 - 20) + "px"; FX.appendChild(d); if (!rm()) anim();
    setTimeout(function () { d.remove(); }, sec * 1000);
  }

  // every frame, before it is shown
  var lastText = "";
  if (window.SSHooks) SSHooks.on("frame", function (d) {
    var f = d.frame; M.prev = M.cur; M.cur = f; M.pend = null; if (f && f.why) M.whyLast = { pick: String(f.why.pick || ""), n: f.n }; if (d.skipping) return;
    var c = classify(f); if (c && !(c.puts && M.lastMoment === c.name)) M.stats.frames[c.kind]++;
  });
  // the end of each frame: hold it for its moment; draw what it did on the table
  M.gate = function (go, engineWait, f) {
    var g = G(); if (!g || g.skip || g.dir || !f) return false;
    var fx = f.fx || {}, t = f.text || "", c = classify(f), prevMom = M.lastMoment; M.lastMoment = null;
    try {
      if (fx.kind === "attack" && /attack/.test(t)) onAttack(f); else outcome(f);
      if (/^--- |^Round \d+\. /.test(t) || (fx.kind === "attack")) M.card = null;
    } catch (e) { }
    if (!c) return false;
    if (c.puts && prevMom === c.name) { M.lastMoment = c.name; var r0 = M.recent[0]; if (r0 && r0.name === c.name) r0.label = "On the Mission Track: " + c.rounds + " round" + (c.rounds === "1" ? "" : "s") + " to H-Hour"; return false; }   // "plays X" then "puts X on the Mission Track": one moment
    var nm = M.pend && M.pend.name === c.name ? M.pend : null, sp = g.speed || 1;
    var label = nm ? nm.label : c.kind === "ability" ? usedHead(c) + (c.ability && c.ability !== c.name ? ": " + c.ability : "") : c.kind === "reaction" ? "Reaction" + (c.verb && c.verb !== "fires" ? ": " + c.verb : "") : c.kind === "hhour" ? "H-Hour: " + (c.verb === "ends" ? "ends" : "resolves now") : "Effect played";
    if (label === "Played") label = "Effect played";
    if (c.kind === "effect") { var nx = g.queue && g.queue[0]; if (nx && new RegExp(" puts? " + c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " on the Mission Track \\((\\d+) round").test(nx.text || "")) { var rr = (nx.text.match(/\((\d+) round/) || [])[1]; label = "On the Mission Track: " + rr + " round" + (rr === "1" ? "" : "s") + " to H-Hour"; } }
    M.lastMoment = c.name; if (c.kind === "effect" || c.kind === "hhour") M.card = { name: c.name }; else M.card = null;
    var first = c.kind === "hhour" && !/^H-Hour/.test((M.prev && M.prev.text) || ""), st = first ? 1.0 / sp : 0;
    if (first) { stinger(st + .2); try { SSMomentsAPI.shake(.12); } catch (e) { } }
    var hot = nm ? nm.hot : c.kind !== "effect";
    if (st) { var gen = g.pgen; setTimeout(function () { var gg = G(); if (!gg || gg.pgen !== gen) return; if (gg.skip) return go(); startMoment(c, go, Math.max(0, engineWait - st), label, hot); }, st * 1000); }
    else startMoment(c, go, engineWait, label, hot);
    return true;
  };

  // ---------- LAST CARD ----------
  var EAR = null, earName = "";
  function openCard(i) {
    var r = M.recent[i], f = r && (G().faces || {})[r.name]; if (!f) return;
    SS.zoom(f, { caption: (i ? "Shown earlier" : "Last card shown") + (r.round ? " (round " + r.round + ")" : "") + ": " + r.who + " · " + r.label });
    earName = r.name; if (EAR) EAR.remove();
    EAR = document.createElement("div"); EAR.id = "ssmEarlier";
    EAR.innerHTML = M.recent.length > 1 ? "<b>Cards shown before it:</b> " + M.recent.map(function (x, k) { return k === i ? "" : '<button type="button" data-k="' + k + '">' + esc(x.name) + "</button>"; }).join("") : "";
    var cap = $("zCap"); if (cap && cap.parentNode) cap.parentNode.insertBefore(EAR, cap.nextSibling);
    EAR.onclick = function (e) { var b = e.target.closest("button[data-k]"); if (b) { e.stopPropagation(); openCard(+b.dataset.k); } };
  }
  LC.onclick = function (e) { e.stopPropagation(); e.preventDefault(); if (M.recent.length) openCard(0); };
  ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup"].forEach(function (ev) { LC.addEventListener(ev, function (e) { e.stopPropagation(); }); });   // never reaches the hand's handle
  // the earlier-cards row belongs only to a card opened from LAST CARD
  (function watch() { var z = $("zName"); if (!z) return setTimeout(watch, 500); new MutationObserver(function () { if (EAR && z.textContent !== earName) { EAR.remove(); EAR = null; } }).observe(z, { childList: true, characterData: true, subtree: true }); })();
})();
