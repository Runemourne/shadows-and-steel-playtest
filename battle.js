// Shadows & Steel: the battlefield table. Draws the real game (merged_engine.py, run in this page) on a lit 3D board.
// The engine sends one "frame" for each thing that happens and, when it is your turn, the list of choices with what each is about.
// This file only shows what the engine says: it holds no rules.
(function () {
"use strict";
var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
var ART = window.ART || {}, IMG = {}, CP = "/api/merged";
var W = innerWidth, H = innerHeight, LAND = W > H * 1.05, T = 0;
var G = { view: null, latest: null, pend: null, latestPend: null, queue: [], playing: false, since: 0, sel: null, over: null, err: null, speed: 1, muted: false, canUndo: false, hist: [], skip: false, info: null, started: false, busy: false, assist: true, calm: false, meta: {}, bases: {}, notes: [], paused: false, histWhy: {}, rate: {}, faces: {}, volFx: .9, volMus: .5, volVox: .85, capLast: {}, capUntil: 0 };
(function () { try { var st = JSON.parse(localStorage.getItem("ss.sound") || "null"); if (st) { G.volFx = st.fx; G.volMus = st.mus; G.volVox = st.vox == null ? .85 : st.vox; G.muted = !!st.muted; } } catch (e) { } })();
// Settings (v0.15): kept in localStorage under ss.settings; sound volumes stay under ss.sound
var SETDEF = { text: 1, motion: "auto", shake: true, shapes: false, confirm: false, tips: true, captions: false, badges: true, speed: 1, opening: true };   // opening (v0.18): the animated opening before the Main Menu
var PREF = (function () { var d = {}, k; for (k in SETDEF) d[k] = SETDEF[k]; try { var st = JSON.parse(localStorage.getItem("ss.settings") || "null"); if (st) for (k in SETDEF) if (st[k] != null && typeof st[k] === typeof SETDEF[k]) d[k] = st[k]; } catch (e) { } return d; })();
function savePrefs() { try { localStorage.setItem("ss.settings", JSON.stringify(PREF)); } catch (e) { } }
G.speed = PREF.speed; G.assist = PREF.badges;
function saveSound() { try { localStorage.setItem("ss.sound", JSON.stringify({ fx: G.volFx, mus: G.volMus, vox: G.volVox, muted: G.muted })); } catch (e) { } }

/* ================= scene ================= */
var renderer = new THREE.WebGLRenderer({ canvas: $("gl"), antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
var HAZE = 0x2a302c; renderer.setClearColor(HAZE);
var scene = new THREE.Scene(); scene.fog = new THREE.Fog(HAZE, 30, 62);
var camera = new THREE.PerspectiveCamera(19, W / H, .5, 400), camBase = new THREE.Vector3(), camTarget = new THREE.Vector3(), shake = 0;
function cv(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function tex(c) { var t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; }
function radial(stops) { var c = cv(128, 128), g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); stops.forEach(function (p) { gr.addColorStop(p[0], p[1]); }); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return tex(c); }
var TX = { glow: radial([[0, "rgba(255,255,255,1)"], [.25, "rgba(255,255,255,.55)"], [1, "rgba(255,255,255,0)"]]), smoke: radial([[0, "rgba(255,255,255,.9)"], [.5, "rgba(255,255,255,.35)"], [1, "rgba(255,255,255,0)"]]), dark: radial([[0, "rgba(0,0,0,.75)"], [.55, "rgba(0,0,0,.4)"], [1, "rgba(0,0,0,0)"]]) };
var tweens = [];
function tween(dur, fn, done) { tweens.push({ t: 0, d: dur, fn: fn, done: done }); }
function after(sec, fn) { tween(sec, function () { }, fn); }
function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
var TER = window.SSTerrain ? window.SSTerrain.create({ scene: scene, renderer: renderer, TX: TX }) :   // the ground: one look for each terrain card (terrain.js)
  { set: function () { return Promise.resolve("open"); }, load: function () { return Promise.reject(new Error("terrain.js is missing")); }, tick: function () { }, heights: function () { return window.SS_H; }, embed: function () { return Promise.resolve(""); }, key: function () { return "open"; }, keyOf: function () { return "open"; } };
TER.set(window.SS_TNAME || "OPEN PLAIN");
function groundPlane(texture, w, d, x, y, z, opts) {
  var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial(Object.assign({ map: texture, transparent: true, depthWrite: false }, opts || {})));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m); return m;
}
var frontLine = (function () { var c = cv(512, 8), g = c.getContext("2d"); g.fillStyle = "#fff"; for (var i = 0; i < 512; i += 32) g.fillRect(i, 2, 18, 4); var m = groundPlane(tex(c), 12, .09, 0, .33, .15, { color: 0xe0a85a }); m.material.opacity = .8; return m; })();

/* ================= particles and flashes ================= */
var parts = [], pool = [];
function spawn(o) {
  var s = pool.pop(); if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.smoke, transparent: true, depthWrite: false })); scene.add(s); }
  s.material.map = o.glow ? TX.glow : TX.smoke; s.material.blending = o.glow ? THREE.AdditiveBlending : THREE.NormalBlending; s.material.color.set(o.color || 0xffffff); s.material.fog = !o.glow; s.material.needsUpdate = true; s.visible = true; s.position.copy(o.p);
  parts.push({ s: s, t: 0, life: o.life || 1, v: o.v || new THREE.Vector3(), s0: o.s0 || .3, s1: o.s1 || 1, a: o.a == null ? 1 : o.a, drag: o.drag || 0 });
}
function stepParts(dt) {
  for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.t += dt; var k = p.t / p.life; if (k >= 1) { p.s.visible = false; pool.push(p.s); parts.splice(i, 1); continue; }
    p.s.position.addScaledVector(p.v, dt); if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt)); var sc = p.s0 + (p.s1 - p.s0) * k; p.s.scale.set(sc, sc, 1); p.s.material.opacity = p.a * (1 - k) * (k < .1 ? k * 10 : 1); }
}
function groundFlash(x, z, size, color, dur) { var m = groundPlane(TX.glow, size, size, x, .5, z, { blending: THREE.AdditiveBlending, color: color, fog: false }); tween(dur, function (k) { m.material.opacity = 1 - k; var s = 1 + k * .6; m.scale.set(s, s, 1); }, function () { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); }
function flashScreen(a) { if (G.calm) return; var f = $("flash"); f.style.transition = "none"; f.style.opacity = a; requestAnimationFrame(function () { f.style.transition = "opacity .5s"; f.style.opacity = 0; }); }

/* ================= sound: synthesized, no files ================= */
var AC = null, master = null, sfxBus = null, musBus = null, voxBus = null, ambBus = null, noiseBuf = null, silentEl = null;
/* ---- generated music: a bed that tightens as the game does. It plays only when the recorded music (sound.js) is not there, as in a saved replay file. ---- */
var MUS = { tension: 0, target: 0, next: 0, beat: 0, on: false };
function musicInit() {
  try { var f = AC.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 160; f.Q.value = 2; var g = AC.createGain(); g.gain.value = 0; f.connect(g); g.connect(musBus); MUS.f = f; MUS.g = g; MUS.osc = [];
    [[55, "sawtooth", 0], [55, "sawtooth", 7], [82.4, "triangle", -5], [110, "sine", 3]].forEach(function (d) { var o = AC.createOscillator(); o.type = d[1]; o.frequency.value = d[0]; o.detune.value = d[2]; var og = AC.createGain(); og.gain.value = d[0] > 100 ? .25 : .5; o.connect(og); og.connect(f); o.start(); MUS.osc.push(og); });
    setInterval(musicTick, 120); } catch (e) { }
}
function musicTick() {
  if (!AC || !MUS.g) return; var t = AC.currentTime, live = MUS.on && !G.muted && !(SND && SND.playing()); if (ambBus) ambBus.gain.setTargetAtTime(G.started && !G.over ? 1 : 0, t, .8);
  MUS.tension += (MUS.target - MUS.tension) * .06; var k = MUS.tension;
  MUS.g.gain.setTargetAtTime(live ? .05 + k * .05 : 0, t, .8); MUS.f.frequency.setTargetAtTime(150 + k * 520, t, 1.2); MUS.osc[3].gain.setTargetAtTime(k > .6 ? .3 : .05, t, 1.5);
  if (!live) { MUS.next = 0; return; } var per = 60 / (46 + k * 62); if (!MUS.next || MUS.next < t - 1) MUS.next = t + .2;
  while (MUS.next < t + .3) { var w = MUS.next, b = MUS.beat++ % 8, vol = (b % 4 === 0 ? .2 : .1) * (.35 + k * .9);   // a slow drum that quickens with tension
    var o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(74, w); o.frequency.exponentialRampToValueAtTime(34, w + .22); g.gain.setValueAtTime(.0001, w); g.gain.exponentialRampToValueAtTime(vol, w + .012); g.gain.exponentialRampToValueAtTime(.0001, w + .3); o.connect(g); g.connect(musBus); o.start(w); o.stop(w + .35);
    if (k > .55 && b % 2 === 1) { var n = AC.createBufferSource(); n.buffer = noiseBuf; var nf = AC.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1900; var ng = AC.createGain(); ng.gain.setValueAtTime(.0001, w); ng.gain.exponentialRampToValueAtTime(.05 * k, w + .01); ng.gain.exponentialRampToValueAtTime(.0001, w + .09); n.connect(nf); nf.connect(ng); ng.connect(musBus); n.start(w); n.stop(w + .12); }
    MUS.next += per; }
}
function musicState(v) { if (!v) { MUS.target = 0; return; } var low = Math.min(v.you.hf, v.bot.hf), stand = v.contact && (v.you.marker === 1 || v.bot.marker === v.Z); MUS.target = Math.max(0, Math.min(1, (20 - low) / 20 * .55 + (v.contact ? .2 : 0) + (stand ? .3 : 0))); G.stand = stand; if (G.started && !G.over) setMood(moodOf(v), stand || v.round >= v.last); }
function unlock() {
  try { if (!AC) audioInit(); if (AC && AC.state !== "running") AC.resume(); if (SND && AC) { SND.bless(); if (!G.sndLoad) { G.sndLoad = true; SND.preloadAll(); } if (!G.started && !G.view && !G.replay && !G.opening) setMood("menu", true); }
    if (!silentEl) { var n = 4410, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = function (o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
      silentEl = new Audio(URL.createObjectURL(new Blob([b], { type: "audio/wav" }))); silentEl.loop = true; silentEl.setAttribute("playsinline", ""); }
    if (silentEl.paused) { var p = silentEl.play(); if (p && p.catch) p.catch(function () { }); } } catch (e) { }
}
addEventListener("pointerdown", unlock, true); addEventListener("touchend", unlock, true);
function audioInit() {
  if (AC) return;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = .9; master.connect(AC.destination);
    sfxBus = AC.createGain(); sfxBus.gain.value = G.volFx; sfxBus.connect(master); musBus = AC.createGain(); musBus.gain.value = G.volMus; musBus.connect(master); voxBus = AC.createGain(); voxBus.gain.value = G.volVox; voxBus.connect(master); ambBus = AC.createGain(); ambBus.gain.value = 0; ambBus.connect(master); if (G.muted) master.gain.value = 0; musicInit();
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var n = AC.createBufferSource(); n.buffer = noiseBuf; n.loop = true; var f = AC.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 320; var g = AC.createGain(); g.gain.value = .04; n.connect(f); f.connect(g); g.connect(ambBus); n.start(); } catch (e) { AC = null; }
}
function nz(dur, type, f0, f1, vol, when) { if (!AC || G.muted || G.skip) return; var t = AC.currentTime + (when || 0), n = AC.createBufferSource(); n.buffer = noiseBuf; n.loop = true; var f = AC.createBiquadFilter(); f.type = type; f.Q.value = 1.1; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur); var g = AC.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + dur); n.connect(f); f.connect(g); g.connect(sfxBus || master); n.start(t); n.stop(t + dur + .05); }
function tone(dur, f0, f1, vol, type, when) { if (!AC || G.muted || G.skip) return; var t = AC.currentTime + (when || 0), o = AC.createOscillator(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); var g = AC.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g); g.connect(sfxBus || master); o.start(t); o.stop(t + dur + .05); }
var SYN = {   // generated sounds: the fallback when a recording is not loaded (or in a saved replay file)
  click: function () { nz(.05, "highpass", 2400, 1800, .16); tone(.06, 900, 600, .07, "square"); },
  select: function () { tone(.12, 520, 780, .13, "triangle"); },
  ping: function () { tone(.7, 1480, 1440, .15); tone(.5, 2960, 2900, .05, "sine", .02); },
  deploy: function () { nz(.18, "lowpass", 500, 120, .4); tone(.2, 120, 60, .3); },
  radio: function () { nz(.09, "bandpass", 1800, 1700, .2); nz(.07, "bandpass", 1800, 1700, .16, .2); },
  launch: function () { nz(.75, "bandpass", 2600, 420, .4); tone(.22, 170, 60, .38); },
  cannon: function () { nz(.35, "lowpass", 1800, 120, .7); tone(.3, 140, 40, .7); },
  tracer: function () { nz(.06, "highpass", 3200, 1500, .3); tone(.05, 420, 160, .16, "square"); },
  boom: function () { nz(1.1, "lowpass", 1400, 90, .8); tone(.9, 95, 32, .85); nz(.18, "highpass", 3000, 1200, .22); },
  thud: function () { nz(.3, "lowpass", 800, 100, .45); tone(.25, 110, 50, .4); },
  down: function () { nz(1.7, "lowpass", 900, 55, .6); tone(.7, 68, 26, .6); nz(.25, "bandpass", 700, 250, .5); for (var i = 0; i < 8; i++) nz(.04 + Math.random() * .09, "bandpass", 1600 + Math.random() * 3800, 900, .2, .12 + Math.random()); nz(2.2, "bandpass", 520, 220, .1, .35); },
  hf: function () { tone(.5, 196, 98, .22, "triangle"); nz(.4, "lowpass", 400, 100, .25); },
  round: function () { tone(.9, 147, 147, .16, "sawtooth"); tone(1.1, 220, 220, .1, "sawtooth", .08); nz(1.2, "lowpass", 300, 80, .3); },
  hhour: function () { for (var i = 0; i < 3; i++) tone(.09, 1200, 1200, .12, "square", i * .16); tone(.8, 300, 80, .3, "sawtooth", .5); },
  ability: function () { tone(.25, 660, 990, .1, "triangle"); nz(.2, "bandpass", 2400, 1200, .12); },
  win: function () { [196, 247, 294, 392].forEach(function (h, i) { tone(.6, h, h, .14, "sawtooth", i * .18); }); },
  lose: function () { [294, 247, 196, 147].forEach(function (h, i) { tone(.7, h, h, .14, "sawtooth", i * .22); }); }
};
var SND = window.SSSound ? window.SSSound.create({ ctx: function () { return AC; }, bus: function (n) { return n === "fx" ? sfxBus : n === "mus" ? musBus : voxBus; } }) : null;
function rec(name, opt) { return !!(SND && AC && !G.muted && !G.skip && SND.play(name, opt)); }
function vox(ev, opt) {
  var f = (SND && AC && !G.muted && !G.skip && G.speed < 3 && G.volVox > 0) ? SND.say(ev, opt) : false;
  if (!PREF.captions || G.skip) return;
  if (f) { var lc = SND.lastCall && SND.lastCall(); return caption(f, lc ? lc.wait : 0, lc ? lc.dur : 1.5); }
  var man = SND && SND.manifest && SND.manifest(), list = man && man.vox && man.vox[ev], now = Date.now();   // voices off or muted: still show what would have been said
  if (!list || !list.length || (G.capLast[ev] && now - G.capLast[ev] < 9000) || now < G.capUntil) return; G.capLast[ev] = now; caption(list[Math.floor(Math.random() * list.length)], (opt && opt.delay) || 0, 1.6);
}
var CAPFIX = { "weve": "we've", "its": "it's", "i": "I" };
function capText(file) { var w = String(file).split("/").pop().replace(/\.[a-z0-9]+$/i, "").replace(/_\d+$/, "").split("_").map(function (x) { return CAPFIX[x] || x; }).join(" "); return w.charAt(0).toUpperCase() + w.slice(1) + "."; }
function caption(file, wait, dur) { var el = $("capt"); if (!el) return; var t = capText(file); G.capUntil = Date.now() + (wait + dur) * 1000;
  setTimeout(function () { el.innerHTML = "<b>RADIO</b>" + esc(t); el.style.display = "block"; clearTimeout(G.capT); G.capT = setTimeout(function () { el.style.display = "none"; }, Math.max(2200, (dur + .9) * 1000)); }, Math.max(0, wait * 1000)); }
var SFX = {   // recorded sound (sound.js and audio/) when it is loaded; the generated sound otherwise
  click: function () { rec("ui_confirm", { vol: .4 }) || SYN.click(); }, select: function () { rec("card_draw", { vol: .8 }) || SYN.select(); },
  ping: function () { rec("ui_ping", { vol: .6 }) || SYN.ping(); }, deploy: function () { rec("card_place", { vol: .9 }) || SYN.deploy(); }, radio: function () { SYN.radio(); },
  launch: function () { rec("launch", { vol: .75 }) || SYN.launch(); }, cannon: function () { rec("cannon", { vol: .9 }) || SYN.cannon(); }, tracer: function () { rec("burst", { vol: .7 }) || SYN.tracer(); },
  boom: function () { rec("boom", { vol: 1 }) || SYN.boom(); }, thud: function () { rec("impact", { vol: .75 }) || SYN.thud(); }, down: function () { rec("boom_big", { vol: 1 }) || SYN.down(); },
  hf: function () { rec("hf", { vol: .6 }) || SYN.hf(); }, round: function () { rec("round", { vol: .8 }) || SYN.round(); }, hhour: function () { rec("alert_hhour", { vol: .5 }) || SYN.hhour(); },
  react: function () { rec("alert_reaction", { vol: .55 }) || SYN.hhour(); }, ability: function () { rec("ui_ability", { vol: .55 }) || SYN.ability(); },
  win: function () { if (!(SND && SND.manifest())) SYN.win(); }, lose: function () { if (!(SND && SND.manifest())) SYN.lose(); },
  draw: function (n) { for (var i = 0; i < Math.min(n, 5); i++) rec("card_draw", { vol: .6, when: i * .13 }); }, shuffle: function () { rec("shuffle", { vol: .8 }); },
  engine: function () { rec("engine", { vol: .4, when: .05 }); }, open: function () { rec("ui_open", { vol: .45 }); }, close: function () { rec("ui_close", { vol: .4 }); },
  zoom: function () { rec("ui_zoom", { vol: .4 }); }, turn: function () { rec("ui_turn", { vol: .45 }); }
};
var moodAt = -99;
function setMood(m, force) {   // recorded music: one mood at a time; the battle moods change at most every 25 seconds unless the moment demands it
  if (!SND || !AC) return false; if (G.opening) return true;   // v0.18: the opening plays its own music (Last Duel)
  var cur = SND.mood(), t = AC.currentTime, calm = { approach: 1, contact: 1, intense: 1 };
  if (m !== cur && !force && calm[cur] && calm[m] && t - moodAt < 25) return true; if (m !== cur) moodAt = t; return SND.music(m);
}
function moodOf(v) { return !v ? "menu" : G.over ? "debrief" : v.round >= v.last ? "final" : G.stand ? "stand" : v.contact ? (Math.min(v.you.hf, v.bot.hf) <= 8 ? "intense" : "contact") : "approach"; }

/* ================= card faces: drawn by cardface.js (shared with the Workbench) ================= */
var CF = window.CardFace, CLS = CF.CLS, TPL = CF.TPL, BOO = CF.BOO, BAR = CF.BAR, rr = CF.rr, cover = CF.cover, isCap = CF.isCap, parseLine = CF.parseLine;
function drawCard(u, S, o) { o = o || {}; if (!o.meta) o.meta = G.meta; var f = u && !u.upfrom && (G.faces || {})[u.name]; if (f && f.upfrom) u = Object.assign({}, u, { upfrom: f.upfrom }); return CF.draw(u, S, o, IMG); }
function drawBase(b, side) {
  var c = cv(440, 160), g = c.getContext("2d"), img = IMG[(b.kind === "Hub" ? "Base_STAGING_ISB_" : "Base_FORWARD_ISB_") + (b.dev ? "Devastated" : "Operational")];
  rr(g, 0, 0, 440, 160, 14); g.fillStyle = "#16191a"; g.fill(); g.save(); rr(g, 6, 6, 428, 148, 10); g.clip();
  if (img) cover(g, img, 6, 6, 428, 148); else { g.fillStyle = "#3b3f36"; g.fillRect(6, 6, 428, 148); }
  var gr = g.createLinearGradient(0, 0, 440, 0); gr.addColorStop(0, "rgba(12,14,12,.92)"); gr.addColorStop(.7, "rgba(12,14,12,.6)"); gr.addColorStop(1, "rgba(12,14,12,.25)"); g.fillStyle = gr; g.fillRect(6, 6, 428, 148);
  if (b.dev) { g.fillStyle = "rgba(125,42,28,.45)"; g.fillRect(6, 6, 428, 148); } g.restore();
  g.fillStyle = "#efe9d6"; g.font = "25px " + BOO; g.textBaseline = "alphabetic"; g.fillText(b.name, 18, 40);
  g.font = "600 16px " + BAR; g.fillStyle = b.dev ? "#ffb49a" : "#a9a48f"; g.fillText(b.kind.toUpperCase() + (b.dev ? " · DEGRADED" : ""), 18, 62);
  var acc = (G.bases || {})[b.kind] || []; g.font = "600 13px " + BAR; g.textAlign = "right"; g.fillStyle = b.ex ? "#ffb49a" : "#7fe0c8"; g.fillText(b.ex ? "PULSE FIRED" : acc.length ? "PULSE READY" : "", 424, 40); g.fillStyle = "#d6cfb8"; g.fillText(acc.map(function (a) { return "[" + a + "]"; }).join(" "), 424, 60); g.textAlign = "left";
  g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(18, 74, 250, 16); g.fillStyle = "#e0a85a"; g.fillRect(18, 74, 250 * Math.min(1, b.sup / Math.max(1, b.stock)), 16);
  g.fillStyle = "#16191a"; g.font = "600 13px " + BAR; g.fillText("SUPPLY " + b.sup + " / " + b.stock + "  (+" + b.restock + ")", 24, 87);
  var left = Math.max(0, b.dur - b.dmg); g.font = "22px " + BOO; g.fillStyle = "#efe9d6"; g.fillText("SURV " + b.surv, 18, 132); g.fillStyle = b.dmg ? "#ffb49a" : "#efe9d6"; g.fillText("DUR " + left + "/" + b.dur, 140, 132); g.fillStyle = "#7fe0c8"; g.fillText("CONC " + b.conc, 290, 132);
  g.strokeStyle = side === "foe" ? "#d8674e" : "#7fb6d8"; g.lineWidth = 5; rr(g, 3, 3, 434, 154, 12); g.stroke();
  if (PREF.shapes) { g.lineWidth = 3; g.strokeStyle = "#0d0f0e"; g.fillStyle = side === "foe" ? "#d8674e" : "#7fb6d8"; g.beginPath(); if (side === "foe") { g.moveTo(404, 96); g.lineTo(420, 112); g.lineTo(404, 128); g.lineTo(388, 112); } else g.rect(384, 100, 38, 24); g.closePath(); g.fill(); g.stroke(); }
  return c;
}
var staticC = cv(96, 134), staticG = staticC.getContext("2d"), staticT = tex(staticC); staticT.magFilter = THREE.NearestFilter;
function drawStatic() {
  var im = staticG.createImageData(96, 134), d = im.data; for (var i = 0; i < d.length; i += 4) { var v = 30 + Math.random() * 90 | 0; if (((i / 4 / 96) | 0) % 3 === 0) v *= .6; d[i] = v * .8; d[i + 1] = v; d[i + 2] = v * .95; d[i + 3] = 255; }
  staticG.putImageData(im, 0, 0); staticG.strokeStyle = "rgba(216,103,78,.95)"; staticG.lineWidth = 3; staticG.beginPath(); staticG.moveTo(48, 38); staticG.lineTo(74, 67); staticG.lineTo(48, 96); staticG.lineTo(22, 67); staticG.closePath(); staticG.stroke();
  staticG.fillStyle = "rgba(8,10,10,.55)"; staticG.fill(); staticG.fillStyle = "#ffb49a"; staticG.font = "bold 30px sans-serif"; staticG.textAlign = "center"; staticG.fillText("?", 48, 78); staticG.font = "bold 9px sans-serif"; staticG.fillStyle = "rgba(232,226,207,.85)"; staticG.fillText("UNKNOWN CONTACT", 48, 122); staticT.needsUpdate = true;
}
var glowC = (function () { var c = cv(128, 176), g = c.getContext("2d"); g.shadowColor = "#fff"; g.shadowBlur = 22; g.strokeStyle = "#fff"; g.lineWidth = 7; rr(g, 26, 26, 76, 124, 8); g.stroke(); g.stroke(); return tex(c); })();
var glowB = (function () { var c = cv(256, 128), g = c.getContext("2d"); g.shadowColor = "#fff"; g.shadowBlur = 20; g.strokeStyle = "#fff"; g.lineWidth = 7; rr(g, 26, 26, 204, 76, 8); g.stroke(); g.stroke(); return tex(c); })();
var retT = (function () { var c = cv(128, 128), g = c.getContext("2d"); g.strokeStyle = "#ff8a66"; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 44, 0, 7); g.stroke(); for (var i = 0; i < 4; i++) { g.save(); g.translate(64, 64); g.rotate(i * Math.PI / 2); g.fillStyle = "#ff8a66"; g.fillRect(-3, -62, 6, 26); g.restore(); } return tex(c); })();

