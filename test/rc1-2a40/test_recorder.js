/* The test recorder: loaded only by an unlisted test page (build_test_page.py --recorder), never by the game or the live site.
   It shows a small label with the test's name and keeps a record of the last runs in this browser (tap the label to read them),
   so a crash on a real phone leaves something to look at. Version 0.2, 19 November 2026: the label is one short line in the bottom-left corner,
   clear of the game's controls; tapping it also lists the last 30 inputs (event sequence, target, ms since the previous one, and whether an
   engine choice was committed and by which control), so a phone screenshot shows what a tap really did. */
(function () {
  var BUILD = "TEST " + (window.SS_TEST_NAME || "page");
  var id = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var S = { build: BUILD, id: id, started: new Date().toISOString(), ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: window.devicePixelRatio || 1,
    framed: (function () { try { return window.top !== window.self; } catch (e) { return true; } })(),
    est: 1, maxEst: 1, pinches: 0, blockedMoves: 0, blockedPinches: 0, freeMoves: 0, notCancelable: 0, gestureEvents: 0, hasTouchScale: null,
    vv: 1, maxVv: 1, screen: "", last: "", clean: false, t: 0,
    resizes: 0, resizesInPinch: 0, minW: innerWidth, maxW: innerWidth, minH: innerHeight, maxH: innerHeight, canvasChanges: 0, canvas: "", ctxLost: 0, maxGapMs: 0, lastGapMs: 0 };
  var g = null, badge = null, prevLine = "";
  function scr() { var op = document.getElementById("op"); if (op && getComputedStyle(op).display !== "none" && !op.classList.contains("table")) return "film"; var cv = document.getElementById("cover"); if (cv && getComputedStyle(cv).display !== "none") return "setup"; return "game"; }
  function show() { if (!badge) return; badge.textContent = BUILD + " · zoom " + S.est.toFixed(1) + (prevLine ? " · " + prevLine : "") + " · tap for log"; }
  function save() { S.t = Date.now(); S.screen = scr(); try { S.vv = window.visualViewport ? visualViewport.scale : 1; S.maxVv = Math.max(S.maxVv, S.vv); } catch (e) { } try { localStorage.setItem("ssdiag", JSON.stringify(S)); } catch (e) { } show(); push(); }
  function push() { }   // nothing leaves this browser
  addEventListener("resize", function () { S.resizes++; if (g) S.resizesInPinch++; S.minW = Math.min(S.minW, innerWidth); S.maxW = Math.max(S.maxW, innerWidth); S.minH = Math.min(S.minH, innerHeight); S.maxH = Math.max(S.maxH, innerHeight);
    var c = document.getElementById("gl"); if (c) { var k = c.width + "x" + c.height; if (S.canvas && k !== S.canvas) S.canvasChanges++; S.canvas = k; } S.last = "resize " + innerWidth + "x" + innerHeight; save(); });
  var lastF = 0; (function tick(now) { if (lastF) { var d = Math.round(now - lastF); S.lastGapMs = d; if (d > S.maxGapMs && d < 60000) S.maxGapMs = d; } lastF = now; requestAnimationFrame(tick); })(0);   // the longest stall between two drawn frames
  function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1; }
  function ratio(e) { if (typeof e.scale === "number" && e.scale > 0) { S.hasTouchScale = true; return e.scale; } if (S.hasTouchScale === null) S.hasTouchScale = false; return dist(e.touches) / g.d0; }
  /* registered on window, so these run after the game's own handlers on document and can see what it stopped */
  addEventListener("touchstart", function (e) { if (e.touches.length >= 2) window.__ssPinch = true; if (e.touches.length !== 2) return; g = { d0: dist(e.touches), z0: S.est, z: S.est, blocked: 0 }; S.pinches++; S.last = "start"; save(); }, { passive: true });
  addEventListener("touchmove", function (e) { if (e.touches.length < 2 || !g) return; var r = ratio(e);
    if (!e.cancelable) S.notCancelable++;
    if (e.defaultPrevented) { S.blockedMoves++; g.blocked++; S.last = "stopped at x" + r.toFixed(2); }
    else { S.freeMoves++; g.z = g.z0 * r; S.est = Math.max(1, g.z); S.maxEst = Math.max(S.maxEst, S.est); S.last = "moving x" + r.toFixed(2); }
    save(); }, { passive: true });
  function lift(e) { if (e.touches.length < 2) window.__ssPinch = false; if (!g || e.touches.length >= 2) return; if (g.blocked) S.blockedPinches++; S.est = Math.max(1, g.z); if (S.est < 1.05) S.est = 1; g = null; S.last = "lifted"; save(); push(true); }
  addEventListener("touchend", lift, { passive: true }); addEventListener("touchcancel", lift, { passive: true });
  addEventListener("gesturechange", function () { S.gestureEvents++; }, { passive: true });
  addEventListener("pagehide", function () { S.clean = true; S.last = "closed normally"; save(); push(true); });
  /* v0.2: the last 30 inputs, and what each one committed */
  var IN = [], lastT = 0, lastChosen = null, CH = [], lastC = 0;
  function tgt(el) { if (!el || !el.closest) return "?"; var b = el.closest("button,[id]"); if (!b) return el.tagName.toLowerCase(); var t = b.id ? "#" + b.id : b.tagName.toLowerCase(); if (b.tagName === "BUTTON") t += "[" + (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 18) + "]"; return t; }
  function rec(type, e) { var now = Date.now(), r = { at: now, ty: type, tg: e ? tgt(e.target) : "", dt: lastT ? now - lastT : 0, x: e && e.clientX != null ? Math.round(e.clientX) : (e && e.changedTouches && e.changedTouches[0] ? Math.round(e.changedTouches[0].clientX) : ""), y: e && e.clientY != null ? Math.round(e.clientY) : (e && e.changedTouches && e.changedTouches[0] ? Math.round(e.changedTouches[0].clientY) : "") }; lastT = now; IN.push(r); if (IN.length > 30) IN.shift();
    hookChoose(); }
  function hookChoose() { try { var G = window.SS && window.SS.G; if (!G || G.__recHooked) return; var v = G.lastChosen; Object.defineProperty(G, "lastChosen", { configurable: true, get: function () { return v; }, set: function (x) { v = x; var r = IN[IN.length - 1]; if (r && x) { r.chose = "n" + x.n + " option " + x.i + (G.pend && G.pend.options && G.pend.options[x.i] ? " (" + String(G.pend.options[x.i]).slice(0, 40) + ")" : ""); var now = Date.now(); CH.push({ t: now, dt: lastC ? now - lastC : 0, what: r.chose, by: r.ty + " " + r.tg, gap: now - (r.at || now), seq: IN.slice(-4).map(function (q) { return q.ty; }).join(">") }); lastC = now; if (CH.length > 30) CH.shift(); } } }); G.__recHooked = true; } catch (x) { } }   // the choice is credited to the input being handled when the game commits it
  ["touchstart", "touchend", "pointerdown", "pointerup", "mousedown", "mouseup", "click", "contextmenu"].forEach(function (t) { addEventListener(t, function (e) { rec(t, e); }, { capture: true, passive: true }); });
  window.SS_REC = function (what) { rec(what, null); };
  function chosen() { return CH.length ? CH.map(function (c) { return ("+" + c.dt + "ms").padStart(9) + " " + c.what + "  BY " + c.by + "  [" + c.seq + "]"; }).join("\n") : "none yet"; }
  function inputs() { return IN.map(function (r) { return ("+" + r.dt + "ms").padStart(8) + " " + r.ty + " " + r.tg + (r.x !== "" ? " @" + r.x + "," + r.y : "") + (r.chose ? "  => CHOSE " + r.chose : ""); }).join("\n"); }
  function boot() {
    badge = document.createElement("div");
    badge.style.cssText = "position:fixed;left:0;bottom:0;z-index:99;max-width:46vw;overflow:hidden;text-overflow:ellipsis;font:600 9px/10px monospace;color:#9fe;background:rgba(0,0,0,.75);padding:7px 6px calc(7px + env(safe-area-inset-bottom)) 6px;white-space:nowrap;border-top-right-radius:4px";
    document.body.appendChild(badge);
    var st = document.createElement("style"); st.textContent = "#bot{padding-bottom:calc(26px + env(safe-area-inset-bottom))!important}"; document.head.appendChild(st);   // the game's foot moves up by the label's height, so the label covers no control
    var prev = null; try { prev = JSON.parse(localStorage.getItem("ssdiag") || "null"); } catch (e) { }
    if (prev && prev.id) prevLine = "last run " + (prev.clean ? "ok" : "ENDED ABRUPTLY");
    var cv = document.getElementById("gl"); if (cv) { S.canvas = cv.width + "x" + cv.height; cv.addEventListener("webglcontextlost", function () { S.ctxLost++; S.last = "3D context lost"; save(); push(true); }); }
    var hist = []; try { hist = JSON.parse(localStorage.getItem("ssdiagHist") || "[]"); } catch (e) { }
    if (prev && prev.id && !(hist.length && hist[hist.length - 1].id === prev.id)) { hist.push(prev); hist = hist.slice(-8); try { localStorage.setItem("ssdiagHist", JSON.stringify(hist)); } catch (e) { } }
    var panel = null, open = false; badge.addEventListener("click", function (e) { e.stopPropagation(); open = !open; if (!open) { if (panel) panel.remove(); panel = null; return show(); }
      panel = document.createElement("pre"); panel.style.cssText = "position:fixed;left:0;right:0;top:0;bottom:12px;z-index:100;margin:0;overflow:auto;font:600 10px/1.3 monospace;color:#9fe;background:rgba(0,0,0,.92);padding:6px;white-space:pre-wrap"; panel.addEventListener("click", function (ev) { ev.stopPropagation(); open = false; panel.remove(); panel = null; show(); }); document.body.appendChild(panel);
      panel.textContent = BUILD + " | " + innerWidth + "x" + innerHeight + " | tap to close\nLAST 30 CHOICES MADE, newest last (ms since the previous choice; the input that made it; the inputs just before)\n" + chosen() + "\n\nLAST 30 RAW INPUTS, newest last\n" + inputs() + "\n\n" + BUILD + " | earlier runs, newest last (tap to close)\n" + (hist.length ? hist.map(function (h) { return (h.clean ? "ok   " : "ENDED") + " " + String(h.build || "").replace("TEST ", "") + " " + Math.round((h.t - Date.parse(h.started)) / 1000) + "s " + h.screen + " zoom~" + (+h.est).toFixed(1) + " max~" + (+h.maxEst).toFixed(1) + " real " + (+h.maxVv).toFixed(1) + " pinches " + h.pinches + " stopped " + h.blockedPinches + " resized " + (h.resizes || 0) + " 3Dlost " + (h.ctxLost || 0); }).join("\n") : "none yet"); });
    show(); save();
  }
  if (document.body) boot(); else addEventListener("DOMContentLoaded", boot);
})();
