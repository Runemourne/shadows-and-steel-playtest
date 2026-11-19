// Shadows & Steel: the animated opening (RD-151; Animated Opening Storyboard v0.2, Build Handoff v0.1). Version 0.2, 16 November 2026.
// v0.2 (Battlefield v0.19.3): the whole picture on every screen. The wide film plays on every screen, shown whole (letterboxed,
// never cropped), with a soft blurred copy of the picture filling the bars; the tall film (a centre crop that lost the second
// shooter and the muzzle flash) is no longer used. The tags and the card still follow the screen's shape, and turning a
// phone mid-film re-lays them.
// Scenes 1 and 2 are a film (opening_wide.mp4 or opening_tall.mp4, no sound track). This file plays over it, from opening.json:
// the music (Last Duel), the radio calls and effects through the game's own sound (so the Sound sliders, Mute and Radio captions
// work), the Class tags and the MOVEMENT TO CONTACT card as live layers, then scene 3 live on the table from Basic Training's own
// round 3 (scene3.json, through the replay playback in battle.js), the title and the hook, a fade, and a loop.
// It runs once per page load, before the Main Menu; never in a saved replay file, under Reduced motion, or with Settings > Opening off.
// Skip, Esc, a tap or a key go to the Main Menu (where sound was blocked, the first tap turns it on and starts again from 0:00).
(function () {
"use strict";
var SS = window.SS, D = SS && SS.op, BASE = "opening/";
var gateRes, gateP = new Promise(function (r) { gateRes = r; }), menuCb = null;
var O = { on: false, state: "off", cut: "", sound: false, blocked: false, restarts: 0, loops: 0, exit: "", t: 0, fired: [] };
window.SSOpening = { gate: function () { return gateP; }, menuShown: function () { if (menuCb) { var f = menuCb; menuCb = null; f(); } }, state: function () { return O; } };
var again = false; try { again = sessionStorage.getItem("ss.opAgain") === "1"; sessionStorage.removeItem("ss.opAgain"); } catch (e) { }   // v0.21 (WP8): About's WATCH THE OPENING plays it once more, even with Settings > Opening off
if (!D || document.getElementById("ss-replay") || !(D.PREF.opening || again) || D.reducedMotion()) { O.state = !D ? "no page" : !D.PREF.opening ? "off in Settings" : "skipped: reduced motion"; gateRes(); return; }

var G = SS.G, SND = SS.SND, J = null, S3 = null, $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
var ease = function (k) { k = Math.max(0, Math.min(1, k)); return k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; };
var cut = innerHeight > innerWidth ? "tall" : "wide"; O.cut = cut; O.film = "wide";   // cut: how the tags and card are laid out; the film is always the wide one (v0.2)
addEventListener("resize", function () { cut = innerHeight > innerWidth ? "tall" : "wide"; O.cut = cut; }); O.on = true; O.state = "poster"; G.opening = true;

/* ---------- the layers ---------- */
var root = document.createElement("div"); root.id = "op"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Opening film. Tap or press any key to continue; Esc or Skip goes to the Main Menu.");
var TITLE = '<h1 class="t">Shadows <span>&amp;</span> Steel</h1>';
root.innerHTML = '<canvas id="opAmb" width="32" height="18" aria-hidden="true"></canvas><video id="opV" muted playsinline preload="auto" aria-hidden="true"></video><div id="opPoster"><img alt="" src="' + BASE + "poster_" + cut + '.jpg">' + TITLE + "</div>" +
  '<div id="opPaint"></div><div id="opTags" aria-hidden="true"></div><canvas id="opCard" aria-hidden="true"></canvas><div id="opTitle">' + TITLE + '<p id="opHook"></p></div>' +
  '<canvas id="opMap" class="contours"></canvas><div id="opFade"></div>' +
  '<div id="opBar"><button id="opMute" aria-label="Mute"></button><button id="opSkip">Skip ›</button></div><p id="opPrompt">Tap or press any key to continue</p>';
document.body.appendChild(root); document.body.classList.add("op-on");
var amb = $("opAmb"), ambX = amb.getContext("2d"), ambN = 0, vid = $("opV"), tagsEl = $("opTags"), card = $("opCard"), paint = $("opPaint"), map = $("opMap"), fade = $("opFade"), title = $("opTitle"), hook = $("opHook"), prompt = $("opPrompt");
function muteIcon() { var m = G.muted, b = $("opMute"); b.setAttribute("aria-pressed", m); b.setAttribute("aria-label", m ? "Sound off: tap to turn it on" : "Mute");
  b.innerHTML = '<svg viewBox="0 0 24 24" width="1.25em" height="1.25em" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 4V5L7 9z"/>' + (m ? '<path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" fill="none"/>' : '<path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none"/>') + "</svg>"; }
muteIcon();

/* ---------- sound: start with sound where the browser allows it ---------- */
function probeSound() {   // a throwaway context tells whether this page may play sound before a tap, without waking the game's own sound
  try { var C = window.AudioContext || window.webkitAudioContext; if (!C) return false; var c = new C(), ok = c.state === "running"; c.close && c.close(); return ok; } catch (e) { return false; }
}
function soundUp() { var ac = D.ac(); return !!(ac && ac.state === "running" && SND); }
O.sound = probeSound(); O.blocked = !O.sound;
if (O.sound) D.unlock();   // the game's sound, the music players and the recorded files, now

/* ---------- loading: the plan, scene 3 and the film (fetched whole, so it can start again from 0 anywhere) ---------- */
(new Image()).src = "art/hi/CAP-102.jpg";   // the HOPLITE painting of scene 3, ready before it is needed
var getJ = function (f) { return fetch(BASE + f).then(function (r) { if (!r.ok) throw new Error(f); return r.json(); }); };
var cueFiles = [];
var films = fetch(BASE + "opening_wide.mp4").then(function (r) { if (!r.ok) throw new Error("the film"); return r.blob(); });
Promise.all([getJ("opening.json"), getJ("scene3.json").catch(function () { return null; }), films]).then(function (a) {
  J = a[0]; S3 = a[1]; vid.src = URL.createObjectURL(a[2]);
  cueFiles = J.cues.map(function (c) { return c[2]; }).concat((J.scene3.schedule || []).filter(function (s) { return s[2].file; }).map(function (s) { return s[2].file; }));
  return new Promise(function (res, rej) { if (vid.readyState >= 3) return res(); vid.addEventListener("canplaythrough", res, { once: true }); vid.addEventListener("error", function () { rej(new Error("the film cannot play here")); }, { once: true }); setTimeout(res, 8000); });
}).then(function () { if (O.exit) return; begin(); }).catch(function (e) { O.error = String(e && e.message || e); exit("error"); });
setTimeout(function () { if (O.state === "poster" && !O.exit) { O.error = "the film took too long to load"; exit("error"); } }, 30000);

/* ---------- the clock: the film's own time to 0:38, then the page's ---------- */
var tableAt = 0, ci = 0, si = 0, faded = false, lastT = 0;
function clock() {
  if (O.state === "film") { var t = vid.currentTime; if (vid.ended || t >= J.film_end - .04) { O.state = "table"; tableAt = performance.now() - Math.max(0, t - J.film_end) * 1000; return J.film_end; } return t; }
  if (O.state === "table") return J.film_end + (performance.now() - tableAt) / 1000;
  return 0;
}
function begin() {   // from 0:00: the first time, after the tap that turned sound on, and at every loop
  O.state = "starting"; O.t = 0; end3(); clearLayers(); ci = 0; si = 0; faded = false; fade.style.opacity = 0; O.fired = []; try { vid.pause(); vid.currentTime = 0; } catch (e) { }
  var ready = soundUp() ? Promise.race([SND.ready.then(function () { SND.loadFiles(cueFiles); return SND.loadFiles(cueFiles.slice(0, 3)); }), new Promise(function (r) { setTimeout(r, 1500); })]) : Promise.resolve();   // the first calls; the rest load while the film plays
  ready.then(function () {
    if (O.exit) return;
    var go = function () { if (O.exit) return; var p = vid.play(); if (p && p.catch) p.catch(function () { }); O.state = "film"; $("opPoster").classList.add("off"); };
    if (soundUp() && SND.music(J.music.mood, .05, true)) { var me = SND.musicEl(); if (me && me.readyState < 3) { var k = setTimeout(go, 900); me.addEventListener("playing", function () { clearTimeout(k); go(); }, { once: true }); } else go(); }
    else go();
  });
}
vid.addEventListener("ended", function () { if (O.state === "film") clock(); });

/* ---------- what happens at each moment ---------- */
function fire(c) {   // [time, "vox" or "fx", file, caption or volume]
  O.fired.push(c[2] + "@" + c[0]);
  var dur = 0; if (soundUp()) dur = SND.cue(c[2], c[1], c[1] === "fx" && typeof c[3] === "number" ? c[3] : 1) || 0;
  if (c[1] === "vox" && D.PREF.captions) D.caption(c[2], 0, dur || 1.4);
}
function tick() {
  requestAnimationFrame(tick); if (!J || (O.state !== "film" && O.state !== "table")) return;
  if (O.state === "film" && (ambN++ % 4 === 0)) try { ambX.drawImage(vid, 0, 0, 32, 18); } catch (e) { }   // the blurred fill behind the letterboxed film
  var t = clock(); O.t = Math.round(t * 100) / 100; if (t < lastT - 1) { ci = 0; si = 0; } lastT = t;
  while (ci < J.cues.length && J.cues[ci][0] <= t) { if (t - J.cues[ci][0] < 1.2) fire(J.cues[ci]); ci++; }
  if (O.state === "table") { var sc = J.scene3.schedule; while (si < sc.length && sc[si][0] <= t) { act(sc[si], t); si++; } }
  if (!faded && t >= J.music.fade_out[0]) { faded = true; if (soundUp()) SND.silence(J.music.fade_out[1] - J.music.fade_out[0]); }
  layers(t);
  if (t >= J.title.loop) { O.loops++; begin(); }
}
requestAnimationFrame(tick);

/* ---------- scene 3: Basic Training's round 3, live on the table ---------- */
var hero = "", in3 = false;
function act(s, t) {
  var d = s[2]; O.fired.push(s[1] + "@" + s[0]);
  if (!S3) return;   // no scene3.json: the title plays over a black screen
  if (s[1] === "start") { D.start(S3, d.i); in3 = true; root.classList.add("table"); D.cam(camera); }
  else if (s[1] === "paint") { hero = d.uid; D.show(hero, false); paint.style.backgroundImage = "url(art/hi/" + d.card + ".jpg)"; paint.dataset.t0 = s[0]; paint.dataset.t1 = d.to; paint.style.display = "block"; }
  else if (s[1] === "land") { D.show(d.uid, true); paint.style.display = "none"; }
  else if (s[1] === "frame") { var f = S3.frames[d.i]; if (f) D.frame(f, d.quiet); }
  else if (s[1] === "banner") { D.banner(d.big, d.small); D.vig(true); }
  else if (s[1] === "showcase") D.showcase(d.card, d.label);
  else if (s[1] === "vox" || s[1] === "fx") fire([s[0], s[1], d.file, s[1] === "fx" ? d.vol : ""]);
}
function end3() { if (in3) { in3 = false; D.end(); } root.classList.remove("table"); paint.style.display = "none"; }
function camera(raw, base, tgt) {   // the scripted camera: keys of [time, look-at z, elevation, distance], eased, with a slight hand-held sway
  var K = J.scene3.camera, t = clock(), i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++;
  var a = K[i], b = K[i + 1], k = ease((t - a[0]) / (b[0] - a[0])), L = function (j) { return a[j] + (b[j] - a[j]) * k; };
  var z = L(1), el = L(2) * Math.PI / 180, dist = L(3) * (G.dirD || 30), sw = Math.sin(t * .9) * .05, sv = Math.cos(t * .63) * .035;
  tgt.set(sw, 0, z); base.set(sw * 1.5 + sv, Math.sin(el) * dist, z + Math.cos(el) * dist);
}

/* ---------- the live layers: the Class tags, the card, the HOPLITE painting, the title ---------- */
function filmRect() {   // where the layers are laid out: on a wide screen, the film itself (shown whole); on an upright screen, the screen
  var fw = cut === "wide" ? 1280 : 720, fh = cut === "wide" ? 720 : 1280, s = cut === "wide" ? Math.min(innerWidth / fw, innerHeight / fh) : Math.max(innerWidth / fw, innerHeight / fh), w = fw * s, h = fh * s; return { x: (innerWidth - w) / 2, y: (innerHeight - h) / 2, w: w, h: h, u: Math.max(w, h) / 1280 }; }
function clearLayers() { tagsEl.style.display = "none"; tagsEl.innerHTML = ""; card.style.display = "none"; title.style.opacity = 0; hook.style.opacity = 0; paint.style.display = "none"; }
var cardDrawn = false;
function drawTheCard() {
  if (cardDrawn || !S3) return; var f = S3.faces[J.card.name]; if (!f) return; cardDrawn = true;
  try { var c = D.drawCard(f, 2, { meta: S3.meta }); card.width = c.width; card.height = c.height; card.getContext("2d").drawImage(c, 0, 0); } catch (e) { cardDrawn = false; }
}
function layers(t) {
  var R = filmRect(), tsz = D.PREF.text || 1, T = J.tags, C = J.card;
  if (t >= T.show[0] && t < T.show[1]) {   // 2C: every function reports
    if (!tagsEl.children.length) tagsEl.innerHTML = T.names.map(function (n) { return '<span style="background:' + T.colors[n] + '">' + esc(n) + "</span>"; }).join("");
    tagsEl.style.display = "flex"; tagsEl.style.fontSize = (30 * R.u * tsz) + "px"; tagsEl.style.maxWidth = (cut === "tall" ? Math.min(innerWidth * .94, 560 * R.u * tsz) : innerWidth * .94) + "px";
    var ty = R.y + R.h * (cut === "wide" ? .80 : .70); tagsEl.style.top = Math.min(ty, innerHeight - tagsEl.offsetHeight - prompt.offsetHeight - 30) + "px";
    Array.prototype.forEach.call(tagsEl.children, function (s, i) { var t0 = T.t0 + i * T.step, on = t >= t0, p = on ? ease((t - t0) / .18) : 0; s.className = on ? "on" : ""; s.style.transform = "scale(" + (1 + (1 - p) * .15 * (on ? 1 : 0)) + ")"; });
  } else if (tagsEl.style.display !== "none") clearLayers0(tagsEl);
  if (t >= C.t && t < C.fade_out[1]) {   // 2D: the commander decides; the real card face, dropped on the board
    drawTheCard(); var pos = C[cut], k = ease((t - C.t) / .35), a = t < C.fade_out[0] ? 1 : 1 - ease((t - C.fade_out[0]) / (C.fade_out[1] - C.fade_out[0]));
    var w = pos[2] * R.u * Math.min(tsz, 1.4); card.style.display = "block"; card.style.width = w + "px"; card.style.left = (R.x + R.w * pos[0] - w / 2) + "px";
    card.style.top = (R.y + R.h * pos[1] - w * card.height / card.width / 2) + "px"; card.style.opacity = a;
    card.style.transform = "translateY(" + (-(1 - k) * 60 * R.u) + "px) rotate(" + (-8 + 6 * (1 - k)) + "deg) scale(" + (1.25 - .25 * k) + ")";
  } else card.style.display = "none";
  if (paint.style.display === "block") {   // 3A: the painting becomes a card
    var t0 = +paint.dataset.t0, t1 = +paint.dataset.t1, r = D.rect(hero), q = ease((t - t0 - .4) / (t1 - t0 - .4));
    if (r) { var x = r.x * q, y = r.y * q, ww = innerWidth + (r.w - innerWidth) * q, hh = innerHeight + (r.h - innerHeight) * q;
      paint.style.left = x + "px"; paint.style.top = y + "px"; paint.style.width = ww + "px"; paint.style.height = hh + "px"; paint.style.borderRadius = (q * 8) + "px"; paint.style.opacity = t > t1 - .12 ? Math.max(0, (t1 + .05 - t) / .17) : 1; }
  }
  var Ti = J.title;   // 3C: the title and the hook
  if (t >= Ti.title_in) { var trained = false; try { trained = !!localStorage.getItem("ss.trained"); } catch (e) { }
    if (!hook.textContent || hook.dataset.tr !== String(trained)) { hook.textContent = trained ? Ti.hook_trained : Ti.hook_new; hook.dataset.tr = String(trained); }
    title.style.opacity = ease((t - Ti.title_in) / .8); title.style.transform = "scale(" + (1.06 - .06 * ease((t - Ti.title_in) / 1.6)) + ")"; hook.style.opacity = t >= Ti.hook_in ? ease((t - Ti.hook_in) / .7) : 0; }
  else { title.style.opacity = 0; hook.style.opacity = 0; }
  fade.style.opacity = t >= Ti.fade[0] ? ease((t - Ti.fade[0]) / (Ti.fade[1] - Ti.fade[0])) : 0;
}
function clearLayers0(el) { el.style.display = "none"; el.innerHTML = ""; }

/* ---------- taps, keys, Skip and Mute ---------- */
function tap(how) {
  if (O.exit) return; D.unlock();
  if (O.blocked && !O.restarts) { O.restarts = 1; O.sound = true; prompt.textContent = "Tap again to continue"; muteIcon(); begin(); return; }   // sound was blocked: now it is on, so start again
  exit(how || "tap");
}
root.addEventListener("click", function (e) { if (e.target.closest("#opBar")) return; tap(); });
$("opSkip").addEventListener("click", function (e) { e.stopPropagation(); D.unlock(); exit("skip"); });
$("opMute").addEventListener("click", function (e) { e.stopPropagation(); D.unlock(); D.setMuted(!G.muted); muteIcon(); });
function onKey(e) {
  if (!O.on || O.exit || e.ctrlKey || e.metaKey || e.altKey || /^(Shift|Control|Alt|Meta|Tab|CapsLock|F\d+)$/.test(e.key)) return;
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest("#opBar") && (e.key === "Enter" || e.key === " ")) return;   // a focused button handles its own Enter
  e.preventDefault(); e.stopPropagation(); if (e.key === "Escape") { D.unlock(); exit("esc"); } else tap("key");
}
addEventListener("keydown", onKey, true);

/* ---------- the hand-off: the picture dissolves into the Main Menu's contour map, then the menu fades in ---------- */
function exit(how) {
  if (O.exit) return; O.exit = how; root.classList.add("leaving"); G.opening = false; D.setMood("menu", true);
  map.style.display = "block"; try { D.contourMap(map, ""); } catch (e) { } requestAnimationFrame(function () { map.style.opacity = 1; });
  setTimeout(function () {
    O.state = "menu"; try { vid.pause(); } catch (e) { } end3(); clearLayers();
    var shown = false, done = function () { if (shown) return; shown = true; root.classList.add("out"); setTimeout(function () { root.remove(); document.body.classList.remove("op-on"); O.on = false; removeEventListener("keydown", onKey, true); if (vid.src) URL.revokeObjectURL(vid.src); }, 520); };
    menuCb = done; gateRes();
    if (!G.engineUp) {   // the engine is still loading: the loading screen takes the same contour backdrop until the menu replaces it
      var cv = $("cover"), inn = cv && cv.firstElementChild; if (cv && inn && !inn.querySelector("canvas")) { cv.style.display = "block"; cv.classList.add("map"); inn.innerHTML = '<canvas class="contours" id="opLoadMap"></canvas><div class="su">' + inn.innerHTML + "</div>"; try { D.contourMap($("opLoadMap"), ""); } catch (e) { } }
      done();
    } else setTimeout(done, 4000);   // in case the menu cannot be drawn: never leave the opening over the page
  }, how === "error" ? 60 : 540);
}
})();