/* ================= the board: one object for each card, contact and Base ================= */
var O = {}, pickables = [], CW = 1.3, CH = 1.3 * 480 / 280, BW = 2.3, BH = 2.3 * 160 / 440;
function rowLayout(n, zc) {
  var RW = LAND ? 11.5 : 6.2, per = n, s = Math.min(1, RW / (n * 1.4)), lines = 1, out = [];
  if (s < .62 && n > 4) { lines = 2; per = Math.ceil(n / 2); s = Math.min(.6, RW / (per * 1.4)); }
  for (var i = 0; i < n; i++) { var line = Math.floor(i / per), k = i % per, cnt = line === lines - 1 ? n - per * (lines - 1) : per; out.push({ x: (k - (cnt - 1) / 2) * 1.4 * s, z: zc + (lines === 2 ? (line ? .72 : -.72) : 0), s: s }); }
  return out;
}
function layout(v) {
  var list = [];
  [["you", 1, "own"], ["bot", -1, "foe"]].forEach(function (a) {
    var p = v[a[0]], sg = a[1];
    [[p.front, 1.72], [p.rear, 4.12]].forEach(function (r) { var L = rowLayout(r[0].length, sg * r[1]); r[0].forEach(function (u, i) { list.push({ uid: u.uid, u: u, x: L[i].x, z: L[i].z, s: L[i].s, side: a[2], type: (u.hidden && !u.cls) ? "contact" : "card" }); }); });
    p.bases.forEach(function (b, i) { list.push({ uid: b.uid, u: b, x: (i - (p.bases.length - 1) / 2) * (BW + .25), z: sg * 5.84, s: 1, side: a[2], type: "base" }); });
  });
  return list;
}
function makeObj(e) {
  var grp = new THREE.Group(); grp.position.set(e.x, .42, e.z); scene.add(grp);
  var base = e.type === "base", w = base ? BW : CW, h = base ? BH : CH;
  var sh = groundPlane(TX.dark, w * 1.5, h * 1.35, e.x + .2, .34, e.z + .24, {}); sh.material.opacity = .85;
  var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ transparent: true, fog: false })); m.rotation.x = -Math.PI / 2 + .03; grp.add(m);
  var gl = new THREE.Mesh(new THREE.PlaneGeometry(w * (base ? 1.3 : 1.55), h * (base ? 1.7 : 1.5)), new THREE.MeshBasicMaterial({ map: base ? glowB : glowC, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: 0x7fe0c8, fog: false })); gl.rotation.x = -Math.PI / 2 + .03; gl.position.y = -.03; grp.add(gl);
  var ring = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: retT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 })); ring.rotation.x = -Math.PI / 2; ring.position.y = .5; grp.add(ring);
  var o = { uid: e.uid, grp: grp, mesh: m, glow: gl, ring: ring, shadow: sh, key: "", tx: e.x, tz: e.z, ts: e.s, side: e.side, type: e.type, u: e.u, alive: true, lift: 0 };
  m.userData.obj = o; pickables.push(m); O[e.uid] = o; return o;
}
function faceKey(e) { var u = e.u; return e.type === "contact" ? "contact" : e.type === "base" ? ["b", u.sup, u.dmg, u.dev, u.surv, u.conc, u.stock, u.ex, PREF.shapes].join("|") : ["c", u.name, u.dmg, u.ex, u.hidden, u.spot, u.surv, u.atkn, u.conc, e.side, G.assist, PREF.shapes].join("|"); }
function setFace(o, e) {
  var k = faceKey(e); if (k === o.key) return false; var old = o.mesh.material.map;
  o.mesh.material.map = e.type === "contact" ? staticT : tex(e.type === "base" ? drawBase(e.u, e.side) : drawCard(e.u, 1, { side: e.side, assist: G.assist, shapes: PREF.shapes }));
  o.mesh.material.needsUpdate = true; if (old && old !== staticT) old.dispose(); o.key = k; return true;
}
function removeObj(o, destroyed) {
  o.alive = false; delete O[o.uid]; var i = pickables.indexOf(o.mesh); if (i >= 0) pickables.splice(i, 1);
  var kill = function () { scene.remove(o.grp); scene.remove(o.shadow); };
  if (G.skip) return kill();
  if (destroyed) {
    SFX.down(); vox(o.side === "foe" ? "kill" : "loss", { delay: .45 }); callout(o.grp.position, "TARGET DESTROYED", "#ff9a7a"); var col = new THREE.Color(1, 1, 1), x = o.grp.position.x, z = o.grp.position.z, n = 0;
    tween(1.3, function (k) { col.setScalar(1 - k * .75); o.mesh.material.color.copy(col); o.mesh.material.opacity = 1 - k * .9; o.grp.position.y = .42 - k * .25; o.shadow.material.opacity = .85 * (1 - k); o.grp.rotation.z = Math.sin(k * 40) * .02 * (1 - k); o.glow.material.opacity = 0; o.ring.material.opacity = 0; }, kill);
    (function puff() { spawn({ p: new THREE.Vector3(x + (Math.random() - .5) * .8, .6, z + (Math.random() - .5) * .8), v: new THREE.Vector3(.5, 1.3, 0), life: 2.6, s0: .5, s1: 3.2, a: .38, color: 0x2c2a28 }); if (++n < 22) after(.12, puff); })();
  } else tween(.3, function (k) { o.mesh.material.opacity = 1 - k; o.shadow.material.opacity = .85 * (1 - k); o.glow.material.opacity = 0; o.ring.material.opacity = 0; }, kill);
}
function screenPos(v) { var p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H }; }
function dmgNum(o, txt) { if (G.skip) return; var p = screenPos(o.grp.position), d = document.createElement("div"); d.className = "dmg"; d.textContent = txt; d.style.left = p.x + "px"; d.style.top = p.y + "px"; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 1400); }
function sync(v, text) {
  if (v && v.terrain) TER.set(v.terrain);
  if (!v) return; var list = layout(v), seen = {}, destroyed = /destroyed/.test(text || "");
  list.forEach(function (e) {
    seen[e.uid] = 1; var o = O[e.uid], fresh = !o; if (!o) o = makeObj(e);
    var was = o.u, wasType = o.type; o.type = e.type; o.side = e.side; o.tx = e.x; o.tz = e.z; o.ts = e.s;
    if (!fresh && was) { var d = (e.u.dmg || 0) - (was.dmg || 0); if (d > 0) { dmgNum(o, "−" + d); o.jolt = 1; if (!G.skip) { SFX.thud(); if (e.side === "own") vox("hit", { delay: .3 }); } } }
    if (!fresh && wasType === "contact" && e.type === "card" && !G.skip) { SFX.ping(); vox(e.side === "foe" ? "spotted" : "detected", { delay: .2 }); sensorSweep({ x: e.x, z: e.z > 0 ? e.z - 4 : e.z + 4 }, { x: e.x, z: e.z }, .45); o.flip = 1; callout(o.grp.position, "IDENTIFIED: " + e.u.name, "#7fe0c8"); }
    setFace(o, e); o.u = e.u;
    if (fresh) { o.grp.scale.setScalar(e.s); if (!G.skip && G.started) { var air = /AIRBORNE/.test(String((G.faces[e.u.name] || {}).tags || "")) && /deploy/.test(text || ""); o.grp.position.y = air ? 7 : 2.4; o.drop = air ? 2 : 1; if (air) callout(new THREE.Vector3(e.x, .5, e.z), "AIRDROP", "#7fe0c8"); } }
  });
  Object.keys(O).forEach(function (uid) { if (!seen[uid]) removeObj(O[uid], destroyed); });
}
function clearBoard() { Object.keys(O).forEach(function (uid) { var o = O[uid]; scene.remove(o.grp); scene.remove(o.shadow); }); O = {}; pickables = []; }

/* ================= sensor sweep: ISR being spent to find a target ================= */
var beamT = (function () { var c = cv(8, 128), g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(127,224,200,0)"); gr.addColorStop(.12, "rgba(200,255,240,1)"); gr.addColorStop(.22, "rgba(127,224,200,.5)"); gr.addColorStop(1, "rgba(127,224,200,0)"); g.fillStyle = gr; g.fillRect(0, 0, 8, 128); return tex(c); })();
function sensorSweep(from, to, dur) {
  if (G.skip) return; var dir = to.z < from.z ? -1 : 1, z0 = to.z - dir * 3.2, z1 = to.z + dir * .6, m = groundPlane(beamT, 9, 2.4, to.x, 1.0, z0, { blending: THREE.AdditiveBlending, fog: false }); if (dir > 0) m.rotation.z = Math.PI;
  nz(dur, "bandpass", 500, 2600, .1); tween(dur, function (k) { m.position.z = z0 + (z1 - z0) * ease(k); m.material.opacity = k > .8 ? (1 - k) / .2 : 1; }, function () { scene.remove(m); m.geometry.dispose(); m.material.dispose(); groundFlash(to.x, to.z, 3.2, 0x7fe0c8, .35); tone(.18, 1480, 1480, .08); });
}

/* ================= attacks ================= */
function attackAnim(fx, v, icpt) {
  var a = O[fx.src], b = O[fx.dst]; if (!b) return .3; if (!a) { impact(b.grp.position, 1); return .6; }
  var u = a.u || {}, tags = String(u.tags || ""), range = u.range || "", kind = range === "Close" ? "tracer" : /ROCKET/.test(tags) ? "rocket" : /CANNON/.test(tags) || range === "Tactical" ? "cannon" : "missile";
  var from = a.grp.position, to = b.grp.position, dir = to.z < from.z ? -1 : 1, d0 = kind === "tracer" ? 0 : .45;
  SFX.radio(); vox(a.side === "own" ? (kind === "rocket" || kind === "missile" ? "fires" : "attack") : "incoming"); if (d0) { sensorSweep(from, to, .4); after(d0, function () { callout(from, kind === "missile" ? "MISSILE AWAY" : "SHOT, OVER"); }); after(d0 + (kind === "rocket" ? 1.0 : kind === "cannon" ? .65 : 1.1), function () { callout(to, icpt ? "INTERCEPTED" : "SPLASH", icpt ? "#7fb6d8" : null); }); } else callout(from, "CONTACT!");
  if (kind === "tracer") { for (var i = 0; i < 6; i++) (function (i) { after(.05 + i * .07, function () { SFX.tracer(); shot(from, to, { dur: .16, arc: .2, size: .5, color: 0xffe08a, trail: false, spread: .8, hit: i === 5 ? .7 : .25, icpt: icpt }); }); })(i); return .9; }
  if (kind === "rocket") { for (var j = 0; j < 6; j++) (function (j) { after(d0 + .15 + j * .12, function () { SFX.launch(); shake = Math.max(shake, .06); groundFlash(from.x, from.z - .5 * dir * -1, 3.5, 0xffb060, .25); shot(from, to, { dur: .8, arc: 4.4 + Math.random() * 1.4, size: 1, color: 0xffc070, trail: true, spread: 1.3, hit: 1, icpt: icpt }); }); })(j); return 1.9 + d0; }
  if (kind === "cannon") { for (var k = 0; k < 2; k++) (function (k) { after(d0 + .1 + k * .28, function () { SFX.cannon(); shake = Math.max(shake, .12); groundFlash(from.x, from.z, 4.5, 0xffd090, .18); shot(from, to, { dur: .5, arc: 2.2, size: .8, color: 0xffd9a0, trail: false, spread: .8, hit: 1.1, icpt: icpt }); }); })(k); return 1.25 + d0; }
  after(d0 + .1, function () { SFX.launch(); groundFlash(from.x, from.z, 4, 0xffb060, .3); shot(from, to, { dur: 1.0, arc: 6.5, size: 1.4, color: 0xfff0d0, trail: true, spread: .3, hit: 1.6, icpt: icpt }); }); return 1.55 + d0;
}
function shot(from, to, o) {
  var p0 = new THREE.Vector3(from.x + (Math.random() - .5) * .5, .8, from.z), p2 = new THREE.Vector3(to.x + (Math.random() - .5) * o.spread, .5, to.z + (Math.random() - .5) * o.spread), p1 = p0.clone().lerp(p2, .5); p1.y = o.arc;
  if (o.icpt) { p2 = p0.clone().lerp(p2, .78); p2.y = 1.6 + Math.random() * .8; }   // stopped short, in the air
  var head = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow, blending: THREE.AdditiveBlending, color: o.color, depthWrite: false, fog: false })); head.scale.set(o.size, o.size, 1); scene.add(head);
  var pos = new THREE.Vector3(), acc = 0;
  tween(o.dur, function (k, dt) { var a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k; pos.set(a * p0.x + b * p1.x + c * p2.x, a * p0.y + b * p1.y + c * p2.y, a * p0.z + b * p1.z + c * p2.z); head.position.copy(pos);
    if (o.trail) { acc += dt; while (acc > .02) { acc -= .02; spawn({ p: pos.clone(), life: .8, s0: .26, s1: 1.0, a: .4, color: 0xddd6c4, v: new THREE.Vector3(0, .15, 0) }); spawn({ p: pos.clone(), life: .15, s0: .7, s1: .2, a: .9, color: 0xff9a40, glow: true }); } } },
  function () { scene.remove(head); head.material.dispose(); if (o.icpt) { SFX.tracer(); for (var q = 0; q < 6; q++) spawn({ p: p2.clone(), v: new THREE.Vector3((Math.random() - .5) * 4, (Math.random() - .3) * 3, (Math.random() - .5) * 4), life: .45, s0: .7, s1: .1, a: 1, color: 0x8fc8ff, glow: true, drag: 1.5 }); spawn({ p: p2.clone(), life: .5, s0: .6, s1: 2.6, a: .8, color: 0x8fc8ff, glow: true }); } else impact(p2, o.hit); });
}
function impact(p, pw) {
  if (pw >= 1) { SFX.boom(); flashScreen(.1 * pw); } else SFX.thud();
  shake = Math.max(shake, .3 * pw); groundFlash(p.x, p.z, 6 * pw, 0xffa040, .4); groundFlash(p.x, p.z, 2.6 * pw, 0xffffff, .16);
  var n = Math.round(8 * pw); for (var i = 0; i < n; i++) { var a = Math.random() * 6.28, sp = 1.5 + Math.random() * 3; spawn({ p: new THREE.Vector3(p.x, .6, p.z), v: new THREE.Vector3(Math.cos(a) * sp, 1.5 + Math.random() * 3, Math.sin(a) * sp), life: 1.2 + Math.random(), s0: .5, s1: 3 * pw, a: .5, color: i % 3 ? 0xb8a888 : 0x4a4640, drag: 2.2 }); }
  for (var j = 0; j < 4; j++) spawn({ p: new THREE.Vector3(p.x, .7, p.z), v: new THREE.Vector3((Math.random() - .5) * 5, 2 + Math.random() * 4, (Math.random() - .5) * 5), life: .35, s0: .5, s1: .1, a: 1, color: 0xffb050, glow: true, drag: 1 });
}

/* ================= camera ================= */
function placeTrack(tb, botPx) {   // the Mission Track sits between the bars (scaled down when the prompt is tall); the feed beside it on wide screens
  tb = tb == null ? ($("top").offsetHeight || 0) : tb; botPx = botPx || 0;
  var mt = $("mtrack"), avail = H - tb - (H <= 520 ? 74 : Math.max(botPx, $("bot").offsetHeight)) - 12; mt.style.top = Math.round(tb + 6 + avail / 2) + "px";
  mt.style.transform = "translateY(-50%)"; var mh = mt.offsetHeight, k = mh > avail && avail > 80 ? Math.max(.55, avail / mh) : 1; mt.style.transformOrigin = "left center"; mt.style.transform = "translateY(-50%)" + (k < 1 ? " scale(" + k.toFixed(3) + ")" : "");   // the Mission Track fits between the bars
  $("feed").style.left = (W >= 900 ? Math.round(mt.getBoundingClientRect().right + 10) : 8) + "px";
}
function uiScale() { var u = Math.max(1, Math.min(1.6, Math.min(innerWidth / 1400, innerHeight / 820))); document.documentElement.style.setProperty("--ui", u.toFixed(3)); }
function fit() {
  uiScale(); W = innerWidth; H = innerHeight; LAND = W > H * 1.05; renderer.setSize(W, H, false); camera.aspect = W / H; camera.clearViewOffset();
  var short = H <= 520, el = (LAND ? (short ? 56 : 60) : 66) * Math.PI / 180; camTarget.set(0, 0, 0);
  var dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el)), bx = LAND ? 6.2 : 3.3, bz = 6.5;
  var tb = $("top").offsetHeight || 0, topPx = Math.max(W < 600 ? 104 : 62, tb), botPx = (H <= 520 ? 74 : W < 600 ? Math.max(268, $("bot").offsetHeight) : $("hand").offsetHeight + 150 * (PREF.text || 1)), topPad = Math.max(.3, 1 - 2 * topPx / H), botPad = Math.max(.15, 1 - 2 * botPx / H);
  var pts = [[-bx, -bz], [bx, -bz], [-bx, bz], [bx, bz]], lo = 10, hi = 260;
  for (var i = 0; i < 24; i++) { var d = (lo + hi) / 2; camera.position.copy(camTarget).addScaledVector(dir, d); camera.lookAt(camTarget); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    var ok = true, mx = -9, mn = 9; pts.forEach(function (p) { var v = new THREE.Vector3(p[0], .4, p[1]).project(camera); if (Math.abs(v.x) > .97) ok = false; mx = Math.max(mx, v.y); mn = Math.min(mn, v.y); }); if (mx - mn > topPad + botPad) ok = false; if (ok) hi = d; else lo = d; }
  // centre the field between the bars
  camera.position.copy(camTarget).addScaledVector(dir, hi); camera.lookAt(camTarget); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  var t = new THREE.Vector3(0, .4, -bz).project(camera).y, b = new THREE.Vector3(0, .4, bz).project(camera).y, off = ((topPad - t) - (b + botPad)) / 2;
  camera.setViewOffset(W, H, 0, off * H / 2, W, H);
  camBase.copy(camera.position); scene.fog.near = hi + 4; scene.fog.far = hi + 20;
  $("feed").style.top = Math.max(W < 600 ? 62 : 58, tb - 6) + "px"; placeTrack(tb, botPx); $("preview").style.bottom = (botPx + 14) + "px";
  if (G.dir) camera.clearViewOffset();
  if (G.view) sync(G.view);
}
addEventListener("resize", function () { fit(); });

/* ================= what the player can do right now ================= */
function maps() {
  var v = G.view, pend = G.pend, M = { src: {}, card: {}, free: [], dsts: {}, sups: {}, selOpts: [] }; if (!v || !pend) return M;
  var meta = pend.meta || [], onBoard = {}, inHand = {};
  [v.you, v.bot].forEach(function (p) { p.front.concat(p.rear).forEach(function (u) { onBoard[u.uid] = 1; }); p.bases.forEach(function (b) { onBoard[b.uid] = 1; }); });
  (v.you.hand || []).forEach(function (c) { inHand[c.id] = 1; });
  var co = pend.coach, al = co && co.allow; if (co && !coachReady(pend)) return M;
  pend.options.forEach(function (o, i) { if (al && al.indexOf(i) < 0) return; var m = meta[i] || {}; if (m.src && onBoard[m.src]) (M.src[m.src] = M.src[m.src] || []).push(i); else if (m.card && inHand[m.card] && pend.kind !== "target") (M.card[m.card] = M.card[m.card] || []).push(i); else M.free.push(i); });
  M.selOpts = G.sel ? (M.src[G.sel] || M.card[G.sel] || []) : [];
  M.selOpts.forEach(function (i) { var m = meta[i] || {}; if (m.dst) (M.dsts[m.dst] = M.dsts[m.dst] || []).push(i); (m.sup || []).forEach(function (x) { M.sups[x] = 1; }); });
  return M;
}
function findUnit(uid) { var v = G.view, r = null; if (!v) return null; [v.you, v.bot].forEach(function (p) { p.front.concat(p.rear).concat(p.bases).forEach(function (u) { if (u.uid === uid) r = u; }); }); return r; }
function selName() { var u = findUnit(G.sel); if (u) return u.name; var c = (G.view.you.hand || []).filter(function (c) { return c.id === G.sel; })[0]; return c ? c.name : ""; }
function reasonFor(name) { var n = (G.pend && G.pend.notes) || []; for (var i = 0; i < n.length; i++) if (n[i].indexOf(name + " ") === 0 || n[i].indexOf(name + ":") === 0 || n[i].indexOf("Hidden " + name + " ") >= 0) return n[i]; return ""; }

/* ================= HUD ================= */
var lastHf = {};
function stat(p, own) {
  var hit = lastHf[own] != null && p.hf < lastHf[own]; lastHf[own] = p.hf;
  var pips = ""; if (own) { for (var i = 0; i < 10; i++) pips += '<span class="' + (i < p.isr ? "on" : "") + '"></span>'; }
  var sp = G.info && G.info.spectate;
  return '<span class="who t">' + (sp ? esc(p.concept) : own ? "You" : "Bot") + "<small>" + (sp ? (own ? "south" : "north") : esc(p.concept)) + "</small></span>" +
    '<span class="hf' + (hit ? " hit" : "") + '"><span class="l">Homefront</span><span class="s">HF</span><b>' + p.hf + '</b><i><u style="width:' + Math.max(0, Math.min(100, p.hf * 5)) + '%"></u></i></span>' +
    "<span>ISR<b>" + p.isr + "</b>" + (own ? '<span class="pips">' + pips + "</span>" : "") + "</span><span><span class='l'>Supply</span><span class='s'>Sup</span><b>" + p.sup + "</b></span>" +
    (own ? "<span>Lift<b>" + p.lift + "</b></span><span>Span<b>" + p.span + "</b></span>" : "<span>Hand<b>" + p.hand_count + "</b></span>") +
    "<span><span class='l'>Strength</span><span class='s'>Str</span><b>" + p.strength + "</b></span>" + (p.piles ? '<button class="piles" id="' + (own ? "hudPiles" : "hudPilesFoe") + '" title="' + (own ? "Your" : "The enemy's") + ' discard pile, Ash Heap and decks"><span class="l">Deck<b>' + (p.ie + p.deck) + "</b> Discard<b>" + p.discard + "</b> Ash Heap<b>" + p.ash + '</b></span><span class="s">Discard<b>' + p.discard + "</b> Ash<b>" + p.ash + "</b></span></button>" : "<span class=\"l\">Deck<b>" + (p.ie + p.deck) + "</b></span>");
}
function pileThumbs(names, counts) {
  if (!names.length) return '<p class="pe">Empty.</p>'; var F = G.faces || {};
  return '<div class="pt">' + names.map(function (n) { var f = F[n]; if (!f) return '<span class="pn">' + esc(n) + "</span>"; var k = "pile:" + n; if (!handCv[k]) try { handCv[k] = drawCard(f, 1, { hand: true }).toDataURL("image/jpeg", .85); } catch (e) { return '<span class="pn">' + esc(n) + "</span>"; }
    return '<button data-pc="' + esc(n) + '" title="' + esc(n) + '"><img src="' + handCv[k] + '" alt="' + esc(n) + '">' + (counts && counts[n] > 1 ? "<i>×" + counts[n] + "</i>" : "") + "</button>"; }).join("") + "</div>"; }
function tally(list) { var c = {}, order = []; (list || []).forEach(function (n) { if (!c[n]) { c[n] = 0; order.push(n); } c[n]++; }); return { c: c, order: order }; }
function showPiles(side) { SFX.open();
  var v = G.view; if (!v) return; side = side === "bot" ? "bot" : "you"; var p = v[side], pl = p.piles || {}, el = $("piles"), mine = side === "you", sp = G.info && G.info.spectate, nm = (G.info && G.info.names) || ["You", "The bot"];
  var lab = function (k) { return sp ? nm[k === "you" ? 0 : 1] : k === "you" ? "Yours" : "The enemy's"; }, ie = tally(pl.ie), mf = tally(pl.mf);
  el.innerHTML = '<div class="pb"><button class="ghost" id="pilesX">Close</button><h3 class="t">Discard piles and Ash Heaps</h3><p class="pd">Round ' + v.round + ". Both players' piles are face up (RD-137). Tap a card to read it.</p>" +
    '<div class="psw" role="tablist">' + ["you", "bot"].map(function (k) { return '<button role="tab" aria-selected="' + (k === side) + '" class="' + (k === side ? "on" : "") + '" data-side="' + k + '">' + esc(lab(k)) + "</button>"; }).join("") + "</div>" +
    "<h4>Discard pile <b>" + p.discard + "</b></h4><p class=\"pd\">Played and discarded cards, newest first. When the Main Force runs out, this pile is shuffled to make a new one.</p>" + pileThumbs(pl.discard || []) +
    "<h4>Ash Heap <b>" + p.ash + "</b></h4><p class=\"pd\">Destroyed and expended cards, newest first. They never return.</p>" + pileThumbs(pl.ash || []) +
    "<h4>Still in " + (sp ? "the" : mine ? "your" : "their") + " decks <b>" + (p.ie + p.deck) + "</b></h4>" +
    (pl.mf ? '<p class="pd">In no particular order. Cards are drawn from Initial Entry until it is empty, then from the Main Force.</p>' + (p.ie ? "<h5>Initial Entry " + p.ie + "</h5>" + pileThumbs(ie.order, ie.c) : "") + "<h5>Main Force " + p.deck + "</h5>" + pileThumbs(mf.order, mf.c)
      : '<p class="pd">Initial Entry ' + p.ie + ", Main Force " + p.deck + ". Which cards they are stays secret.</p>") + "</div>";
  el.style.display = "block"; el.scrollTop = 0; }
$("piles").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; if (b.id === "pilesX") { $("piles").style.display = "none"; return; } if (b.dataset.side) return showPiles(b.dataset.side); var n = b.dataset.pc, f = n && (G.faces || {})[n]; if (f) zoom(f, { hand: true }); });
document.addEventListener("click", function (e) { if (!e.target.closest) return; if (e.target.closest("#hudPiles")) showPiles("you"); else if (e.target.closest("#hudPilesFoe")) showPiles("bot"); });
function trackCol(p, own) { var order = own ? [0, 1, 2, 3] : [3, 2, 1, 0], h = ""; order.forEach(function (n) { var cs = p.track.map(function (t, i) { return { t: t, i: i }; }).filter(function (x) { return n === 0 ? x.t.space <= 0 : n === 3 ? x.t.space >= 3 : x.t.space === n; });
    h += '<div class="ms' + (n === 0 ? " hh" : "") + '"><i>' + (n === 0 ? "H" : n) + "</i>" + cs.map(function (x) { var tp = TPL[x.t.cls] || TPL.JOINT; return '<span data-tr="' + x.i + '" data-own="' + own + '" style="border-color:' + tp[0] + ";background-image:url(" + (ART[x.t.id] || "") + ')"><b>' + esc(x.t.name) + "</b></span>"; }).join("") + "</div>"; }); return h; }
