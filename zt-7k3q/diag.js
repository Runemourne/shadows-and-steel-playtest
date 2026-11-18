/* UNLISTED ZOOM TEST PAGE ONLY (not part of the game): a build label and a zoom recorder,
   so a crash on a real phone leaves a record the Studio Lead can read back from the page's store. */
(function () {
  var BUILD = "LIVE 6" + (window.__ssT ? " [" + window.__ssT + "]" : " [plain]");
  var id = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var S = { build: BUILD, id: id, started: new Date().toISOString(), ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: window.devicePixelRatio || 1,
    framed: (function () { try { return window.top !== window.self; } catch (e) { return true; } })(),
    est: 1, maxEst: 1, pinches: 0, blockedMoves: 0, blockedPinches: 0, freeMoves: 0, notCancelable: 0, gestureEvents: 0, hasTouchScale: null,
    vv: 1, maxVv: 1, screen: "", last: "", clean: false, t: 0,
    resizes: 0, resizesInPinch: 0, minW: innerWidth, maxW: innerWidth, minH: innerHeight, maxH: innerHeight, canvasChanges: 0, canvas: "", ctxLost: 0, maxGapMs: 0, lastGapMs: 0 };
  var g = null, badge = null, prevLine = "";
  function scr() { var op = document.getElementById("op"); if (op && getComputedStyle(op).display !== "none" && !op.classList.contains("table")) return "film"; var cv = document.getElementById("cover"); if (cv && getComputedStyle(cv).display !== "none") return "setup"; return "game"; }
  function show() { if (!badge) return; badge.textContent = BUILD + " | zoom ~" + S.est.toFixed(1) + (S.vv > 1.01 ? " (" + S.vv.toFixed(1) + ")" : "") + " | stopped " + S.blockedPinches + " | resized " + S.resizes + (prevLine ? "\n" + prevLine : ""); }
  function save() { S.t = Date.now(); S.screen = scr(); try { S.vv = window.visualViewport ? visualViewport.scale : 1; S.maxVv = Math.max(S.maxVv, S.vv); } catch (e) { } try { localStorage.setItem("ssdiag", JSON.stringify(S)); } catch (e) { } show(); push(); }
  /* the page's store: one write at a time, at most about one a second */
  var db = null, busy = false, dirty = false, lastPush = 0;
  function push(force) { if (!db) return; if (busy || (!force && Date.now() - lastPush < 900)) { dirty = true; return; } busy = true; dirty = false; lastPush = Date.now();
    var done = function () { busy = false; if (dirty) setTimeout(function () { push(true); }, 300); };
    try { db.collection("diag").doc(id).set(JSON.parse(JSON.stringify(S))).then(done, done); } catch (e) { done(); } }
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
  function boot() {
    badge = document.createElement("div");
    badge.style.cssText = "position:fixed;left:4px;top:4px;z-index:99;font:600 10px/1.25 monospace;color:#9fe;background:rgba(0,0,0,.6);padding:2px 5px;white-space:pre;border:1px solid rgba(127,224,200,.5)";
    document.body.appendChild(badge);
    var prev = null; try { prev = JSON.parse(localStorage.getItem("ssdiag") || "null"); } catch (e) { }
    if (prev && prev.id) prevLine = "last run: " + (prev.clean ? "closed ok" : "ENDED ABRUPTLY") + ", " + prev.screen + ", zoom ~" + (+prev.est).toFixed(1) + ", max ~" + (+prev.maxEst).toFixed(1) + ", stopped " + prev.blockedPinches + ", resized " + (prev.resizes || 0);
    var cv = document.getElementById("gl"); if (cv) { S.canvas = cv.width + "x" + cv.height; cv.addEventListener("webglcontextlost", function () { S.ctxLost++; S.last = "3D context lost"; save(); push(true); }); }
    var hist = []; try { hist = JSON.parse(localStorage.getItem("ssdiagHist") || "[]"); } catch (e) { }
    if (prev && prev.id && !(hist.length && hist[hist.length - 1].id === prev.id)) { hist.push(prev); hist = hist.slice(-8); try { localStorage.setItem("ssdiagHist", JSON.stringify(hist)); } catch (e) { } }
    var open = false; badge.addEventListener("click", function (e) { e.stopPropagation(); open = !open; if (!open) return show();
      badge.textContent = BUILD + " | earlier runs, newest last (tap to close)\n" + (hist.length ? hist.map(function (h) { return (h.clean ? "ok   " : "ENDED") + " " + String(h.build || "").replace("LIVE ", "L") + " " + Math.round((h.t - Date.parse(h.started)) / 1000) + "s " + h.screen + " zoom~" + (+h.est).toFixed(1) + " max~" + (+h.maxEst).toFixed(1) + " real " + (+h.maxVv).toFixed(1) + " pinches " + h.pinches + " stopped " + h.blockedPinches + " resized " + (h.resizes || 0) + " 3Dlost " + (h.ctxLost || 0); }).join("\n") : "none yet"); });
    show(); save();
    if (window.claude && window.claude.use) window.claude.use("db").then(function (d) { db = d || null; if (!db) return;
      if (prev && prev.id) { prev.recovered = true; try { db.collection("diag").doc(prev.id).set(prev).then(function () { push(true); }, function () { push(true); }); } catch (e) { } } else push(true); }, function () { });
  }
  if (document.body) boot(); else addEventListener("DOMContentLoaded", boot);
})();