function winTrack() {   // the four ways to win, from the board as it stands (rules: engine Assessment; see the rulebook, Winning)
  var el = $("wint"), v = G.view; if (!el || el.style.display !== "block" || !v) return;
  var I = G.info || {}, hf0 = I.hf0 || 20, last = I.last || v.last || 8, y = v.you, b = v.bot, Z = v.Z || 5;
  var bar = function (cls, who, val, max, txt) { return '<div class="wbar ' + cls + '"><span>' + who + "</span><i><em style=\"width:" + Math.max(0, Math.min(100, 100 * val / max)) + '%"></em></i><u>' + txt + "</u></div>"; };
  var roomY = Math.abs((y.marker || 1) - 1), roomB = Math.abs(Z - (b.marker || Z)), devY = (y.bases || []).filter(function (x) { return x.dev; }).length, devB = (b.bases || []).filter(function (x) { return x.dev; }).length, nb = Math.max((y.bases || []).length, 1);
  var lead = y.hf === b.hf ? "level" : (y.hf > b.hf ? "you lead by " + (y.hf - b.hf) : "the bot leads by " + (b.hf - y.hf));
  var row = function (hot, title, sub, body) { return '<div class="wr' + (hot ? " hot" : "") + '"><b>' + title + "</b><small>" + sub + "</small>" + body + "</div>"; };
  el.innerHTML = '<h4>How each side can win</h4><small style="color:var(--dim)">Checked at Assessment, the end of each round. Amber marks a side close to it.</small>' +
    row(Math.min(y.hf, b.hf) <= 6, "Homefront collapse", "A side whose Homefront reaches 0 loses.", bar("you", "You", y.hf, hf0, y.hf + " of " + hf0) + bar("foe", "Bot", b.hf, hf0, b.hf + " of " + hf0)) +
    row(v.contact && Math.min(roomY, roomB) === 0, "Supremacy", "In Contact, a side that loses the Frontline contest while at its own end of the route is driven off. Room left before that end:", bar("you", "You", roomY, Z - 1, roomY + " Zone" + (roomY === 1 ? "" : "s")) + bar("foe", "Bot", roomB, Z - 1, roomB + " Zone" + (roomB === 1 ? "" : "s"))) +
    row(Math.max(devY, devB) >= nb - 1 && Math.max(devY, devB) > 0, "Devastation", "A side whose Bases are all devastated loses.", bar("you", "You", devY, nb, devY + " of " + nb + " lost") + bar("foe", "Bot", devB, nb, devB + " of " + nb + " lost")) +
    row(v.round >= last - 1, "End of round " + last, "If no one has won by then, the higher Homefront wins. Round " + v.round + " of " + last + "; " + lead + ".", "");
}
function hud() {
  var v = G.view; if (!v) return; winTrack();
  $("foe").innerHTML = stat(v.bot, 0); $("you").innerHTML = stat(v.you, 1);
  var tbh = $("top").offsetHeight; if (tbh !== G.tbH) { G.tbH = tbh; setTimeout(fit, 0); }   // the top bar grew or shrank (text size): place the table, feed and Mission Track again
  var mt = "<em>MISSION TRACK</em>" + trackCol(v.bot, 0) + '<hr>' + trackCol(v.you, 1); if ($("mtrack").dataset.h !== mt) { $("mtrack").innerHTML = mt; $("mtrack").dataset.h = mt; }
  $("phase").innerHTML = "Round " + v.round + " of " + v.last + " · " + esc(v.phase) + "<small> · " + esc(v.terrain) + (v.contact ? " · IN CONTACT" : "") + "" + "</small>";
  var h = ""; for (var z = v.Z; z >= 1; z--) { var c = (v.Z + 1) / 2 === z, k = v.you.marker === z && v.bot.marker === z; h += '<div class="' + (k ? "k" : c ? "c" : "") + '">' + (v.bot.marker === z ? '<span class="f">▼</span>' : "") + (v.you.marker === z ? '<span class="o">▲</span>' : "") + "</div>"; }
  var ct = v.contact ? '<p class="ctst" title="Frontline contest at Assessment: higher Frontline Strength wins; on a tie, more different Classes in the Frontline wins.">CONTEST<b class="f">' + v.bot.strength + '</b><i>vs</i><b class="o">' + v.you.strength + "</b><em>" + (v.you.strength > v.bot.strength ? "you lead" : v.you.strength < v.bot.strength ? "you trail by " + (v.bot.strength - v.you.strength) : "tied") + "</em></p>" : "";
  $("route").innerHTML = ct + "<span>ENEMY</span>" + h + "<span>YOU</span>"; $("route").classList.toggle("live", !!(G.pend && !G.playing && G.pend.kind === "maneuver"));
  frontLine.material.color.set(v.contact ? 0xff6a4a : 0xe0a85a);
}
var handKey = "", handCv = {};
function hand() {
  var v = G.view, M = maps(), hs = (v && v.you.hand) || [], key = hs.map(function (c) { return c.id; }).join(",") + "|" + Object.keys(M.card).join(",") + "|" + G.sel + "|" + (G.playing ? 1 : 0);
  key += "|" + (G.multi ? JSON.stringify(G.multi.picked) : ""); if (key === handKey) return; handKey = key; var el = $("hand"); el.innerHTML = ""; var hi0 = 0;
  hs.forEach(function (c) { var k = c.id + c.name; if (!handCv[k]) handCv[k] = drawCard(c, 1, { hand: true }).toDataURL("image/jpeg", .85); var im = new Image(); im.src = handCv[k]; im.alt = c.name; im.dataset.card = c.id;
    var hi = hi0++; if (M.card[c.id] && !G.playing) im.className = "can"; if (G.sel === c.id) im.className = "sel"; if (G.multi && G.multi.picked.some(function (x) { return x.id === c.id && x.ix === hi; })) im.className = "sel";
    im.dataset.ix = hi; im.onclick = function () { if (dragged) { dragged = false; return; } if (handHeld) { handHeld = false; return; } tapHand(c, hi); }; im.addEventListener("pointerdown", function (e) { handHold(e, c, hi); handDown(e, c, hi, im); }); im.oncontextmenu = function (e) { e.preventDefault(); }; el.appendChild(im); });
}
function btn(i, label, cls) { var w = optWhere(i); return '<button data-i="' + i + '" class="' + (cls || (label.length + w.length > 26 ? "opt" : "ghost")) + '">' + esc(label) + (w ? '<small class="which">' + esc(w) + "</small>" : "") + "</button>"; }
/* v0.17.1: when a side has two or more of the same card, say which one an option means (row, place from the left, damage) */
function copyWhere(uid) {
  var o = O[uid]; if (!o || !o.alive || o.type === "base" || !o.u || !o.u.name || !G.view) return "";
  var same = []; for (var k in O) { var q = O[k]; if (q.alive && q.side === o.side && q.type !== "base" && q.u && q.u.name === o.u.name) same.push(q); }
  if (same.length < 2) return "";
  var p = G.view[o.side === "own" ? "you" : "bot"], row = p.front.some(function (u) { return u.uid === uid; }) ? "Frontline" : "Rear Area";
  var inRow = same.filter(function (q) { return (p.front.some(function (u) { return u.uid === q.uid; }) ? "Frontline" : "Rear Area") === row; }).sort(function (a, b) { return a.tx - b.tx; });
  var n = inRow.indexOf(o) + 1, ord = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"][n] || n + "th";
  return o.u.name + ": " + (o.side === "foe" ? "enemy " : "your ") + row + (inRow.length > 1 ? ", " + ord + " from the left" : "") + (o.u.dmg ? ", " + o.u.dmg + " damage" : ", no damage");
}
function optWhere(i) { var m = G.pend && G.pend.meta && G.pend.meta[i]; if (!m) return ""; var a = m.dst ? copyWhere(m.dst) : "", b = m.src ? copyWhere(m.src) : ""; return [b, a].filter(Boolean).join(" · "); }
function prompt() {
  var el = $("prompt"), v = G.view, pend = G.pend, h = "";
  if (G.err) h = "<p><b>The game stopped on an error. Please pass this text to Claude.</b></p><pre style='white-space:pre-wrap;font-size:calc(12px * var(--ts))'>" + esc(G.err) + "</pre>";
  else if (G.over && !G.playing && !G.queue.length && G.info && G.info.tutorial && !G.replay) h = coachEnd();
  else if (G.over && !G.playing && !G.queue.length) h = '<p class="t" style="font-size:calc(16px * var(--ts));color:var(--amber)">' + (/^Nobody/.test(G.over.winner) ? "A draw" : esc(G.over.winner) + (G.over.winner === "You" ? " win" : " wins")) + " in round " + G.over.round + '</p><p class="h">' + esc(G.over.how) + '.</p><div class="btns"><button id="pDebrief">Debrief</button>' + (SITE && !G.replay ? '<button id="pSend">✉ Send notes</button>' : "") + (G.replay ? '<button class="ghost" id="rExit">' + (G.replay.standalone ? "Stop" : "Exit replay") + "</button>" : '<button class="ghost" id="pNew">Exit to the Main Menu</button>') + "</div>";
  else if (G.replay) h = "<p>" + esc(G.caption || "…") + "</p>" + (G.why && G.whyAt === G.shownN && G.info && G.info.spectate ? '<p class="why">' + esc(whyLine(G.why)) + "</p>" : "") + replayBar();
  else if (G.busy) h = "<p class='h'>Working…</p>";
  else if (pend && !G.playing && G.confirm && G.confirm.n === pend.n) h = '<div class="cf"><p>' + esc(pend.options[G.confirm.i]) + '?</p><p class="h">Once the bot answers, this cannot be taken back. (Settings: Ask before moves you cannot take back.)</p><div class="btns"><button class="go" id="cfYes">Confirm</button><button class="ghost" id="cfNo">Back</button></div></div>';
  else if (pend && !G.playing) {
    var M = maps(), n = Object.keys(M.src).length + Object.keys(M.card).length;
    h = coachBox(pend) + hitsBox() + (pend.coach && !coachReady(pend) ? "" : "<p>" + esc(pend.prompt) + "</p>") + (pend.coach ? "" : tipLine(pend));
    if (pend.coach && !coachReady(pend)) { if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; } return; }
    if (isMulti(pend)) return multiPrompt(el, h, M);
    if (G.sel) {
      var direct = M.selOpts.filter(function (i) { return !((pend.meta[i] || {}).dst); }), tg = Object.keys(M.dsts).length;
      h += '<p class="h"><b style="color:var(--ink)">' + esc(selName()) + "</b> selected." + (tg ? " Tap a ringed target" + (direct.length ? ", or choose:" : ".") : "") + "</p>" + direct.map(function (i) { return btn(i, pend.options[i], "opt"); }).join("") +
        '<div class="btns"><button class="ghost" id="pCancel">Cancel</button><button class="ghost" id="pView">View card</button></div>';
    } else {
      if (n) h += '<p class="h tip">' + (pend.kind === "target" ? "Tap a glowing card to choose it." : "Glowing cards can act. Tap one.") + "</p>";
      h += hintBox(pend);
      var long = M.free.filter(function (i) { return pend.options[i].length > 26; }), shortO = M.free.filter(function (i) { return pend.options[i].length <= 26; });
      h += long.map(function (i) { return btn(i, pend.options[i]); }).join("") + '<div class="btns">' + shortO.map(function (i) { return btn(i, pend.options[i], /^(Pass|Done|Do not|No\b|Keep|Leave|Hold|Stay)/.test(pend.options[i]) ? "ghost" : ""); }).join("") + (G.canUndo ? '<button class="ghost" id="pUndo">↶ Undo</button>' : "") + (hintable(pend) && !(pend.coach && !pend.coach.free) && !(G.hint && G.hint.n === pend.n) ? '<button class="ghost" id="pHint">Hint</button>' : "") + "</div>";
      var notes = pend.notes || []; if (notes.length) h += '<p class="why">' + (notes.length === 1 || pend.kind !== "action" ? notes.map(esc).join("<br>") : notes.length + " of your cards cannot act right now. Tap one to see why.") + "</p>";
    }
  } else h = "<p" + (G.info && G.info.spectate ? "" : " class='h'") + ">" + esc(G.caption || "…") + "</p>" + (G.explain && G.explainAt === G.shownN ? '<p class="why" style="color:#8fc8ff">' + esc(G.explain) + "</p>" : "") + (G.why && G.whyAt === G.shownN && G.info && G.info.spectate ? '<p class="why">' + esc(whyLine(G.why)) + "</p>" : "") + '<div class="btns">' + (G.why && G.info && G.info.spectate ? '<button class="ghost" id="pWhy">Why?</button>' : "") + '<button class="ghost" id="pPause">' + (G.paused ? "▶ Resume" : "❚❚ Pause") + "</button>" + (G.paused ? '<button class="ghost" id="pStep">Next event</button>' : "") + '<button class="ghost" id="pNote">✎ Add note</button></div>';
  if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; var bh = $("bot").offsetHeight; if (Math.abs(bh - (G.botH || 0)) > 8) { G.botH = bh; placeTrack(); } }
}
function render() { hud(); hand(); prompt(); }
/* what caused a loss: the last attack, played or fired card, ability or H-Hour before it (consequence lines are not causes) */
function isCause(text, fx) { if (/takes \d+ damage|is destroyed|loses? \d+ Homefront|is suppressed|covers the target|intercepts|reloads|^--- /.test(text)) return false; return (fx && fx.kind === "attack") || /^H-Hour|\b(attacks|plays|fires|uses|puts|resolves|ends|completes)\b|spills onto/.test(text); }
function hitsBox() { if (!G.hits || !G.hits.length) return ""; return '<div class="hits"><b>Since your last move:</b>' + G.hits.slice(-3).map(function (x) { return '<div class="hit1">' + (x.cause ? '<span class="cz">' + esc(x.cause.replace(/^H-Hour: (The |Your )?/, function (m, w) { return "At H-Hour, " + (w ? w.toLowerCase() : ""); })) + "</span>" : "") + '<span class="out">' + esc(x.lines.join(" ")) + "</span></div>"; }).join("") + "</div>"; }
function feed(text) {
  var nm = (G.info && G.info.names) || ["You", "The bot"], tx = text.replace(/^H-Hour: /, ""), cls = tx.indexOf(nm[1]) === 0 ? "foe" : (tx.indexOf(nm[0]) === 0 || /^Your /.test(tx)) ? "own" : ""; if (/destroyed|devastated|Homefront|wins|Contact/.test(text)) cls += " big";
  var d = document.createElement("div"); d.className = cls; d.textContent = (PREF.shapes && /own|foe/.test(cls) ? (/foe/.test(cls) ? "◆ " : "■ ") : "") + text.replace(/^--- | ---$/g, ""); $("feed").appendChild(d);
  while ($("feed").children.length > (H < 700 || W < 600 ? 2 : 4)) $("feed").removeChild($("feed").firstChild); setTimeout(function () { d.style.opacity = .3; }, 6000);
}
function banner(big, small) { if (G.skip || G.dirQuiet) return; var b = $("banner"); b.innerHTML = esc(big) + (small ? "<small>" + esc(small) + "</small>" : ""); b.classList.remove("on"); void b.offsetWidth; b.classList.add("on"); }
function glossFor(u) {   // which keywords and game terms appear on this card, with their meanings (from browser_play.glossary)
  var GL = G.gloss || [], txt = [].concat(u.lines || [], [u.atk || "", u.range || "", u.sub || "", u.kind || ""]).join("  "), out = [], seen = {};
  GL.forEach(function (g) { if (out.length >= 8 || seen[g[0]]) return; try { if (new RegExp(g[1]).test(txt)) { seen[g[0]] = 1; out.push(g); } } catch (e) { } });
  return out.sort(function (a, b) { return (a[3] === "keyword" ? 0 : 1) - (b[3] === "keyword" ? 0 : 1); });
}
function zoom(u, o) { SFX.zoom(); var cap = ""; if (o && o.caption) cap = o.caption; else if (isCap(u) && u.dur) cap = "Deploy " + (u.costn != null ? u.costn : u.cost) + " · Ready " + u.ready + " · Homefront Loss " + u.hf + " · Concealment " + u.conc; var why = reasonFor(u.name); if (why) cap = why + (cap ? "  ·  " + cap : "");
  var st = u.ex ? "Exhausted. " : (u.hidden && u.cls) ? "Face down (Hidden). " : ""; if (u.dmg > 0) st += "Damaged: " + u.dmg + " of " + u.dur + ". "; if (st) cap = st + cap;
  var clean = Object.assign({}, u, { ex: false, hidden: false, spot: false }), oo = Object.assign({}, o || {}); delete oo.side; delete oo.assist; delete oo.pick; delete oo.caption;
  G.zoomPick = o && o.pick ? o.pick.fn : null; $("zPick").style.display = G.zoomPick ? "" : "none"; if (G.zoomPick) $("zPick").textContent = o.pick.label;
  G.zoomName = u.cls || u.id ? u.name : ""; $("zNote").style.display = G.zoomName && G.info ? "" : "none";
  try { $("zImg").src = (o && o.canvas ? o.canvas : drawCard(clean, 2.5, oo)).toDataURL(); } catch (e) { return; } $("zCap").textContent = cap; var gls = (u.cls || u.id) && !(o && o.canvas) ? glossFor(Object.assign({}, (G.faces || {})[u.name] || {}, u)) : []; $("zGlos").innerHTML = gls.map(function (g) { return "<p><b>" + esc(g[0]) + "</b>" + esc(g[2]) + "</p>"; }).join(""); $("zGlos").style.display = gls.length ? "block" : "none"; $("zoom").classList.toggle("gl", gls.length > 0); $("zoom").classList.toggle("over", $("lib").style.display === "block");   /* above the card library; otherwise under the prompt, so you can still choose while reading */ $("zoom").style.display = "flex"; SFX.click();
  G.zoomId = u.id; if (u.id && !(o && o.canvas) && CF.hi) CF.hi(u.id, function (fresh) { if (fresh && G.zoomId === u.id && $("zoom").style.display === "flex") try { $("zImg").src = drawCard(clean, 2.5, oo).toDataURL(); } catch (e) {} }); }
$("zoom").onclick = function () { $("zoom").style.display = "none"; };
$("zPick").onclick = function (e) { e.stopPropagation(); $("zoom").style.display = "none"; var f = G.zoomPick; G.zoomPick = null; if (f) f(); };

/* ================= moments: a played card shown large, short radio-style callouts, the aiming line ================= */
function showcase(name, label, hot) {
  var f = (G.faces || {})[name]; if (!f || G.skip) return 0; var el = $("show"); if (f.id && CF.hi) CF.hi(f.id);
  try { $("showImg").src = drawCard(f, 1.6, {}).toDataURL("image/jpeg", .9); } catch (e) { return 0; }
  $("showLab").textContent = label; el.className = hot ? "hot" : ""; el.style.animation = "none"; void el.offsetWidth; var d = 1.5 / G.speed; el.style.animation = "showIn " + d + "s ease-out forwards"; return 1.35;
}
function callout(pos, text, col) { if (G.skip || !pos) return; var p = screenPos(pos.clone ? pos : new THREE.Vector3(pos.x, .5, pos.z)), d = document.createElement("div"); d.className = "call"; d.textContent = text; if (col) d.style.color = col; d.style.left = p.x + "px"; d.style.top = (p.y - 26) + "px"; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 1500); }
var aimT = (function () { var c = cv(64, 8), g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 2, 40, 4); var t = tex(c); t.wrapS = THREE.RepeatWrapping; return t; })();
var aim = groundPlane(aimT, 1, .16, 0, .95, 0, { blending: THREE.AdditiveBlending, color: 0xff8a66, fog: false }); aim.visible = false;
function aimUpdate(raw) {
  var ba = G.btnAim, a = (ba && O[ba.a]) || (G.sel && O[G.sel]), b = (ba && O[ba.b]) || (G.pvDst && O[G.pvDst]) || (G.hoverDst && O[G.hoverDst]); if (!a || !b || G.playing) { aim.visible = false; return; }
  var ax = a.grp.position.x, az = a.grp.position.z, bx = b.grp.position.x, bz = b.grp.position.z, len = Math.hypot(bx - ax, bz - az); if (len < .5) { aim.visible = false; return; }
  aim.visible = true; aim.position.set((ax + bx) / 2, .95, (az + bz) / 2); aim.scale.set(len, 1, 1); aim.rotation.z = -Math.atan2(bz - az, bx - ax); aimT.repeat.x = len / 1.1; aimT.offset.x -= raw * 1.6; aim.material.opacity = .75;
}

/* ================= reactions: say which card reacted, with what, and what it did ================= */
var ICPT = /intercepts\. The action is canceled|cancels the action/;
function sideOf(owner) { var nm = (G.info && G.info.names) || ["You", "The bot"]; return owner === "Your" || owner === "You" || owner === nm[0] ? "own" : "foe"; }
function findByName(name, side) { var r = null; Object.keys(O).forEach(function (uid) { var o = O[uid]; if (!r && o.u && o.u.name === name && (!side || o.side === side)) r = o; }); return r; }
function reactionLine(name, verb) { var ls = ((G.faces[name] || {}).lines || []).filter(function (l) { return /^REACTION/.test(l); }), want = /cancel|intercept/.test(verb) ? /INTERCEPT|Cancel/i : /cover/.test(verb) ? /COVER/i : /counterfire/.test(verb) ? /COUNTERFIRE/i : /evacuat/.test(verb) ? /CASEVAC|return it to hand/i : /./, l = ls.filter(function (x) { return want.test(x); })[0] || ls[0]; return l ? parseLine(l) : null; }
function reactionMoment(text, f) {
  var m = text.match(/^(.+?)(?:'s)? ([A-Z0-9][A-Z0-9 '\-]+?) (covers the target|intercepts|cancels the action|counterfires)/), ev = !m && text.match(/^(Your|.+?'s) .+ is destroyed but evacuated to hand by ([A-Z0-9][A-Z0-9 '\-]+?)\./);
  if (!m && !ev) return 0; var owner = (m ? m[1] : ev[1]).replace(/'s$/, ""), name = m ? m[2] : ev[2], verb = m ? m[3] : "evacuated", side = sideOf(owner), o = findByName(name, side), p = reactionLine(name, verb), atk = G.lastAtk || {};
  var what = p ? name + "'s Reaction, " + p.name + ": " + p.body : ""; G.explain = what; G.explainAt = f.n; if (what) G.histWhy[G.hist.length - 1] = (G.histWhy[G.hist.length - 1] ? G.histWhy[G.hist.length - 1] + " " : "") + what;
  if (G.skip) return 0;
  if (o) { groundFlash(o.grp.position.x, o.grp.position.z, 4.5, 0x6aa8ff, .7); o.lift = 1; callout(o.grp.position, "REACTION" + (p && p.name ? ": " + p.name : ""), "#8fc8ff"); }
  var a = O[atk.src], d = O[atk.dst];
  if (/cancels the action|counterfires/.test(verb) && o && a) after(.35, function () { SFX.cannon(); shot(o.grp.position, a.grp.position, { dur: .4, arc: 2, size: .7, color: 0x8fc8ff, trail: false, spread: .3, hit: .7 }); });   // the return shot that damages the attacker
  if (/covers/.test(verb) && d) groundFlash(d.grp.position.x, d.grp.position.z, 3.6, 0x6aa8ff, .8);
  if (ICPT.test(text)) { SFX.react(); showcase(name, "Reaction: " + (p && p.name ? p.name : "cancel") + (side === "foe" ? " · your attack is canceled" : " · the attack is canceled"), true); return 2.0; }
  return 1.1;
}
function enemyReactions() {   // what the other side has face up and Ready that could react; shown before you commit
  var v = G.view, out = [], hid = 0; if (!v) return { list: out, hidden: 0 };
  v.bot.front.concat(v.bot.rear).forEach(function (u) { if (u.hidden && !u.cls) { hid++; return; } if (u.ex) return; ((G.faces[u.name] || {}).lines || []).forEach(function (l) { if (/^REACTION/.test(l)) { var p = parseLine(l); out.push({ name: u.name, title: p.name, body: p.body }); } }); });
  return { list: out, hidden: hid, hand: v.bot.hand_count };
}

/* ================= preview before you commit ================= */
function preview(idx) {
  var pend = G.pend, i0 = idx[0], lab = pend.options[i0], m = pend.meta[i0] || {}, t = findUnit(m.dst), el = $("preview"), h;
  if (m.t === "attack") {
    var atk = (lab.match(/ATK (\d+)/) || [])[1], cost = (lab.match(/costs (\d+) ISR/) || [])[1], dm = (lab.match(/should do (\d+) damage/) || [])[1], sup = (lab.match(/with support from (.+?),/) || [])[1];
    var left = t && t.dur != null ? Math.max(0, t.dur - (t.dmg || 0)) : null, hid = !t || (t.hidden && !t.cls);
    h = '<h3 class="t">' + esc(selName()) + " ▸ " + esc(hid ? "Unknown contact" : t.name) + "</h3><table>" +
      "<tr><td>Attack</td><td>" + esc(atk || "?") + "</td></tr>" + (hid ? "" : "<tr><td>Target Survivability</td><td>" + esc(t.surv) + "</td></tr>") +
      (dm != null ? "<tr><td>Expected damage</td><td>" + dm + "</td></tr>" : "") + "<tr><td>Cost</td><td>" + esc(cost || 0) + " ISR</td></tr><tr><td>Supporting cards</td><td>" + esc(sup || "None") + "</td></tr></table>" +
      '<div class="res">' + (hid ? "Attacking a Hidden card reveals it." : dm == null ? "" : +dm >= left ? "Result: " + esc(t.name) + " should be " + (m.dst.indexOf("b:") === 0 ? "devastated" : "destroyed") : +dm > 0 ? "Result: " + esc(t.name) + " should survive with " + (left - dm) + " Durability" : "Result: no damage expected") + "</div>" +
      (function () { var er = enemyReactions(), seen = {}, rows = er.list.filter(function (r) { var k = r.name + r.title; if (seen[k]) return false; seen[k] = 1; return true; }); if (!rows.length && !er.hidden) return "";
        return '<div class="alt" style="margin-top:6px"><p style="margin:0 0 3px;font-size:calc(12.5px * var(--ts));color:#8fc8ff"><b>The enemy may react.</b> Ready cards with a Reaction:</p>' + rows.map(function (r) { return '<p style="margin:2px 0;font-size:calc(12px * var(--ts));color:var(--dim)"><b style="color:' + (/cancel|intercept/i.test(r.body) ? "#ff9a7a" : "var(--ink)") + '">' + esc(r.name) + " · " + esc(r.title) + (/cancel|intercept/i.test(r.body) ? " (can cancel)" : "") + ":</b> " + esc(r.body) + "</p>"; }).join("") + (er.hidden ? '<p style="margin:2px 0;font-size:calc(12px * var(--ts));color:var(--dim)">' + er.hidden + " Hidden enemy card" + (er.hidden === 1 ? "" : "s") + " may also react.</p>" : "") + "</div>"; })() +
      '<div class="row"><button class="ghost" id="pvX">Cancel</button><button class="go" data-i="' + i0 + '">Fire</button></div>' +
      idx.slice(1).map(function (i) { return '<div class="alt"><p style="margin:0;font-size:calc(12.5px * var(--ts));color:var(--dim)">' + esc(pend.options[i]) + '</p><div class="row"><button class="ghost" data-i="' + i + '">Fire this way</button></div></div>'; }).join("");
  } else h = '<h3 class="t">' + esc(selName()) + "</h3>" + idx.map(function (i) { return btn(i, pend.options[i], "opt"); }).join("") + '<div class="row"><button class="ghost" id="pvX">Cancel</button></div>';
  el.innerHTML = h; el.style.display = "block"; G.pvDst = m.dst;
}
/* ---- why the bot did that: the engine reports what it chose and how it rated every option ---- */
function shortOpt(l) { l = String(l); var i = l.indexOf(": "), j = l.indexOf(" ("); if (/^(Deploy|Upgrade|Attack|Play|Start|Use)/.test(l)) { var c = Math.min(i < 0 ? 999 : i, j < 0 ? 999 : j); if (c < 999) l = l.slice(0, c); } return l.length > 46 ? l.slice(0, 44) + "…" : l; }
function whyLine(w) { var rest = w.options.filter(function (o) { return o.label !== w.pick; }).slice(0, 2); return w.who + " chose “" + shortOpt(w.pick) + "” (rated " + w.score + ")" + (rest.length ? " over " + rest.map(function (o) { return "“" + shortOpt(o.label) + "” (" + o.score + ")"; }).join(", ") : "") + "."; }
function rateNote(w, round) {   // every time a card could be deployed: was it, and how was it rated
  if (w.kind !== "deploy") return; var R = G.rate[w.who] = G.rate[w.who] || {};
  w.options.forEach(function (o, rank) { var m = String(o.label).match(/^Deploy (.+?)( face down)? \(/); if (!m) return; var r = R[m[1]] = R[m[1]] || { offered: 0, chosen: 0, sum: 0, rank: 0 }; r.offered++; r.sum += o.score; r.rank += rank + 1; if (o.label === w.pick) r.chosen++; });
}
function rateTable() {
  var h = ""; Object.keys(G.rate).forEach(function (who) { var R = G.rate[who], names = Object.keys(R).sort(function (a, b) { return R[b].sum / R[b].offered - R[a].sum / R[a].offered; });
    h += '<p style="margin:10px 0 2px;color:var(--amber)">' + esc(who) + '</p><table style="border-collapse:collapse;font-size:calc(12.5px * var(--ts))"><tr style="color:var(--dim)"><td style="padding:2px 12px 2px 0">Card</td><td style="padding:2px 8px">Times it could deploy</td><td style="padding:2px 8px">Times chosen</td><td style="padding:2px 8px">Average rating</td><td style="padding:2px 8px">Average rank among options</td></tr>' +
      names.map(function (n) { var r = R[n]; return '<tr style="border-top:1px solid rgba(255,255,255,.08)"><td style="padding:2px 12px 2px 0">' + esc(n) + (r.chosen === 0 && r.offered >= 3 ? ' <span style="color:var(--amber)">· passed over</span>' : "") + '</td><td style="padding:2px 8px">' + r.offered + '</td><td style="padding:2px 8px">' + r.chosen + '</td><td style="padding:2px 8px">' + (r.sum / r.offered).toFixed(1) + '</td><td style="padding:2px 8px">' + (r.rank / r.offered).toFixed(1) + "</td></tr>"; }).join("") + "</table>"; });
  return h || "<div>No bot deployments recorded yet.</div>";
}
function showWhy() {
  var w = G.why, el = $("log"); if (!w) return; var mx = Math.max.apply(null, w.options.map(function (o) { return Math.abs(o.score); }).concat([1]));
  el.innerHTML = '<button class="ghost" id="logX">Close</button><h3 class="t">Why the bot did that</h3><p>' + esc(w.who) + " had " + w.count + " option" + (w.count === 1 ? "" : "s") + ". It gives each a rating and takes the highest. A rating is the bot's own estimate of worth, not a rule of the game." + (w.count > w.options.length ? " The top " + w.options.length + " are shown." : "") + "</p>" +
    w.options.map(function (o) { var pick = o.label === w.pick; return '<div style="margin:8px 0;max-width:760px"><div style="display:flex;gap:10px;align-items:baseline"><b style="font-family:\'Black Ops One\',Impact,sans-serif;font-weight:400;min-width:44px;color:' + (pick ? "var(--amber)" : "var(--ink)") + '">' + o.score + "</b><span" + (pick ? ' style="color:#fff"' : ' style="color:var(--dim)"') + ">" + esc(o.label) + (pick ? " &nbsp;◀ chosen" : "") + '</span></div><div style="height:4px;margin-top:3px;background:rgba(255,255,255,.08)"><div style="height:4px;width:' + Math.max(1, Math.abs(o.score) / mx * 100) + "%;background:" + (o.score < 0 ? "#8a8f86" : pick ? "#e0a85a" : "#6f7a70") + '"></div></div></div>'; }).join("");
  el.style.display = "block"; el.scrollTop = 0; $("logX").onclick = function () { el.style.display = "none"; };
}
function pause(on) { G.paused = on; if (!on && G.waiting) { G.waiting = false; playNext(); } render(); }
function closePreview() { $("preview").style.display = "none"; G.pvDst = null; }
$("preview").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; if (b.id === "pvX") { closePreview(); return; } if (b.dataset.i != null) choose(+b.dataset.i); };

/* ================= input ================= */
function tapObj(o) {
  if (!G.pend || G.playing || G.busy) { if (o.type !== "contact") zoom(o.u, o.type === "base" ? { canvas: drawBase(o.u, o.side), caption: o.u.kind + ". Survivability " + o.u.surv + ", Concealment " + o.u.conc + " ISR to target." } : { side: o.side }); return; }
  var M = maps(), pend = G.pend, id = o.uid;
  if (isMulti(pend)) { if (M.src[id]) return multiToggle(id); return zoom(o.u, { side: o.side }); }
  if (G.sel && M.dsts[id]) { var d = M.dsts[id]; SFX.click(); if (d.length === 1 && (pend.meta[d[0]] || {}).t !== "attack") return choose(d[0]); return preview(d); }
  var mine = M.src[id];
  if (mine) { if (mine.length === 1 && !(pend.meta[mine[0]] || {}).dst && pend.kind !== "action" && pend.kind !== "deploy") return choose(mine[0]); SFX.select(); closePreview(); G.sel = G.sel === id ? null : id; render(); return; }
  if (o.type === "contact") { zoom({ name: "UNKNOWN CONTACT" }, { canvas: staticC, caption: "A Hidden enemy card. Attacking it costs ISR and reveals it." }); return; }
  zoom(o.u, o.type === "base" ? { canvas: drawBase(o.u, o.side), caption: o.u.kind + ". Survivability " + o.u.surv + ", Concealment " + o.u.conc + " ISR to target." } : { side: o.side });   // zoom puts the reason the card cannot act first (reasonFor)
}
var handHoldT = null, handHeld = false;
function handHold(e, c, ix) { clearTimeout(handHoldT); handHeld = false; var x = e.clientX, y = e.clientY;
  var stop = function (ev) { if (ev.type === "pointermove" && Math.hypot(ev.clientX - x, ev.clientY - y) <= 12) return; clearTimeout(handHoldT); removeEventListener("pointermove", stop); removeEventListener("pointerup", stop); removeEventListener("pointercancel", stop); };
  addEventListener("pointermove", stop); addEventListener("pointerup", stop); addEventListener("pointercancel", stop);
  handHoldT = setTimeout(function () { stop({ type: "x" }); handHeld = true; if (drag) { drag = null; $("dragGhost").style.display = "none"; } readCard(c, ix); }, 430); }
function readCard(c, ix) {   // the large card; while choosing several cards, it carries the choice too
  var pend = G.pend, M = G.pend && !G.playing && !G.busy ? maps() : null;
  if (M && isMulti(pend) && M.card[c.id]) { var cfg = MULTI[pend.kind], on = !!(G.multi && G.multi.kind === pend.kind && G.multi.picked.some(function (x) { return x.id === c.id && x.ix === ix; }));
    return zoom(c, { hand: true, caption: on ? "Picked to " + cfg.verb.toLowerCase() + "." : "", pick: { label: on ? (pend.kind === "discard" ? "Keep this card" : "Do not " + cfg.verb.toLowerCase()) : cfg.verb + " this card", fn: function () { multiToggle(c.id, ix); } } }); }
  zoom(c, { hand: true, caption: pend ? (pend.hand_notes || {})[c.name] || "" : "" });
}
function tapHand(c, ix) {
  if (!G.pend || G.playing || G.busy) return zoom(c, { hand: true });
  var M = maps(), mine = M.card[c.id], pend = G.pend;
  if (isMulti(pend)) { if (mine) return multiToggle(c.id, ix); return zoom(c, { hand: true }); }
  if (G.sel && M.dsts[c.id]) return choose(M.dsts[c.id][0]);
  if (!mine) return zoom(c, { hand: true, caption: (pend.hand_notes || {})[c.name] || "" });
  if (mine.length === 1 && !(pend.meta[mine[0]] || {}).dst && pend.kind !== "action" && pend.kind !== "deploy") return choose(mine[0]);
  SFX.select(); closePreview(); G.sel = G.sel === c.id ? null : c.id; handKey = ""; render();
}
var ray = new THREE.Raycaster(), down = null, holdT = null, held = false;
function objAt(x, y) { ray.setFromCamera({ x: x / W * 2 - 1, y: -(y / H) * 2 + 1 }, camera); var hh = ray.intersectObjects(pickables); return hh.length ? hh[0].object.userData.obj : null; }
$("gl").addEventListener("pointerdown", function (e) { $("menu").hidden = true; down = { x: e.clientX, y: e.clientY }; held = false; clearTimeout(holdT);
  holdT = setTimeout(function () { var o = down && objAt(down.x, down.y); if (o && o.type !== "contact") { held = true; zoom(o.u, o.type === "base" ? { canvas: drawBase(o.u, o.side) } : { side: o.side }); } }, 430); });
$("gl").addEventListener("pointermove", function (e) { if (e.pointerType === "mouse" && G.sel && G.pend && !G.playing) { var ho = objAt(e.clientX, e.clientY), M2 = maps(); G.hoverDst = ho && M2.dsts[ho.uid] ? ho.uid : null; }
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 14) { clearTimeout(holdT); down = null; } });
$("gl").addEventListener("pointercancel", function () { clearTimeout(holdT); down = null; });
$("gl").addEventListener("pointerup", function (e) { clearTimeout(holdT); if (!down || held) { down = null; return; } down = null; var o = objAt(e.clientX, e.clientY); if (o && o.alive) tapObj(o); });
/* v0.17.1: pointing at an option button draws the aim line from the card that acts to its target */
$("prompt").addEventListener("mouseover", function (e) { var b = e.target.closest && e.target.closest("button[data-i]"); var m = b && G.pend && G.pend.meta && G.pend.meta[+b.dataset.i]; G.btnAim = m && m.src && m.dst ? { a: m.src, b: m.dst } : null; });
$("prompt").addEventListener("mouseleave", function () { G.btnAim = null; });
$("prompt").onclick = function (e) {
  var b = e.target.closest("button"); if (!b) return;
  if (b.dataset.i != null) return choose(+b.dataset.i);
  if (b.id === "pCancel") { G.sel = null; closePreview(); handKey = ""; return render(); }
  if (b.id === "pView") { var u = findUnit(G.sel) || (G.view.you.hand || []).filter(function (c) { return c.id === G.sel; })[0]; if (u) zoom(u, { hand: !u.uid }); return; }
  if (b.id === "pUndo") return undo();
  if (b.id === "cfYes" && G.confirm) return choose(G.confirm.i, true);
  if (b.id === "pHintX") { G.hint = null; SFX.close && SFX.close(); return render(); }
  if (b.id === "pHint" && G.pend) { G.hint = { n: G.pend.n }; G.hints = (G.hints || 0) + 1; SFX.select && SFX.select(); return render(); }
  if (b.id === "cfNo") { G.confirm = null; return render(); }
  if (b.id === "pPause") return pause(!G.paused);
  if (b.id === "pWhy") { if (G.playing && !G.paused) pause(true); return showWhy(); }
  if (b.id === "pStep") { G.stepOnce = true; if (G.waiting) { G.waiting = false; playNext(); } return; }
  if (b.id === "pNote") return noteForm();
  if (b.id === "pRec") return $("bRec").onclick();
  if (b.id === "pNew") return quit(true);
  if (b.id === "pLog") return showLog();
  if (b.id === "pAAR") return showAAR();
  if (b.id === "pDebrief") return showDebrief();
  if (b.id === "pSend") return showSend();
  if (b.id === "cNext" && G.pend) { G.cpage[G.pend.n] = (G.cpage[G.pend.n] || 0) + 1; SFX.select && SFX.select(); handKey = ""; return render(); }
  if (b.id === "cBack" && G.pend) { G.cpage[G.pend.n] = Math.max(0, Math.min(coachPages(G.pend).length, G.cpage[G.pend.n] || 0) - 1); handKey = ""; return render(); }
  if (b.id === "cFM") return showManual();
  if (b.id === "cPlay") { SET.mode = "bot"; return quit(true); }
  if (b.id === "tipX" && G.tipNow && G.tipNow.key) { tipSeen(G.tipNow.key); G.tipNow = { key: null, n: G.tipNow.n }; return render(); }   /* one tip a prompt: the next waits for the next prompt */
};
$("mtrack").onclick = function (e) { var c = e.target.closest("[data-tr]"); if (!c || !G.view) return; var t = (c.dataset.own === "1" ? G.view.you : G.view.bot).track[+c.dataset.tr]; if (!t) return;
  zoom({ name: t.name, cls: t.cls, id: t.id, cap: false, gen: "", sub: t.kind === "inf" ? "Operator" : "Mission Track", lines: String(t.text).split(" / ") }, { caption: (c.dataset.own === "1" ? "Yours. " : "The enemy's. ") + (t.space <= 0 ? "Resolves at H-Hour." : t.space + " round" + (t.space === 1 ? "" : "s") + " to H-Hour.") }); };

/* ================= select, then confirm (discard, readying, COUNTERATTACK) ================= */
var MULTI = { discard: { verb: "Discard", done: "Keep the rest and draw", max: 99 }, ready_select: { verb: "Ready", done: "Done readying", max: 99 }, counterattack: { verb: "Ready", done: "Ready none", max: 2 },
  flip: { verb: "Flip", done: "Flip none", max: 2, hint: "Tap the glowing cards of yours to flip face down, then confirm." }, paralyze: { verb: "Exhaust", done: "Exhaust none", max: 2, hint: "Tap the glowing enemy cards to exhaust, then confirm." },
  strike: { verb: "Ready", done: "Ready none", max: 2, hint: "Tap the glowing FIRES cards to ready, then confirm." } };
function isMulti(p) { return !!(p && MULTI[p.kind] && !p.coach); }   /* v0.17: Basic Training asks one card at a time */
function optFor(id) { var pend = G.pend, meta = pend.meta || []; for (var i = 0; i < pend.options.length; i++) { var m = meta[i] || {}; if (m.src === id || m.card === id) return i; } return -1; }
function finalOpt() { var pend = G.pend, meta = pend.meta || []; for (var i = 0; i < pend.options.length; i++) { var m = meta[i] || {}; if (m.t === "num" && m.n === 0) return i; } return pend.options.length - 1; }
function multiToggle(id, ix) {
  var pend = G.pend, cfg = MULTI[pend.kind]; if (!G.multi || G.multi.kind !== pend.kind) G.multi = { kind: pend.kind, picked: [] };
  var k = G.multi.picked.findIndex(function (x) { return x.id === id && (ix == null || x.ix === ix); });
  if (k >= 0) G.multi.picked.splice(k, 1); else if (G.multi.picked.length < cfg.max) { G.multi.picked.push({ id: id, ix: ix }); SFX.select(); }
  handKey = ""; render();
}
function multiCost() { var pend = G.pend, t = 0; (G.multi ? G.multi.picked : []).forEach(function (x) { var i = optFor(x.id); var c = i >= 0 && (pend.options[i].match(/^Pay (\d+)/) || [])[1]; if (c) t += +c; }); return t; }
function multiPrompt(el, h, M) {
  var pend = G.pend, cfg = MULTI[pend.kind], k = (G.multi && G.multi.kind === pend.kind) ? G.multi.picked.length : 0, cost = multiCost();
  var names = (G.multi && G.multi.kind === pend.kind ? G.multi.picked : []).map(function (x) { var u = findUnit(x.id); if (u) return u.name; var c = (G.view.you.hand || []).filter(function (c) { return c.id === x.id; })[0]; return c ? c.name : x.id; });
  h += '<p class="h tip">' + (cfg.hint || (pend.kind === "discard" ? "Tap the cards in your hand you want to discard, then confirm. Hold a card to read it." : "Tap the glowing cards you want to ready, then confirm.")) + (cfg.max < 99 ? " Up to " + cfg.max + "." : "") + "</p>" +
    (k ? '<p class="why" style="color:var(--ink)">Selected: ' + esc(names.join(", ")) + (cost ? " · costs " + cost + " Supply" : "") + "</p>" : "") +
    '<div class="btns"><button class="go" id="mGo">' + (k ? cfg.verb + " " + k + (pend.kind === "discard" ? " and draw" : "") : esc(cfg.done)) + "</button>" + (k ? '<button class="ghost" id="mClr">Clear</button>' : "") + (G.canUndo ? '<button class="ghost" id="pUndo">↶ Undo</button>' : "") + "</div>";
  if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; }
}
function multiGo() { var pend = G.pend; if (!pend) return; var picked = (G.multi && G.multi.kind === pend.kind) ? G.multi.picked.map(function (x) { return x.id; }) : []; G.multi = null; G.autoQ = { kind: pend.kind, ids: picked }; autoStep(); }
function autoStep() {
  var q = G.autoQ, pend = G.pend; if (!q || !pend || pend.kind !== q.kind) { G.autoQ = null; return; }
  while (q.ids.length) { var i = optFor(q.ids.shift()); if (i >= 0) return choose(i); }
  G.autoQ = null; choose(finalOpt());
}
$("prompt").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; if (b.id === "mGo") multiGo(); if (b.id === "mClr") { G.multi = null; handKey = ""; render(); } });

/* ================= drag and drop: hand to table or Mission Track; your card to a target; the marker along the route ================= */
var drag = null, dragged = false;
function handDown(e, c, ix, im) { if (!G.pend || G.playing || G.busy || isMulti(G.pend)) return; drag = { kind: "card", c: c, ix: ix, x: e.clientX, y: e.clientY, im: im, on: false }; }
function infOpt(uid) { var M = maps(), l = M.src[uid] || []; for (var k = 0; k < l.length; k++) if (/to infiltrate/.test(G.pend.options[l[k]])) return l[k]; return -1; }   /* an Operator's INFILTRATE option */
function ghostAt(x, y) { var g = $("dragGhost"); g.style.left = x + "px"; g.style.top = y + "px"; }
addEventListener("pointermove", function (e) {
  if (!drag) return;
  if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 12) {
    drag.on = true; clearTimeout(holdT); down = null;
    if (drag.kind === "card") { var g = $("dragGhost"); g.innerHTML = ""; var im = new Image(); im.src = drag.im.src; g.appendChild(im); g.style.display = "block"; var M = maps(); if (M.card[drag.c.id]) { G.sel = drag.c.id; render(); } }
  }
  if (!drag.on) return; e.preventDefault();
  if (drag.kind === "card") { ghostAt(e.clientX, e.clientY); var over = document.elementFromPoint(e.clientX, e.clientY); $("mtrack").classList.toggle("drop", !!(over && over.closest && over.closest("#mtrack"))); var ho = objAt(e.clientX, e.clientY), M2 = maps(); G.hoverDst = ho && M2.dsts[ho.uid] ? ho.uid : null; }
  if (drag.kind === "unit") { var ho2 = objAt(e.clientX, e.clientY), M3 = maps(); G.hoverDst = ho2 && M3.dsts[ho2.uid] ? ho2.uid : null; var ov = document.elementFromPoint(e.clientX, e.clientY); $("mtrack").classList.toggle("drop", !!(ov && ov.closest && ov.closest("#mtrack")) && infOpt(drag.uid) >= 0); }
  if (drag.kind === "marker") routeHover(e.clientY);
}, { passive: false });
addEventListener("pointerup", function (e) {
  var d = drag; drag = null; $("dragGhost").style.display = "none"; $("mtrack").classList.remove("drop"); if (!d || !d.on) return; dragged = true; setTimeout(function () { dragged = false; }, 50); G.hoverDst = null;
  if (!G.pend || G.playing || G.busy) return; var M = maps(), pend = G.pend;
  if (d.kind === "card") {
    var mine = M.card[d.c.id] || [], over = document.elementFromPoint(e.clientX, e.clientY), onTrack = !!(over && over.closest && over.closest("#mtrack")), onHand = !!(over && over.closest && over.closest("#hand"));
    if (!mine.length) { G.sel = null; render(); return zoom(d.c, { hand: true, caption: (pend.hand_notes || {})[d.c.name] || "This card cannot be played right now." }); }
    if (onHand) { G.sel = null; handKey = ""; return render(); }
    var o = objAt(e.clientX, e.clientY), lab = function (i) { return pend.options[i]; };
    if (o && M.dsts[o.uid]) { var dd = M.dsts[o.uid]; if (dd.length === 1 && (pend.meta[dd[0]] || {}).t !== "attack") return choose(dd[0]); return preview(dd); }   // onto a card: upgrade it, or aim at it
    var pick = mine.filter(function (i) { return !(pend.meta[i] || {}).dst; });
    if (onTrack) { var tr = pick.filter(function (i) { return /^Play /.test(lab(i)); }); if (tr.length === 1) return choose(tr[0]); }
    else { var up = pick.filter(function (i) { return !/face down|decoy/.test(lab(i)); }); if (up.length === 1) return choose(up[0]); if (!up.length && pick.length === 1) return choose(pick[0]); }
    G.sel = d.c.id; handKey = ""; return render();   // more than one way to play it: the choices are listed below
  }
  if (d.kind === "unit") { var ovt = document.elementFromPoint(e.clientX, e.clientY); if (ovt && ovt.closest && ovt.closest("#mtrack") && infOpt(d.uid) >= 0) return choose(infOpt(d.uid));
    var t = objAt(e.clientX, e.clientY); if (t && M.dsts[t.uid]) { var ds = M.dsts[t.uid]; if (ds.length === 1 && (pend.meta[ds[0]] || {}).t !== "attack") return choose(ds[0]); return preview(ds); } return render(); }
  if (d.kind === "marker") routeDrop(e.clientY);
});
$("gl").addEventListener("pointerdown", function (e) { if (!G.pend || G.playing || G.busy || isMulti(G.pend)) return; var o = objAt(e.clientX, e.clientY), M = maps(); if (o && M.src[o.uid] && M.src[o.uid].some(function (i) { return (G.pend.meta[i] || {}).dst || /to infiltrate/.test(G.pend.options[i]); })) drag = { kind: "unit", uid: o.uid, x: e.clientX, y: e.clientY, on: false, start: function () { G.sel = o.uid; render(); } }; });
addEventListener("pointermove", function () { if (drag && drag.kind === "unit" && drag.on && drag.start) { drag.start(); drag.start = null; } });
function routeZones() { return Array.prototype.slice.call($("route").querySelectorAll("div")); }
function routeMoves() { var pend = G.pend, out = {}; if (!pend || pend.kind !== "maneuver") return out; pend.options.forEach(function (o, i) { var m = o.match(/^Advance (\d+) Zone/); if (m) out[+m[1]] = i; else if (/^Fall back/.test(o)) out[-1] = i; else if (/^Hold/.test(o)) out[0] = i; }); return out; }
function zoneAtY(y) { var zs = routeZones(), v = G.view; for (var k = 0; k < zs.length; k++) { var r = zs[k].getBoundingClientRect(); if (y >= r.top - 2 && y <= r.bottom + 2) return v.Z - k; } return null; }
function routeHover(y) { var z = zoneAtY(y), v = G.view; routeZones().forEach(function (d, k) { d.classList.toggle("hov", z != null && v.Z - k === z); }); }
function routeDrop(y) { var z = zoneAtY(y), v = G.view, mv = routeMoves(); routeZones().forEach(function (d) { d.classList.remove("hov"); }); if (z == null) return; var steps = z - v.you.marker;   // you move up the route toward the enemy
  if (mv[steps] != null) return choose(mv[steps]); feed(steps > 0 && !Object.keys(mv).some(function (k) { return +k > 0; }) ? "You cannot advance right now." + ((G.pend.notes || [])[0] ? " " + G.pend.notes[0] : "") : "That move is not allowed. Your choices: " + G.pend.options.join(", ") + "."); }
$("route").addEventListener("pointerdown", function (e) { if (!G.pend || G.playing || G.pend.kind !== "maneuver") return; e.preventDefault(); drag = { kind: "marker", x: e.clientX, y: e.clientY, on: false }; });
$("route").addEventListener("click", function (e) { if (dragged || !G.pend || G.playing || G.pend.kind !== "maneuver") return; routeDrop(e.clientY); });

/* ================= Basic Training: the coach (v0.17, Stage D) ================= */
function coachPages(p) { return (p.coach && p.coach.pages) || []; }
function coachReady(p) { return !p.coach || (G.cpage[p.n] || 0) >= coachPages(p).length; }
function coachBox(p) {
  var c = p.coach; if (!c) return "";
  var pg = coachPages(p), k = Math.min(G.cpage[p.n] || 0, pg.length), reading = k < pg.length, h = '<div class="coach' + (c.drift ? " drift" : "") + '">';
  h += '<p class="ck">' + esc(c.free ? "Basic Training" : (c.lesson ? c.lesson + " · " : "") + "step " + c.n + " of " + c.of) + '</p><p class="ct">' + esc(c.title || "") + "</p>";
  if (reading) h += '<p class="cx">' + esc(pg[k]) + '</p><div class="btns">' + (k ? '<button class="ghost" id="cBack">Back</button>' : "") + '<button class="cgo" id="cNext">Next' + (pg.length > 1 ? " (" + (k + 1) + " of " + pg.length + ")" : "") + "</button></div>";
  else { if (k && pg.length) h += '<p class="cr"><button class="ghost lk" id="cBack">Read the note again</button></p>';
    h += '<p class="cd">' + esc(c.do || "") + "</p>" + (G.nudge && G.nudge.n === p.n ? '<p class="cn">' + esc(c.nudge || "Not that one yet. " + (c.do || "")) + "</p>" : ""); }
  return h + "</div>";
}
function coachEnd() {
  var t = G.info.tutorial || {}, e = (t.end || {})[G.over.winner === "You" ? "win" : "other"] || {}, pages = e.pages || [];
  return '<div class="coach end"><p class="ck">' + esc(t.name || "Basic Training") + ' · complete</p><p class="ct">' + esc(e.title || "Basic Training is over") + "</p>" + (e.next ? '<p class="cd">' + esc(e.next) + "</p>" : "") +
    '<div class="btns">' + (SITE ? '<button class="cgo" id="pSend">✉ Send notes</button><button class="ghost" id="cPlay">Play the bot</button>' : '<button class="cgo" id="cPlay">Play the bot</button>') + '<button class="ghost" id="cFM">Field Manual</button><button class="ghost" id="pDebrief">Debrief</button><button class="ghost" id="pNew">Exit to the Main Menu</button></div>' + pages.map(function (x) { return '<p class="cx">' + esc(x) + "</p>"; }).join("") + "</div>";
}
function showManual() {   /* the Field Manual: the Basic Training lessons, the ways to win and the glossary, all in the game */
  audioInit(); unlock(); SFX.open && SFX.open(); var el = $("fm"), t = (G.setupData && G.setupData.training) || G.training || null, gl = G.gloss || {};
  if (t) G.training = t;
  var lessons = t ? t.lessons : [], groups = [], seen = {};
  lessons.forEach(function (x) { if (!seen[x.lesson]) { seen[x.lesson] = { lesson: x.lesson, items: [] }; groups.push(seen[x.lesson]); } seen[x.lesson].items.push(x); });
  var words = [], had = {}; (Array.isArray(gl) ? gl : []).forEach(function (x) { if (x && !had[x[0]]) { had[x[0]] = 1; words.push([x[0], x[2], x[3]]); } });
  words.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  el.innerHTML = '<div class="lh"><button class="ghost" id="fmX" style="float:right">Close</button><h3 class="t" style="margin:2px 0">Field Manual</h3><p class="hint">How to play, as taught in Basic Training, and every keyword and game term. The full rules join this page when the rulebook is updated.</p>' +
    '<div class="row seg2" id="fmTabs"><button data-fm="how" aria-pressed="true">How to play</button><button data-fm="win" aria-pressed="false">Ways to win</button><button data-fm="words" aria-pressed="false">Glossary</button></div></div>' +
    '<div class="fmb" data-fm="how">' + (groups.length ? groups.map(function (g) { return "<h4>" + esc(g.lesson) + "</h4>" + g.items.map(function (x) { return '<p class="fq">' + esc(x.title) + "</p>" + x.pages.map(function (y) { return "<p>" + esc(y) + "</p>"; }).join(""); }).join(""); }).join("") : "<p>Basic Training is not on this copy of the page.</p>") + "</div>" +
    '<div class="fmb" data-fm="win" hidden>' + (t && t.win ? t.win.pages.map(function (y) { return "<p>" + esc(y) + "</p>"; }).join("") : "") + "<p>In a game, the ⚑ button shows how close each side is to each way to win.</p></div>" +
    '<div class="fmb" data-fm="words" hidden><input type="search" id="fmQ" placeholder="Find a word"><dl id="fmDl">' + words.map(function (w) { return "<dt>" + esc(w[0]) + (w[2] === "keyword" ? ' <small style="color:var(--dim);font-weight:400">keyword</small>' : "") + "</dt><dd>" + esc(w[1]) + "</dd>"; }).join("") + "</dl></div>";
  el.style.display = "block";
}
$("fm").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; if (b.id === "fmX") { $("fm").style.display = "none"; SFX.close && SFX.close(); return; }
  if (b.dataset.fm) { Array.prototype.forEach.call($("fmTabs").children, function (x) { x.setAttribute("aria-pressed", x === b); }); Array.prototype.forEach.call($("fm").querySelectorAll(".fmb"), function (x) { x.hidden = x.dataset.fm !== b.dataset.fm; }); } };
$("fm").addEventListener("input", function (e) { if (e.target.id !== "fmQ") return; var q = e.target.value.toUpperCase(), dts = $("fmDl").children;
  for (var i = 0; i < dts.length; i += 2) { var on = !q || (dts[i].textContent + " " + dts[i + 1].textContent).toUpperCase().indexOf(q) >= 0; dts[i].hidden = dts[i + 1].hidden = !on; } });

/* first-time tips: one line the first time each thing comes up in a normal game (Settings > Tips switches them off) */
var TIPS = [
  ["deploy", function (p) { return p.kind === "deploy"; }, "Command: deploy cards from your hand. Each costs its Deploy number in Supply and 1 Lift. New cards arrive in your Rear Area."],
  ["hidden", function (p) { return p.kind === "deploy" && p.options.some(function (o) { return /face down/.test(o); }); }, "Deploying face down makes a Hidden card: it costs no Supply now, and the enemy pays {hidden_isr} more ISR to attack it. Revealing it later costs its Deploy cost."],
  ["upgrade", function (p) { return p.kind === "deploy" && p.options.some(function (o) { return /^Upgrade /.test(o); }); }, "Upgrade: a Generation II or III card can replace a card in play that its Upgrades From line names. You pay only the difference in Supply."],
  ["discard", function (p) { return p.kind === "discard"; }, "Command starts with a choice: discard any cards you will not use soon, then draw back up to 5."],
  ["arrange", function (p) { return p.kind === "arrange"; }, "Frontline cards fight and count for Frontline Strength. Rear Area cards are safe from close attacks. The Frontline holds a limited number of cards."],
  ["maneuver", function (p) { return p.kind === "maneuver"; }, "Move your Force Marker: advance, hold or fall back. When both markers share a Zone the forces are in Contact."],
  ["action", function (p) { return p.kind === "action"; }, "Operations: you and the enemy take turns, one action each. Tap a glowing card to act. Two passes in a row end the phase."],
  ["contact", function (p, v) { return v && v.contact && (p.kind === "action" || p.kind === "maneuver"); }, "In Contact: Close attacks can reach, and at Assessment the higher Frontline Strength wins the contest. The loser falls back and loses 1 Homefront."],
  ["operator", function (p) { return p.kind === "action" && p.options.some(function (o) { return /to infiltrate/.test(o); }); }, "Operators reach the Mission Track one way: from your Frontline, in Operations, by their INFILTRATE line (1 ISR). They act at H-Hour, then return to your Rear Area."],
  ["effect", function (p) { return p.kind === "action" && p.options.some(function (o) { return /^Play /.test(o); }); }, "Effect cards: Orders happen at once; Operations and Conditions wait on the Mission Track and act at H-Hour. Tap a card in your hand to play it."],
  ["etrack", function (p, v) { return v && v.bot.track.length > 0; }, "The enemy has a card on its Mission Track. It acts at H-Hour; tap it on the track to read it."],
  ["reaction", function (p) { return p.kind === "reaction"; }, "A Reaction answers the enemy's move. Using it exhausts the card, or spends the Reaction card from your hand."],
  ["ready", function (p) { return p.kind === "ready_select"; }, "Sustainment: pay each card's Ready number in Supply to ready it for next round. Aircraft you do not ready return to base."],
  ["repair", function (p) { return p.kind === "ready" && /^Recover/.test(p.prompt); }, "Repair: {recover_cost} Supply removes 1 damage. A card is destroyed when its damage reaches its Durability."],
  ["stand", function (p, v) { return v && (v.you.marker === 1 || v.bot.marker === v.Z) && v.contact; }, "Last stand: a force on its own home edge gets +{home_bonus} Frontline Strength. Losing the contest there loses the game (Supremacy)."],
  ["mobil", function (p, v) { return v && v.you.hf <= ((G.setupData && G.setupData.rules) || {}).tick_hi; }, "Homefront {tick_hi} or less: mobilization gives +2 ISR and +2 Supply, once. At {tick_lo} or less, a national emergency gives a card and +1 Span of Control."]];
function tipsSeen() { try { return JSON.parse(localStorage.getItem("ss.tipsSeen") || "{}") || {}; } catch (e) { return {}; } }
function tipSeen(k) { var s = tipsSeen(); s[k] = 1; try { localStorage.setItem("ss.tipsSeen", JSON.stringify(s)); } catch (e) { } }
function tipLine(p) {
  if (!PREF.tips || (G.info && (G.info.spectate || G.info.tutorial)) || G.replay) return "";
  if (!(G.tipNow && G.tipNow.n === p.n)) { var s = tipsSeen(), v = G.view, t = null; G.tipNow = null;
    for (var i = 0; i < TIPS.length; i++) { if (s[TIPS[i][0]]) continue; try { if (TIPS[i][1](p, v)) { t = TIPS[i]; break; } } catch (e) { } }
    if (t) { var R = (G.setupData && G.setupData.rules) || {}; G.tipNow = { key: t[0], text: t[2].replace(/\{(\w+)\}/g, function (m, k) { return R[k] != null ? R[k] : m; }), n: p.n }; } }
  return G.tipNow && G.tipNow.key ? '<p class="ftip tip"><b>First time:</b> ' + esc(G.tipNow.text) + ' <button class="ghost lk" id="tipX">Got it</button></p>' : "";
}

/* ================= talking to the engine ================= */
var engineOk, ENGINE = new Promise(function (ok) { engineOk = ok; });
function api(path, body) { return ENGINE.then(function (handle) { return new Promise(function (r) { setTimeout(r, 0); }).then(function () { var out = JSON.parse(handle(CP + path, JSON.stringify(body || {}))); if (out && out.error && !out.game) throw new Error(out.error); return out; }); }); }
function fail(e) { G.err = String(e && e.message || e); G.busy = false; render(); }
function hintable(p) { return !!(p && p.rate && p.rate.length === p.options.length && p.options.length > 1 && !(G.info && G.info.spectate)); }
function hintBox(p) {   // the bot's own rating of your options: its top pick and the next two (Settings > Tips does not hide it; you asked for it)
  if (!G.hint || G.hint.n !== p.n || !hintable(p)) return "";
  var ix = p.options.map(function (_, i) { return i; }).sort(function (a, b) { return p.rate[b] - p.rate[a]; }), top = p.rate[ix[0]], ties = ix.filter(function (i) { return Math.abs(p.rate[i] - top) < 1e-6; });
  var h = '<div class="hintbox">';
  if (ties.length === p.options.length) h += "<p>The bot rates all of these the same; any is as good as another by its rules of thumb.</p>";
  else { h += "<p><b>The bot would choose:</b> " + esc(ties.length > 1 ? ties.map(function (i) { return p.options[i]; }).slice(0, 3).join(" or ") : p.options[ix[0]]) + "</p>";
    var rest = ix.filter(function (i) { return ties.indexOf(i) < 0; }).slice(0, 2); if (rest.length) h += "<p><small>Next: " + rest.map(function (i) { return esc(p.options[i]) + " (" + p.rate[i] + ")"; }).join("; ") + ". Top rating " + top + ".</small></p>"; }
  return h + "<p><small>The bot weighs each option by simple rules of thumb. It can be wrong; your plan comes first.</small></p><button class=\"ghost\" id=\"pHintX\">Hide hint</button></div>";   /* v0.16.1: close it without choosing */
}
function needsConfirm(i) { var p = G.pend, l = String(p.options[i] || ""), m = (p.meta || [])[i] || {}; return (p.kind === "action" && m.t !== "attack" && /^(Pass|Play |Use |Send |Reveal )/.test(l)) || (p.kind === "deploy" && /^Done deploying/.test(l)) || p.kind === "maneuver"; }
function choose(i, sure) {
  if (!G.pend || G.busy) return;
  var co = G.pend.coach; if (co && co.allow && co.allow.indexOf(i) < 0) { G.nudge = { n: G.pend.n }; SFX.select && SFX.select(); return render(); }
  if (co && !coachReady(G.pend)) { G.cpage[G.pend.n] = 99; }
  if (!co && G.tipNow && G.tipNow.key && G.tipNow.n === G.pend.n) tipSeen(G.tipNow.key);
  if (PREF.confirm && !sure && needsConfirm(i)) { G.confirm = { i: i, n: G.pend.n }; SFX.select && SFX.select(); return render(); }
  G.confirm = null; var n = G.pend.n; SFX.click(); G.hits = []; closePreview(); G.sel = null; G.pend = null; G.latestPend = null; G.busy = true; handKey = ""; render();
  api("/play/choose", { i: i, n: n }).then(poll, fail);
}
function undo() { if (G.busy) return; G.busy = true; G.sel = null; G.pend = null; closePreview(); render(); api("/play/undo", {}).then(poll, fail); }
function poll() {
  $("bot").style.visibility = "";
  return api("/play/state", { since: G.since }).then(function (d) {
    var g = d.game; G.busy = false; if (!g) return showSetup();
    G.lastN = g.last; G.canUndo = !!g.can_undo; G.info = g.info; useBuild(g.info && g.info.build);
    if (!G.notesTried) { G.notesTried = true; try { var sv = JSON.parse(localStorage.getItem("ss_notes") || "null"); if (sv && sv.seed === g.info.seed && !G.notes.length) G.notes = sv.notes || []; } catch (e) { } } G.over = g.over; G.err = g.error; G.latest = g.view && g.view.board; G.latestPend = g.pending;
    g.frames.forEach(function (f) { G.queue.push(f); G.since = Math.max(G.since, f.n); });
    if (!G.playing) playNext();
  }, fail);
}
function finish() {
  G.playing = false; G.skip = false; G.caption = ""; musicState(G.latest); $("vig").className = G.stand && !G.over ? "fx stand" : "fx"; if (G.over) MUS.target = 0;
  if (G.latest) { G.view = G.latest; sync(G.view); }
  G.pend = G.latestPend; G.started = true; handKey = "";
  if (G.pend && G.view && G.info && !G.info.spectate && !G.replay && !G.over && G.ordersRound !== G.view.round) { G.ordersRound = G.view.round; SFX.turn(); vox("orders", { delay: .25 }); }
  if (G.pend && G.autoQ && !G.over) { if (G.pend.kind === G.autoQ.kind) { setTimeout(autoStep, 60); return render(); } G.autoQ = null; }
  if (G.pend && G.multi && G.multi.kind !== G.pend.kind) G.multi = null;
  if (G.replay && !G.over && !G.queue.length) G.over = G.replay.body.over || null;
  if (G.over && !G.overShown) { G.overShown = true; if (!G.replay) { storeGame(); $("bQuit").textContent = "Exit game"; } var won = G.over.winner === "You", gen = G.pgen; banner(G.info && G.info.spectate || G.replay ? G.over.winner : won ? "Victory" : G.over.winner === "The bot" ? "Defeat" : "Draw", G.over.how); (won ? SFX.win : SFX.lose)(); if (SND) { setMood("debrief", true); if (!(G.info && G.info.spectate)) vox(won ? "win" : "lose", { delay: .5 }); } if (G.info && G.info.tutorial) { if (won) try { localStorage.setItem("ss.trained", "1"); } catch (e) { } } else setTimeout(function () { if (gen === G.pgen && G.over) showDebrief(); }, 1900); }
  else if (G.pend) tone(.1, 880, 880, .06);
  render();
}
function playNext() {
  if (!G.queue.length) { if (G.dir) { G.playing = false; return; } if (G.since < (G.lastN || 0)) { G.playing = false; return poll(); } return finish(); }
  if (G.paused && !G.stepOnce && !G.skip) { G.waiting = true; G.playing = true; return render(); }
  G.stepOnce = false;
  G.playing = true; var f = G.queue.shift(), text = f.text, fx = f.fx || {}, wait = .7 + Math.min(1.3, text.length / 85);
  G.hist.push(text); G.caption = text; G.shownN = f.n; aarNote(f);
  if (f.why) { G.why = f.why; G.whyAt = f.n; G.histWhy[G.hist.length - 1] = whyLine(f.why); rateNote(f.why, f.view.round); }
  if (G.skip) { if (!G.queue.length) { G.view = f.view; sync(f.view, text); feed(text); } return playNext(); }
  try {
    var prev = G.view, pm = null; G.view = f.view; musicState(f.view);
    if (/^--- Round/.test(text) && (f.view.you.track.length || f.view.bot.track.length)) { tone(.05, 1500, 1500, .07, "square", .9); tone(.05, 1500, 1500, .07, "square", 1.1); $("mtrack").classList.remove("tick"); void $("mtrack").offsetWidth; $("mtrack").classList.add("tick"); }
    if (/^--- Round/.test(text)) { banner("Round " + f.view.round, f.view.terrain); SFX.round(); if (f.view.round === 1 && !G.shuffled) { G.shuffled = true; SFX.shuffle(); } else vox("round", { delay: .4 }); wait = 1.5; }
    else if (/^H-Hour/.test(text)) { var hm = text.match(/'s ([A-Z0-9][A-Z0-9 '\-]+?) (resolves|ends|completes)/); SFX.hhour(); vox(/^H-Hour: Your /.test(text) ? "hhour" : "incoming"); flashScreen(.12); wait = 1.7; if (!(hm && showcase(hm[1], "H-Hour: " + (hm[2] === "ends" ? "ends" : "resolves now"), true))) banner("H-Hour", ""); $("mtrack").classList.remove("tick"); void $("mtrack").offsetWidth; $("mtrack").classList.add("tick"); }
    else if (/^Frontline contest/.test(text) && G.stand && G.standRound !== f.view.round) { G.standRound = f.view.round; var home = f.view.you.marker === 1 ? ((G.info && G.info.names) || ["You"])[0] : ((G.info && G.info.names) || ["", "The bot"])[1]; banner("Last stand", home + " " + (home === "You" ? "defend" : "defends") + " the home edge"); SFX.react(); vox(home === "You" ? "stand" : "advance"); shake = .25; wait = 1.9; }
    else if ((pm = text.match(/ (plays|puts) ([A-Z0-9][A-Z0-9 '\-]+?)( on the Mission Track \((\d+) round|[:.])/)) && showcase(pm[2], pm[1] === "puts" ? "On the Mission Track: " + pm[4] + " round" + (pm[4] === "1" ? "" : "s") + " to H-Hour" : "Played", false)) { SFX.ability(); wait = Math.max(wait, 1.5); }
    else if ((pm = text.match(/ fires ([A-Z0-9][A-Z0-9 '\-]+?):/)) && showcase(pm[1], "Reaction", true)) { SFX.react(); wait = Math.max(wait, 2.2); }
    else if (/reveals a Hidden card/.test(text)) { wait += .4; }
    else if (/in Contact/.test(text)) { banner("In Contact", "The Frontlines meet"); SFX.round(); vox("contact", { delay: .3 }); wait = 1.4; }
    else if (/ cancels .+ on the Mission Track/.test(text)) vox(/ cancels Your /.test(text) ? "disrupted" : "cyber");
    else if (/^You air-assault/.test(text)) vox("air");
    var isAtk = fx.kind === "attack" && /attack/.test(text) && f.n !== G.lastFx, held = G.heldAtk; G.heldAtk = null;
    sync(f.view, text); feed(text);
    if (prev && G.info && !G.info.spectate && !G.replay && !/^You /.test(text)) {   // one of your cards was destroyed or damaged by the other side: hold it, and keep it for your next choice
      var mine0 = {}; prev.you.front.concat(prev.you.rear).forEach(function (u) { mine0[u.uid] = u; }); var now0 = {}; f.view.you.front.concat(f.view.you.rear).forEach(function (u) { now0[u.uid] = u; });
      var hurt = Object.keys(mine0).some(function (k) { return !now0[k] || (now0[k].dmg || 0) > (mine0[k].dmg || 0); }) || /Your .+ (is destroyed|takes \d+ damage)/.test(text);
      if (hurt) { var cz = G.cause && G.cause !== text ? G.cause : "", lh = G.hits[G.hits.length - 1]; if (lh && lh.cause === cz) lh.lines.push(text); else G.hits.push({ cause: cz, lines: [text] }); wait = Math.max(wait, 2.4); }
      else if (/^You lose \d+ Homefront \(.+ lost\)/.test(text) && G.hits.length) G.hits[G.hits.length - 1].lines.push(text);
    }
    if (isCause(text, fx)) G.cause = text;
    if (held) wait = Math.max(wait, attackAnim(held, f.view, ICPT.test(text)) + .25);   // the shot waited for your reaction choice
    var rw = reactionMoment(text, f); if (rw) wait = Math.max(wait, rw);
    if (isAtk) { G.lastFx = f.n; G.lastAtk = { src: fx.src, dst: fx.dst };
      if (!G.queue.length && G.latestPend && G.latestPend.kind === "reaction") { G.heldAtk = fx; var tgt = O[fx.dst]; if (tgt) { callout(tgt.grp.position, "INCOMING", "#ff9a7a"); groundFlash(tgt.grp.position.x, tgt.grp.position.z, 3.4, 0xff8a66, .6); } SFX.radio(); wait = .7; }
      else wait = Math.max(wait, attackAnim(fx, f.view, G.queue.slice(0, 3).some(function (q) { return ICPT.test(q.text); })) + .25); }
    else if (fx.kind === "ability" && /uses/.test(text)) { SFX.ability(); var a = O[fx.src]; if (a) { groundFlash(a.grp.position.x, a.grp.position.z, 4.5, 0x7fe0c8, .6); a.lift = 1; } }
    else if (/deploys|upgrades|returns to|^You (deploy|upgrade)/.test(text)) { SFX.deploy(); var dn = text.match(/^You deploy ([A-Z0-9][A-Z0-9 '\-]*[A-Z0-9])/); if (/^You (deploy|upgrade)/.test(text)) { vox("deploy", { delay: .35 }); if (dn && /VEHICLE|TRACKED|ARMOR/.test(String((G.faces[dn[1].trim()] || {}).tags || ""))) SFX.engine(); } }
    else if (/loses \d+ Homefront/.test(text)) { SFX.hf(); wait += .3; }
    else if (/devastated/.test(text)) { SFX.down(); shake = .5; if (/^Your /.test(text)) vox("base", { delay: .6 }); }
    else if (/passes/.test(text)) wait = .7;
    if (prev && f.view.you.hand && prev.you.hand && f.view.you.hand.length > prev.you.hand.length && !G.info.spectate) SFX.draw(f.view.you.hand.length - prev.you.hand.length);
    if (prev) ["you", "bot"].forEach(function (k) { if (f.view[k].hf < prev[k].hf) { var d = document.createElement("div"); d.className = "dmg"; d.style.fontSize = "24px"; d.textContent = "Homefront −" + (prev[k].hf - f.view[k].hf); d.style.left = "50%"; d.style.top = (k === "you" ? H - 60 : 70) + "px"; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 1400); } });
    $("vig").className = G.stand ? "fx stand" : "fx"; render();
  } catch (e) { console.error(e); }
  if (G.dir) { G.playing = false; return; }   // v0.18: the opening plays one frame at a time, on its own schedule
  var gen = G.pgen; after(wait, function () { if (gen === G.pgen) playNext(); });
}

/* ================= menu, log, setup ================= */
$("bMenu").onclick = function () { $("menu").hidden = !$("menu").hidden; };
$("bSettings").onclick = function () { $("menu").hidden = true; showSettings(); };
function toggleWin(on) { var el = $("wint"); on = on == null ? el.style.display !== "block" : on; el.style.display = on ? "block" : "none"; $("bWin").setAttribute("aria-pressed", on); if (on) { SFX.open && SFX.open(); winTrack(); } }
$("bWin").onclick = function (e) { e.stopPropagation(); toggleWin(); }; $("bWinM").onclick = function () { $("menu").hidden = true; toggleWin(true); }; $("wint").onclick = function () { toggleWin(false); };
$("bLib").onclick = function () { $("menu").hidden = true; showLibrary(); };
$("bFM").onclick = function () { $("menu").hidden = true; showManual(); };
$("bSpeed").onclick = function () { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? .5 : 1; PREF.speed = G.speed; savePrefs(); speedLabel(); };
function speedLabel() { var b = $("bSpeed"); if (b) b.textContent = "Speed " + (G.speed === .5 ? "½" : G.speed) + "×"; }
$("bSkip").onclick = function () { $("menu").hidden = true; if (G.playing) G.skip = true; };
/* ---- card library (v0.16): every card in the card file, with filters; tap a card to read it and its keywords ---- */
var LIB = { q: "", type: "all", cls: "all", gen: "all", deck: "all", cv: {} };
function showLibrary() { audioInit(); unlock(); SFX.open && SFX.open(); var el = $("lib"); el.style.display = "block"; libDraw(true); }
function libCards() { var F = G.faces || {}, D = G.decklists || {}, names = Object.keys(F).sort();
  return names.map(function (n) { return F[n]; }).filter(function (f) {
    if (!f || !f.name) return false; if (LIB.type === "cap" && !f.cap) return false; if (LIB.type === "eff" && f.cap) return false;
    if (LIB.cls !== "all" && f.cls !== LIB.cls) return false; if (LIB.gen !== "all" && String(f.gen) !== LIB.gen) return false;
    if (LIB.deck !== "all") { var d = D[LIB.deck] || { ie: [], deck: [] }; if (d.ie.indexOf(f.name) < 0 && d.deck.indexOf(f.name) < 0) return false; }
    if (LIB.q) { var t = (f.name + " " + (f.lines || []).join(" ") + " " + (f.tags || "")).toUpperCase(); if (t.indexOf(LIB.q.toUpperCase()) < 0) return false; }
    return true; }); }
function libSeg(key, opts) { return '<div class="seg2" data-lib="' + key + '">' + opts.map(function (o) { return '<button data-v="' + esc(o[0]) + '" aria-pressed="' + (LIB[key] === o[0]) + '">' + esc(o[1]) + "</button>"; }).join("") + "</div>"; }
function libDraw(full) { var el = $("lib"), F = G.faces || {}, cls = {}, gens = {};
  Object.keys(F).forEach(function (n) { var f = F[n]; if (f.cls) cls[f.cls] = 1; if (f.gen) gens[f.gen] = 1; });
  var list = libCards();
  if (full || !$("libGrid")) el.innerHTML = '<div class="lh"><button class="ghost" id="libX" style="float:right">Close</button><h3 class="t" style="margin:2px 0">Card library</h3>' +
    '<div class="row"><input type="search" id="libQ" placeholder="Search names, text or tags" value="' + esc(LIB.q) + '"><span class="cnt" id="libN"></span></div>' +
    '<div class="row">' + libSeg("type", [["all", "All"], ["cap", "Capabilities"], ["eff", "Effects"]]) + libSeg("gen", [["all", "Any Generation"]].concat(Object.keys(gens).sort().map(function (g) { return [String(g), "Gen " + g]; }))) + "</div>" +
    '<div class="row">' + libSeg("cls", [["all", "Every Class"]].concat(Object.keys(cls).sort().map(function (c) { return [c, c]; }))) + "</div>" +
    '<div class="row">' + libSeg("deck", [["all", "Every card"]].concat(Object.keys(G.decklists || {}).sort().map(function (d) { return [d, "In " + d]; }))) + "</div></div><div class=\"grid\" id=\"libGrid\"></div>";
  $("libN").textContent = list.length + " card" + (list.length === 1 ? "" : "s");
  var gr = $("libGrid"); gr.innerHTML = list.map(function (f) { return '<button data-card="' + esc(f.name) + '"><img alt="' + esc(f.name) + '" data-src="' + esc(f.name) + '">' + esc(f.name) + "</button>"; }).join("");
  var imgs = Array.prototype.slice.call(gr.querySelectorAll("img")), k = 0;
  (function step() { var t0 = Date.now(); while (k < imgs.length && Date.now() - t0 < 30) { var im = imgs[k++], n = im.dataset.src; if (!LIB.cv[n]) try { LIB.cv[n] = drawCard(F[n], .8, {}).toDataURL("image/jpeg", .82); } catch (e) { LIB.cv[n] = ""; } im.src = LIB.cv[n]; } if (k < imgs.length && $("lib").style.display === "block") requestAnimationFrame(step); })();
  var q = $("libQ"); if (q && !q.oninput) q.oninput = function () { LIB.q = this.value; clearTimeout(LIB.t); LIB.t = setTimeout(function () { libDraw(false); }, 180); };
}
$("lib").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; if (b.id === "libX") { $("lib").style.display = "none"; SFX.close && SFX.close(); return; }
  if (b.dataset.card) { var f = (G.faces || {})[b.dataset.card]; if (f) zoom(f, {}); return; }
  var grp = b.closest("[data-lib]"); if (!grp) return; LIB[grp.dataset.lib] = b.dataset.v; Array.prototype.forEach.call(grp.children, function (x) { x.setAttribute("aria-pressed", x === b); }); SFX.select && SFX.select(); libDraw(false); });
/* ---- settings (v0.15): display, sound, gameplay, accessibility, about ---- */
function reducedMotion() { return PREF.motion === "on" || (PREF.motion === "auto" && !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)); }
function applyPrefs(redraw) {
  var de = document.documentElement; de.style.setProperty("--tsz", String(PREF.text)); G.rm = reducedMotion(); de.classList.toggle("rm", G.rm); de.classList.toggle("notips", !PREF.tips);
  G.calm = !PREF.shake || G.rm; G.assist = PREF.badges; if (redraw !== false) { if (G.view) sync(G.view); fit(); handKey = ""; render(); } speedLabel();
}
function segRow(key, label, sub, opts) { return '<div class="row"><span>' + esc(label) + (sub ? "<small>" + esc(sub) + "</small>" : "") + '</span><div class="seg2" data-pref="' + key + '">' + opts.map(function (o) { return '<button data-v="' + esc(JSON.stringify(o[0])) + '" aria-pressed="' + (PREF[key] === o[0]) + '">' + esc(o[1]) + "</button>"; }).join("") + "</div></div>"; }
function showSettings() { audioInit(); unlock(); SFX.open && SFX.open();
  var el = $("settings"), d = G.setupData || {}, L = window.SS_LOGOS || [], CR = window.SS_CREDITS || [], MU = window.SS_MUSIC || [];
  var rng = function (id, label, v) { return '<div class="row"><span>' + label + '</span><input type="range" id="' + id + '" min="0" max="100" value="' + Math.round(v * 100) + '"></div>'; };
  el.innerHTML = '<div class="sb"><button class="ghost" id="setX">Close</button><h3 class="t">Settings</h3><p class="hint">Saved on this device. Changes apply at once.</p>' +
    "<h4>Display</h4>" + segRow("text", "Text size", "", [[1, "100%"], [1.25, "125%"], [1.5, "150%"], [1.75, "175%"]]) +
    segRow("motion", "Reduced motion", "Stills the screen effects. Follows your device setting unless you choose.", [["auto", "Follow device"], ["on", "On"], ["off", "Off"]]) +
    segRow("shake", "Screen shake", "", [[true, "On"], [false, "Off"]]) +
    segRow("opening", "Opening film", "Plays before the Main Menu each time the game opens. Skip or Esc goes straight to the menu; Reduced motion skips it.", [[true, "On"], [false, "Off"]]) +
    segRow("shapes", "Side markers", "Adds a shape to the side colours: your cards a rectangle, the enemy's a diamond, as on a map.", [[false, "Colour only"], [true, "Colour and shape"]]) +
    "<h4>Sound</h4>" + '<div class="row"><span>Mute everything</span><label class="ck"><input type="checkbox" id="sMute"' + (G.muted ? " checked" : "") + "> Mute</label></div>" + rng("sFx", "Effects", G.volFx) + rng("sMus", "Music", G.volMus) + rng("sVox", "Radio voices", G.volVox) +
    "<h4>Gameplay</h4>" + segRow("speed", "Speed", "How fast the bot's moves play out.", [[.5, "½×"], [1, "1×"], [2, "2×"]]) +
    segRow("confirm", "Ask before moves you cannot take back", "Passing, playing a card, using an ability, moving the Force Marker and ending deployment ask you to confirm.", [[false, "Off"], [true, "On"]]) +
    segRow("tips", "Tips", "First-time tips, and the one-line hints in the prompt.", [[true, "On"], [false, "Off"]]) + '<div class="row"><span>First-time tips<small>Show each one again, as in your first game.</small></span><button class="ghost" id="sTipsAgain">Show them again</button></div>' +
    segRow("badges", "Attack badges", "The attack value on cards on the table.", [[true, "On"], [false, "Off"]]) +
    "<h4>Accessibility</h4>" + segRow("captions", "Captions for radio calls", "Shows each radio call as text, also when the voices are off.", [[false, "Off"], [true, "On"]]) +
    '<h4>About</h4><div class="about"><div class="logos">' + L.map(function (x) { return '<img class="' + x.key + '" alt="' + esc(x.alt) + '" src="' + x.src + '">'; }).join("") + "</div>" +
    "<p><b>Shadows &amp; Steel</b>, a force design and concept development card game from the Department of Strategic Wargaming, U.S. Army War College. Battlefield table v0.18" + (d.version ? ", game " + esc(d.version) : "") + ". Cards: " + esc(d.cards || (G.info && G.info.cards) || "") + ".</p>" +
    "<p><b>Sound</b></p><ul>" + CR.map(function (c) { return "<li>" + esc(c.source) + ": " + esc(c.what) + "</li>"; }).join("") + "</ul>" + (MU.length ? "<p>Music: " + esc(MU.join(", ")) + ".</p>" : "") +
    "<p><b>Card art</b>: made for the project (Art Pass v6.0 and earlier passes); some cards show Beta 3 art until the next Art Pass.</p></div></div>";
  el.style.display = "block"; el.scrollTop = 0;
  $("sMute").onchange = function () { G.muted = this.checked; if (master) master.gain.value = G.muted ? 0 : .9; saveSound(); };
  $("sFx").oninput = function () { G.volFx = this.value / 100; if (sfxBus) sfxBus.gain.value = G.volFx; saveSound(); }; $("sFx").onchange = function () { SFX.thud(); };
  $("sMus").oninput = function () { G.volMus = this.value / 100; if (musBus) musBus.gain.value = G.volMus; saveSound(); };
  $("sVox").oninput = function () { G.volVox = this.value / 100; if (voxBus) voxBus.gain.value = G.volVox; saveSound(); }; $("sVox").onchange = function () { if (SND) vox("ack", { vol: 1 }); };
}
$("settings").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; if (b.id === "setX") { $("settings").style.display = "none"; SFX.close && SFX.close(); return; }
  if (b.id === "sTipsAgain") { try { localStorage.removeItem("ss.tipsSeen"); } catch (x) { } G.tipNow = null; b.textContent = "Done: they will show again"; SFX.select && SFX.select(); return; }
  var grp = b.closest("[data-pref]"); if (!grp) return; var k = grp.dataset.pref; PREF[k] = JSON.parse(b.dataset.v); savePrefs();
  Array.prototype.forEach.call(grp.children, function (x) { x.setAttribute("aria-pressed", x === b); }); if (k === "speed") G.speed = PREF.speed; SFX.select && SFX.select(); applyPrefs(); });
/* ---- after-action review: built from the same frames the table plays back ---- */
function aarSnap(v, label) { var s = function (p) { var dur = 0; p.bases.forEach(function (b) { dur += Math.max(0, b.dur - b.dmg); }); return { hf: p.hf, str: p.strength, base: dur, units: p.front.length + p.rear.length, marker: p.marker }; }; return { label: label, round: v.round, you: s(v.you), bot: s(v.bot), contact: !!v.contact }; }
function aarNote(f) {
  var t = f.text, v = f.view; if (!G.aar) { G.aar = []; G.aarEv = []; }
  if (/^--- Round/.test(t)) G.aar.push(aarSnap(v, "Start of round " + v.round));
  if (/is destroyed|devastated|loses \d+ Homefront|in Contact|^H-Hour|falls back|is pushed back|wins/.test(t)) G.aarEv.push({ round: v.round, text: t.replace(/^--- | ---$/g, "") });
  G.aarLast = aarSnap(v, "End");
}
function showAAR() {
  var el = $("log"), nm = (G.info && G.info.names) || ["You", "The bot"], rows = (G.aar || []).slice(); if (G.aarLast) rows.push(G.aarLast);
  if (rows.length < 2) { el.innerHTML = '<button class="ghost" id="logX">Close</button><h3 class="t">After-action review</h3><p>Not enough of the game has been played yet.</p>'; el.style.display = "block"; $("logX").onclick = function () { el.style.display = "none"; }; return; }
  var C = ["#3f93d2", "#d8674e"], tbl = '<table style="border-collapse:collapse;font-size:calc(12.5px * var(--ts));margin-top:6px"><tr style="color:var(--dim)"><td style="padding:2px 10px 2px 0">Point in the game</td><td style="padding:2px 8px">Homefront</td><td style="padding:2px 8px">Frontline Strength</td><td style="padding:2px 8px">Cards in play</td><td style="padding:2px 8px">Base Durability left</td><td style="padding:2px 8px">Markers (Zone)</td></tr>' +
    rows.map(function (r) { return '<tr style="border-top:1px solid rgba(255,255,255,.08)"><td style="padding:2px 10px 2px 0">' + esc(r.label) + '</td>' + ["hf", "str", "units", "base", "marker"].map(function (k) { return '<td style="padding:2px 8px">' + r.you[k] + " / " + r.bot[k] + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>";
  var byRound = {}; (G.aarEv || []).forEach(function (e) { (byRound[e.round] = byRound[e.round] || []).push(e.text); });
  el.innerHTML = '<button class="ghost" id="logX">Close</button><h3 class="t">After-action review</h3>' + (G.over ? '<p style="color:var(--amber)">' + esc(G.over.winner) + (G.over.winner === "You" ? " win" : " wins") + " in round " + G.over.round + ": " + esc(G.over.how) + ".</p>" : "") +
    '<p style="margin:10px 0 2px"><b>Homefront by round</b> <span style="color:var(--dim)">(the game ends when one reaches 0)</span></p><p style="margin:0 0 4px;font-size:calc(12.5px * var(--ts))"><span style="display:inline-block;width:14px;height:3px;background:' + C[0] + ';vertical-align:middle"></span> ' + esc(nm[0]) + ' &nbsp; <span style="display:inline-block;width:14px;height:3px;background:' + C[1] + ';vertical-align:middle"></span> ' + esc(nm[1]) + '</p>' +
    '<div style="position:relative;max-width:720px"><canvas id="aarC" style="width:100%;height:230px;display:block"></canvas><div id="aarTip" style="position:absolute;display:none;pointer-events:none;background:rgba(14,18,16,.96);border:1px solid var(--line);padding:5px 8px;font-size:calc(12px * var(--ts));white-space:nowrap"></div></div>' +
    '<p style="margin:14px 0 2px"><b>Turning points</b></p>' + (Object.keys(byRound).length ? Object.keys(byRound).map(function (r) { return '<div class="r">Round ' + r + "</div>" + byRound[r].map(function (t) { return "<div>" + esc(t) + "</div>"; }).join(""); }).join("") : "<div>None recorded.</div>") +
    '<p style="margin:14px 0 2px"><b>How the bot rated the cards it could deploy</b> <span style="color:var(--dim)">(a low rating or "passed over" may mean the bot undervalues the card, or that the card is weak)</span></p>' + rateTable() +
    '<p style="margin:14px 0 2px"><b>The numbers</b> <span style="color:var(--dim)">(' + esc(nm[0]) + " / " + esc(nm[1]) + ")</span></p>" + tbl;
  el.style.display = "block"; el.scrollTop = 0; $("logX").onclick = function () { el.style.display = "none"; };
  var c = $("aarC"), dpr = Math.min(2, devicePixelRatio || 1), cw = c.clientWidth, ch = c.clientHeight; c.width = cw * dpr; c.height = ch * dpr; var g = c.getContext("2d"); g.scale(dpr, dpr);
  var L = 34, R = 104, Tp = 10, B = 26, n = rows.length, mx = 0; rows.forEach(function (r) { mx = Math.max(mx, r.you.hf, r.bot.hf); }); mx = Math.ceil(mx / 5) * 5 || 5;
  var X = function (i) { return L + (cw - L - R) * i / (n - 1); }, Y = function (v) { return Tp + (ch - Tp - B) * (1 - v / mx); };
  var draw = function (hi) { g.clearRect(0, 0, cw, ch); g.font = "11px Barlow,system-ui,sans-serif"; g.textBaseline = "middle";
    for (var v = 0; v <= mx; v += 5) { g.strokeStyle = "rgba(232,226,207," + (v ? .1 : .3) + ")"; g.lineWidth = 1; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(cw - R, Y(v)); g.stroke(); g.fillStyle = "#a9a48f"; g.textAlign = "right"; g.fillText(v, L - 6, Y(v)); }
    g.textAlign = "center"; rows.forEach(function (r, i) { if (i < n - 1 || n < 3) g.fillText(i === n - 1 ? "End" : "R" + r.round, X(i), ch - 10); else g.fillText("End", X(i), ch - 10); });
    if (hi != null) { g.strokeStyle = "rgba(232,226,207,.35)"; g.beginPath(); g.moveTo(X(hi), Tp); g.lineTo(X(hi), ch - B); g.stroke(); }
    ["you", "bot"].forEach(function (k, si) { g.strokeStyle = C[si]; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath(); rows.forEach(function (r, i) { g[i ? "lineTo" : "moveTo"](X(i), Y(r[k].hf)); }); g.stroke();
      rows.forEach(function (r, i) { if (i === n - 1 || i === hi) { g.fillStyle = "#0c0f0e"; g.beginPath(); g.arc(X(i), Y(r[k].hf), 6, 0, 7); g.fill(); g.fillStyle = C[si]; g.beginPath(); g.arc(X(i), Y(r[k].hf), 4, 0, 7); g.fill(); } }); });
    var e = rows[n - 1], ya = Y(e.you.hf), yb = Y(e.bot.hf); if (Math.abs(ya - yb) < 14) { var mid = (ya + yb) / 2, up = e.you.hf >= e.bot.hf; ya = mid + (up ? -8 : 8); yb = mid + (up ? 8 : -8); }
    g.textAlign = "left"; g.fillStyle = "#e8e2cf"; g.fillText(nm[0].slice(0, 12) + " " + e.you.hf, cw - R + 10, ya); g.fillText(nm[1].slice(0, 12) + " " + e.bot.hf, cw - R + 10, yb); };
  draw(null); var tip = $("aarTip");
  c.onpointermove = c.onpointerdown = function (ev) { var r = c.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.round((ev.clientX - r.left - L) / ((cw - L - R) / (n - 1))))); draw(i); var w = rows[i]; tip.innerHTML = "<b>" + esc(w.label) + "</b><br>" + esc(nm[0]) + ": Homefront " + w.you.hf + "<br>" + esc(nm[1]) + ": Homefront " + w.bot.hf; tip.style.display = "block"; tip.style.left = Math.min(cw - 170, X(i) + 10) + "px"; tip.style.top = "8px"; };
  c.onpointerleave = function () { draw(null); tip.style.display = "none"; };
}
function showLog() { var el = $("log"); el.innerHTML = '<button class="ghost" id="logX">Close</button><h3 class="t">Battle log</h3>' + G.hist.map(function (t, i) { return '<div class="' + (/^---/.test(t) ? "r" : "") + '">' + esc(t) + "</div>" + (G.histWhy[i] && (G.over || (G.info && G.info.spectate)) ? '<div style="color:var(--dim);font-size:calc(12px * var(--ts));margin:0 0 4px 14px">' + esc(G.histWhy[i]) + "</div>" : ""); }).join(""); el.style.display = "block"; el.scrollTop = el.scrollHeight; $("logX").onclick = function () { el.style.display = "none"; }; }
$("bLog").onclick = function () { $("menu").hidden = true; showLog(); };
$("bAAR").onclick = function () { $("menu").hidden = true; showAAR(); };
$("bRec").onclick = function () { $("menu").hidden = true; api("/play/record", {}).then(function (r) { r.notes = G.notes; r = (G.notes.length ? "NOTES\n" + notesText() + "\n\nGAME RECORD\n" : "") + JSON.stringify(r); var el = $("log"), show = function (ok) {
    el.innerHTML = '<button class="ghost" id="logX">Close</button><h3 class="t">Game record</h3><p style="color:' + (ok ? "var(--teal)" : "var(--amber)") + '"><b>' + (ok ? (SITE ? "Copied. Send notes sends this with your notes." : "Copied. Paste it into your chat with Claude.") : (SITE ? "Could not copy automatically. Send notes sends this with your notes." : "Could not copy automatically. Select all of the text below, copy it, and paste it to Claude.")) + '</b></p><p style="color:var(--dim)">' + (SITE ? "This game and its notes are kept in this browser until you send them." : G.stored ? "This game and its notes are also saved in the game store, where Claude can read them." : "Not in the game store yet: games are stored when you save a note or the game ends.") + '</p><textarea readonly style="width:100%;height:40vh;font:12px monospace;user-select:text;-webkit-user-select:text"></textarea>';
    el.querySelector("textarea").value = r; el.style.display = "block"; $("logX").onclick = function () { el.style.display = "none"; }; if (!ok) el.querySelector("textarea").select(); };
  try { navigator.clipboard.writeText(r).then(function () { show(true); }, function () { show(false); }); } catch (e) { show(false); } }, fail); };
/* ---- the game store: every game with its notes is saved where Claude can read it back (the artifact's database) ---- */
var DB = null, gameId = "";
var dbP = null;
function dbReady() { if (DB) return Promise.resolve(DB); if (SITE && window.SS_LOCALDB) { DB = window.SS_LOCALDB; return Promise.resolve(DB); } if (!window.claude || !window.claude.use) return Promise.resolve(null);
  if (!dbP) dbP = Promise.race([window.claude.use("db"), new Promise(function (r) { setTimeout(function () { r(null); }, 11000); })]).then(function (d) { DB = d || null; if (!DB) dbP = null; return DB; }, function () { dbP = null; return null; });
  return dbP; }
var LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) && !(window.claude && window.claude.use) && !window.SS_SITE;   // served by the Workbench on the project lead's computer
var SITE = (!(window.claude && window.claude.use) && window.SS_SITE) || null;   // v0.17.2: the playtest website (site.js): games, notes and replays stay in this browser; Send notes posts to the Google Form
function dbSet(id, data) { if (LOCAL) return fetch("/api/battlefield/store", { method: "POST", headers: { "Content-Type": "application/json", "X-Workbench": "1" }, body: JSON.stringify({ id: id, data: data }) }).then(function (r) { return r.ok; }, function () { return false; });
  return dbReady().then(function (d) { if (!d) return false; return d.doc("games/" + id).set(data).then(function () { return true; }, function (e) { console.warn("store", e); return false; }); }); }
var storeBusy = false, storeAgain = false;
function storeGame() {   // one write at a time; called when a note is saved and when a game ends
  if (!G.info) return Promise.resolve(false); if (storeBusy) { storeAgain = true; return Promise.resolve(false); } storeBusy = true;
  if (!gameId) gameId = "g" + new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) + "_" + G.info.seed;
  return api("/play/record", {}).then(function (r) {
    return dbSet(gameId, { startedAt: G.startedAt || "", savedAt: new Date().toISOString(), you: G.info.you, bot: G.info.bot, spectate: !!G.info.spectate, terrain: G.info.terrain, seed: G.info.seed, cards: G.info.cards, decks: G.info.decks || "", build: G.info.build || "merged", buildLabel: G.info.build_label || "", screen: W + "x" + H,
      finished: !!G.over, winner: G.over ? G.over.winner : "", how: G.over ? G.over.how : "", round: (G.view && G.view.round) || 0, noteCount: G.notes.length, notes: G.notes, hintsUsed: G.hints || 0, botRatings: JSON.stringify(G.rate), record: JSON.stringify(r) });
  }).then(function (ok) { storeBusy = false; G.stored = ok; if (ok) { try { var sv = JSON.parse(localStorage.getItem("ss_notes") || "null"); if (sv) { sv.stored = true; localStorage.setItem("ss_notes", JSON.stringify(sv)); } } catch (e) { } } if (storeAgain) { storeAgain = false; return storeGame(); } return ok; }, function () { storeBusy = false; return false; });
}
function recoverNotes() {   // notes written before the store existed, or while it could not be reached, are still in this browser: send them up once
  try { var sv = JSON.parse(localStorage.getItem("ss_notes") || "null"); if (!sv || !sv.notes || !sv.notes.length || sv.stored) return;
    dbSet("recovered_" + (sv.seed || 0) + "_" + sv.notes.length, { recovered: true, savedAt: new Date().toISOString(), seed: sv.seed || 0, noteCount: sv.notes.length, notes: sv.notes, screen: W + "x" + H }).then(function (ok) { if (ok) { sv.stored = true; try { localStorage.setItem("ss_notes", JSON.stringify(sv)); } catch (e) { } } }); } catch (e) { }
}
function saveNotes() { try { localStorage.setItem("ss_notes", JSON.stringify({ seed: G.info && G.info.seed, notes: G.notes, stored: false })); } catch (e) { } storeGame().then(function (ok) { feed(ok ? (LOCAL ? "Note saved on this computer, in 04. Workbench/data/games (" : SITE ? "Note saved in this browser. Send notes at the end sends it to the team (" : "Note saved to the game store (") + G.notes.length + ")." : "Note kept on this device only: the game store could not be reached. Use Game record and notes to copy it."); }); }
function notesText() { return G.notes.map(function (n, i) { return (i + 1) + ". Round " + n.round + ", " + n.phase + (n.card ? " · " + n.card : "") + " [" + n.kind + "]: " + n.text; }).join("\n"); }
function noteForm(card) {
  var was = G.paused; if (G.playing) pause(true); var v = G.view || {}, el = $("log"), cards = {};
  if (v.you) [v.you, v.bot].forEach(function (p) { p.front.concat(p.rear).forEach(function (u) { if (u.cls) cards[u.name] = 1; }); (p.hand || []).forEach(function (c) { cards[c.name] = 1; }); p.track.forEach(function (t) { cards[t.name] = 1; }); });
  if (card) cards[card] = 1;   /* a card picked in the card library need not be on the table (v0.16.1) */
  el.classList.toggle("over", $("lib").style.display === "block");   /* in front of the card library when opened from it */
  el.innerHTML = '<button class="ghost" id="logX">Close</button><h3 class="t">Add a note</h3><p style="color:var(--dim)">Saved with this game\'s record: Round ' + (v.round || "–") + ", " + esc(v.phase || "") + ". The game is paused while this is open.</p>" +
    '<div class="form" style="max-width:640px"><div><label>About (optional)</label><select id="nCard"><option value="">The game in general</option>' + Object.keys(cards).sort().map(function (n) { return '<option' + (n === card ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select></div>" +
    '<div><label>Kind of note</label><select id="nKind"><option>Observation</option><option>Feels too strong</option><option>Feels too weak</option><option>Cost or value</option><option>Unclear or confusing</option><option>Bug or wrong result</option><option>Idea</option></select></div></div>' +
    '<textarea id="nText" placeholder="What did you notice, and why does it matter right now?" style="width:100%;max-width:640px;height:22vh;margin-top:10px;font:15px Barlow,system-ui,sans-serif;background:#18201b;color:var(--ink);border:1px solid var(--line);padding:8px;user-select:text;-webkit-user-select:text"></textarea>' +
    '<div class="btns" style="display:flex;gap:8px;margin:10px 0"><button id="nSave">Save note</button></div><h3 class="t" style="font-size:calc(14px * var(--ts))">Notes this game (' + G.notes.length + ')</h3><pre style="white-space:pre-wrap;font:13px Barlow,system-ui,sans-serif;color:var(--dim)">' + esc(notesText() || "None yet.") + "</pre>";
  el.style.display = "block"; el.scrollTop = 0; var done = function () { el.style.display = "none"; el.classList.remove("over"); if (!was) pause(false); };
  $("logX").onclick = done; $("nSave").onclick = function () { var t = $("nText").value.trim(); if (t) { G.notes.push({ round: v.round || 0, phase: v.phase || "", event: G.shownN || 0, card: $("nCard").value, kind: $("nKind").value, text: t }); saveNotes(); } done(); };
  setTimeout(function () { try { $("nText").focus(); } catch (e) { } }, 50);
}
$("bNote").onclick = function () { $("menu").hidden = true; noteForm(); };
$("zNote").onclick = function (e) { e.stopPropagation(); $("zoom").style.display = "none"; noteForm(G.zoomName); };
function quit(sure) { if (G.replay) return exitReplay(); if (!sure && !G.over && $("bQuit").dataset.sure !== "1") { $("bQuit").dataset.sure = "1"; $("bQuit").textContent = "Tap again to abandon"; setTimeout(function () { $("bQuit").dataset.sure = ""; $("bQuit").textContent = "Abandon game"; }, 2500); return; }
  $("menu").hidden = true; api("/play/quit", {}).then(showSetup, fail); }
$("bQuit").onclick = function () { quit(false); };
/* v0.17.1: Quit closes the Battlefield window and stops the Workbench on this computer (one click; asks once). Only where the Workbench serves the page. */
function quitApp(b) {
  if (b && b.dataset.sure !== "1") { b.dataset.sure = "1"; var t = b.textContent; b.textContent = "Tap again to quit"; setTimeout(function () { b.dataset.sure = ""; b.textContent = t; }, 3000); return; }
  try { if (G.info && !G.over && !G.replay) storeGame(); } catch (e) { }
  MUS.on = false; try { SND && SND.silence && SND.silence(); } catch (e) { }
  var done = function () { document.body.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#141915;color:#e8e2cf;font:calc(18px * var(--ts,1)) Barlow,system-ui,sans-serif;text-align:center;padding:24px"><div><h1 style="font-family:\'Black Ops One\',sans-serif;font-weight:400;color:#d6caa8">Shadows &amp; Steel</h1><p>The Battlefield has stopped. Your games and notes are saved.</p><p style="color:#a9a48f">If this window is still open, you can close it.</p></div></div>'; try { window.close(); } catch (e) { } };
  fetch("/api/quit", { method: "POST", headers: { "Content-Type": "application/json", "X-Workbench": "1" }, body: "{}" }).then(done, done);
}
if (LOCAL) { var qb = document.createElement("button"); qb.className = "ghost"; qb.id = "bQuitApp"; qb.textContent = "Quit Shadows & Steel"; $("bQuit").parentNode.insertBefore(qb, $("bQuit").nextSibling); qb.onclick = function () { quitApp(qb); }; }
/* ================= v0.17.2: the playtest website. Send notes posts the tester's answers, notes and game record to the project lead's Google Form ================= */
function siteWelcome() {
  var seen = false; try { seen = !!localStorage.getItem("ss.welcomed"); } catch (e) { }
  return '<div class="welcome" id="welcome"' + (seen ? ' data-seen="1"' : "") + '><p class="wk">Playtest · please do not share this address</p>' +
    "<p><b>Welcome, and thank you for testing.</b> Start with <b>Basic Training</b>, selected for you below: a guided battle of about 15 minutes that teaches the game one step at a time.</p>" +
    "<p>When you finish, press <b>✉ Send notes</b>: a few quick questions, then your answers and notes go to the team. No sign-in is needed. During a game, <b>✎ Add note</b> in the ☰ menu keeps a note for later.</p>" +
    (seen ? '<p><button class="ghost" id="wHide">Hide this</button></p>' : "") + "</div>";
}
function sendCss() { if ($("sendCss")) return; var st = document.createElement("style"); st.id = "sendCss"; st.textContent =
  "#send button,.sf button{font-family:Barlow,system-ui,sans-serif;font-weight:600;text-transform:none;letter-spacing:0;font-size:calc(14px * var(--ts))}#send{position:fixed;inset:0;z-index:14;background:#111612;overflow-y:auto;touch-action:pan-y;display:none;padding:14px}#send .sb{max-width:720px;margin:0 auto}#send #sendX{position:sticky;top:0;float:right;z-index:1}" +
  ".sf{font-size:calc(14px * var(--ts));line-height:1.4}.sf .q{margin:14px 0 6px;font-weight:600;color:var(--ink)}.sf .q i{font-style:normal;color:var(--amber)}.sf .qh{color:var(--dim);font-size:calc(12.5px * var(--ts));margin:-2px 0 6px}" +
  ".sf input[type=text],.sf textarea{width:100%;font:calc(15px * var(--ts)) Barlow,system-ui,sans-serif;background:#18201b;color:var(--ink);border:1px solid var(--line);padding:8px;user-select:text;-webkit-user-select:text}.sf textarea{height:18vh;min-height:90px}" +
  ".sf .scale{display:flex;gap:6px;flex-wrap:wrap}.sf .scale button{min-width:44px;min-height:44px}.sf .scale button[aria-pressed=true],.sf .opt button[aria-pressed=true]{background:var(--amber);color:#141915;border-color:var(--amber)}" +
  ".sf .opt{display:flex;flex-direction:column;gap:6px}.sf .opt button{text-align:left;min-height:44px;white-space:normal}.sf .ends{display:flex;justify-content:space-between;max-width:290px;color:var(--dim);font-size:calc(12px * var(--ts))}" +
  ".sf .gn{color:var(--dim);font-size:calc(13px * var(--ts));white-space:pre-wrap;background:#161c18;border-left:3px solid var(--line);padding:6px 9px;margin:4px 0}.sf .go2{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0 6px}" +
  ".sf .st{margin:6px 0;font-weight:600}.sf .st.ok{color:var(--teal)}.sf .st.bad{color:var(--amber)}.sf details{margin-top:10px;color:var(--dim)}.sf details textarea{height:22vh;font:12px monospace}" +
  ".welcome{max-width:760px;margin:6px 0 10px;background:rgba(17,22,18,.92);border:1px solid var(--line);border-left:3px solid var(--amber);padding:8px 12px;font-size:calc(14px * var(--ts));line-height:1.45}.welcome p{margin:5px 0}.welcome .wk{color:var(--amber);font-size:calc(12px * var(--ts));letter-spacing:.06em;text-transform:uppercase;margin:0 0 2px}" +
  ".dbn{margin-top:14px;border-top:1px solid var(--line);padding-top:8px}";
  document.head.appendChild(st); }
if (SITE) { sendCss(); (function () { var sb = document.createElement("button"); sb.className = "ghost"; sb.id = "bSend"; sb.textContent = "✉ Send notes"; $("bNote").parentNode.insertBefore(sb, $("bNote").nextSibling); sb.onclick = function () { $("menu").hidden = true; showSend(); }; var d = document.createElement("div"); d.id = "send"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Send notes"); document.body.appendChild(d); })(); }
function showSend() { var el = $("send"); if (!el) return; var was = G.paused; if (G.playing && !G.paused) pause(true);
  el.innerHTML = '<div class="sb"><button class="ghost" id="sendX">Close</button><h3 class="t" style="margin:2px 0">Send notes</h3><div id="sendBox"></div></div>'; el.style.display = "block"; el.scrollTop = 0;
  $("sendX").onclick = function () { el.style.display = "none"; if (!was && G.playing) pause(false); }; sendForm($("sendBox")); }
function lastStoredGame() {   // the newest game kept in this browser, for Send notes from the Main Menu
  return dbReady().then(function (d) { if (!d) return null; return d.collection("games").orderBy("savedAt", "desc").limit(1).get().then(function (s) { return s.docs.length ? s.docs[0].data() : null; }); }).catch(function () { return null; }); }
function gameNow() {   // what Send notes carries about the game: the one on the table, or the newest one kept in this browser
  if (G.info && !G.replay) return api("/play/record", {}).then(function (r) { var o = G.over;
    return { record: r, notes: G.notes.slice(), tutorial: !!(G.info.tutorial), spectate: !!G.info.spectate, you: G.info.you, bot: G.info.bot, terrain: G.info.terrain, finished: !!o, winner: o ? o.winner : "", how: o ? o.how : "", round: (G.view && G.view.round) || 0, id: gameId || "" }; }, function () { return null; });
  return lastStoredGame().then(function (g) { if (!g) return null; var r = null; try { r = JSON.parse(g.record || "null"); } catch (e) { }
    return { record: r, notes: g.notes || [], tutorial: !!(r && r.tutorial), spectate: !!g.spectate, you: g.you, bot: g.bot, terrain: g.terrain, finished: g.finished, winner: g.winner, how: g.how, round: g.round, id: "", saved: g.savedAt }; }); }
function gameLine(g) { if (!g) return "No game played on this device yet.";
  var what = g.tutorial ? "Basic Training" : g.spectate ? "Watched the bot play itself" : "Play the bot"; var res = g.finished ? (/^Nobody/.test(g.winner) ? "a draw" : (g.winner === "You" ? "you won" : g.winner + " won")) + (g.how ? " (" + g.how + ")" : "") + " in round " + g.round : "not finished, round " + (g.round || 1);
  return what + ": " + (g.you || "") + " against " + (g.bot || "") + " on " + (g.terrain || "") + ", " + res + "."; }
function notesOf(list) { return (list || []).map(function (n, i) { return (i + 1) + ". Round " + n.round + ", " + n.phase + (n.card ? " · " + n.card : "") + " [" + n.kind + "]: " + n.text; }).join("\n"); }
function sendForm(root) {
  if (!root || !SITE) return; var S = SITE, A = { overall: "", fair: "", pacing: "", unb: [] }, who = ""; try { who = localStorage.getItem("ss.tester") || ""; A = Object.assign(A, JSON.parse(localStorage.getItem("ss.answers") || "{}")); } catch (e) { }
  var req = S.required || [], star = function (k) { return req.indexOf(k) >= 0 ? " <i>*</i>" : ""; };
  var scale = function (k) { return '<div class="scale" data-k="' + k + '">' + [1, 2, 3, 4, 5].map(function (v) { return '<button class="ghost" data-v="' + v + '" aria-pressed="' + (String(A[k]) === String(v)) + '">' + v + "</button>"; }).join("") + "</div>" + ((S.ends || {})[k] ? '<p class="qh">1 = ' + esc(S.ends[k][0]) + ", 5 = " + esc(S.ends[k][1]) + "</p>" : ""); };
  root.innerHTML = '<div class="sf"><p class="qh">Your answers, your notes and this game\'s record go to the project team\'s form. No sign-in, and no email address is collected.</p><p class="gn" data-g="1">Looking for your game…</p>' +
    '<p class="q">What is your playtester handle or name?' + star("name") + '</p><input type="text" data-f="name" maxlength="80" autocomplete="nickname" value="' + esc(who) + '">' +
    '<p class="q">How would you rate your overall experience with the playtest build?' + star("overall") + "</p>" + scale("overall") +
    '<p class="q">Balance: Did the game feel fair?' + star("fair") + '</p><div class="opt" data-k="fair">' + (S.fairChoices || []).map(function (c) { return '<button class="ghost" data-v="' + esc(c) + '" aria-pressed="' + (A.fair === c) + '">' + esc(c) + "</button>"; }).join("") + "</div>" +
    '<p class="q">How would you rate the pacing of the game during matches?' + star("pacing") + "</p>" + scale("pacing") +
    '<p class="q">Which specific elements or mechanics contributed most to the game feeling unbalanced?' + star("unbalanced") + '</p><p class="qh">Pick any that apply, or none.</p><div class="opt" data-k="unb" data-multi="1">' + (S.unbalancedChoices || []).map(function (c) { return '<button class="ghost" data-v="' + esc(c) + '" aria-pressed="' + (A.unb.indexOf(c) >= 0) + '">' + esc(c) + "</button>"; }).join("") + "</div>" +
    '<p class="q">Your notes' + star("notes") + '</p><p class="qh">Notes you added during the game are sent too, each with its round, phase and card:</p><p class="gn" data-n="1">None yet.</p><textarea data-f="more" placeholder="Anything else? What was clear, what was confusing, what you enjoyed, what you would change."></textarea>' +
    '<div class="go2"><button class="big" data-send="1">Send notes</button></div><p class="st" aria-live="polite"></p>' +
    '<details><summary>A copy of what is sent</summary><p class="qh">If sending fails, copy this text and send it to the person who gave you this link.</p><textarea readonly data-copy="1"></textarea></details></div>';
  var q = function (sel) { return root.querySelector(sel); }, G2 = null;
  var keep = function () { try { localStorage.setItem("ss.answers", JSON.stringify(A)); localStorage.setItem("ss.tester", q('[data-f="name"]').value.trim()); } catch (e) { } };
  var payload = function () {
    var g = G2, nm = q('[data-f="name"]').value.trim(), more = q('[data-f="more"]').value.trim(), notes = notesOf(g && g.notes);
    var body = "Game: " + (g ? gameLine(g) : "none") + "\nScreen: " + innerWidth + " x " + innerHeight + (matchMedia("(pointer: coarse)").matches ? " (touch)" : "") + "\n\nNotes during the game:\n" + (notes || "None.") + "\n\nOther notes:\n" + (more || "None.");
    var code = g && g.record ? JSON.stringify(Object.assign({}, g.record, { notes: g.notes || [] })) : "";
    var F = S.form, pairs = [[F.name, nm], [F.build, S.build], [F.overall, A.overall], [F.fair, A.fair], [F.pacing, A.pacing]];
    A.unb.forEach(function (c) { pairs.push([F.unbalanced, c]); }); pairs.push([F.notes, body]); pairs.push([F.code, code]);
    return { pairs: pairs.filter(function (x) { return x[1] !== "" && x[1] != null; }), text: "Name: " + nm + "\nBuild: " + S.build + "\nOverall: " + (A.overall || "-") + "\nFair: " + (A.fair || "-") + "\nPacing: " + (A.pacing || "-") + "\nUnbalanced: " + (A.unb.join("; ") || "-") + "\n\n" + body + "\n\nGame code:\n" + code };
  };
  var refresh = function () { var c = q('[data-copy="1"]'); if (c) c.value = payload().text; };
  gameNow().then(function (g) { G2 = g; q('[data-g="1"]').innerHTML = esc("This game: ") + esc(gameLine(g)); q('[data-n="1"]').textContent = notesOf(g && g.notes) || "None yet."; refresh(); });
  root.addEventListener("input", function () { keep(); refresh(); });
  root.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b || !root.contains(b)) return;
    var grp = b.parentNode && b.parentNode.dataset && b.parentNode.dataset.k;
    if (grp && b.dataset.v != null) { var k = grp, v = b.dataset.v;
      if (b.parentNode.dataset.multi) { var i = A.unb.indexOf(v); if (i >= 0) A.unb.splice(i, 1); else A.unb.push(v); b.setAttribute("aria-pressed", i < 0); }
      else { A[k] = A[k] === v ? "" : v; Array.prototype.forEach.call(b.parentNode.children, function (x) { x.setAttribute("aria-pressed", x.dataset.v === A[k]); }); }
      SFX.select && SFX.select(); keep(); refresh(); return; }
    if (b.dataset.send) { var st = q(".st"), P = payload(), nm = q('[data-f="name"]').value.trim(), miss = [];
      var has = { name: nm, overall: A.overall, fair: A.fair, pacing: A.pacing, unbalanced: A.unb.length ? 1 : "", notes: 1 };
      req.forEach(function (k) { if (!has[k]) miss.push({ name: "your name or handle", overall: "the overall rating", fair: "the fairness question", pacing: "the pacing rating", unbalanced: "at least one unbalanced element" }[k] || k); });
      if (miss.length) { st.className = "st bad"; st.textContent = "Please answer " + miss.join(", ") + " first."; return; }
      keep(); b.disabled = true; b.textContent = "Sending…"; st.className = "st"; st.textContent = "";
      var form = new URLSearchParams(); P.pairs.forEach(function (x) { form.append(x[0], x[1]); });
      fetch(S.form.action, { method: "POST", mode: "no-cors", body: form }).then(function () {
        b.textContent = "Send again"; b.disabled = false; st.className = "st ok"; st.textContent = "Sent. Thank you! Your notes are on their way to the team.";
        try { localStorage.setItem("ss.lastSent", new Date().toISOString()); localStorage.removeItem("ss.answers"); } catch (e) { }   /* the name is remembered; the answers start fresh for the next game */ feed("Notes sent to the team.");
      }, function () { b.textContent = "Try again"; b.disabled = false; st.className = "st bad"; st.textContent = "Could not send: check the internet connection, then try again. Or open “A copy of what is sent” below, copy it and send it to the person who gave you this link."; root.querySelector("details").open = true; });
    } });
}
$("bSaveRep").onclick = function () { $("menu").hidden = true; if (!G.info || G.replay) return; saveReplay(null, null); };
function reset() { G.cpage = {}; G.nudge = null; G.tipNow = null; tweens = []; clearBoard(); G.hint = null; G.hints = 0; G.view = null; G.latest = null; G.pend = null; G.latestPend = null; G.queue = []; G.playing = false; G.since = 0; G.sel = null; G.over = null; G.overShown = false; G.err = null; G.stand = false; G.standRound = 0; G.hoverDst = null; G.heldAtk = null; G.lastAtk = null; G.explain = ""; G.aar = []; G.aarEv = []; G.aarLast = null; G.why = null; G.histWhy = {}; G.rate = {}; gameId = ""; G.startedAt = new Date().toISOString(); G.stored = false; G.hist = []; G.hits = []; G.cause = ""; $("bQuit").textContent = "Abandon game"; G.multi = null; G.autoQ = null; G.notes = []; G.paused = false; G.replay = null; G.savedReplay = null; G.lastRec = null; G.pgen = (G.pgen || 0) + 1; G.ordersRound = 0; G.shuffled = false; document.body.classList.remove("replaying"); $("debrief").style.display = "none"; $("bQuit").textContent = "Abandon game"; G.waiting = false; G.lastN = 0; G.skip = false; G.started = false; G.busy = false; G.caption = ""; lastHf = {}; handKey = ""; $("feed").innerHTML = ""; closePreview(); }
function useBuild(k) {   // card faces and printed values of the build in play (the test build has cards the baseline does not)
  var b = (G.builds || []).filter(function (x) { return x.key === k; })[0]; if (!b || G.buildOn === k) return; G.buildOn = k; G.faces = b.faces || G.faces; G.meta = b.meta || G.meta; G.gloss = b.glossary || G.gloss; G.decklists = b.decklists || G.decklists; handCv = {}; handKey = ""; }
/* ================= the map: contour lines of the chosen battlefield (setup backdrop and saved-game cover) ================= */
function contourMap(cnv, terrain) {
  if (!cnv) return; if (terrain !== undefined) cnv.dataset.terrain = terrain || ""; var tk = TER.keyOf(cnv.dataset.terrain), M = TER.heights(cnv.dataset.terrain || "OPEN PLAIN"); var w = M.w, h = M.h, a = new Float32Array(w * h);
  for (var i = 0; i < w * h; i++) a[i] = parseInt(M.d.substr(i * 2, 2), 16) || 0;
  var dpr = Math.min(2, window.devicePixelRatio || 1), CW = Math.max(2, Math.round(cnv.clientWidth * dpr)), CH = Math.max(2, Math.round(cnv.clientHeight * dpr));
  if (cnv.width === CW && cnv.height === CH && cnv.dataset.done === tk) return; cnv.width = CW; cnv.height = CH; cnv.dataset.done = tk;
  var g = cnv.getContext("2d"), s = Math.max(CW / w, CH / h), ox = (CW - w * s) / 2, oy = (CH - h * s) / 2, im = g.createImageData(CW, CH), px = im.data, step = 7;
  var lv = new Int16Array(CW * 2), hv = function (x, y) { var mx = Math.max(0, Math.min(w - 1.001, (x - ox) / s)), my = Math.max(0, Math.min(h - 1.001, (y - oy) / s)), x0 = mx | 0, y0 = my | 0, fx = mx - x0, fy = my - y0, k = y0 * w + x0;
    return (a[k] * (1 - fx) + a[k + 1] * fx) * (1 - fy) + (a[k + w] * (1 - fx) + a[k + w + 1] * fx) * fy; };
  for (var y = 0; y < CH; y++) { var cur = (y % 2) * CW, prv = ((y + 1) % 2) * CW;
    for (var x = 0; x < CW; x++) { var L = Math.floor(hv(x, y) / step); lv[cur + x] = L;
      if (x && y && (L !== lv[cur + x - 1] || L !== lv[prv + x])) { var hi = Math.max(L, lv[cur + x - 1], lv[prv + x]), idx = hi % 5 === 0, o = (y * CW + x) * 4; px[o] = 214; px[o + 1] = 202; px[o + 2] = 168; px[o + 3] = idx ? 62 : 28; } } }
  g.putImageData(im, 0, 0);
  var gs = Math.round(s * 16); g.strokeStyle = "rgba(214,202,168,.07)"; g.lineWidth = 1; g.fillStyle = "rgba(214,202,168,.32)"; g.font = Math.round(10 * dpr) + "px Barlow,system-ui,sans-serif";
  for (var gx = ox % gs, n = 41; gx < CW; gx += gs, n++) { g.beginPath(); g.moveTo(gx + .5, 0); g.lineTo(gx + .5, CH); g.stroke(); g.fillText(String(n), gx + 3 * dpr, 12 * dpr); }
  for (var gy = oy % gs, m = 87; gy < CH; gy += gs, m--) { g.beginPath(); g.moveTo(0, gy + .5); g.lineTo(CW, gy + .5); g.stroke(); g.fillText(String(m), 3 * dpr, gy - 3 * dpr); }
}

/* ================= setup: choose the forces, the ground and the rules ================= */
var THEORY = { SPEARHEAD: "Shock. Close by round 3, keep attacking, push the enemy off the board.", SPECTRUM: "The long game. The enemy fights blind, late and out of step.",
  BULWARK: "Wants to be attacked. Blunt the blow, hold, counterpunch, win on points.", "KILL CHAIN": "Out-cycle the enemy. Find, strike, confirm, strike again." };
var KEYCLASS = { SPEARHEAD: "M2", BULWARK: "PROT", "KILL CHAIN": "FIRES", SPECTRUM: "INFO" };
var SET = { mode: (function () { try { return localStorage.getItem("ss.trained") ? "bot" : "train"; } catch (e) { return "train"; } })(), you: "", bot: "", terrain: "", first: "", concepts: "0", fd: "0", end: "0" };
function conceptArt(name) {   // the Concept's own painting, or the strongest card of its signature Class that has art
  if (ART["Concept_" + name]) return ART["Concept_" + name];
  var best = null; Object.keys(G.faces || {}).forEach(function (n) { var f = G.faces[n]; if (f.cap && f.cls === KEYCLASS[name] && ART[f.id] && (!best || String(f.gen).length > String(best.gen).length)) best = f; });
  return best ? ART[best.id] : "";
}
function forceTile(c, side) {
  var on = SET[side] === c.name, art = conceptArt(c.name);
  return '<button class="force' + (on ? " on" : "") + '" data-' + side + '="' + esc(c.name) + '" aria-pressed="' + on + '">' + (art ? '<img alt="" src="' + art + '">' : '<span class="noart"></span>') +
    '<span class="fx-t"><b>' + esc(c.name) + "</b><small>" + esc(c.box) + "</small><em>" + esc(THEORY[c.name] || c.text) + "</em></span>" + (on ? '<span class="tag">' + (side === "you" ? (SET.mode === "watch" ? "South" : "You") : (SET.mode === "watch" ? "North" : "The bot")) + "</span>" : "") + "</button>";
}
function seg(key, opts) { return '<div class="seg2" data-set="' + key + '">' + opts.map(function (o) { return '<button data-v="' + esc(o[0]) + '" aria-pressed="' + (SET[key] === o[0]) + '">' + esc(o[1]) + "</button>"; }).join("") + "</div>"; }
function setupBody(d) {
  var el = $("suBody"); if (!el) return;
  if (SET.mode === "replays") return replayList(el);
  if (SET.mode === "train") return trainBody(el, d);
  var cs = d.concepts, watch = SET.mode === "watch", tr = d.terrain.filter(function (t) { return t.name === SET.terrain; })[0];
  el.innerHTML = '<section class="step"><h2><i>1</i>' + (watch ? "South side" : "Your force") + '</h2><div class="forces you">' + cs.map(function (c) { return forceTile(c, "you"); }).join("") + "</div></section>" +
    '<section class="step"><h2><i>2</i>' + (watch ? "North side" : "The enemy") + '</h2><div class="forces bot">' + cs.map(function (c) { return forceTile(c, "bot"); }).join("") + "</div></section>" +
    '<section class="step"><h2><i>3</i>The ground</h2><div class="chips2" data-set="terrain"><button data-v="" aria-pressed="' + (!SET.terrain) + '">Random</button>' + d.terrain.map(function (t) { return '<button data-v="' + esc(t.name) + '" aria-pressed="' + (SET.terrain === t.name) + '">' + esc(t.name.charAt(0) + t.name.slice(1).toLowerCase()) + "</button>"; }).join("") +
    '</div><p class="hint">' + (tr ? esc(tr.text) : "A battlefield from the two boxes in play, chosen at random.") + "</p></section>" +
    '<details class="more"' + (SET.open ? " open" : "") + '><summary>Rules for this game</summary><div class="opts">' +
    '<div><label>Goes first in round 1</label>' + seg("first", [["", "Random"], ["you", watch ? "South" : "You"], ["bot", watch ? "North" : "The bot"]]) + "</div>" +
    '<div><label>Concept benefits</label>' + seg("concepts", [["0", "Off while we balance"], ["1", "On"]]) + "</div>" +
    '<div><label>Hand at the end of the round</label>' + seg("fd", [["0", "Keep it"], ["1", "Draw 5 new"]]) + "</div>" +
    '<div><label>The game ends</label>' + seg("end", [["0", "At Assessment"], ["1", "The instant a condition is met"]]) + "</div></div></details>" +
    '<div class="go"><button id="pgo" class="big">' + (watch ? "Watch the game" : "Start the game") + '</button><p>' + esc(SET.you) + " against " + esc(SET.bot) + (SET.terrain ? ", " + esc(SET.terrain.toLowerCase()) : ", random ground") + '</p></div><pre id="serr"></pre>';
}
function trainBody(el, d) {   /* v0.17 (Stage D): Basic Training on the Main Menu */
  var t = d.training;
  if (!t) { el.innerHTML = '<section class="step"><h2>Basic Training</h2><p class="hint">Basic Training is not on this copy of the page (basic_training.json is missing).</p></section>'; return; }
  var done = false; try { done = !!localStorage.getItem("ss.trained"); } catch (e) { }
  el.innerHTML = '<section class="step train"><h2><i>★</i>' + esc(t.name) + '</h2><p class="lead2">New to Shadows &amp; Steel? Start here. A short guided battle teaches the game one step at a time: about ' + esc(t.minutes) + ' minutes, and you cannot get it wrong.</p>' +
    '<ol class="tl">' + ["The board: the route, Zones, your Force Marker and Contact", "Deploying cards, and your Frontline and Rear Area", "Attacking, and what Survivability and Durability mean", "Operators, the Mission Track and H-Hour", "Effect cards, Sustainment and Assessment", "How to win"].map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>" +
    '<p class="hint">' + (done ? "You have finished Basic Training on this device. Play it again any time." : "The coach explains each step. Read it, tap Next, then do what it asks.") + ' The Field Manual holds every lesson to read again later.</p></section>' +
    '<div class="go"><button id="pgo" class="big">Start Basic Training</button><p><button class="ghost" id="tFM">Read the Field Manual</button></p></div><pre id="serr"></pre>';
}
function logoBand() { var L = window.SS_LOGOS || []; return L.length ? '<div class="logos" aria-label="U.S. Army, U.S. Army War College, Department of Strategic Wargaming">' + L.map(function (x) { return '<img class="' + x.key + '" alt="' + esc(x.alt) + '" src="' + x.src + '">'; }).join("") + "</div>" : ""; }
function showSetup() {
  reset(); render(); $("bot").style.visibility = "hidden"; $("debrief").style.display = "none";   // the setup screen covers the table: keep the game buttons out from behind it
  api("/play").then(function (d) {
    G.meta = d.meta || {}; G.bases = d.bases || {}; G.faces = d.faces || {}; G.builds = d.builds || []; G.gloss = (G.builds[0] || {}).glossary || d.glossary || G.gloss; G.decklists = (G.builds[0] || {}).decklists || G.decklists; G.buildOn = null; handCv = {}; MUS.on = false; MUS.target = 0; $("vig").className = "fx"; if (d.game) { $("cover").style.display = "none"; return poll(); }
    G.setupData = d; var cs = d.concepts; if (!SET.you) SET.you = cs[0].name; if (!SET.bot) SET.bot = (cs[1] || cs[0]).name;
    $("cover").style.display = "block"; $("cover").classList.add("map");
    $("cover").firstElementChild.innerHTML = '<canvas class="contours" id="suMap"></canvas><div class="su"><header class="su-h"><h1 class="t">Shadows <span>&amp;</span> Steel</h1>' +
      '<div class="seg" data-set="mode"><button data-v="train" aria-pressed="' + (SET.mode === "train") + '">Basic Training</button><button data-v="bot" aria-pressed="' + (SET.mode === "bot") + '">Play the bot</button><button data-v="watch" aria-pressed="' + (SET.mode === "watch") + '">Watch the bot play itself</button><button data-v="replays" aria-pressed="' + (SET.mode === "replays") + '">Saved replays</button></div><button class="ghost gear" id="suFM">Field Manual</button><button class="ghost gear" id="suLib">Card library</button><button class="ghost gear" id="suGear">⚙ Settings</button>' + (LOCAL ? '<button class="ghost gear" id="suQuit">Quit</button>' : "") + (SITE ? '<button class="ghost gear" id="suSend">✉ Send notes</button>' : "") + '</header>' + (SITE ? siteWelcome() : "") +
      '<div id="suBody"></div><footer class="su-f">Tap a card to read it during the game; glowing cards can act. The ☰ menu holds notes, the battle log, saving a replay and Settings. Cards: ' + esc(d.cards || "") + ". Decks: " + esc(d.decks || "") + ". Battlefield table v0.18.</footer>" + logoBand() + "</div>";
    setupBody(d); requestAnimationFrame(function () { contourMap($("suMap"), SET.terrain); if (window.SSOpening && window.SSOpening.menuShown) window.SSOpening.menuShown(); });
  }, function (e) { $("cover").style.display = "block"; $("cover").firstElementChild.innerHTML = "<h1 class='t'>Shadows &amp; Steel</h1><p class='lead'>The game engine did not start.</p><pre>" + esc(e.message) + "</pre>"; });
}
$("cover").addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (b && b.id === "suGear") return showSettings(); if (b && b.id === "suQuit") return quitApp(b); if (b && b.id === "suSend") return showSend(); if (b && b.id === "wHide") { try { localStorage.setItem("ss.welcomed", "1"); } catch (er) { } var wl = $("welcome"); if (wl) wl.remove(); return; } if (b && (b.id === "suFM" || b.id === "tFM")) return showManual(); if (b && b.id === "suLib") return showLibrary(); if (!b || !G.setupData) return; var d = G.setupData, grp = b.closest("[data-set]");
  if (b.dataset.you || b.dataset.bot) { if (b.dataset.you) SET.you = b.dataset.you; else SET.bot = b.dataset.bot; SFX.select && SFX.select(); return setupBody(d); }
  if (grp && b.dataset.v != null) { SET[grp.dataset.set] = b.dataset.v; SET.open = !!document.querySelector("#cover details.more[open]");
    if (grp.dataset.set === "mode") { Array.prototype.forEach.call(grp.children, function (x) { x.setAttribute("aria-pressed", x === b); }); $("pgo") && ($("pgo").disabled = false); }
    if (grp.dataset.set === "terrain") { var tn = SET.terrain || "OPEN PLAIN"; TER.set(tn); TER.load(tn).then(function () { var m = $("suMap"); if (m) contourMap(m, SET.terrain); }, function () { }); }
    return setupBody(d); }
  if (b.id === "pgo") { audioInit(); unlock(); b.disabled = true; b.textContent = "Setting up…";
    api("/play/start", SET.mode === "train" ? { tutorial: "basic" } : { build: "", spectate: SET.mode === "watch" ? "1" : "", you: SET.you, bot: SET.bot, terrain: SET.terrain, first: SET.first, concepts: SET.concepts, forced_discard: SET.fd, instant_end: SET.end })
      .then(function () { $("cover").style.display = "none"; reset(); fit(); MUS.on = true; return poll(); }, function (e) { b.disabled = false; b.textContent = "Start the game"; $("serr").textContent = e.message; }); }
});
window.addEventListener("resize", function () { var m = $("suMap"); if (m && $("cover").style.display !== "none") { m.dataset.done = ""; contourMap(m); } });

/* ================= saved replays ================= */
function shortHow(how) { how = String(how || ""); return /Higher Homefront/.test(how) ? "points" : /Homefront/.test(how) ? "Homefront" : /Supremacy/.test(how) ? "Supremacy" : /Devastation/.test(how) ? "Devastation" : how.split(":")[0]; }
function sides(m) { var same = m.you === m.bot; return m.spectate ? [m.you + (same ? " (south)" : ""), m.bot + (same ? " (north)" : "")] : [m.you + " (you)", m.bot + " (bot)"]; }
function resultLine(m) {   // "SPEARHEAD (you) beat BULWARK (bot) on Homefront in round 7"
  var s = sides(m), nm = m.names || ["You", "The bot"], how = shortHow(m.how);
  if (!m.finished) return s[0] + " v " + s[1] + ", unfinished, round " + m.rounds;
  var w = m.winner === nm[0] ? 0 : m.winner === nm[1] ? 1 : -1, tail = how === "points" ? " on points after round " + m.rounds : (how === "Homefront" ? " on " : " by ") + how + " in round " + m.rounds;
  return w < 0 ? s[0] + " drew with " + s[1] + " after round " + m.rounds : s[w] + " beat " + s[1 - w] + tail;
}
function replayName(m, when) { var d = when || new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
  return (d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + p(d.getMinutes()) + " " + resultLine(m)).replace(/[<>:"\/\\|?*]/g, "-"); }
function whenText(iso) { try { var d = new Date(iso); return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + " at " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
function unpack(rec) {
  if (!window.DecompressionStream) return Promise.reject(new Error("This browser is too old to open saved replays. Try a current Chrome, Edge, Safari or Firefox."));
  var bin = atob(rec.z), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text().then(JSON.parse);
}
function buildReplayFile(rec) {   // one HTML file that plays this game on the 3D table, with no engine and no server: to keep or to send
  var get = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error("Could not read " + u + " from this page."); return r.text(); }); };
  var tname = (rec.meta || {}).terrain || "OPEN PLAIN";
  return Promise.all([get("index.html"), get("three.min.js"), get("heights.js"), get("art.js"), get("cardface.js"), get("battle.js"), TER.embed(tname), get("terrain.js")]).then(function (a) {
    var js = function (t) { return "<script>" + t.replace(/<\/script/gi, "<\\/script") + "<\/script>"; }, html = a[0].replace(/<script type="module">[\s\S]*?<\/script>/, "");
    var put = function (src, body) { html = html.replace('<script src="' + src + '"></script>', function () { return body; }); };
    put("three.min.js", js(a[1])); put("heights.js", js(a[2])); put("art.js", js(a[3] + "\nwindow.ART_HI=[];")); put("cardface.js", js(a[4])); put("terrain.js", js(a[7])); put("sound.js", ""); put("brand.js", ""); put("site.js", ""); put("opening/opening.js", "");
    put("battle.js", '<script type="application/json" id="ss-replay">' + JSON.stringify(rec).replace(/</g, "\\u003c") + "<\/script>" + js(a[6] + "window.SS_TNAME=" + JSON.stringify(tname) + ";") + js(a[5]));
    html = html.replace(/<title>[^<]*<\/title>/, function () { return "<title>" + esc("Shadows & Steel replay: " + rec.name) + "</title>"; });
    return html.replace("<!DOCTYPE html>", function () { return "<!DOCTYPE html>\n<!--ss-replay " + JSON.stringify({ name: rec.name, saved: rec.saved, meta: rec.meta }).replace(/--/g, "- -") + "-->"; });
  });
}
var DLP = null;
function dlReady() { if (!window.claude || !window.claude.use) return Promise.resolve(null); if (!DLP) DLP = Promise.race([window.claude.use("downloads"), new Promise(function (r) { setTimeout(function () { r(null); }, 11000); })]).then(function (d) { return d || null; }, function () { return null; }); return DLP; }
function downloadText(name, text) {   // resolves "saved" or "declined"; rejects with a plain message
  return dlReady().then(function (dl) {
    if (dl) return dl.save({ filename: name + ".html", data: new Blob([text], { type: "text/html" }) }).then(function () { return "saved"; }, function (e) { var c = (e && e.code) || ""; if (c === "declined") return "declined";
      throw new Error(c === "rate_limited" ? "A save is already waiting for your answer. Try again in a moment." : c === "too_large" ? "The file is too large to save here." : "This view cannot save files (" + (c || (e && e.message) || "unavailable") + "). The replay is still kept under Saved replays."); });
    if (window.claude && window.claude.use && !LOCAL) throw new Error("This view cannot save files. The replay is still kept under Saved replays.");
    var u = URL.createObjectURL(new Blob([text], { type: "text/html" })), a = document.createElement("a"); a.href = u; a.download = name + ".html"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 5000); return "saved"; }); }
var CHUNK = 180000;
function storeReplay(rec) {   // the Workbench keeps a file in 04. Workbench/replays; the published page keeps it in its own store
  if (LOCAL) return buildReplayFile(rec).then(function (html) { return fetch("/api/battlefield/replay", { method: "POST", headers: { "Content-Type": "application/json", "X-Workbench": "1" }, body: JSON.stringify({ name: rec.name, html: html }) }).then(function (r) { return r.json(); }); });
  return dbReady().then(function (d) {
    if (!d) return { error: "The replay store cannot be reached from here. Use Download to keep the file." };
    var id = "r" + new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) + "_" + (rec.meta.seed || 0), parts = []; for (var i = 0; i < rec.z.length; i += CHUNK) parts.push(rec.z.slice(i, i + CHUNK));
    var k = 0, next = function () { if (k >= parts.length) return d.doc("replays/" + id).set({ name: rec.name, saved: rec.saved, meta: rec.meta, parts: parts.length, kind: rec.kind, version: rec.version }); var p = parts[k]; return d.doc("replaydata/" + id + "-" + (k++)).set({ z: p }).then(next); };
    return next().then(function () { return { ok: true, id: id }; }, function (e) { return { error: e && e.code === "quota_exceeded" ? "The replay store is full. Delete some saved replays first." : "The replay could not be saved: " + (e && (e.message || e.code) || e) }; });
  });
}
function listReplays() {
  if (LOCAL) return fetch("/api/battlefield/replays").then(function (r) { return r.json(); }).then(function (j) { return j.items || []; });
  return dbReady().then(function (d) { if (!d) return null; return d.collection("replays").orderBy("saved", "desc").limit(200).get().then(function (s) { return s.docs.map(function (x) { return Object.assign({ id: x.id }, x.data()); }); }); });
}
function loadReplay(item) {
  if (LOCAL) return fetch("/api/battlefield/replay?id=" + encodeURIComponent(item.id)).then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw new Error(j.error); return j; });
  return dbReady().then(function (d) { var ps = []; for (var k = 0; k < (item.parts || 1); k++) ps.push(d.doc("replaydata/" + item.id + "-" + k).get()); return Promise.all(ps).then(function (ss) {
    if (ss.some(function (s) { return !s.exists; })) throw new Error("Part of this replay is missing from the store."); return { kind: item.kind, version: item.version, name: item.name, saved: item.saved, meta: item.meta, z: ss.map(function (s) { return s.data().z; }).join("") }; }); });
}
function deleteReplay(item) {
  if (LOCAL) return fetch("/api/battlefield/replay/delete", { method: "POST", headers: { "Content-Type": "application/json", "X-Workbench": "1" }, body: JSON.stringify({ id: item.id }) }).then(function (r) { return r.json(); });
  return dbReady().then(function (d) { var k = 0, next = function () { if (k >= (item.parts || 1)) return d.doc("replays/" + item.id).delete(); return d.doc("replaydata/" + item.id + "-" + (k++)).delete().then(next); }; return next(); });
}
function replayList(el) {
  el.innerHTML = '<section class="step reps"><h2>Saved replays</h2><p class="hint">' + (LOCAL ? "Each one is a file in 04. Workbench/replays that opens in any browser, so you can send it to anyone." : "Saved from the end of a game, or from the ☰ menu during one. Download makes a file that opens in any browser, so you can send it to anyone.") + '</p><ol class="replist" id="rlist"><li class="empty">Looking for saved replays…</li></ol></section>';
  var timer = setTimeout(function () { var l = $("rlist"); if (l && /Looking/.test(l.textContent)) l.innerHTML = '<li class="empty">The replay store has not answered yet. It may be offline; try again in a moment.</li>'; }, 10000);
  listReplays().then(function (items) { clearTimeout(timer); G.replays = items || []; var l = $("rlist"); if (!l) return;
    if (items === null) { l.innerHTML = '<li class="empty">Saved replays need the page\'s store, which this view cannot reach.</li>'; return; }
    if (!items.length) { l.innerHTML = '<li class="empty">No saved replays yet. Finish a game, then choose Save replay on the debrief.</li>'; return; }
    l.innerHTML = items.map(function (it, i) { var m = it.meta || {}; return '<li><div class="rp-main"><b>' + esc(resultLine(m)) + "</b><span>" + esc(m.terrain ? m.terrain.charAt(0) + m.terrain.slice(1).toLowerCase() + ", " : "") + esc(m.events || "?") + " events, saved " + esc(whenText(it.saved)) + '</span></div><div class="rp-act"><button data-watch="' + i + '">Watch</button>' +
      (LOCAL ? '<button class="ghost" data-show="' + i + '">Show the file</button>' : '<button class="ghost" data-dl="' + i + '">Download</button>') + '<button class="ghost" data-del="' + i + '">Delete</button></div></li>'; }).join(""); },
    function (e) { clearTimeout(timer); var l = $("rlist"); if (l) l.innerHTML = '<li class="empty">Saved replays could not be read: ' + esc(e.message || e) + "</li>"; });
}
$("cover").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-watch],button[data-dl],button[data-del],button[data-show]"); if (!b) return; var it = (G.replays || [])[+(b.dataset.watch || b.dataset.dl || b.dataset.del || b.dataset.show)]; if (!it) return;
  if (b.dataset.watch != null) { b.disabled = true; b.textContent = "Loading…"; audioInit(); unlock(); return loadReplay(it).then(function (rec) { return playReplay(rec); }).catch(function (er) { b.disabled = false; b.textContent = "Watch"; alertLine(b, er.message || er); }); }
  if (b.dataset.dl != null) { b.disabled = true; b.textContent = "Making the file…"; return loadReplay(it).then(buildReplayFile).then(function (html) { return downloadText(it.name, html); }).then(function (st) { b.disabled = false; b.textContent = st === "saved" ? "Download again" : "Download"; }).catch(function (er) { b.disabled = false; b.textContent = "Download"; alertLine(b, er.message || er); }); }
  if (b.dataset.show != null) { return fetch("/api/battlefield/replay/show", { method: "POST", headers: { "Content-Type": "application/json", "X-Workbench": "1" }, body: JSON.stringify({ id: it.id }) }).then(function (r) { return r.json(); }).then(function (j) { alertLine(b, j.file ? "In " + j.file : j.error || ""); }); }
  if (b.dataset.del != null) { if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tap again to delete"; setTimeout(function () { b.dataset.sure = ""; b.textContent = "Delete"; }, 2500); return; }
    b.disabled = true; return deleteReplay(it).then(function () { replayList($("suBody")); }); }
});
function alertLine(b, text) { var li = b.closest("li"), p = li && li.querySelector(".rp-msg"); if (!li) return; if (!p) { p = document.createElement("p"); p.className = "rp-msg"; li.appendChild(p); } p.textContent = text; }

/* ---- playing a saved replay on the table: the recorded frames go through the same playback as a live game ---- */
function playReplay(rec, opts) {
  opts = opts || {};
  return unpack(rec).then(function (body) {
    $("cover").style.display = "none"; $("debrief").style.display = "none"; $("menu").hidden = true; reset(); fit();
    var fr = body.frames || [], rounds = []; fr.forEach(function (f, i) { if (/^--- Round/.test(f.text)) rounds.push({ round: f.view.round, i: i }); });
    G.replay = { rec: rec, body: body, standalone: !!opts.standalone, rounds: rounds };
    G.faces = body.faces || G.faces || {}; G.meta = body.meta || G.meta || {}; G.bases = body.bases || G.bases || {}; handCv = {}; handKey = "";
    G.info = body.info; G.lastN = fr.length; G.since = fr.length; G.latest = fr.length ? fr[fr.length - 1].view : null; G.latestPend = null; G.queue = fr.slice(); G.started = true;
    MUS.on = true; $("bot").style.visibility = ""; document.body.classList.add("replaying"); $("bQuit").textContent = R0(opts); playNext();
  });
}
function R0(opts) { return opts && opts.standalone ? "Stop the replay" : "Exit replay"; }
function replayJump(i) {   // to the start of a round
  var R = G.replay; if (!R) return; var fr = R.body.frames; i = Math.max(0, Math.min(fr.length - 1, i));
  G.pgen = (G.pgen || 0) + 1; G.queue = fr.slice(i); G.playing = false; G.waiting = false; G.skip = false; G.over = null; G.overShown = false; $("debrief").style.display = "none";
  G.hist = fr.slice(0, i).map(function (f) { return f.text; }); G.aar = []; G.aarEv = []; G.aarLast = null; fr.slice(0, i).forEach(aarNote);
  if (i) { G.view = fr[i - 1].view; sync(G.view); } $("feed").innerHTML = ""; playNext();
}
function exitReplay() { var R = G.replay; document.body.classList.remove("replaying"); G.replay = null; G.pgen = (G.pgen || 0) + 1;
  if (R && R.standalone) { reset(); render(); $("cover").style.display = "block"; $("cover").firstElementChild.innerHTML = standaloneCover(R.rec); return; }
  SET.mode = "replays"; showSetup(); }
function standaloneCover(rec) { return '<canvas class="contours" id="suMap"></canvas><div class="su"><header class="su-h"><h1 class="t">Shadows <span>&amp;</span> Steel</h1></header><section class="step"><h2>A saved game</h2><p class="lead2">' + esc(resultLine(rec.meta || {})) + '</p><p class="hint">Saved ' + esc(whenText(rec.saved)) + ". This file plays the game on the 3D table; nothing else is needed.</p><div class=\"go\"><button class=\"big\" id=\"sWatch\">Watch the game</button></div></section></div>"; }
$("cover").addEventListener("click", function (e) { if (e.target.id === "sWatch" && window.SS_REPLAY) { audioInit(); unlock(); playReplay(window.SS_REPLAY, { standalone: true }); } });
function replayBar() {
  var R = G.replay, fr = R.body.frames, at = fr.length - G.queue.length, cur = (G.view && G.view.round) || 1;
  return '<div class="rbar"><span class="rtag">Replay</span><button class="ghost" id="rPause">' + (G.paused ? "▶ Play" : "❚❚ Pause") + "</button>" + (G.paused ? '<button class="ghost" id="rStep">Next event</button>' : "") +
    '<span class="rr">' + R.rounds.map(function (r) { return '<button class="ghost' + (r.round === cur ? " on" : "") + '" data-jump="' + r.i + '" aria-label="Round ' + r.round + '">' + r.round + "</button>"; }).join("") + "</span>" +
    '<button class="ghost" id="rSpeed">Speed ' + (G.speed === .5 ? "½" : G.speed) + "×</button><button class=\"ghost\" id=\"rExit\">" + (R.standalone ? "Stop" : "Exit replay") + '</button></div><div class="rprog"><i style="width:' + Math.round(100 * at / Math.max(1, fr.length)) + '%"></i></div>';
}
$("prompt").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b || !G.replay) return;
  if (b.id === "rPause") return pause(!G.paused);
  if (b.id === "rStep") { G.stepOnce = true; if (G.waiting) { G.waiting = false; playNext(); } return; }
  if (b.id === "rSpeed") { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? .5 : 1; return render(); }
  if (b.id === "rExit") return exitReplay();
  if (b.dataset.jump != null) return replayJump(+b.dataset.jump);
  if (b.id === "rDebrief") return showDebrief();
});

/* ================= debrief: the end of a game (or of a replay) ================= */
function turningPoints() {   // up to six moments that decided the game, in the order they happened
  var seen = {}, w = function (t) { if (/devastated/.test(t)) return 4; if (/Last stand/.test(t)) return 4; if (/in Contact/.test(t)) return seen.c ? 0 : (seen.c = 1, 3);
    if (/falls back|is pushed back/.test(t)) return 2; if (/loses ([3-9]|\d\d) Homefront/.test(t)) return 2.5; if (/is destroyed/.test(t)) return 1.5; if (/^H-Hour/.test(t)) return /ends\.?$/.test(t) ? .3 : 1.2; return 1; };
  var ev = (G.aarEv || []).filter(function (e) { return !/^Game over/.test(e.text) && !/loses \d+ Homefront \([^)]*devastated\)/.test(e.text); });
  var pick = ev.map(function (e, i) { return { e: e, i: i, w: w(e.text) + i / 1000 }; }).filter(function (p) { return p.w >= .3; }).sort(function (a, b) { return b.w - a.w; }).slice(0, 6).sort(function (a, b) { return a.i - b.i; });
  return pick.map(function (p) { return p.e; });
}
function hfChart(c, rows, nm) {
  if (!c || rows.length < 2) return; var dpr = Math.min(2, devicePixelRatio || 1), cw = c.clientWidth, ch = c.clientHeight; c.width = cw * dpr; c.height = ch * dpr; var g = c.getContext("2d"); g.scale(dpr, dpr);
  var L = 26, R = 92, T = 8, B = 20, n = rows.length, mx = 5; rows.forEach(function (r) { mx = Math.max(mx, r.you.hf, r.bot.hf); }); mx = Math.ceil(mx / 5) * 5;
  var X = function (i) { return L + (cw - L - R) * i / (n - 1); }, Y = function (v) { return T + (ch - T - B) * (1 - v / mx); }, C = ["#7fb6d8", "#d8674e"];
  g.font = "11px Barlow,system-ui,sans-serif"; g.textBaseline = "middle";
  for (var v = 0; v <= mx; v += 5) { g.strokeStyle = "rgba(232,226,207," + (v ? .08 : .25) + ")"; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(cw - R, Y(v)); g.stroke(); g.fillStyle = "#a9a48f"; g.textAlign = "right"; g.fillText(v, L - 6, Y(v)); }
  g.textAlign = "center"; rows.forEach(function (r, i) { g.fillText(i === n - 1 ? "End" : "R" + r.round, X(i), ch - 7); });
  ["you", "bot"].forEach(function (k, si) { g.strokeStyle = C[si]; g.lineWidth = 2.2; g.lineJoin = "round"; g.beginPath(); rows.forEach(function (r, i) { g[i ? "lineTo" : "moveTo"](X(i), Y(r[k].hf)); }); g.stroke(); });
  var e = rows[n - 1], ya = Y(e.you.hf), yb = Y(e.bot.hf); if (Math.abs(ya - yb) < 14) { var mid = (ya + yb) / 2, up = e.you.hf >= e.bot.hf; ya = mid + (up ? -8 : 8); yb = mid + (up ? 8 : -8); }
  g.textAlign = "left"; g.fillStyle = C[0]; g.fillText(nm[0].slice(0, 12) + " " + e.you.hf, cw - R + 8, ya); g.fillStyle = C[1]; g.fillText(nm[1].slice(0, 12) + " " + e.bot.hf, cw - R + 8, yb);
}
function showDebrief() {
  var o = G.over; if (!o) return; var el = $("debrief"), nm = (G.info && G.info.names) || ["You", "The bot"], spect = G.info && G.info.spectate, R = G.replay;
  var key = spect || R ? (o.winner && o.winner.indexOf("Nobody") < 0 ? o.winner + " wins" : "Draw") : o.winner === "You" ? "Victory" : o.winner === "The bot" ? "Defeat" : "Draw", kc = /Victory/.test(key) ? "win" : /Defeat/.test(key) ? "lose" : "even";
  var m = { you: G.info.you, bot: G.info.bot, names: nm, spectate: spect, winner: o.winner, how: o.how, finished: true, rounds: o.round };
  var rows = (G.aar || []).slice(); if (G.aarLast) rows.push(G.aarLast);
  el.innerHTML = '<div class="db"><p class="dbk ' + kc + '">' + esc(key) + "</p><h2>" + esc(resultLine(m).replace(/ \((you|bot)\)/g, "")) + "</h2>" +
    '<p class="dbs">' + esc(o.how) + ". Final Homefront: " + esc(nm[0]) + " " + o.you_hf + ", " + esc(nm[1]) + " " + o.bot_hf + ".</p>" +
    (rows.length > 1 ? '<div class="dbc"><p class="dbl">Homefront by round</p><canvas id="dbC"></canvas></div>' : "") +
    '<div class="dbt"><p class="dbl">Turning points</p><ol>' + (turningPoints().map(function (e) { return "<li><b>Round " + e.round + "</b> " + esc(e.text) + "</li>"; }).join("") || "<li>None recorded.</li>") + "</ol></div>" +
    '<div class="dba">' + (R ? '<button class="big" id="dAgain">Watch again</button>' : '<button class="big" id="dSave">Save replay</button>') + '<button class="ghost" id="dAAR">After-action review</button><button class="ghost" id="dLog">Battle log</button>' +
    (R ? (R.standalone ? "" : '<button class="ghost" id="dBack">Saved replays</button>') : '<button class="ghost" id="dNew">Exit to the Main Menu</button>') + '<button class="ghost" id="dClose">Look at the board</button></div><p id="dMsg" class="dbm">' + (G.savedReplay ? savedText(G.savedReplay) : "") + "</p>" + (SITE && !R ? '<div class="dbn"><p class="dbl">✉ Send notes: your verdict, for the team</p><div id="dSendBox"></div></div>' : "") + "</div>";
  el.style.display = "flex"; requestAnimationFrame(function () { hfChart($("dbC"), rows, nm); }); if (SITE && !R) sendForm($("dSendBox"));
}
function savedText(r) { return r.error ? esc(r.error) : LOCAL ? "Saved as “" + esc(r.name) + "” in " + esc(r.folder || "04. Workbench/replays") + ". It opens in any browser." : "Saved as “" + esc(r.name) + "”. Find it under Saved replays on the Main Menu." + ' <button class="ghost" id="dDl">Download a file to share</button>'; }
function saveReplay(msg, btn) {
  if (G.replay) return Promise.resolve();
  if (G.savedReplay && !G.savedReplay.error && G.savedReplay.at === G.lastN) { if (msg) msg.innerHTML = savedText(G.savedReplay); return Promise.resolve(G.savedReplay); }
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; } if (msg) msg.textContent = "";
  return api("/play/replay", {}).then(function (rec) { rec.saved = new Date().toISOString(); rec.name = replayName(rec.meta); G.lastRec = rec; return storeReplay(rec).then(function (r) { r = r || {}; r.name = rec.name; r.at = G.lastN; return r; }); })
    .then(function (r) { G.savedReplay = r; if (msg) msg.innerHTML = savedText(r); if (btn) { btn.disabled = false; btn.textContent = r.error ? "Try again" : "Saved"; if (!r.error) btn.disabled = true; } feed(r.error ? r.error : "Replay saved: " + r.name); return r; },
      function (e) { G.savedReplay = { error: "The replay could not be saved: " + (e.message || e) }; if (msg) msg.innerHTML = savedText(G.savedReplay); if (btn) { btn.disabled = false; btn.textContent = "Try again"; } });
}
$("debrief").addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return;
  if (b.id === "dClose") { $("debrief").style.display = "none"; return render(); }
  if (b.id === "dSave") return saveReplay($("dMsg"), b);
  if (b.id === "dDl") { b.disabled = true; b.textContent = "Making the file…"; return buildReplayFile(G.lastRec).then(function (html) { return downloadText(G.lastRec.name, html); }).then(function (st) { b.disabled = false; b.textContent = st === "saved" ? "Download again" : "Download a file to share"; }, function (er) { b.disabled = false; b.textContent = "Download a file to share"; var m = document.createElement("span"); m.textContent = " " + (er.message || er); b.after(m); }); }
  if (b.id === "dAAR") return showAAR();
  if (b.id === "dLog") return showLog();
  if (b.id === "dNew") { $("debrief").style.display = "none"; return quit(true); }
  if (b.id === "dAgain") { var R = G.replay; return playReplay(R.rec, { standalone: R.standalone }); }
  if (b.id === "dBack") return exitReplay();
});

/* ================= v0.18: the animated opening's live scene (opening/opening.js drives it; RD-151) ================= */
// Scene 3 plays Basic Training's own round 3 through the replay playback, one frame at a time on the opening's schedule ("director"
// mode): no replay bar, no music changes, a scripted camera. opening.js owns the timing; this file only shows the frames.
function dirStart(body, i) {
  reset(); var fr = body.frames; G.opening = true; G.dir = true;
  G.replay = { rec: null, body: body, standalone: false, rounds: [], dir: true };
  G.faces = body.faces || G.faces || {}; G.meta = body.meta || G.meta || {}; G.bases = body.bases || G.bases || {}; handCv = {}; handKey = "";
  G.info = body.info; G.queue = []; G.lastN = fr.length; G.since = fr.length; G.started = false; MUS.on = false;
  G.view = fr[i].view; G.latest = G.view; sync(G.view); G.started = true; G.stand = false;
  document.body.classList.add("replaying", "dir"); $("bot").style.visibility = "hidden"; camera.clearViewOffset(); camera.updateProjectionMatrix();
  G.dirD = camBase.distanceTo(camTarget) || 30; render();
}
function dirFrame(f, quiet) { if (!G.dir) return; G.queue.push(f); G.dirQuiet = !!quiet; try { playNext(); } finally { G.dirQuiet = false; } }
function dirEnd() { if (!G.dir) return; G.dirCam = null; G.dir = false; G.replay = null; document.body.classList.remove("dir", "replaying"); $("vig").className = "fx"; reset(); clearBoard(); fit(); }
function dirShow(uid, on) { var o = O[uid]; if (!o) return; o.mesh.material.opacity = on ? 1 : 0; o.shadow.material.opacity = on ? .85 : 0; if (on) { groundFlash(o.tx, o.tz, 2.6, 0xd8c8a0, .35); shake = Math.max(shake, .08); } }
function dirRect(uid) {   // where a card lies on the screen now: its four corners, projected
  var o = O[uid]; if (!o) return null; var p = o.grp.position, s = o.grp.scale.y, xs = [], ys = [];
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { var q = screenPos(new THREE.Vector3(p.x + c[0] * CW * s / 2, p.y, p.z + c[1] * CH * s / 2)); xs.push(q.x); ys.push(q.y); });
  var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys); return { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 };
}
function setMuted(on) { G.muted = !!on; if (master) master.gain.value = G.muted ? 0 : .9; saveSound(); }
var OPDIR = { start: dirStart, frame: dirFrame, end: dirEnd, show: dirShow, rect: dirRect, cam: function (fn) { G.dirCam = fn; }, banner: banner, showcase: function (n, l) { if (showcase(n, l, false)) SFX.ability(); }, vig: function (on) { $("vig").className = on ? "fx stand" : "fx"; },
  audioInit: audioInit, unlock: unlock, ac: function () { return AC; }, setMood: setMood, setMuted: setMuted, caption: caption, contourMap: contourMap, reducedMotion: reducedMotion, PREF: PREF, savePrefs: savePrefs, applyPrefs: applyPrefs, drawCard: drawCard, fit: fit };

/* ================= loop ================= */
var last = performance.now(), fc = 0;
function frame(now) {
  requestAnimationFrame(frame); var raw = Math.min(.05, (now - last) / 1000); last = now; var dt = raw * G.speed; T += raw; fc++;
  for (var i = tweens.length - 1; i >= 0; i--) { var t = tweens[i]; t.t += dt; var k = Math.min(1, t.t / t.d); try { t.fn(k, dt); } catch (e) { } if (k >= 1) { tweens.splice(i, 1); if (t.done) try { t.done(); } catch (e) { console.error(e); } } }
  stepParts(dt); if (fc % 4 === 0) drawStatic();
  TER.tick(raw);
  var M = (G.pend && !G.playing) ? maps() : null, fxs = G.playing && G.caption && G.view ? null : null, lerp = Math.min(1, raw * 9);
  Object.keys(O).forEach(function (uid) {
    var o = O[uid], g = o.grp, on = 0, col = 0x7fe0c8, ring = 0;
    if (M) { if (M.src[uid]) on = .5 + Math.sin(T * 4 + o.tx) * .25; if (G.sel === uid) { on = 1; col = 0xffffff; } if (M.sups[uid]) { on = .9; col = 0x6aa8ff; } if (M.dsts[uid]) { ring = 1; if (G.pvDst === uid) { on = 1; col = 0xff8a66; } } if (G.multi && G.multi.picked.some(function (x) { return x.id === uid; })) { on = 1; col = 0xffd27a; } }
    o.glow.material.color.set(col); o.glow.material.opacity += (on - o.glow.material.opacity) * .2; o.ring.material.opacity += (ring - o.ring.material.opacity) * .25; if (ring) { o.ring.rotation.z += raw * .9; }
    g.position.x += (o.tx - g.position.x) * lerp; g.position.z += (o.tz - g.position.z) * lerp;
    var ty = .42 + (o.type === "contact" ? Math.sin(T * 2 + o.tx) * .04 : 0) + (G.sel === uid ? .25 : 0);
    if (o.lift) { o.lift = Math.max(0, o.lift - raw * 1.6); ty += Math.sin(o.lift * Math.PI) * .5; }
    if (o.drop) { var sp = o.drop === 2 ? 1.6 : 2.6 + (o.dv = (o.dv || 0) + raw * 30); g.position.y = Math.max(ty, g.position.y - raw * sp); if (g.position.y <= ty + .001) { var hard = o.drop === 1; o.drop = 0; o.dv = 0; if (!G.skip) { groundFlash(o.tx, o.tz, hard ? 3.6 : 2.4, 0xd8c8a0, .35); if (hard) { shake = Math.max(shake, .1); SFX.thud(); } for (var q = 0; q < (hard ? 6 : 3); q++) { var an = Math.random() * 6.28; spawn({ p: new THREE.Vector3(o.tx, .5, o.tz), v: new THREE.Vector3(Math.cos(an) * 1.6, .5 + Math.random(), Math.sin(an) * 1.6), life: .9, s0: .3, s1: 1.6, a: .35, color: 0xb8a888, drag: 2.5 }); } } } } else g.position.y += (ty - g.position.y) * lerp;
    var sc = g.scale.x + (o.ts - g.scale.x) * lerp, sx = sc;
    if (o.flip) { o.flip = Math.max(0, o.flip - raw * 2.4); sx = sc * Math.max(.04, Math.abs(Math.cos(o.flip * Math.PI))); }
    g.scale.set(sx, sc, sc);
    if (o.jolt) { o.jolt = Math.max(0, o.jolt - raw * 2.5); g.rotation.z = Math.sin(o.jolt * 30) * .05 * o.jolt; }
    o.shadow.position.x = g.position.x + .2; o.shadow.position.z = g.position.z + .24; o.shadow.scale.setScalar(sc);
  });
  aimUpdate(raw); if (G.dirCam) try { G.dirCam(raw, camBase, camTarget, camera); } catch (e) { G.dirCam = null; }
  if (G.calm) shake = 0; shake *= Math.pow(.004, raw); camera.position.set(camBase.x + (Math.random() - .5) * shake, camBase.y + (Math.random() - .5) * shake, camBase.z + (Math.random() - .5) * shake * .6); camera.lookAt(camTarget);
  renderer.render(scene, camera);
}

/* ================= start ================= */
(function () { var c = cv(160, 160), g = c.getContext("2d"), im = g.createImageData(160, 160); for (var i = 0; i < im.data.length; i += 4) { var v = Math.random() * 255 | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); try { $("grain").style.backgroundImage = "url(" + c.toDataURL() + ")"; } catch (e) { } })();
drawStatic(); applyPrefs(false); fit(); requestAnimationFrame(frame);
if (window.matchMedia) try { matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", function () { applyPrefs(); }); } catch (e) { }
var artReady = Promise.all(Object.keys(ART).map(function (k) { return new Promise(function (r) { var im = new Image(); im.onload = function () { IMG[k] = im; r(); }; im.onerror = r; im.src = ART[k]; }); }));
var fontReady = (document.fonts && document.fonts.load) ? Promise.race([Promise.all([document.fonts.load('30px "Black Ops One"'), document.fonts.load("600 20px Barlow")]), new Promise(function (r) { setTimeout(r, 1800); })]).catch(function () { }) : Promise.resolve();
[1500, 6000, 15000].forEach(function (ms) { setTimeout(function () { dbReady().then(function (d) { if (d) recoverNotes(); }); }, ms); });
(function () { var rj = document.getElementById("ss-replay"); if (!rj) return; try { window.SS_REPLAY = JSON.parse(rj.textContent); } catch (e) { return; }   // a saved-replay file: no engine, just the game
  Promise.all([artReady, fontReady]).then(function () { $("cover").classList.add("map"); $("cover").firstElementChild.innerHTML = standaloneCover(window.SS_REPLAY); requestAnimationFrame(function () { contourMap($("suMap"), (window.SS_REPLAY.meta || {}).terrain || window.SS_TNAME || ""); }); }); })();
window.SS = { sendForm: sendForm, showSend: showSend, site: SITE, copyWhere: copyWhere, optWhere: optWhere, quitApp: quitApp, winTrack: winTrack, showLibrary: showLibrary, toggleWin: toggleWin, glossFor: glossFor, hintBox: hintBox, PREF: PREF, applyPrefs: applyPrefs, showSettings: showSettings, caption: caption, TER: TER, SND: SND, readCard: readCard, showPiles: showPiles, hitsBox: hitsBox, isCause: isCause, saveReplay: saveReplay, playReplay: playReplay, buildReplayFile: buildReplayFile, listReplays: listReplays, loadReplay: loadReplay, showDebrief: showDebrief, replayJump: replayJump, set: SET, drawCard: function (u, S) { return drawCard(u, S || 1); }, engine: function (handle) { Promise.all([artReady, fontReady]).then(function () { engineOk(handle); G.engineUp = true; var gate = window.SSOpening && window.SSOpening.gate && window.SSOpening.gate(); (gate || Promise.resolve()).then(showSetup); }); }, op: OPDIR, G: G, api: api, objs: function () { return O; }, choose: choose, tapObj: tapObj, zoom: zoom, resume: function () { $("cover").style.display = "none"; reset(); fit(); MUS.on = true; return poll(); } };
})();
