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
var SETDEF = { text: 1, motion: "auto", shake: true, shapes: true, confirm: false, tips: true, captions: false, badges: true, speed: 1, opening: true, glance: true, steady: false };   // steady (WP3): "Steadier touch", a wider slop before a press becomes a drag   // glance (v0.19.1, RD-153 (2)): the glance face for cards in the hand and on the table   // opening (v0.18): the animated opening before the Main Menu
var PREFOK = { text: [1, 1.25, 1.5, 1.75, 2], speed: [.5, 1, 2], motion: ["auto", "on", "off"] };   // v0.21 (checkers): a stored value the Settings do not offer (a speed of 0 stopped every game) falls back to the default
var PREF = (function () { var d = {}, k; for (k in SETDEF) d[k] = SETDEF[k]; try { var st = JSON.parse(localStorage.getItem("ss.settings") || "null"); if (st) for (k in SETDEF) if (st[k] != null && typeof st[k] === typeof SETDEF[k] && (!PREFOK[k] || PREFOK[k].indexOf(st[k]) >= 0)) d[k] = st[k]; } catch (e) { } return d; })();
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
function musicState(v) { if (!v) { MUS.target = 0; return; } var low = Math.min(v.you.hf, v.bot.hf), stand = v.contact && (v.you.marker === 1 || v.bot.marker === v.Z); MUS.target = Math.max(0, Math.min(1, (20 - low) / 20 * .55 + (v.contact ? .2 : 0) + (stand ? .3 : 0))); G.stand = stand; if (G.started && !G.over && !G.dir) setMood(moodOf(v), stand || v.round >= v.last); }   // v0.19.3: never in the opening's scene 3 (it kept Final Stand playing on the Main Menu)
function unlock() {
  try { if (!AC) audioInit(); if (AC && AC.state !== "running") AC.resume(); if (SND && AC) { SND.bless(); if (!G.sndLoad) { G.sndLoad = true; SND.preloadAll(); } if (!G.started && !G.view && !G.replay && !G.opening && !G.battleMus) setMood("menu", true); }
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
function drawCard(u, S, o) { o = o || {}; if (!o.meta) o.meta = G.meta; var f = u && !u.upfrom && (G.faces || {})[u.name]; if (f && f.upfrom) u = Object.assign({}, u, { upfrom: f.upfrom }); if (o.glance && f) u = Object.assign({}, f, u, { costn: u.costn != null ? u.costn : f.costn, cost: u.cost || f.cost }); return CF.draw(u, S, o, IMG); }   // v0.19.1: a table card lacks its cost; the glance face takes it from the card's face
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
  var per = n, s = Math.min(1, RW / (n * 1.4)), lines = 1, out = [];
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
function faceKey(e) { var u = e.u; return e.type === "contact" ? "contact" : e.type === "base" ? ["b", u.sup, u.dmg, u.dev, u.surv, u.conc, u.stock, u.ex, PREF.shapes].join("|") : ["c", u.name, u.dmg, u.ex, u.hidden, u.spot, u.surv, u.atkn, u.conc, e.side, G.assist, PREF.shapes, PREF.glance, u.dur].join("|"); }
function setFace(o, e) {
  var k = faceKey(e); if (k === o.key) return false; var old = o.mesh.material.map;
  o.mesh.material.map = e.type === "contact" ? staticT : tex(e.type === "base" ? drawBase(e.u, e.side) : drawCard(e.u, 1, { side: e.side, assist: G.assist && !PREF.glance, shapes: PREF.shapes, glance: PREF.glance }));
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
function dmgNum(o, txt, cls, dy) { if (G.skip) return; var p = screenPos(o.grp.position), d = document.createElement("div"); d.className = "dmg" + (cls ? " " + cls : ""); d.textContent = txt; d.style.left = p.x + "px"; d.style.top = (p.y + (dy || 0)) + "px"; document.body.appendChild(d); setTimeout(function () { d.remove(); }, cls ? 1900 : 1400); }
function sync(v, text) {
  if (v && v.terrain) TER.set(v.terrain);
  if (!v) return; var list = layout(v), seen = {}, destroyed = /destroyed/.test(text || "");
  list.forEach(function (e) {
    seen[e.uid] = 1; var o = O[e.uid], fresh = !o; if (!o) o = makeObj(e);
    var was = o.u, wasType = o.type; o.type = e.type; o.side = e.side; o.tx = e.x; o.tz = e.z; o.ts = e.s;
    if (!fresh && was) { var d = (e.u.dmg || 0) - (was.dmg || 0); if (d > 0) { dmgNum(o, "−" + d); o.jolt = 1; if (!G.skip) { SFX.thud(); if (e.side === "own") vox("hit", { delay: .3 }); } }
      if (e.type === "base") { var ds = (was.sup || 0) - (e.u.sup || 0); if (ds > 0) dmgNum(o, "−" + ds + " Supply", "sup", d > 0 ? 34 : 0); } }   // v0.20 (Patch 15, 60/40 payment): each Base shows its share as it pays
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
  tb = tb == null ? ($("top").offsetHeight || 0) : tb; botPx = botPx == null ? (FR ? H - FR.B : 0) : botPx;
  var mt = $("mtrack"), avail = H - tb - Math.max(botPx, H <= 520 && W >= 600 ? 74 : $("bot").offsetHeight) - 12;   /* v0.20.2: never down over the dock */ mt.style.top = Math.round(tb + 6 + avail / 2) + "px";
  mt.style.transform = "translateY(-50%)"; var mh = mt.offsetHeight, k = mh > avail && avail > 40 ? Math.max(.4, avail / mh) : 1; mt.style.transformOrigin = "left center"; mt.style.transform = "translateY(-50%)" + (k < 1 ? " scale(" + k.toFixed(3) + ")" : "");   // the Mission Track fits between the bars
  var wide = W >= 900 && H > 520; mt.style.left = wide ? "22px" : "";   // v0.19.2: on a desktop or laptop, in from the screen edge
  if (wide && !G.dir) try {   // v0.19.2: the line between the two H-Hours sits on the dashed centre line of the board (as near as the bars allow)
    var hr = mt.querySelector("hr"), ly = screenPos(new THREE.Vector3(0, .33, .15)).y, h0 = hr ? hr.offsetTop + 1 : mh / 2, lo = tb + 6, bot = H - Math.max(botPx, $("bot").offsetHeight) - 6;
    var k2 = Math.min(k, (ly - lo) / h0, (bot - ly) / Math.max(1, mh - h0)); if (k2 < .55) k2 = k;   // shrink a little more if that lets the H-Hour line meet the centre line
    var hiT = bot - mh * k2;
    if (hr && hiT >= lo) { mt.style.transformOrigin = "left top"; mt.style.transform = k2 < 1 ? "scale(" + k2.toFixed(3) + ")" : "none"; mt.style.top = Math.round(Math.max(lo, Math.min(hiT, ly - h0 * k2))) + "px"; }
  } catch (e) { }
  $("feed").style.left = (W >= 900 ? Math.round(mt.getBoundingClientRect().right + 10) : 8) + "px";
}
function uiScale() { var u = Math.max(1, Math.min(1.6, Math.min(innerWidth / 1400, innerHeight / 820))); document.documentElement.style.setProperty("--ui", u.toFixed(3)); }
/* v0.20.1 (Step 0b, reliable table fit): the table gets a measured "safe frame", the part of the screen left once the top bar, the bottom
   dock (hand, prompt or coach panel, your status) and the side rails (Mission Track, route) have taken their space. The camera fits the whole
   board into it and refits when it changes (at most once a frame, measured only on a change). Small changes are absorbed so the table does not
   twitch. If the frame would fall below MIN_TABLE of the screen height, the prompt or coach panel gives way (capped; it scrolls), not the table. */
var TABLE_FLOOR = .25, MIN_TABLE = .4, FR = null, FIT = null, LF = null, CAM = null, camEase = null, fitRaf = 0, fitHeld = false, _v = new THREE.Vector3();
var RW = LAND ? 11.5 : 6.2;   // the width of a row of cards on the table (world units): as wide as the frame allows without shrinking the board
function bxOf(rw) { return 3.3 + (rw - 6.2) * 2.9 / 5.3; }   // half the board's width for a row width (6.2 gives 3.3 and 11.5 gives 6.2, as before)
function capDock() {   // v0.20.2: sets the panel's fixed height for this screen, text size and kind of game; true when it was set anew
  var pr = $("prompt"), bot = $("bot"); if (!pr || !bot) return false;
  var key = W + "x" + H + "@" + PREF.text + "|" + (G.info && G.info.tutorial ? "t" : "g") + (G.pgen || 0);
  if (SQ.key === key) { keepBars(); promptCue(); return false; }
  SQ.key = G.view ? key : "";   // the bars are measured full: until the first view of a game is drawn, measure again next time
  setSq(0); ["top", "me"].forEach(function (id) { $(id).style.minHeight = ""; });
  if (isDesk()) { pr.style.height = ""; pr.style.maxHeight = ""; deskColumn(); keepBars(); promptCue(); return true; }   // v0.21 (WP10): on a desktop the panel is the right-hand commitment column
  var tut = !!(G.info && G.info.tutorial), minT = W < 600 && tut ? .34 : MIN_TABLE;   /* v0.21 (lead's phone notes 1): in Basic Training on a phone the lesson must read whole; the table gives up to 6% of the screen for it */
  var short = H <= 520 && W >= 600, desk = W >= 900 && H >= 521, ts = PREF.text * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui")) || 1), floor = Math.round(50 * ts + 44), room;
  for (;;) {   // a new size, text size or game: start uncompressed, then give way step by step until the table keeps its share
    var top = topEdge(true), other = short ? 8 : bot.offsetHeight - pr.offsetHeight;
    room = Math.floor(H - top - minT * H - other);
    if (room >= floor || SQ.n >= 3) break;
    setSq(SQ.n + 1);   // 1: the status rows compress; 2: the hand strip shrinks; 3: both go to their smallest
  }
  if (room < floor) floor = Math.max(Math.round(33 * ts + 44), Math.min(floor, room));   // the smallest screens: the panel goes down to its buttons and one line of text before the table gives way
  var tsc = Math.min(1.4, ts), design = short ? H * .46 : desk ? Math.min(230, Math.max(140, H * .2)) * tsc : Math.min(236, Math.max(140, H * .25)) * tsc;
  if (W < 600 && !(G.info && G.info.tutorial)) design = Math.round(2 * 21 * ts + 50 * tsc + 34);
  if (W < 600 && tut) design = Math.round(140 * tsc + 4 * 22.7 * ts + 30);   /* a 160-character lesson page: its kicker, a two-line title, four lines of text and the compact row of BACK, NEXT and More */   // v0.21 (Council M2): with no coach, the phone panel is two lines and its buttons; the height goes to the table
  var cap = Math.round(Math.min(H * (short ? .46 : .38), Math.max(floor, Math.min(design, room))));
  var two = W < 600 && !(G.info && G.info.tutorial) ? 0 : Math.round(2 * 46 * Math.min(1.4, ts) + 16 * ts + 44); cap = Math.round(Math.min(H * (short ? .46 : .38), Math.max(cap, Math.min(room, two))));
  cap = Math.max(60, Math.min(cap, Math.floor(H - top - TABLE_FLOOR * H - other)));   // the stated floor: whatever the screen and text size, the table keeps at least a quarter of the height   // v0.21: room for two rows of pinned buttons from the start when the table can spare it, so the panel need not grow mid-game
  pr.style.height = cap + "px"; pr.style.maxHeight = cap + "px"; pr.dataset.cap = String(cap); pr.dataset.grown = ""; listGrow(pr);
  var me = $("me"); if (me) me.style.maxHeight = short ? cap + "px" : "";   // landscape phones: the dock is one row, so no part of it may be taller than the panel
  keepBars(); promptCue(); return true;
}
/* v0.20.2: the bars keep their height during play (Prototype Design Spec 3), so the table does not breathe from turn to turn. The panel has a
   fixed height for each screen size, text size and kind of game; its text scrolls inside it and its buttons are pinned at its foot. The top
   bar and your status bar may grow (a longer line wraps) but never shrink back while the game goes on. When the table would fall under its
   share, the bars give way in this order: the event feed becomes one line, the status rows compress (short labels, one size of counter
   text), then the hand strip shrinks. */
var SQ = { n: 0, key: "" };
function setSq(n) { var de = document.documentElement; SQ.n = n; de.classList.toggle("sq1", n >= 1); de.classList.toggle("sq2", n >= 2); de.classList.toggle("sq3", n >= 3); }
function keepBars() { ["top", "me"].forEach(function (id) { var e = $(id), h = e && e.offsetHeight; if (h && h > (parseFloat(e.style.minHeight) || 0)) e.style.minHeight = h + "px"; }); if (isDesk()) deskColumn();
  var pr = $("prompt"), ft = pr && pr.querySelector(".pfoot"), cap = pr && +pr.dataset.cap; if (pr && isPh() && !isDesk() && !(G.info && G.info.tutorial)) panelFit(pr); else if (ft && cap) {   /* RC2.3: on a phone, panelFit sizes the panel and its foot */ var tsz = PREF.text * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui")) || 1), need = ft.scrollHeight, one = Math.round(16 * tsz + 22);
    var spare = FR ? Math.floor((FR.B - FR.T) - MIN_TABLE * H) : 0;
    var rows2 = need > 80 * Math.min(tsz, 1.4); if ((need > cap - 24 || rows2 && need > cap - 2 * one - 16) && cap < H * .5 && spare > 4) { var nc = Math.round(Math.min(H * .5, need + (rows2 ? 2 : 1) * one + 24, cap + spare));   /* RC2: with two rows of buttons (such as the trial's WITHDRAW under Done deploying), room for two lines of the question, not one */   /* v0.21 (checkers): room for the buttons and at least one line of the question, so the question never vanishes behind its own buttons */ pr.style.height = pr.style.maxHeight = nc + "px"; pr.dataset.cap = String(nc); cap = nc; requestFit(); }   // the smallest screens: the panel grows (once, never back) until its buttons fit; the table gives way, never a choice
    ft.style.maxHeight = Math.round(Math.max(48, need > cap - one ? cap - 24 : cap - one)) + "px"; }   // v0.21: the pinned buttons may take all but one line of the body, and on the smallest screens the whole panel: no choice is ever cut off
  if (pr && !(pr.querySelector(".pbody") || {}).scrollTop) requestAnimationFrame(function () { unslice(pr.querySelector(".pbody"), pr.classList.contains("more") || pr.querySelector(".pfoot .pmore") ? 0 : 28); promptCue(); });
  document.documentElement.classList.toggle("tight", (W < 420 && PREF.text >= 1.5) || (H < 420 && W < 600)); }   // narrow and large text: Undo and Hint become icons (their names stay as labels)   // v0.21: the pinned buttons may take all but one line of the body, so no choice is ever cut off
function feedLine() { return W < 900 ? Math.round(12 * PREF.text * 1.25 + 12) : 0; }   // on narrow screens the feed shows one line over the table's top edge: that line is kept free
function topEdge(feed) {   // below the top bar, below the menu buttons where they reach down over the table and, with feed, below the feed's one line (narrow screens)
  var tb = $("top").offsetHeight || 0, tl = Math.max($("bWin").getBoundingClientRect().bottom, $("bMenu").getBoundingClientRect().bottom), T = Math.max(tb, tl ? tl + 4 : 0);
  if (feed) T = Math.max(T, tb - 6 + feedLine());
  return T;
}
function measureFrame() {   // the safe frame, in screen pixels
  var tb = $("top").offsetHeight || 0, T = topEdge(true), B = Math.min(H, $("bot").getBoundingClientRect().top), L = 0, R = W;
  if (isPh()) { var hr0 = $("hand").getBoundingClientRect(), cap0 = +$("prompt").dataset.cap, gap0 = parseFloat(getComputedStyle($("bot")).rowGap) || 6; if (cap0 && hr0.height) B = Math.min(H, Math.round(hr0.top - gap0 - cap0)); }   /* v0.21: on a phone the table's foot is where the panel's top is with the hand tucked, whatever the drawer and panel are doing, so the table never moves for them */
  if (B - T < MIN_TABLE * H && !isPh()) T = Math.min(T, Math.max(topEdge(false), B - MIN_TABLE * H));   /* v0.21 (lead's phone notes): on a phone the event line keeps its own strip, so it never lies over the enemy's cards */   // the feed's line gives way when the table would get too small (large text on a phone)
  var mt = $("mtrack"), em = mt.querySelector("em"), rt = $("route"), cs = rt.querySelector(".ctst");
  if (mt.offsetWidth) L = Math.max(mt.getBoundingClientRect().right, em ? em.getBoundingClientRect().right : 0) + 4;
  if (rt.offsetWidth) R = Math.min(rt.getBoundingClientRect().left, cs ? cs.getBoundingClientRect().left : W) - 4;
  if (isDesk()) { var pq = $("prompt").getBoundingClientRect(); if (pq.width) R = Math.min(R, pq.left - 8); }
  if (R - L < 120) { L = 0; R = W; }
  if (B < T + 1) B = T + 1;   // v0.20.2: never stretch the frame under a bar; a tiny table is better than a card under the dock
  return { T: T, B: B, L: L, R: R, tb: tb };
}
function elev() { return (LAND ? (window.__ELL || (H <= 520 ? 56 : 60)) : W < 600 ? (window.__EL || 42) : (window.__ELD || 66)) * Math.PI / 180; }   // v0.21: a phone held upright looks along the table at a lower angle, so the rows (not the empty ground) fill its height and cards read larger
function camPut(el, d, ox, oy) { camBase.set(0, Math.sin(el) * d, Math.cos(el) * d); camera.position.copy(camBase); camera.lookAt(camTarget); camera.setViewOffset(W, H, ox, oy, W, H); camera.updateMatrixWorld(); scene.fog.near = d + 4; scene.fog.far = d + 20; CAM = { el: el, d: d, ox: ox, oy: oy }; }
function boxAt(bx, bz) { var b = { l: 1e9, r: -1e9, t: 1e9, b: -1e9 }; [[-bx, -bz], [bx, -bz], [-bx, bz], [bx, bz]].forEach(function (p) { _v.set(p[0], .4, p[1]).project(camera); var x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H; b.l = Math.min(b.l, x); b.r = Math.max(b.r, x); b.t = Math.min(b.t, y); b.b = Math.max(b.b, y); }); return b; }
function unitW(z) { _v.set(-.5, .42, z).project(camera); var x0 = _v.x; _v.set(.5, .42, z).project(camera); return Math.abs(_v.x - x0) / 2 * W; }   // how wide one world unit looks at depth z (the card rows), for the current camera
function distFor(el, bx, bz, fw, fh) { var lo = 8, hi = 400; for (var i = 0; i < 26; i++) { var d = (lo + hi) / 2; camPut(el, d, 0, 0); var b = boxAt(bx, bz); if (b.r - b.l <= fw && b.b - b.t <= fh) hi = d; else lo = d; } return hi; }
function fit(soft) {   // soft: ease to the new fit (a panel grew or shrank); otherwise jump (game start, resize, rotation, Settings)
  var vw = innerWidth, vh = innerHeight, resized = vw !== W || vh !== H || !FIT, was = CAM && { el: CAM.el, d: CAM.d, ox: CAM.ox, oy: CAM.oy };   // where the camera is now (the search below moves it)
  uiScale(); W = vw; H = vh; LAND = W > H * 1.05; document.documentElement.classList.toggle("ph", W < 600); document.documentElement.classList.toggle("desk", W >= 900 && H >= 521); /* v0.21 (WP9, WP10): phone upright: the hand is a drawer; desktop: the commitment column */ var meEl = $("me"), meIn = W < 600 ? $("top") : $("bot"); if (meEl && meEl.parentNode !== meIn) { meIn.appendChild(meEl); SQ.key = ""; }   /* v0.21 (Council M2b, spec 3.1): on a phone held upright your status row joins the top band, under the enemy's, and the hand sits at the bottom edge */ if (resized) { renderer.setSize(W, H, false); camera.aspect = W / H; } camTarget.set(0, 0, 0);
  capDock(); var f = measureFrame(); placeTrack(f.tb, H - f.B); f = measureFrame();   // the Mission Track's height follows the frame; the frame's left edge follows the Mission Track
  var pad = 4, bz = 6.5, fw = Math.max(20, f.R - f.L - 2 * pad), fh = Math.max(20, f.B - f.T);
  var solve = function (el) { var dn = distFor(el, bxOf(6.2), bz, fw, fh), rw = 11.5;
    if (distFor(el, bxOf(11.5), bz, fw, fh) > dn * 1.002) { var a = 6.2, b = 11.5; for (var i = 0; i < 12; i++) { var m = (a + b) / 2; if (distFor(el, bxOf(m), bz, fw, fh) <= dn * 1.002) a = m; else b = m; } rw = Math.floor(a * 10) / 10; }   // rows as wide as the frame takes without making the board smaller
    var d = distFor(el, bxOf(rw), bz, fw, fh); camPut(el, d, 0, 0); return { el: el, rw: rw, d: d, w: Math.min(unitW(-4.12), unitW(4.12)) }; };
  /* v0.21 (lead's phone notes 3): readability first. Of the angles from nearly straight down to 42 degrees, the camera takes the most top-down one
     whose smallest card (the far rear row) is within 3% of the largest that any angle allows: both sides' cards as equal and as large as the
     space allows, and only as much tilt as buys legibility. The same rule on phones held sideways and on desktops. */
  var pick = null; if (window.__EL) pick = solve(elev()); else { var tries = [80, 74, 68, 62, 56, 50, 46, 42].map(function (e) { return solve(e * Math.PI / 180); }), best = Math.max.apply(0, tries.map(function (t) { return t.w; })); pick = tries.filter(function (t) { return t.w >= best * .97; })[0]; }
  var el = pick.el, rw = pick.rw, bx = bxOf(rw), d = pick.d; camPut(el, d, 0, 0); var bb = boxAt(bx, bz), hw = (bb.r - bb.l) / 2, cx = W / 2;
  if (cx - hw < f.L + pad) cx = f.L + pad + hw; if (cx + hw > f.R - pad) cx = f.R - pad - hw;   // centred on the screen unless that puts it under a rail
  var to = { el: el, d: d, ox: (bb.l + bb.r) / 2 - cx, oy: (bb.t + bb.b) / 2 - (f.T + f.B) / 2 }, from = was && was.el === el ? was : null;
  RW = rw; camPut(el, to.d, to.ox, to.oy); FR = f; LF = f; FIT = { frame: f, content: boxAt(Math.max(rw / 2, 2.45), 6.3) };   // content: the cards and Bases, without the board's margin
  $("route").style.top = Math.round((f.T + f.B) / 2) + "px";   // v0.20.2: the route sits level with the table's middle, never over the hand
  $("feed").style.top = Math.max(W < 600 ? 62 : 58, f.tb - 6) + "px"; placeTrack(f.tb, H - f.B); if (!$("preview").classList.contains("sheet")) $("preview").style.bottom = (H - f.B + 14) + "px";   // with the final view, so the H-Hour line meets the board's centre line
  camEase = null; var sp = $("spots");
  if (soft && !resized && from && !G.dir && !G.rm && (Math.abs(from.d - to.d) > .01 || Math.abs(from.ox - to.ox) > .5 || Math.abs(from.oy - to.oy) > .5)) { camPut(from.el, from.d, from.ox, from.oy); camEase = { t: 0, a: from, b: to }; if (sp) sp.style.visibility = "hidden"; }   // the outlines come back when the camera arrives
  else if (sp) sp.style.visibility = "";
  if (G.dir) camera.clearViewOffset();
  G.fitN = (G.fitN || 0) + 1;
  if (G.view) sync(G.view);
}
function camStep(raw) {   // the eased refit (about 250 ms; reduced motion jumps instead)
  var e = camEase; if (!e) return; if (G.dir) { camEase = null; return; }
  e.t = Math.min(1, e.t + raw / .25); var k = ease(e.t), a = e.a, b = e.b; camPut(b.el, a.d + (b.d - a.d) * k, a.ox + (b.ox - a.ox) * k, a.oy + (b.oy - a.oy) * k);
  if (e.t >= 1) { camEase = null; var sp = $("spots"); if (sp) { sp.dataset.k = ""; sp.style.visibility = ""; } try { spotlight(); } catch (er) { } }
}
function requestFit() { if (!fitRaf) fitRaf = requestAnimationFrame(fitCheck); }
function fitCheck() {   // has the safe frame changed enough to refit?
  fitRaf = 0;
  if (innerWidth !== W || innerHeight !== H || !FIT) { if (drag) dragCancel(); fit(); try { spotlight(); } catch (e) { } return; }   // resize or rotation: what was under the finger has moved, so a drag is cancelled
  if (G.dir) return;
  if (drag) { fitHeld = true; return; }   // never move the table under a dragged card: refit when it is dropped
  var anew = capDock(), f = measureFrame(), o = LF, moved = Math.abs(f.T - o.T) + Math.abs(f.B - o.B) + Math.abs(f.L - o.L) + Math.abs(f.R - o.R) > 2; if (!moved && !anew) return;
  if (moved) { placeTrack(f.tb, H - f.B); f = measureFrame(); LF = f; }
  var c = FIT.content, covered = c.t < f.T - 1 || c.b > f.B + 1 || c.l < f.L - 1 || c.r > f.R + 1;
  if (covered || anew) return fit(true);   // a bar now covers a card, or a new kind of game set the panel anew: ease to the new fit. More room mid-game is never taken, so the table stays still
  FR = f; $("route").style.top = Math.round((f.T + f.B) / 2) + "px"; if (!$("preview").classList.contains("sheet")) $("preview").style.bottom = (H - f.B + 14) + "px"; G.fitN = (G.fitN || 0) + 1; try { spotlight(); } catch (e) { }
}
function objRect(o) { var w = (o.type === "base" ? BW : CW) * o.ts / 2, h = (o.type === "base" ? BH : CH) * o.ts / 2, xs = [], ys = []; [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { var q = screenPos(new THREE.Vector3(o.tx + c[0] * w, .42, o.tz + c[1] * h)); xs.push(q.x); ys.push(q.y); }); return { l: Math.min.apply(null, xs), r: Math.max.apply(null, xs), t: Math.min.apply(null, ys), b: Math.max.apply(null, ys) }; }
function fitInfo() { return { frame: FR, rw: RW, content: FIT && FIT.content, cap: $("prompt").style.maxHeight, easing: !!camEase, objs: Object.keys(O).map(function (k) { var o = O[k]; return { uid: k, side: o.side, type: o.type, name: o.u && o.u.name, r: objRect(o) }; }) }; }   // for testing: where the frame is and where each card lies on the screen
addEventListener("resize", function () { fitCheck(); });
if (window.visualViewport) try { visualViewport.addEventListener("resize", requestFit); } catch (e) { }
if (window.ResizeObserver) try { var fitRO = new ResizeObserver(function () { requestFit(); }); ["top", "bot", "prompt", "hand", "me", "mtrack", "route", "feed"].forEach(function (id) { fitRO.observe($(id)); }); } catch (e) { }
if (document.fonts) try { document.fonts.addEventListener("loadingdone", requestFit); document.fonts.ready.then(requestFit); } catch (e) { }

/* ================= what the player can do right now ================= */
function maps() {
  var v = G.view, pend = G.pend, M = { src: {}, card: {}, free: [], dsts: {}, sups: {}, selOpts: [] }; if (!v || !pend) return M;
  var meta = pend.meta || [], onBoard = {}, inHand = {};
  [v.you, v.bot].forEach(function (p) { p.front.concat(p.rear).forEach(function (u) { onBoard[u.uid] = 1; }); p.bases.forEach(function (b) { onBoard[b.uid] = 1; }); });
  (v.you.hand || []).forEach(function (c) { inHand[c.id] = 1; });
  var co = pend.coach, al = co && co.allow; if (co && !coachReady(pend)) return M;
  pend.options.forEach(function (o, i) { if (al && al.indexOf(i) < 0) return; var m = meta[i] || {}; if (m.src && onBoard[m.src]) (M.src[m.src] = M.src[m.src] || []).push(i); else if (m.card && inHand[m.card] && pend.kind !== "target") (M.card[m.card] = M.card[m.card] || []).push(i); else M.free.push(i); });
  M.selOpts = G.sel ? (M.src[G.sel] || M.card[G.sel] || []) : [];
  M.selOpts.forEach(function (i) { var m = meta[i] || {}; if (G.selT && m.t !== G.selT) return; if (m.dst) (M.dsts[m.dst] = M.dsts[m.dst] || []).push(i); (m.sup || []).forEach(function (x) { M.sups[x] = 1; }); });   // v0.21: targeting for one kind of move (Inspector: ATTACK…) rings only its targets
  return M;
}
function findUnit(uid) { var v = G.view, r = null; if (!v) return null; [v.you, v.bot].forEach(function (p) { p.front.concat(p.rear).concat(p.bases).forEach(function (u) { if (u.uid === uid) r = u; }); }); return r; }
function selName() { var u = findUnit(G.sel); if (u) return u.name; var c = (G.view.you.hand || []).filter(function (c) { return c.id === G.sel; })[0]; return c ? c.name : ""; }
function reasonFor(name) { var n = (G.pend && G.pend.notes) || []; for (var i = 0; i < n.length; i++) if (n[i].indexOf(name + " ") === 0 || n[i].indexOf(name + ":") === 0 || n[i].indexOf("Hidden " + name + " ") >= 0) return n[i]; return ""; }

/* ================= HUD ================= */
var lastHf = {};
function stat(p, own) {
  var hit = lastHf[own] != null && p.hf < lastHf[own]; lastHf[own] = p.hf;
  if (own) document.body.classList.toggle("trial", !!(G.view && +G.view.table_cap > 0));   /* RC2: with the trial's table count in the row, a phone drops the concept name and the Homefront bar there (both stay in the status sheet), so More stays on screen */
  var pips = ""; if (own) { for (var i = 0; i < 10; i++) pips += '<span class="' + (i < p.isr ? "on" : "") + '"></span>'; }
  var sp = G.info && G.info.spectate;
  return '<span class="who t">' + (sp ? esc(p.concept) : own ? "You" : "Bot") + "<small>" + (sp ? (own ? "south" : "north") : esc(p.concept)) + "</small></span>" +
    '<span class="hf' + (hit ? " hit" : "") + '"><span class="l">Homefront</span><span class="s">HF</span><b>' + p.hf + '</b><i><u style="width:' + Math.max(0, Math.min(100, p.hf * 5)) + '%"></u></i></span>' +
    "<span class='c-isr'>ISR<b>" + p.isr + "</b>" + (own ? '<span class="pips x">' + pips + "</span>" : "") + "</span><span class='c-sup'><span class='l'>Supply</span><span class='s'>Sup</span><b>" + p.sup + "</b></span>" +
    (own ? "<span class='x'>Lift<b>" + p.lift + "</b></span><span class='x'>Span<b>" + p.span + "</b></span>" : "<span class='x'>Hand<b>" + p.hand_count + "</b></span>") +
    (G.view && +G.view.table_cap > 0 && p.table != null ? "<span class='c-tbl" + (p.table >= +G.view.table_cap - 1 ? " full" : "") + "' aria-label='Cards on the table, " + p.table + " of " + G.view.table_cap + "'><span class='l'>On table</span><span class='s'>Table</span><b>" + p.table + "/" + G.view.table_cap + "</b></span>" : "") + "<span class='x'><span class='l'>Strength</span><span class='s'>Str</span><b>" + p.strength + '</b></span><button type="button" class="sbtn" aria-expanded="false" aria-label="All the numbers and piles, both sides">More</button>' + (p.piles ? '<button class="piles x" id="' + (own ? "hudPiles" : "hudPilesFoe") + '" title="' + (own ? "Your" : "The enemy's") + ' discard pile, Ash Heap and decks"><span class="l">Deck<b>' + (p.ie + p.deck) + "</b> Discard<b>" + p.discard + "</b> Ash Heap<b>" + p.ash + '</b></span><span class="s">Discard<b>' + p.discard + "</b> Ash<b>" + p.ash + "</b></span></button>" : "<span class=\"l\">Deck<b>" + (p.ie + p.deck) + "</b></span>");
}
function pileThumbs(names, counts) {
  if (!names.length) return '<p class="pe">Empty.</p>'; var F = G.faces || {};
  return '<div class="pt">' + names.map(function (n) { var f = F[n]; if (!f) return '<span class="pn">' + esc(n) + "</span>"; var k = "pile:" + n; if (!handCv[k]) try { handCv[k] = drawCard(f, 1, { hand: true }).toDataURL("image/jpeg", .85); } catch (e) { return '<span class="pn">' + esc(n) + "</span>"; }
    return '<button data-pc="' + esc(n) + '" title="' + esc(n) + '"><img draggable="false" src="' + handCv[k] + '" alt="' + esc(n) + '">' + (counts && counts[n] > 1 ? "<i>×" + counts[n] + "</i>" : "") + "</button>"; }).join("") + "</div>"; }
function tally(list) { var c = {}, order = []; (list || []).forEach(function (n) { if (!c[n]) { c[n] = 0; order.push(n); } c[n]++; }); return { c: c, order: order }; }
function showPiles(side) { SFX.open();
  var v = G.view; if (!v) return; side = side === "bot" ? "bot" : "you"; var p = v[side], pl = p.piles || {}, el = $("piles"), mine = side === "you", sp = G.info && G.info.spectate, nm = (G.info && G.info.names) || ["You", "The bot"];
  var lab = function (k) { return sp ? nm[k === "you" ? 0 : 1] : k === "you" ? "Yours" : "The enemy's"; }, ie = tally(pl.ie), mf = tally(pl.mf);
  el.innerHTML = '<div class="pb"><div class="shead"><button class="ghost" id="pilesX">Close</button></div><h3 class="t">Discard piles and Ash Heaps</h3><p class="pd">Round ' + v.round + ". Both players' piles are face up. Tap a card to read it.</p>" +
    '<div class="psw" role="tablist">' + ["you", "bot"].map(function (k) { return '<button role="tab" aria-selected="' + (k === side) + '" class="' + (k === side ? "on" : "") + '" data-side="' + k + '">' + esc(lab(k)) + "</button>"; }).join("") + "</div>" +
    "<h4>Discard pile <b>" + p.discard + "</b></h4><p class=\"pd\">Played and discarded cards, newest first. When the Main Force runs out, this pile is shuffled to make a new one.</p>" + pileThumbs(pl.discard || []) +
    "<h4>Ash Heap <b>" + p.ash + "</b></h4><p class=\"pd\">Destroyed and expended cards, newest first. They never return.</p>" + pileThumbs(pl.ash || []) +
    "<h4>Still in " + (sp ? "the" : mine ? "your" : "their") + " decks <b>" + (p.ie + p.deck) + "</b></h4>" +
    (pl.mf ? '<p class="pd">In no particular order. Cards are drawn from Initial Entry until it is empty, then from the Main Force.</p>' + (p.ie ? "<h5>Initial Entry " + p.ie + "</h5>" + pileThumbs(ie.order, ie.c) : "") + "<h5>Main Force " + p.deck + "</h5>" + pileThumbs(mf.order, mf.c)
      : '<p class="pd">Initial Entry ' + p.ie + ", Main Force " + p.deck + ". Which cards they are stays secret.</p>") + "</div>";
  el.style.display = "block"; el.scrollTop = 0; }
/* v0.21 (WP9): on a phone the status bars show Homefront, ISR and Supply; "More" opens this sheet with every number and both sides' piles */
function showStatus() { var v = G.view; if (!v) return; SFX.open(); var el = $("piles"), clean = function (h) { return h.replace(/ id="hudPiles(Foe)?"/g, function (m, f) { return ' data-pside="' + (f ? "bot" : "you") + '"'; }); };
  el.innerHTML = '<div class="pb"><div class="shead"><button class="ghost" id="pilesX">Close</button></div><h3 class="t">Status</h3><p class="pd">Round ' + v.round + " of " + v.last + " · " + esc(v.phase) + ".</p>" + (+v.table_cap > 0 && v.you.table != null ? '<p class="pd">Table: you ' + v.you.table + "/" + v.table_cap + ", the enemy " + v.bot.table + "/" + v.table_cap + " (trial rule).</p>" : "") + "<h4>" + ((G.info && G.info.spectate) ? "North" : "The enemy") + '</h4><div class="stat full">' + clean(stat(v.bot, 0)) + "</div><h4>" + ((G.info && G.info.spectate) ? "South" : "You") + '</h4><div class="stat full mine">' + clean(stat(v.you, 1)) + "</div></div>";
  el.style.display = "block"; el.scrollTop = 0; }
document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".sbtn") && !e.target.closest("#piles")) { showStatus(); Array.prototype.forEach.call(document.querySelectorAll(".sbtn"), function (b) { if (!b.closest("#piles")) b.setAttribute("aria-expanded", "true"); }); } });
function statusClosed() { Array.prototype.forEach.call(document.querySelectorAll(".sbtn"), function (b) { b.setAttribute("aria-expanded", "false"); }); }
$("piles").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; if (b.id === "pilesX") { $("piles").style.display = "none"; statusClosed(); return; } if (b.dataset.pside) return showPiles(b.dataset.pside); if (b.classList.contains("sbtn")) return; if (b.dataset.side) return showPiles(b.dataset.side); var n = b.dataset.pc, f = n && (G.faces || {})[n]; if (f) zoom(f, { hand: true }); });
document.addEventListener("click", function (e) { if (!e.target.closest) return; if (e.target.closest("#hudPiles")) showPiles("you"); else if (e.target.closest("#hudPilesFoe")) showPiles("bot"); });
function trackCol(p, own) { var order = own ? [0, 1, 2, 3] : [3, 2, 1, 0], h = ""; order.forEach(function (n) { var cs = p.track.map(function (t, i) { return { t: t, i: i }; }).filter(function (x) { return n === 0 ? x.t.space <= 0 : n === 3 ? x.t.space >= 3 : x.t.space === n; });
    h += '<div class="ms' + (n === 0 ? " hh" : "") + '"><i>' + (n === 0 ? "H" : n) + "</i>" + cs.map(function (x) { var tp = TPL[x.t.cls] || TPL.JOINT; return '<span data-tr="' + x.i + '" data-own="' + own + '" style="border-color:' + tp[0] + ";background-image:url(" + (ART[x.t.id] || "") + ')"><b>' + esc(x.t.name) + "</b></span>"; }).join("") + "</div>"; }); return h; }
function winTrack() {   // the four ways to win, from the board as it stands (rules: engine Assessment; see the rulebook, Winning)
  var el = $("wint"), v = G.view; if (!el || el.style.display !== "block" || !v) return;
  var I = G.info || {}, hf0 = I.hf0 || 20, last = I.last || v.last || 8, y = v.you, b = v.bot, Z = v.Z || 5;
  var bar = function (cls, who, val, max, txt) { return '<div class="wbar ' + cls + '"><span>' + who + "</span><i><em style=\"width:" + Math.max(0, Math.min(100, 100 * val / max)) + '%"></em></i><u>' + txt + "</u></div>"; };
  var roomY = Math.abs((y.marker || 1) - 1), roomB = Math.abs(Z - (b.marker || Z)), devY = (y.bases || []).filter(function (x) { return x.dev; }).length, devB = (b.bases || []).filter(function (x) { return x.dev; }).length, nb = Math.max((y.bases || []).length, 1);
  var lead = y.hf === b.hf ? "the Homefronts are level" : (y.hf > b.hf ? "you lead by " + (y.hf - b.hf) : "the bot leads by " + (b.hf - y.hf));
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
  var mt = "<em>MISSION TRACK</em>" + trackCol(v.bot, 0) + '<hr>' + trackCol(v.you, 1); if ($("mtrack").dataset.h !== mt) { $("mtrack").innerHTML = mt; $("mtrack").dataset.h = mt; }
  $("phase").innerHTML = '<span class="pm"><span class="rl">Round ' + v.round + " of " + v.last + '</span><span class="rs">R' + v.round + "/" + v.last + "</span> · " + esc(v.phase) + "</span><small>" + (v.contact ? '<i class="sep"> · </i>IN CONTACT' : "") + '<i class="sep"> · </i>' + esc(v.terrain) + "</small>"; $("phase").title = "Round " + v.round + " of " + v.last + " · " + v.phase + (v.contact ? " · IN CONTACT" : "") + " · " + v.terrain;   // v0.21 (checkers): Contact first, so on a phone's two fixed lines it is never the part cut off
  var h = ""; for (var z = v.Z; z >= 1; z--) { var c = (v.Z + 1) / 2 === z, k = v.you.marker === z && v.bot.marker === z; h += '<div class="' + (k ? "k" : c ? "c" : "") + '">' + (v.bot.marker === z ? '<span class="f">▼</span>' : "") + (v.you.marker === z ? '<span class="o">▲</span>' : "") + "</div>"; }
  var ct = v.contact ? '<p class="ctst" title="Frontline contest at Assessment: higher Frontline Strength wins; on a tie, more different Classes in the Frontline wins.">CONTEST<b class="f">' + v.bot.strength + '</b><i>vs</i><b class="o">' + v.you.strength + "</b><em>" + (v.you.strength > v.bot.strength ? "you lead" : v.you.strength < v.bot.strength ? "you trail by " + (v.bot.strength - v.you.strength) : "tied") + "</em></p>" : "";
  $("route").innerHTML = ct + "<span>ENEMY</span>" + h + "<span>YOU</span>"; $("route").classList.toggle("live", !!(G.pend && !G.playing && G.pend.kind === "maneuver"));
  frontLine.material.color.set(v.contact ? 0xff6a4a : 0xe0a85a);
}
var handKey = "", handCv = {};
function hand() {
  var v = G.view, M = maps(), hs = (v && v.you.hand) || [], key = hs.map(function (c) { return c.id + (c.held ? "h" : ""); }).join(",") + "|" + Object.keys(M.card).join(",") + "|" + G.sel + "|" + (G.playing ? 1 : 0);
  key += "|" + (G.multi ? JSON.stringify(G.multi.picked) : "") + "|" + W + "x" + H + "|" + (G.pend && isMulti(G.pend) ? G.pend.n : ""); if (key === handKey) { drawerAuto(); return; } handKey = key; var hand0 = $("hand"), keepX = hand0.querySelector(".strip") ? hand0.querySelector(".strip").scrollLeft : 0; hand0.innerHTML = ""; var el = document.createElement("div"); el.className = "strip"; hand0.appendChild(el); var hi0 = 0;
  hs.forEach(function (c, hix) { if (c.held) { hi0++; return; } var k = c.id + c.name + (PREF.glance ? "|g" : ""); if (!handCv[k]) handCv[k] = drawCard(c, 1, { hand: true, glance: PREF.glance }).toDataURL("image/jpeg", .85); var im = new Image(); im.src = handCv[k]; im.alt = c.name; im.dataset.card = c.id;
    var hi = hi0++, blf = M.card[c.id] && bluffOnly(c.id, M); if (M.card[c.id] && !G.playing && !blf) im.className = "can"; if (G.sel === c.id) im.className = "sel"; if (G.multi && G.multi.picked.some(function (x) { return x.id === c.id && x.ix === hi; })) im.className = "sel";
    im.dataset.ix = hi; im.draggable = false; im.tabIndex = 0; im.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapHand(c, hi); } }); im.setAttribute("role", "button"); im.setAttribute("aria-label", c.name + (M.card[c.id] && !G.playing ? (blf ? ", can only be deployed face down as a decoy" : ", can be played") : "") + ". Tap to read it"); im.addEventListener("pointerdown", function (e) { peekHide(); handDown(e, c, hi, im); }); im.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && !e.buttons) handPeek(im, c); }); im.addEventListener("pointerleave", peekHide); im.oncontextmenu = function (e) { e.preventDefault(); if (rightCancel()) return; readCard(c, hi); };   /* v0.20.2: right-click cancels a selection, otherwise reads the card. v0.21: a tap is read on the pointer's up (input section) */ el.appendChild(im); });
  hand0.insertAdjacentHTML("beforeend", '<button type="button" class="hnav l" aria-label="Scroll the hand left">‹</button><button type="button" class="hnav r" aria-label="Scroll the hand right">›</button><button type="button" class="hhandle" aria-expanded="false"></button>');
  drawerFit(el); el.scrollLeft = keepX; drawerAuto(); readyTabs(el, M);
  if (G.pend && !G.playing && isMulti(G.pend)) pickHand(el, M);
}
/* v0.21 (WP9, spec 2): on a phone held upright the hand is a drawer. Tucked, it is a 48 px handle ("HAND 6 · 3 READY") under the table; open,
   its cards are 132 px tall in a strip that scrolls sideways, laid over the foot of the table, so the table never moves for it. It opens by
   itself when the decision has a playable hand card, tucks when the decision is on the table, during the bot's turn and when a card is lifted;
   the player can open or tuck it with the handle, and that holds until the next decision. Elsewhere the hand is the dock, as before. */
/* v0.21 (WP10, spec 3.3): on a desktop or laptop the prompt, the coach and the attack preview live in a commitment column on the right, from
   under the top bar to above your status bar, with its buttons pinned at its foot; the hand dock sits between the Mission Track and the column */
function isDesk() { return document.documentElement.classList.contains("desk"); }
function deskColumn() { var de = document.documentElement, top = Math.round(($("top").offsetHeight || 0) + 10), me = $("me"), bot = Math.round((me ? me.offsetHeight : 40) + 14), w = Math.round(Math.min(380, Math.max(300, W * .25)));
  de.style.setProperty("--colTop", top + "px"); de.style.setProperty("--colBot", bot + "px"); de.style.setProperty("--colW", w + "px"); var pr = $("prompt"); if (pr) pr.dataset.cap = String(Math.max(160, H - top - bot)); }
/* v0.21 (Council M3): a card that can act now carries a tab that names its move (DEPLOY, PLAY, REACT, UPGRADE), by shape and text, not by
   glow alone; in a decision, a card that cannot act is dimmed but stays readable */
function bluffOnly(id, M) { var ii = (M && M.card[id]) || [], p = G.pend; return !!(p && ii.length && ii.every(function (i) { var m = (p.meta || [])[i] || {}; return m.t === "hide" && /decoy/.test(p.options[i]); })); }   /* RC2 (Council F2): a card whose only move now is to go face down as a decoy: no DEPLOY tab, not counted as ready */
function readyTabs(strip, M) {
  var live = liveDecision() && !isMulti(G.pend), verb = function (id) { var i0 = (M.card[id] || [])[0], t = ((G.pend.meta || [])[i0] || {}).t, l = i0 != null ? G.pend.options[i0] : "", rl = (l.match(/\((\d+) Supply, \d+ less: relief/) || [])[1]; return t === "dep" || t === "hide" ? (rl ? "DEPLOY " + rl + "↓" : "DEPLOY") : t === "effect" ? "PLAY" : t === "react" ? "REACT" : t === "up" ? "UPGRADE" : t === "card" ? "AIR ASSAULT" : "READY"; };
  Array.prototype.forEach.call(strip.querySelectorAll("img[data-card]"), function (im) { var id = im.dataset.card, ok = live && M.card[id] && !G.playing; im.classList.toggle("cant", !!(live && !ok));
    if (ok && bluffOnly(id, M)) { var td = document.createElement("span"); td.className = "rdy full"; td.textContent = "DECOY"; td.setAttribute("aria-hidden", "true"); td.dataset.ix = im.dataset.ix; strip.appendChild(td); return; }
    if (!ok) { if (live && G.pend.kind === "deploy" && tableFull() && isCap((G.faces || {})[im.alt] || {})) { var tf0 = document.createElement("span"); tf0.className = "rdy full"; tf0.textContent = "TABLE FULL"; tf0.setAttribute("aria-hidden", "true"); tf0.dataset.ix = im.dataset.ix; strip.appendChild(tf0); } return; } var t = document.createElement("span"); t.className = "rdy"; t.textContent = verb(id); t.setAttribute("aria-hidden", "true"); t.dataset.ix = im.dataset.ix; strip.appendChild(t); });
  placeTabs(strip); Array.prototype.forEach.call(strip.querySelectorAll("img"), function (im) { if (!im.complete) im.addEventListener("load", function () { drawerFit(strip); placeTabs(strip); }, { once: true }); });   // a card picture has no width until it has loaded
}
function placeTabs(strip) { Array.prototype.forEach.call(strip.querySelectorAll(".rdy"), function (t) { var im = strip.querySelector('img[data-ix="' + t.dataset.ix + '"]'); if (!im) return; t.style.left = Math.round(im.offsetLeft + 4) + "px"; t.style.top = Math.round(im.offsetTop - 7) + "px";
    /* RC2.1 (Council): the cards overlap, so a tab has only up to the next card's tab; a long word (TABLE FULL, AIR ASSAULT) tightens, then gets smaller type, so it always shows whole */
    var nx = strip.querySelector('img[data-ix="' + (+t.dataset.ix + 1) + '"]'), room = (nx ? nx.offsetLeft - im.offsetLeft : im.offsetWidth) - 6; t.style.letterSpacing = ""; t.style.fontSize = ""; t.style.paddingLeft = t.style.paddingRight = "";
    if (t.offsetWidth > room) { t.style.letterSpacing = "0"; t.style.paddingLeft = t.style.paddingRight = "4px"; }
    for (var fz = 9.5; t.offsetWidth > room && fz >= 7.5; fz -= .5) t.style.fontSize = fz + "px"; }); }
/* v0.21 (Council M8): while targeting, each legal target carries a TARGET plate under it, so the choice is plain at any card size */
function targetPlates() {
  var el = $("tplates"); if (!el) { el = document.createElement("div"); el.id = "tplates"; document.body.appendChild(el); }
  var M = liveDecision() && G.sel ? maps() : null, ids = M ? Object.keys(M.dsts) : [], key = ids.join(",") + "|" + W + "x" + H + "|" + (G.fitN || 0) + "|" + (camEase ? "e" : "") + "|" + ($("zoom").style.display === "flex" ? "z" : "") + "|" + (pvOpen() ? "p" : "");
  if (el.dataset.k === key) return; el.dataset.k = key; el.innerHTML = ""; if (camEase || $("zoom").style.display === "flex" || pvOpen()) return;
  ids.forEach(function (uid) { var o = O[uid]; if (!o || !o.alive) return; var r = objRect(o), t = document.createElement("span"); t.textContent = "TARGET"; t.style.left = Math.round((r.l + r.r) / 2) + "px"; t.style.top = Math.round(r.b + 2) + "px"; el.appendChild(t); });
}
function isPh() { return document.documentElement.classList.contains("ph"); }
function drawerFit(strip) {   // cards side by side while they fit, then overlapping down to 44 px each, then the strip scrolls
  var ims = strip.querySelectorAll("img"); Array.prototype.forEach.call(ims, function (im) { im.style.marginLeft = ""; });
  if (!isPh() || !ims.length) return drawerCue();
  var cw = 77, n = ims.length, avail = Math.max(120, (strip.clientWidth || W) - 24), need = n * cw + (n - 1) * 8, step = need <= avail ? cw + 8 : Math.max(44, (avail - cw) / Math.max(1, n - 1));
  Array.prototype.forEach.call(ims, function (im, k) { im.style.marginLeft = k ? Math.round(step - cw) + "px" : "0px"; });
  strip.classList.toggle("fits", need <= avail); drawerCue();
}
function drawerCue() { var h = $("hand"), st = h.querySelector(".strip"); if (!st) return; var more = st.scrollWidth - st.clientWidth; h.classList.toggle("cl", more > 2 && st.scrollLeft > 2); h.classList.toggle("cr", more > 2 && st.scrollLeft < more - 2); }
/* v0.21 (coordinator's check of 734ff41): with the hand open, the panel rides up exactly far enough that its foot sits 6 px above the
   highest hand card or READY tab, measured from the laid-out strip, so no part of it ever covers a card's cost, name or picture */
function panelClear() { var h = $("hand"), st = h && h.querySelector(".strip"), bot = $("bot"); if (!st || !isPh()) return;
  var hr = h.getBoundingClientRect(), gap = parseFloat(getComputedStyle(bot).rowGap) || 6, top = Infinity;
  Array.prototype.forEach.call(st.querySelectorAll("img, .rdy"), function (e) { top = Math.min(top, e.offsetTop); }); if (top === Infinity) top = 12;
  var op = st.offsetParent || bot, stTop = op.getBoundingClientRect().top + op.clientTop + st.offsetTop, cardTop = stTop + top,   /* layout positions (offsetTop), so a strip still sliding in is measured where it will land */ shift = Math.max(0, Math.ceil(hr.top - gap - (cardTop - 6)));
  bot.style.setProperty("--stripH", shift + "px"); }
addEventListener("resize", function () { try { panelClear(); } catch (e) { } });
function drawerAuto() {
  var h = $("hand"); if (!h) return; var hb = h.querySelector(".hhandle"), hs = (G.view && G.view.you.hand) || [], n = hs.filter(function (c) { return !c.held; }).length;
  var live = liveDecision(), M = live ? maps() : null, ready = M ? ((G.view && G.view.you.hand) || []).filter(function (c) { return !c.held && M.card[c.id] && !bluffOnly(c.id, M); }).length : 0, p = G.pend;   /* RC2.1 (Council): every hand card with a can-play tab, copies counted separately */
  var ownActs = !!(M && Object.keys(M.src).some(function (uid) { return O[uid] && O[uid].side === "own"; }));   // v0.21 (checkers): your own table cards can act: the drawer stays tucked so it never hides them; the handle says the hand can play too
  var want = !!(live && !(G.sel && (O[G.sel] || Object.keys(maps().dsts).length)) && !ownActs && (ready || (p && isMulti(p) && p.kind === "discard")));
  var sp = spotNow(), list = !sp ? [] : Array.isArray(sp) ? sp : [sp];
  if (list.indexOf("hand") >= 0) want = true; else if (list.some(function (x) { return /front|rear|bases|route|mtrack/.test(x); })) want = false;
  if (G.drawerUser && p && G.drawerUser.n === p.n) want = G.drawerUser.open;
  if (drag && drag.on) want = false;
  var was = h.classList.contains("open"); h.classList.toggle("open", want);
  var pk = ""; if (hb && !want && isPh()) { var ims = h.querySelectorAll(".strip img[data-card]"), k7 = Math.min(7, ims.length); for (var q = 0; q < k7; q++) pk += '<img draggable="false" src="' + ims[q].src + '" alt="" class="' + (ims[q].classList.contains("can") ? "r" : ims[q].classList.contains("cant") ? "d" : "") + '">'; pk = pk ? '<span class="pk" aria-hidden="true">' + pk + "</span>" : ""; }   // v0.21 (Council M2b, spec 2.2): tucked, the top of each card peeks out of the handle (cost and Class colour), so you see what you hold
  if (hb) { hb.setAttribute("aria-expanded", want ? "true" : "false"); hb.innerHTML = "<span>HAND " + n + (live && ready ? " · " + ready + (want ? " READY" : " CAN PLAY") : "") + "</span>" + pk + '<i aria-hidden="true">' + (want ? "▼" : "▲") + "</i>"; hb.classList.toggle("cue", !want && !!(live && ready)); var pkEl = hb.querySelector(".pk"); if (pkEl) { var pims = pkEl.querySelectorAll("img"), lim = pkEl.getBoundingClientRect().right + .5, shown = 0; Array.prototype.forEach.call(pims, function (im) { if (im.getBoundingClientRect().right > lim) im.remove(); else shown++; }); if (n > shown) { var more = document.createElement("b"); more.textContent = "+" + (n - shown); pkEl.appendChild(more); while (shown && more.getBoundingClientRect().right > lim) { pkEl.removeChild(more.previousSibling); shown--; more.textContent = "+" + (n - shown); } } if (!shown) pkEl.remove(); }   // only whole card tops: the rest are counted
    hb.setAttribute("aria-label", "Hand, " + n + " card" + (n === 1 ? "" : "s") + (ready ? ", " + ready + " ready" : "") + (want ? ". Tuck it" : ". Open it")); }
  panelClear();
  var st2 = h.querySelector(".strip"); if (st2 && st2.clientWidth && st2.dataset.fw !== String(st2.clientWidth)) { st2.dataset.fw = String(st2.clientWidth); drawerFit(st2); } if (st2) placeTabs(st2);   // the strip's width is known only once it is laid out
  if (was !== want && isPh()) { try { spotlight(); } catch (e) { } requestAnimationFrame(function () { panelFit($("prompt")); var pb = $("prompt").querySelector(".pbody"); if (pb) { pb.dataset.mh = ""; pb.scrollTop = 0; if (!want) unslice(pb, $("prompt").classList.contains("more") ? 0 : 28); } promptCue(); }); }   /* the panel's text window changes with the drawer: the More cue follows it */
}
$("hand").addEventListener("click", function (e) {
  var b = e.target.closest && e.target.closest("button"); if (!b) return;
  if (b.classList.contains("hhandle")) { var open = !$("hand").classList.contains("open"); G.drawerUser = { n: G.pend ? G.pend.n : -1, open: open }; SFX.select && SFX.select(); drawerAuto(); return; }
  if (b.classList.contains("hnav")) { var st = $("hand").querySelector(".strip"); if (st) st.scrollBy({ left: (b.classList.contains("l") ? -1 : 1) * 85, behavior: G.rm ? "auto" : "smooth" }); }
});
$("hand").addEventListener("scroll", function () { drawerCue(); var sp = $("spots"); if (sp && sp.firstChild) { sp.dataset.k = ""; try { spotlight(); } catch (e) { } } }, true);
["hand", "prompt"].forEach(function (id) { $(id).addEventListener("transitionend", function () { var sp = $("spots"); if (sp) sp.dataset.k = ""; try { spotlight(); } catch (e) { } }); });   /* v0.21 (lead's phone notes 4): the highlight is measured again once the drawer and panel have finished moving */
/* v0.21 (WP4): while you choose several cards (discard, ready), each card that can be picked carries a PICK box. The box toggles the pick;
   the rest of the card still opens the Inspector, so picking and reading never collide (spec 1.3) */
function pickBtn(on, label) { var b = document.createElement("button"); b.type = "button"; b.className = "pick" + (on ? " on" : ""); b.setAttribute("aria-pressed", on ? "true" : "false"); b.setAttribute("aria-label", label); b.innerHTML = "<span>" + (on ? "✓" : "") + "</span><small>" + (on ? "PICKED" : "PICK") + "</small>"; return b; }
function pickHand(el, M) {
  Array.prototype.forEach.call(el.querySelectorAll("img[data-card]"), function (im) { var id = im.dataset.card, ix = +im.dataset.ix; if (!M.card[id]) return;
    var on = !!(G.multi && G.multi.kind === G.pend.kind && G.multi.picked.some(function (x) { return x.id === id && x.ix === ix; })), b = pickBtn(on, (on ? "Unpick " : "Pick ") + im.alt);
    b.style.left = Math.round(im.offsetLeft + im.offsetWidth - 40) + "px"; b.style.top = Math.round(im.offsetTop + (isPh() ? im.offsetHeight * .3 : 0)) + "px"; b.dataset.card = id; b.dataset.ix = ix; el.appendChild(b); });   /* on a phone the box sits on the picture, below the cost and name line, so the card stays readable */
}
$("hand").addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button.pick"); if (!b || !liveDecision() || !isMulti(G.pend)) return; e.stopPropagation(); multiToggle(b.dataset.card, +b.dataset.ix); });
function pickTable() {   // the same PICK boxes on table cards, placed on each card's top right corner
  var el = $("picks"); if (!el) { el = document.createElement("div"); el.id = "picks"; document.body.appendChild(el);
    el.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button.pick"); if (!b || !liveDecision() || !isMulti(G.pend)) return; multiToggle(b.dataset.uid); }); }
  var M = liveDecision() && isMulti(G.pend) ? maps() : null, ids = M ? Object.keys(M.src) : [], picked = G.multi && G.pend && G.multi.kind === G.pend.kind ? G.multi.picked : [];
  var key = ids.join(",") + "|" + JSON.stringify(picked) + "|" + W + "x" + H + "|" + (G.fitN || 0) + "|" + (camEase ? "e" : "") + "|" + ($("zoom").style.display === "flex" ? "z" : "");
  if (el.dataset.k === key) return; el.dataset.k = key; el.innerHTML = ""; if (camEase || $("zoom").style.display === "flex") return;
  ids.forEach(function (uid) { var o = O[uid]; if (!o || !o.alive) return; var r = objRect(o), on = picked.some(function (x) { return x.id === uid; }), b = pickBtn(on, (on ? "Unpick " : "Pick ") + ((o.u && o.u.name) || "this card"));
    b.style.left = Math.round(Math.min(W - 44, r.r - 30)) + "px"; b.style.top = Math.round(Math.max(0, r.t - 14)) + "px"; b.dataset.uid = uid; el.appendChild(b); });
}
function mvShort(l) { return /^Move .* up to the Frontline/.test(l) ? "Move to Frontline" : /^Move .* back to the Rear Area/.test(l) ? "Move to Rear Area" : l; }   /* v0.21 (checkers): the lesson's words for the two row moves, everywhere a button names them */
function btn(i, label, cls) { label = mvShort(String(label)); var w = optWhere(i); return '<button data-i="' + i + '" class="' + (cls || (label.length + w.length > 26 ? "opt" : "ghost")) + '">' + esc(label) + (w ? '<small class="which">' + esc(w) + "</small>" : "") + "</button>"; }
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
  else if (G.moment) h = momentBox();
  else if (G.over && !G.playing && !G.queue.length && G.info && G.info.tutorial && !G.replay) h = coachEnd();
  else if (G.over && !G.playing && !G.queue.length) h = '<p class="t" style="font-size:calc(16px * var(--ts));color:var(--amber)">' + (/^Nobody/.test(G.over.winner) ? "A draw" : esc(G.over.winner) + (G.over.winner === "You" ? " win" : " wins")) + " in round " + G.over.round + '</p><p class="h">' + esc(overHow(G.over)) + '.</p><div class="btns"><button id="pDebrief">Debrief</button>' + (SITE && !G.replay ? '<button id="pSend">✉ Provide Feedback</button>' : "") + (G.replay ? '<button class="ghost" id="rExit">' + (G.replay.standalone ? "Stop" : "Exit replay") + "</button>" : '<button class="ghost" id="pNew">Exit to the Main Menu</button>') + "</div>";
  else if (G.replay) h = "<p>" + esc(G.caption || "…") + "</p>" + (G.why && G.whyAt === G.shownN && G.info && G.info.spectate ? '<p class="why">' + esc(whyLine(G.why)) + "</p>" : "") + replayBar();
  else if (G.busy) h = "<p class='h'>Working…</p>";
  else if (pend && !G.playing && G.confirm && G.confirm.n === pend.n) h = '<div class="cf"><p>' + esc(pend.options[G.confirm.i]) + '?</p><p class="h">Once the bot answers, this cannot be taken back. (Settings: Ask before moves you cannot take back.)</p><div class="btns"><button class="go" id="cfYes">Confirm</button><button class="ghost" id="cfNo">Back</button></div></div>';
  else if (pend && !G.playing) {
    var M = maps(), n = Object.keys(M.src).length + Object.keys(M.card).length;
    h = coachBox(pend) + (pend.coach && !coachReady(pend) ? "" : '<p class="instr">' + esc(pend.prompt) + "</p>") + hitsBox() + (pend.coach ? "" : tipLine(pend));   // v0.21 (Council M4): the instruction first, then what happened and the tip
    if (pend.coach && !coachReady(pend)) return setPrompt(el, h, true);
    if (isMulti(pend)) return multiPrompt(el, h, M);
    if (G.sel) {   // v0.21 (WP4): targeting. The heading says what to do; CANCEL is in the pinned footer (also Esc, a right-click, empty table, or the card again)
      var direct = G.selT ? [] : M.selOpts.filter(function (i) { return !((pend.meta[i] || {}).dst); }), tg = Object.keys(M.dsts).length;
      h = (pend.coach ? coachBox(pend) : "") + '<p class="tgh" role="status">' + (tg ? "Choose " + (G.selT === "attack" ? "a target to attack" : G.selT === "up" ? "the card to upgrade" : "a target") + " for <b>" + esc(selName()) + "</b>." : "Choose how to play <b>" + esc(selName()) + "</b>.") + "</p>" +
        (tg ? '<p class="h">Tap a ringed card' + (direct.length ? ", or choose below" : "") + ". Tap empty ground, press Esc or Cancel to stop.</p>" : "") + direct.map(function (i) { return btn(i, pend.options[i], "opt"); }).join("") +
        '<div class="btns"><button class="ghost" id="pView">Read the card</button><button class="ghost" id="pCancel">Cancel</button></div>';
    } else {
      var lst = false;   /* RC2 (Council F1): while a list is in the panel, its Done row is not pinned: it comes after the whole list, and the panel grows to show it (listGrow) */
      var wdN = pend.kind === "deploy" ? wdCount(pend) : 0; if (wdN) { var wl = wdList(pend); if (wl) { lst = true; var ixw = h.indexOf('<p class="instr">'), ew = ixw >= 0 ? h.indexOf("</p>", ixw) : -1; h = ew >= 0 ? h.slice(0, ew + 4) + wl + h.slice(ew + 4) : h + wl; } }
      if (pend.kind === "ready_select" || pend.kind === "ready") { var rl0 = readyList(pend, M); if (rl0 && !pend.coach) { lst = true; h = rl0 + h; } else if (rl0) { var ix0 = h.indexOf('<p class="instr">'), e0 = ix0 >= 0 ? h.indexOf("</p>", ix0) : -1; h = e0 >= 0 ? h.slice(0, e0 + 4) + rl0 + h.slice(e0 + 4) : h + rl0; } }   /* the list first, Ready all (or Repair all) its gold button; Basic Training keeps the lesson's card as the one gold button, under the instruction */   /* v0.21 (checkers F): Basic Training's ready steps show the scripted card's button, as lesson v0.3.6 says */
      if (n) h += '<p class="h tip">' + (pend.kind === "target" ? "Tap a glowing card to choose it." : pend.kind === "reaction" ? "Choose below, or drag a glowing Reaction card onto the Mission Track." : "Glowing cards can act. Tap one to read it and choose, or drag it.") + "</p>";
      h += hintBox(pend);
      if (pend.kind === "reaction") { var all = M.free.slice(); Object.keys(M.card).concat(Object.keys(M.src)).forEach(function (k) { (M.card[k] || M.src[k] || []).forEach(function (i) { if (all.indexOf(i) < 0) all.push(i); }); }); all.sort(function (a, b) { return a - b; }); M.free = all; }   // v0.21: in a reaction prompt every answer has its own button too
      var long = M.free.filter(function (i) { return pend.options[i].length > 26; }), shortO = M.free.filter(function (i) { return pend.options[i].length <= 26; });
      h += long.map(function (i) { return btn(i, pend.options[i]); }).join("") + '<div class="btns' + (lst ? " lstfoot" : "") + '">' + shortO.map(function (i) { return btn(i, pend.options[i], /^(Pass|Done|Do not|No\b|Keep|Leave|Stay)/.test(pend.options[i]) ? "ghost" : pend.kind === "maneuver" ? "go" : ""); }).join("") + (wdN && !G.wdOpen ? '<button class="ghost" id="wdT" aria-expanded="false" aria-label="Withdraw a card: ' + wdN + ' can go">WITHDRAW ▸</button>' : "") + (G.canUndo ? '<button class="ghost" id="pUndo" aria-label="Undo"><span class="ic">↶</span><span class="tx"> Undo</span></button>' : "") + (hintable(pend) && !(pend.coach && !pend.coach.free) && !(G.hint && G.hint.n === pend.n) ? '<button class="ghost" id="pHint" aria-label="Hint"><span class="ic">?</span><span class="tx">Hint</span></button>' : "") + "</div>";
      var notes = pend.notes || []; if (notes.length) h += '<p class="why">' + (notes.length === 1 || pend.kind !== "action" ? notes.map(esc).join("<br>") : notes.length + " of your cards cannot act right now. Tap one to see why.") + "</p>";
    }
  } else h = "<p" + (G.info && G.info.spectate ? "" : " class='h'") + ">" + esc(G.caption || "…") + "</p>" + (G.explain && G.explainAt === G.shownN ? '<p class="why" style="color:#8fc8ff">' + esc(G.explain) + "</p>" : "") + (G.why && G.whyAt === G.shownN && G.info && G.info.spectate ? '<p class="why">' + esc(whyLine(G.why)) + "</p>" : "") + '<div class="btns">' + (G.why && G.info && G.info.spectate ? '<button class="ghost" id="pWhy">Why?</button>' : "") + '<button class="ghost" id="pPause">' + (G.paused ? "▶ Resume" : "❚❚ Pause") + "</button>" + (G.paused ? '<button class="ghost" id="pStep">Next event</button>' : "") + '<button class="ghost" id="pNote">✎ Add note</button></div>';
  setPrompt(el, h, true);   // v0.20.1: a capped prompt shows each new message from its top
}
/* v0.20.2 (fix pass on the table fit): the panel is a scrolling body over a pinned footer. The footer holds the panel's last row of buttons
   (NEXT, Continue, CONFIRM, Done, the decision's short choices) and a first-time tip's "Got it", so they never scroll away; when the body
   has more than it shows, a "More" cue sits at its foot. The panel itself never grows past the cap that keeps the table its share. */
function setPrompt(el, h, top) {
  if (el.dataset.h === h) return; el.dataset.h = h;
  var t = document.createElement("div"); t.innerHTML = h;
  var rows = t.querySelectorAll(".btns"), pin = rows.length ? rows[rows.length - 1] : null, tip = t.querySelector("#tipX"), foot = document.createElement("div"); foot.className = "pfoot";
  if (pin && pin.querySelector("button")) foot.appendChild(pin);   /* RC2.2 (checkers' Major): the step's ending button, Undo and "?" are always pinned, list or no list */
  if (pin && pin.querySelector("#pUndo,#pHint")) Array.prototype.forEach.call(pin.querySelectorAll("#pUndo,#pHint"), function (b) { pin.insertBefore(b, pin.firstChild); });   // v0.21 (craft notes): Undo and Hint are compact icons at the start of the row; "Got it" stays with its tip in the text
  if (foot.querySelector(".cgo")) foot.classList.add("go", "cmp");   /* v0.21 (lead's phone notes 1): the coach's BACK and NEXT (or Continue) make one compact row at the foot, NEXT bottom left, with More at the right of the same row; every other pixel goes to the text */
  var body = el.querySelector(".pbody"), keep = body && !top ? body.scrollTop : 0;
  el.innerHTML = '<div class="pwrap"><div class="pbody"></div><button type="button" class="pmore" tabindex="-1" aria-hidden="true">More ▼</button></div>';
  body = el.querySelector(".pbody"); while (t.firstChild) body.appendChild(t.firstChild);
  if (foot.firstChild) el.appendChild(foot);
  if (foot.classList.contains("cmp")) { var ck = body.querySelector(".coach .ck"); if (ck) { var fk = document.createElement("span"); fk.className = "fk"; fk.textContent = ck.textContent; ck.remove(); foot.appendChild(fk); } foot.appendChild(el.querySelector(".pmore")); }   /* the kicker ("BRIEFING · 3 OF 13") rides in the control row, so the text gets its line */
  listGrow(el); body.scrollTop = keep; G.pbUser = !!keep; body.addEventListener("pointerdown", function () { G.pbUser = true; }); body.addEventListener("wheel", function () { G.pbUser = true; }, { passive: true }); body.addEventListener("keydown", function () { G.pbUser = true; });
  body.addEventListener("scroll", function () { if (!G.pbUser && body.scrollTop && isPh() && $("hand").classList.contains("open")) body.scrollTop = 0; promptCue(); }, { passive: true });   /* with the hand open the instruction always starts at its first line; only the player scrolls it */ promptCue(); requestAnimationFrame(function () { if (!keep) { var pb2 = el.querySelector(".pbody"); unslice(pb2, $("prompt").classList.contains("more") || $("prompt").querySelector(".pfoot .pmore") ? 0 : 28); if (pb2) pb2.scrollTop = 0; } promptCue(); });
}
/* RC2 (Council F1): a panel holding a list (ready, repair, or an opened Withdraw list) with its Done row after the list grows upward over the
   table, up to 62% of the screen, so the whole list and Done show; if it still cannot, it scrolls, and Done is reached only after the list.
   The table does not move (its foot is the panel's usual top); the panel returns to its usual height for the next step. */
function listGrow(el) { return panelFit(el); }
/* RC2.3 (accessibility first; the checkers' large-text pass on RC2.2): on a phone, every step's panel is tall enough for ALL its buttons
   (the foot wraps into as many rows as it needs: a step's choices are never hidden or covered), its whole action list, and at least two full
   lines of the instruction (or all of it), plus the More cue's row when text follows. It grows upward over the table, up to 62% of the screen;
   the table does not move (its foot stays at the panel's usual top). If even 62% cannot hold it, the buttons scroll inside the foot, with a cue,
   and the instruction keeps its two lines. Measured each time the panel is drawn and when the layout changes. */
function panelFit(el) { if (!el || isDesk()) return; var cap = +el.dataset.cap; if (!cap || !isPh()) return;
  if (document.documentElement.classList.contains("tut") || (G.info && G.info.tutorial)) { if (el.dataset.grown) { el.dataset.grown = ""; el.style.height = el.style.maxHeight = cap + "px"; } return; }   /* RC2.3d: Basic Training keeps its own panel (sized for its 160-character pages); growing it over the table hid the very cards the lesson asks the player to tap at 175% text */
  var body = el.querySelector(".pbody"), ft = el.querySelector(".pfoot"); if (!body) return;
  var open = !!document.querySelector("#bot #hand.open") && !document.documentElement.classList.contains("tut");   /* RC2.3b: with the hand open the slim panel (height auto, riding above the strip) was still capped at the usual height, so at large text its instruction and buttons were squeezed. It now grows too, upward only: its bottom stays above the hand strip (the hand is never covered) and its top stays below the top band */
  el.style.height = el.style.maxHeight = cap + "px"; body.style.maxHeight = ""; body.dataset.mh = ""; body.style.flexBasis = ""; body.classList.remove("trim"); if (ft) { ft.style.maxHeight = "none"; ft.classList.remove("fscroll"); }
  var q = function (e) { return e.getBoundingClientRect(); }, bq = q(body), pm = el.querySelector(".pmore"), pmH = pm && pm.offsetHeight ? pm.offsetHeight + 2 : 0, footH = ft ? ft.scrollHeight + (parseFloat(getComputedStyle(ft).marginTop) || 0) : 0;
  var chrome = el.offsetHeight - body.clientHeight - pmH - (ft ? ft.offsetHeight : 0); if (chrome < 0) chrome = 16;
  var lst = body.querySelector(".rlist"), lead = body.querySelector(".coach") || body.querySelector(".instr") || body.firstElementChild, need0 = 0, min0 = 0;
  if (lead) { var lr = q(lead), lh = parseFloat(getComputedStyle(lead).lineHeight) || 20 * PREF.text, top = lr.top - bq.top + body.scrollTop; need0 = Math.ceil(top + Math.min(lr.height, (lead.classList.contains("coach") ? 6 : 2) * lh + 2)); min0 = Math.ceil(top + Math.min(lr.height, 2 * lh + 2)); }
  if (lst) { var lb = Math.ceil(q(lst).bottom - bq.top + body.scrollTop) + 8; need0 = Math.max(need0, lb); }
  var pill = body.scrollHeight > need0 + 12 ? Math.round(30 * Math.min(1.4, PREF.text)) + 6 : 0, lim = Math.floor(H * .62), need = chrome + need0 + pill + footH;
  if (open) {   /* the room between the top band and where the panel's bottom sits above the hand strip; measured from layout, not from the panel's current (possibly still moving) place */
    try { panelClear(); } catch (e) { } var tb = $("top") ? $("top").getBoundingClientRect().bottom : 0, tm = new DOMMatrixReadOnly(getComputedStyle(el).transform === "none" ? undefined : getComputedStyle(el).transform), shift = parseFloat(getComputedStyle($("bot")).getPropertyValue("--stripH")) || 0;
    var bottomOpen = q(el).bottom - (tm.m42 || 0) - shift; lim = Math.max(Math.min(cap, Math.floor(bottomOpen - tb - 6)), Math.min(lim, Math.floor(bottomOpen - tb - 6))); }
  var hh = Math.max(cap, Math.min(lim, need));
  if (need > lim) {   /* even 62% cannot hold it all: the ending buttons stay whole in the foot and the list scrolls above them, with the instruction's first two lines first */
    var ins = body.querySelector(".instr"), rs = body.querySelector(".rsup") || lst; if (lst && ins && rs && (rs.compareDocumentPosition(ins) & 4)) body.insertBefore(ins, body.firstChild);
    if (ins && !G.instrOpen) { ins.classList.add("clamp2"); ins.setAttribute("title", "Tap to read it all"); }   /* its first two lines (a tap shows it all), so the list's first button and every choice still show */
    var lh2 = ins ? (parseFloat(getComputedStyle(ins).lineHeight) || 20 * PREF.text) : 20 * PREF.text, insEnd = ins ? Math.ceil(q(ins).bottom - q(body).top + body.scrollTop) : 0, more2 = body.scrollHeight > insEnd + 12,
      bodyMin = Math.ceil(2 * lh2 + 8 + (lst ? 50 * Math.min(1.4, PREF.text) : 0)), roomF = lim - chrome - bodyMin - (more2 ? Math.round(30 * Math.min(1.4, PREF.text)) + 6 : 0);   /* the More cue's row only when text or a list follows the instruction */
    if (ft && footH > roomF) { ft.style.maxHeight = Math.max(52, roomF) + "px"; ft.classList.add("fscroll"); } else if (ft) ft.style.maxHeight = "";   /* only a foot taller than the rest of the panel scrolls (with its amber edge) */
    hh = lim; }
  else if (ft) ft.style.maxHeight = "";
  if (open) hh = Math.min(hh, lim);   /* with the hand open the panel never rises over the top band, even below its usual height */
  el.dataset.grown = hh > cap ? "1" : ""; el.style.height = el.style.maxHeight = hh + "px"; }
/* v0.21 (craft notes): no sliced lines. A scrolling box that has more than it shows is trimmed so its last visible line of text (or row, chip
   or button) is whole; the "More" pill sits in the space below it. Measured when the box is drawn, at its top. */
function unslice(sc, reserve) {
  if (!sc || !sc.isConnected) return; sc.style.maxHeight = sc.dataset.mh || ""; sc.style.flexBasis = ""; sc.classList.remove("trim");
  var avail = sc.clientHeight; if (!avail || sc.scrollHeight <= avail + 1) return;
  var box = sc.getBoundingClientRect(), limit = box.top + avail - (reserve || 0), cut = limit, rects = [];
  var w = document.createTreeWalker(sc, NodeFilter.SHOW_TEXT, null), n, rg = document.createRange();
  while ((n = w.nextNode())) { if (!n.nodeValue.trim()) continue; rg.selectNodeContents(n); Array.prototype.forEach.call(rg.getClientRects(), function (r) { rects.push(r); }); }
  Array.prototype.forEach.call(sc.querySelectorAll("button,label,.zstats span,input"), function (e) { var r = e.getBoundingClientRect(); if (r.height && r.height < 90) rects.push(r); });
  rects.forEach(function (r) { if (r.top < limit - 1 && r.bottom > limit + 1 && r.top < cut) cut = r.top; }); if (reserve && cut >= limit - 1) cut = limit;
  if ((cut < limit - 1 || reserve) && cut > box.top + 8) { sc.style.maxHeight = Math.floor(cut - box.top - 1) + "px"; sc.style.flexBasis = "auto"; sc.classList.add("trim"); }
}
function promptCue() {   // "More ▼" while the panel's body has text below what it shows
  var el = $("prompt"), b = el && el.querySelector(".pbody"); if (!b) return;
  var was = el.classList.contains("more"), now = b.scrollHeight - b.clientHeight - b.scrollTop > 6 || (was && b.scrollTop > 0); el.classList.toggle("more", now);
  if (now && !was && !b.scrollTop) requestAnimationFrame(function () { b.dataset.mh = ""; unslice(b, 0); });   // the More pill took a row: trim again so no line is sliced
}
function render() { document.documentElement.classList.toggle("tut", !!(G.info && G.info.tutorial)); hud(); hand(); prompt(); requestFit(); try { spotlight(); } catch (e) { } try { inspRefresh(); } catch (e) { } }   // v0.20.1: the bars may have changed size: refit on the next frame if the safe frame moved
/* what caused a loss: the last attack, played or fired card, ability or H-Hour before it (consequence lines are not causes) */
function isCause(text, fx) { if (/takes \d+ damage|is destroyed|loses? \d+ Homefront|is suppressed|covers the target|intercepts|reloads|^--- /.test(text)) return false; return (fx && fx.kind === "attack") || /^H-Hour|\b(attacks|plays|fires|uses|puts|resolves|ends|completes)\b|spills onto/.test(text); }
function mineTouched(a, b, text) { if (!a || !b) return false; if (a.you.hf !== b.you.hf || /\bHomefront\b/.test(text) && /^(You|Your)\b/.test(text)) return true;
  var now = {}; b.you.front.forEach(function (u) { now[u.uid] = { u: u, row: "F" }; }); b.you.rear.forEach(function (u) { now[u.uid] = { u: u, row: "R" }; });
  return a.you.front.map(function (u) { return { u: u, row: "F" }; }).concat(a.you.rear.map(function (u) { return { u: u, row: "R" }; })).some(function (x) { var y = now[x.u.uid]; return !y || (y.u.dmg || 0) > (x.u.dmg || 0) || (!x.u.ex && y.u.ex) || (x.u.hidden && !y.u.hidden) || x.row !== y.row; }); }
function hitsBox() { if (!G.hits || !G.hits.length) return ""; var nl = G.hits.reduce(function (a, x) { return a + (x.cause ? 1 : 0) + x.lines.length; }, 0), all = G.hitsAll || G.hits.length < 2;   /* RC2.2 (checkers' Major): a summary that never pushes the step's list or buttons away: the first exchange, then "Show all N lines" (expanded, it scrolls by itself); the Battle Log keeps everything */
  return '<div class="hits' + (G.hitsAll ? " all" : "") + '"><b>Since your last move:</b>' + (all ? G.hits : G.hits.slice(0, 1)).map(function (x) { return '<div class="hit1">' + (x.cause ? '<span class="cz">' + esc(x.cause.replace(/^H-Hour: (The |Your )?/, function (m, w) { return "At H-Hour, " + (w ? w.toLowerCase() : ""); })) + "</span>" : "") + '<span class="out">' + esc(x.lines.join(" ")) + "</span></div>"; }).join("") + (G.hits.length > 1 ? '<button type="button" class="ghost hall" id="hitsAll" aria-expanded="' + (G.hitsAll ? "true" : "false") + '">' + (G.hitsAll ? "Show less" : "Show all " + nl + " lines") + "</button>" : "") + "</div>"; }
/* v0.21 (Council M9, ruling B): the end of a game is told from the player's side; the engine's line is written from the winner's */
function overHow(o) { var how = String((o && o.how) || ""); if (!o || (G.info && G.info.spectate) || G.replay) return how; var won = o.winner === "You", lost = o.winner === "The bot";
  if (/^Supremacy/.test(how)) return won ? "ROUTED: you drove the enemy off its home edge (Supremacy)" : lost ? "ROUTED: you were driven off your home edge (Supremacy)" : how;
  if (/^Devastation/.test(how)) return won ? "Devastation: both enemy Bases destroyed" : lost ? "Devastation: both your Bases destroyed" : how;
  if (/^Homefront collapse/.test(how)) return won ? "Homefront collapse: the enemy's Homefront fell to 0" : lost ? "Homefront collapse: your Homefront fell to 0" : how;
  return how; }
function feed(text) {
  var nm = (G.info && G.info.names) || ["You", "The bot"], tx = text.replace(/^H-Hour: /, ""), cls = tx.indexOf(nm[1]) === 0 ? "foe" : (tx.indexOf(nm[0]) === 0 || /^Your /.test(tx)) ? "own" : ""; if (/destroyed|devastated|Homefront|wins|Contact/.test(text)) cls += " big";
  var d = document.createElement("div"); d.className = cls; d.textContent = (PREF.shapes && /own|foe/.test(cls) ? (/foe/.test(cls) ? "◆ " : "■ ") : "") + text.replace(/^--- | ---$/g, ""); $("feed").appendChild(d);
  while ($("feed").children.length > (H < 700 || W < 600 ? 2 : 4)) $("feed").removeChild($("feed").firstChild); setTimeout(function () { d.style.opacity = .3; }, 6000);
}
function banner(big, small) { if (G.skip || G.dirQuiet) return; var b = $("banner"); b.innerHTML = esc(big) + (small ? "<small>" + esc(small) + "</small>" : ""); b.classList.remove("on"); void b.offsetWidth; b.classList.add("on"); }
function glossFor(u) {   // which keywords and game terms appear on this card, with their meanings (from browser_play.glossary)
  var GL = G.gloss || [], txt = [].concat(u.lines || [], [u.atk || "", u.range || "", u.sub || "", u.kind || ""]).join("  "), out = [], seen = {};
  GL.forEach(function (g) { if (seen[g[0]]) return; try { if (new RegExp(g[1]).test(txt)) { seen[g[0]] = 1; out.push(g); } } catch (e) { } });
  return out.sort(function (a, b) { return (a[3] === "keyword" ? 0 : 1) - (b[3] === "keyword" ? 0 : 1); });
}
/* ================= v0.21 (WP4): the Inspector (Prototype Design Spec 1.3) =================
   One reader for every card: your hand, your table cards, the enemy's, Bases, contacts, Mission Track cards, piles and the card library.
   The card large; under it (beside it on wide screens) its printed rules as live text at readable size, the keywords it uses, and, when it is
   your decision, one button per legal move. A move that is not possible now says why. It never plays anything by itself. On a phone it is a
   bottom sheet with the table visible above it; on a wide screen a panel on the right. Close: CLOSE, tapping outside it, Esc, or a swipe down. */
var INS = { prev: null, act: null };
function inspHead(l) { var m = String(l).match(/^([^:]{2,60}?):\s*(.*)$/); return m ? "<b>" + esc(m[1]) + "</b> " + esc(m[2]) : esc(l); }
function inspRules(u, o) {
  if (o.rules) return o.rules.map(function (x) { return '<p class="zl">' + esc(x) + "</p>"; }).join("");
  if (o.base) { var b = u, acc = (G.bases || {})[b.kind] || [], left = Math.max(0, (b.dur || 0) - (b.dmg || 0));
    return '<p class="zk">Base · ' + esc(b.kind || "") + (b.dev ? " · devastated" : "") + "</p>" + '<p class="zs2">Supply ' + b.sup + " of " + b.stock + " (restocks " + b.restock + ") · Survivability " + b.surv + " · Durability " + left + " of " + b.dur + " · Concealment " + b.conc + " ISR to target</p>" +
      (acc.length ? '<p class="zl"><b>PULSE access</b> ' + esc(acc.map(function (a) { return "[" + a + "]"; }).join(" ")) + (b.ex ? ". Its Pulse has fired this round." : ".") + "</p>" : ""); }
  var f = Object.assign({}, (G.faces || {})[u.name] || {}, u), h = "", tm = +f.timer || 0;
  if (!f.lines && !f.cls) return '<p class="zl">' + esc(u.name || "") + "</p>";
  var cap = isCap(f);
  var subW = f.sub === "Operation" ? "Mission" : f.sub;   // v0.21 (Council M7): the word the card's type line prints (MISSION); the name itself is the lead's call
  h += '<p class="zk">' + esc([cap ? "Capability" : (subW || f.kind || "Effect"), f.cls, f.gen ? "Generation " + f.gen : "", cap ? (f.costn != null ? "Deploy: " + f.costn + " Supply" : f.cost) : (f.cost ? "Cost: " + f.cost : "")].filter(Boolean).join(" · ")) + "</p>";
  var stats = "";
  if (cap) { var chip = function (k, v, t) { return '<span title="' + t + '"><i>' + k + "</i><b>" + v + "</b></span>"; };   // v0.21 (craft pass): a tidy stat row under the rules, not a run-on line
    stats = '<div class="zstats" role="list" aria-label="Numbers">' + (f.atkn ? chip("ATK", f.atkn + (f.range ? " <small>" + esc(f.range) + "</small>" : ""), "Attack") : "") + chip("SURV", f.surv, "Survivability") + chip("DUR", f.dmg ? Math.max(0, f.dur - f.dmg) + "/" + f.dur : f.dur, "Durability") + chip("CONC", f.conc, "Concealment") + chip("READY", f.ready, "Ready cost") + chip("HF", f.hf, "Homefront loss") + "</div>"; }
  else h += '<p class="zs2">' + esc(f.sub === "Reaction" ? "Reaction: played when its trigger happens; it goes to the Mission Track and happens at once." : tm > 0 ? (f.sub === "Condition" ? "Condition: lasts " + tm + " round" + (tm === 1 ? "" : "s") + " on the Mission Track." : "Mission: waits " + tm + " round" + (tm === 1 ? "" : "s") + " on the Mission Track, then acts at H-Hour.") : "Order: lands on the Mission Track at H-Hour and happens at once.") + "</p>";
  h += (f.lines || []).map(function (l) { return '<p class="zl">' + inspHead(l) + "</p>"; }).join("") + stats;
  if (f.upfrom) h += '<p class="zl"><b>Upgrades from</b> ' + esc(f.upfrom) + "</p>";
  if (f.tags) h += '<p class="zt2">Tags: ' + esc(String(f.tags).split(/\s+/).filter(Boolean).join(", ")) + "</p>";
  return h;
}
/* v0.21 (engine v0.17.3 trial: Kurt's table limit of 10 and Withdraw; off unless a game turns them on) */
function tableFull() { var v = G.view; if (!v || !(+v.table_cap > 0) || v.you.table == null) return ""; return v.you.table >= +v.table_cap ? v.you.table + "/" + v.table_cap : ""; }
function wdWhy(uid) { var v = G.view, u = findUnit(uid) || {}; if (!v || !v.withdraw) return ""; var front = (v.you.front || []).some(function (x) { return x.uid === uid; });
  if (u.pin || u.pinned) return "Not now: this card is PINNED.";
  if (u.ex) return "Not now: only a Ready card can be withdrawn.";
  if (front && v.contact) return "Not now: your Frontline is in Contact.";
  if (front && v.withdraw_fix) return "Not now: an enemy FIX nearby may forbid withdrawing Frontline cards.";
  return "Not offered at this step."; }
function trialLine(r) { r = r || (G.view || {}); if (!(+r.table_cap > 0) && !(+r.withdraw > 0)) return ""; var ref = { 0: "no refund", 1: "1 Supply back", 2: "half of what you paid back", 3: "what you paid, less its damage, back", 4: "relief: the next deploy costs less" }[+r.withdraw_refund || 0] || ("refund " + r.withdraw_refund);
  return "Trial rules: table limit " + (r.table_cap || "off") + (+r.withdraw ? " · Withdraw (" + ({ 1: "to hand", 2: "to the discard pile", 3: "face-up cards to the discard pile, face-down cards to hand" }[+r.withdraw] || "on") + ", " + ref + ")" : "") + (+r.withdraw_fix ? " · a FIX stops Frontline withdrawals" : ""); }
function actHead(i) {   // v0.21 (craft pass): a move's button says the move in a few words; the cost and detail go on the second line. The card's name is not repeated: the sheet is about that card
  var pend = G.pend, l = String(pend.options[i]), m = pend.meta[i] || {}, pr = (l.match(/\(([^)]*)\)/) || [])[1] || "", after = (l.match(/\):\s*(.*)$/) || l.match(/:\s*(.*)$/) || [])[1] || "";
  var tidy = function (x) { return String(x || "").replace(/\s+/g, " ").trim(); };
  if (trackOpt(i)) { var c = ((G.view && G.view.you.hand) || []).filter(function (x) { return x.id === m.card; })[0] || {};
    return { h: "Play to Mission Track", s: trackHint(c).replace(/^Let go: to the Mission Track · /, "") + (pr ? " · " + pr : "") }; }
  if (m.t === "dep") return { h: "Deploy", s: /less: relief/.test(pr) ? pr.replace(/, (\d+) less: relief/, " now, $1 less this Command only (relief in place)") : pr };
  if (m.t === "hide") return { h: /decoy/.test(l) ? "Deploy as a decoy" : "Deploy hidden", s: pr + " · face down" };
  if (m.t === "wd") return { h: /discard pile/.test(l) ? "Withdraw to discard pile" : "Withdraw to your hand", s: pr };   /* RC2.1 (Council): a secondary button that says where the card goes, from the engine's own label */
  var r = [[/^Move .* up to the Frontline/, "Move to Frontline"], [/^Move .* back to the Rear Area/, "Move to Rear Area"], [/^Send .* to infiltrate/, "Infiltrate"], [/^Use /, "Use ability"], [/^Ready /, "Ready"], [/^Exhaust /, "Exhaust"], [/^Flip .* face down/, "Flip face down"], [/^Discard /, "Discard"], [/^Reveal /, "Reveal"], [/^Upgrade /, "Upgrade"], [/^Recover /, "Recover"], [/^Withdraw /, "Withdraw"], [/^Air-assault /, "Air assault"]];
  for (var k = 0; k < r.length; k++) if (r[k][0].test(l)) return { h: r[k][1], s: tidy([pr, after].filter(Boolean).join(" · ")) };
  var j = l.search(/ \(|: /); return j < 0 ? { h: l, s: "" } : { h: l.slice(0, j), s: tidy(l.slice(j).replace(/^: /, "").replace(/^ \(/, "(")) };
}
function inspActions(act, u, o) {
  if (!act || G.replay || (G.info && G.info.spectate) || !G.view) return "";
  var mine = act.card ? ((G.view.you.hand || []).some(function (c) { return c.id === act.card; })) : !!(O[act.uid] && O[act.uid].side === "own");
  var dis = function (label, why) { return '<button type="button" class="za0" disabled aria-disabled="true"><span>' + esc(label) + '</span><small>' + esc(why) + "</small></button>"; };
  var moveName = function () { var f = (G.faces || {})[u.name] || u; return act.card ? (isCap(f) ? "Deploy" : f.sub === "Reaction" ? "Play as a Reaction" : "Play to Mission Track") : "Act"; };
  if (!liveDecision()) return mine ? dis(moveName(), G.over ? "The game is over." : "Not now: it is not your decision.") : "";
  var pend = G.pend, M = maps(), opts = act.card ? (M.card[act.card] || []) : (M.src[act.uid] || []), h = "";
  if (isMulti(pend)) return "";   // the PICK button does it
  if (!opts.length) {
    if (!mine) return "";
    var tf = tableFull(), fc = (G.faces || {})[u.name] || u; if (act.card && tf && isCap(fc) && pend.kind === "deploy") return dis("Deploy", "Table full (" + tf + "): withdraw a card or upgrade.");
    if (!act.card && mine && G.view.withdraw && pend.kind === "deploy") { var wy = wdWhy(act.uid); if (wy) return dis("Withdraw", wy); }
    var co = pend.coach, why = co && !coachReady(pend) ? "Read the coach's note first (Next), then do what it asks." : co && co.allow ? "Basic Training asks for another move now: " + (co.do || "see the coach.") : act.card ? ((pend.hand_notes || {})[u.name] || "This card has no move at this step (" + (G.view.phase || "") + ").") : (reasonFor(u.name) || "This card has no move at this step (" + (G.view.phase || "") + ").");
    return dis(moveName(), why);
  }
  var groups = {}, bluff = function (i) { return /as a decoy/.test(pend.options[i]); }, onlyBluff = opts.every(bluff);
  if (onlyBluff && mine) { var f0 = (G.faces || {})[u.name] || u; h += dis(moveName(), isCap(f0) ? "Not now: this card cannot be deployed at this step." : "Not now: " + (f0.sub === "Order" ? "Orders" : f0.sub === "Reaction" ? "Reactions" : "Effects") + (f0.sub === "Reaction" ? " are played when their trigger happens" : " are played in Operations, onto the Mission Track") + "."); }   // v0.21: say first why the real play is not available; a bluff is never the primary button
  opts.forEach(function (i) { var m = pend.meta[i] || {};
    if (m.dst) { var g = groups[m.t] = groups[m.t] || { t: m.t, dsts: {}, n: 0 }; if (!g.dsts[m.dst]) { g.dsts[m.dst] = 1; g.n++; } if (!g.html) { g.html = 1; h += "@@" + m.t + "@@"; } return; }
    var a = actHead(i); h += '<button type="button" data-i="' + i + '" class="zab' + (bluff(i) || m.t === "wd" ? " zsec" : "") + '"><span>' + esc(a.h) + "</span>" + (a.s ? "<small>" + esc(a.s) + "</small>" : "") + "</button>"; });
  Object.keys(groups).forEach(function (t) { var g = groups[t], lab = t === "attack" ? "Attack…" : t === "up" ? "Upgrade…" : "Choose a target…", sub = t === "attack" ? "Choose the target: " + g.n + " in reach" : t === "up" ? "Choose the card it replaces: " + g.n + (g.n === 1 ? " card" : " cards") : g.n + " target" + (g.n === 1 ? "" : "s");
    h = h.replace("@@" + t + "@@", '<button type="button" data-tg="' + esc(t) + '" data-id="' + esc(act.card || act.uid) + '" class="zab tg"><span>' + lab + "</span><small>" + esc(sub) + "</small></button>"); });
  return h;
}
function zoom(u, o) {
  o = o || {}; SFX.zoom();
  var cap = o.caption || "", st = u.ex ? "Exhausted. " : (u.hidden && u.cls) ? "Face down (Hidden). " : ""; if (u.dmg > 0 && !o.base) st += "Damaged: " + u.dmg + " of " + u.dur + ". "; if (st) cap = st + cap;
  var clean = Object.assign({}, u, { ex: false, hidden: false, spot: false }), oo = Object.assign({}, o); ["side", "assist", "pick", "caption", "act", "notTarget", "rules", "base", "canvas"].forEach(function (k) { delete oo[k]; });
  G.zoomAt = Date.now(); G.zoomPick = o.pick ? o.pick.fn : null; $("zPick").style.display = G.zoomPick ? "" : "none"; if (G.zoomPick) { $("zPick").textContent = o.pick.label; $("zPick").setAttribute("aria-pressed", o.pick.on ? "true" : "false"); }
  G.zoomName = u.cls || u.id ? u.name : ""; $("zNote").style.display = G.zoomName && G.info ? "" : "none";
  try { $("zImg").src = (o.canvas ? o.canvas : drawCard(clean, 2.5, oo)).toDataURL(); } catch (e) { return; }
  $("zImg").alt = (u.name || "Card") + " (the printed card; its rules are written out beside it)";
  $("zName").textContent = u.name || ""; $("zCap").textContent = cap; $("zCap").style.display = cap ? "" : "none";
  $("zWhy").textContent = o.notTarget || ""; $("zWhy").style.display = o.notTarget ? "" : "none";
  $("zRules").innerHTML = inspRules(u, o);
  var gls = (u.cls || u.id) && !o.canvas ? glossFor(Object.assign({}, (G.faces || {})[u.name] || {}, u)) : []; $("zGlos").innerHTML = gls.length ? '<p class="zgh">Words on this card</p>' + gls.map(function (g) { return "<p><b>" + esc(g[0]) + "</b> " + esc(g[2]) + "</p>"; }).join("") : ""; $("zGlos").style.display = gls.length ? "block" : "none";
  INS.act = o.act || null; INS.u = u; INS.o = o; var acts = inspActions(o.act, u, o); $("zAct").innerHTML = acts; $("zAct").style.display = acts ? "" : "none";
  var z = $("zoom"), was = z.style.display === "flex"; z.classList.toggle("over", $("lib").style.display === "block");   // above the card library
  if (!was) INS.prev = document.activeElement; z.classList.toggle("big", PREF.text >= 1.5 && !((W >= 900 && H >= 521) || (H <= 520 && W >= 600))); z.style.display = "flex";
  var wide = (W >= 900 && H >= 521), hd = $("hand").getBoundingClientRect(); var pmh = wide && G.view && hd.height && hd.top > 380 ? Math.round(hd.top - 12 - H * .02) : 0; $("zPanel").style.maxHeight = pmh ? pmh + "px" : ""; $("zImg").style.maxHeight = pmh ? Math.max(200, pmh - 150) + "px" : ""; /* the card picture stays inside the panel; wide screens: the hand dock stays visible under it */ $("zBody").scrollTop = 0; zCue(); setTimeout(function () { unslice($("zBody"), $("zoom").classList.contains("more") ? 0 : 30); zCue(); }, 60); peekHide(); SFX.click();
  try { $("zClose").focus({ preventScroll: true }); } catch (e) { } setTimeout(function () { try { if ($("zoom").style.display === "flex" && !$("zoom").contains(document.activeElement)) $("zClose").focus({ preventScroll: true }); } catch (e) { } }, 60);   // after a touch tap the browser's own focus change comes later: take focus again
  G.zoomId = u.id; if (u.id && !o.canvas && CF.hi) CF.hi(u.id, function (fresh) { if (fresh && G.zoomId === u.id && $("zoom").style.display === "flex") try { $("zImg").src = drawCard(clean, 2.5, oo).toDataURL(); } catch (e) {} });
  try { pickTable(); } catch (e) { }
}
function zCue() { var b = $("zBody"); $("zoom").classList.toggle("more", b.scrollHeight - b.clientHeight - b.scrollTop > 6); }   // the "More" cue while the sheet has more below
$("zBody").addEventListener("scroll", zCue, { passive: true }); $("zImg").addEventListener("load", function () { if (!$("zBody").scrollTop) unslice($("zBody"), $("zoom").classList.contains("more") ? 0 : 30); zCue(); });
$("zMore").addEventListener("click", function (e) { e.stopPropagation(); var b = $("zBody"); b.scrollBy({ top: Math.max(40, b.clientHeight * .8), behavior: G.rm ? "auto" : "smooth" }); });
function inspRefresh() { if ($("zoom").style.display !== "flex" || !INS.u) return; var acts = inspActions(INS.act, INS.u, INS.o); if ($("zAct").innerHTML !== acts) { $("zAct").innerHTML = acts; $("zAct").style.display = acts ? "" : "none"; } }   // a decision arrived or went while it is open
function closeInspector(silent) { var z = $("zoom"); if (z.style.display !== "flex") return; z.style.display = "none"; G.zoomPick = null; G.zoomId = null; INS.u = null; if (!silent && SFX.close) SFX.close(); var p = INS.prev; INS.prev = null; try { if (p && p.focus && document.contains(p)) p.focus({ preventScroll: true }); } catch (e) { } try { pickTable(); } catch (e) { } }
$("zoom").addEventListener("click", function (e) {
  var t = e.target; if (t.closest("#zScrim") || t.closest("#zClose")) return closeInspector();
  var b = t.closest("button"); if (!b || b.disabled) return;
  if (b.id === "zPick") { var f = G.zoomPick; closeInspector(true); if (f) f(); return; }
  if (b.id === "zNote") { closeInspector(true); return noteForm(G.zoomName); }
  if (b.dataset.i != null) { var i = +b.dataset.i; closeInspector(true); if (liveDecision()) choose(i); return; }
  if (b.dataset.tg) { var id = b.dataset.id, tg = b.dataset.tg; closeInspector(true); if (!liveDecision()) return; SFX.select(); closePreview(); G.sel = id; G.selT = tg; handKey = ""; render(); return; }   // select, then target
});
(function () { var hd = $("zGrab"), y0 = null; if (!hd) return;   // a swipe down on the sheet's handle closes it (phones)
  hd.addEventListener("pointerdown", function (e) { y0 = e.clientY; }); addEventListener("pointerup", function (e) { if (y0 == null) return; var dy = e.clientY - y0; y0 = null; if (dy > 40 || Math.abs(dy) < 8) closeInspector(); }); })();

/* ================= moments: a played card shown large, short radio-style callouts, the aiming line ================= */
function isOrder(name) { var f = (G.faces || {})[name]; return !!(f && !(f.cap !== false && (f.cap || f.dur > 0)) && f.sub !== "Reaction" && !(+f.timer > 0)); }   // v0.19.4: an Order is an Effect with no timer
function hhPulse() { if (G.skip) return; var m = $("mtrack"); m.classList.remove("hh"); void m.offsetWidth; m.classList.add("hh"); setTimeout(function () { m.classList.remove("hh"); }, 1600 / G.speed); }   // the Order lands at H-Hour on the Mission Track, then acts
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
  var pend = G.pend, i0 = idx[0], m = pend.meta[i0] || {}, el = $("preview"); if (!pvOpen()) G.pvAt = Date.now();
  if (m.t === "attack") { G.pv = { idx: idx.slice(), src: m.src, dst: m.dst, ticked: (m.sup || []).slice() }; return pvAttack(); }   // the engine's own pick of supporters comes first, so it starts ticked
  G.pv = null; el.dataset.nk = ""; el.className = ""; el.innerHTML = '<div class="pvh"><p class="pve">Choose how</p><h3>' + esc(selName()) + "</h3></div>" + '<div class="pvb">' + idx.map(function (i) { return btn(i, pend.options[i], "opt"); }).join("") + '</div><button type="button" class="pvmore" tabindex="-1" aria-hidden="true">More ▼</button><div class="row pvf"><button class="ghost" id="pvX">Cancel</button></div>'; el.style.display = "block"; pvFit(el); pvCue(el); G.pvDst = m.dst;
}
/* v0.21 (WP4; rules audit 2, Step A): the attack preview lets you choose the supporters. Every card that can support this attack is a tick box,
   pre-ticked with the engine's pick; "Attack alone" is one tap. The numbers shown are those of the engine's option whose set of supporters is
   exactly the ticked set, and Fire posts that option. A ticked set the engine does not offer is greyed out with the reason. Page only. */
function sameSet(a, b) { a = a || []; b = b || []; if (a.length !== b.length) return false; for (var k = 0; k < a.length; k++) if (b.indexOf(a[k]) < 0) return false; return true; }
function supWhy(ticked, src) {
  var v = G.view, span = v && v.you.span, a = findUnit(src) || {}, seen = {};
  if (span != null && ticked.length > span) return "Your Span of Control is " + span + ": at most " + span + " supporter" + (span === 1 ? "" : "s") + " for one attack.";
  for (var k = 0; k < ticked.length; k++) { var u = findUnit(ticked[k]) || {}; if (u.cls && u.cls === a.cls) return (u.name || "That card") + " is the same Class as the attacker (" + u.cls + "): a supporter must be a different Class.";
    if (u.cls && seen[u.cls]) return seen[u.cls] + " and " + u.name + " are both " + u.cls + ": no two supporters may share a Class."; if (u.cls) seen[u.cls] = u.name; }
  return "The game does not offer this set: it would cost more ISR than you have (" + (v ? v.you.isr : "?") + ").";
}
function supLine(name) { var l = (((G.faces || {})[name] || {}).lines || []).filter(function (x) { return /^SUPPORT/.test(x); })[0]; return l ? parseLine(l).body : ""; }
function pvAttack() {
  var pv = G.pv, pend = G.pend, el = $("preview"); if (!pv || !pend) return;
  var meta = pend.meta, elig = []; pv.idx.forEach(function (i) { ((meta[i] || {}).sup || []).forEach(function (u) { if (elig.indexOf(u) < 0) elig.push(u); }); });
  var match = pv.idx.filter(function (i) { return sameSet((meta[i] || {}).sup, pv.ticked); })[0], alone = pv.idx.filter(function (i) { return !((meta[i] || {}).sup || []).length; })[0];
  var lab = match != null ? pend.options[match] : "", t = findUnit(pv.dst), hid = !t || (t.hidden && !t.cls), left = t && t.dur != null ? Math.max(0, t.dur - (t.dmg || 0)) : null;
  var atk = (lab.match(/ATK (\d+)/) || [])[1], cost = (lab.match(/costs (\d+) ISR/) || [])[1], dm = (lab.match(/should do (\d+) damage/) || [])[1];
  var names = pv.ticked.map(function (u) { var x = findUnit(u); return x ? x.name : u; }), num = function (k, v, lab, cls) { return '<div class="pvk' + (cls ? " " + cls : "") + '"><b data-k="' + k + '">' + esc(v) + "</b><i>" + lab + "</i></div>"; };
  /* v0.21 (craft pass): an opaque sheet with its own header; the numbers are the focus and flash when a box is ticked */
  var h = '<div class="pvh"><p class="pve">Attack preview</p><h3>' + esc(selName()) + ' <span aria-hidden="true">▸</span><span class="sr"> attacks </span> ' + esc(hid ? "Unknown contact" : t.name) + "</h3></div>" +
    '<div class="pvb"><div class="pvn' + (match == null ? " off" : "") + '" aria-live="polite">' + num("atk", match == null ? "—" : atk || "?", "Attack") + (hid ? "" : '<div class="pvx" aria-hidden="true">vs</div>' + num("surv", t.surv, PREF.text >= 1.5 ? "Surv." : "Survivability")) +
    (match != null && dm != null ? '<div class="pvx" aria-hidden="true">→</div>' + num("dmg", dm, "Damage", "hot") : "") + num("cost", match == null ? "—" : (cost || 0), "ISR cost", "cost") + "</div>" +
    (match == null ? "" : '<div class="res">' + (hid ? "Attacking a Hidden card reveals it." : dm == null ? "" : +dm >= left ? "Result: " + esc(t.name) + " should be " + (pv.dst.indexOf("b:") === 0 ? "devastated" : "destroyed") : +dm > 0 ? "Result: " + esc(t.name) + " should survive with " + (left - dm) + " Durability" : "Result: no damage expected") + "</div>") + '<p class="pvs">' + (names.length ? "With " + esc(names.join(" and ")) : "Alone, no supporters") + "</p>";   // v0.21 (Council): the result sits right under the numbers it comes from
  if (elig.length) h += '<div class="sups"><p>Supporters: tick the cards that back this attack. Each is exhausted.</p>' + elig.map(function (u) { var x = findUnit(u) || {}, on = pv.ticked.indexOf(u) >= 0, sl = supLine(x.name);
      var cw = copyWhere(u); return '<label class="sup' + (on ? " on" : "") + '"><input type="checkbox" data-sup="' + esc(u) + '"' + (on ? " checked" : "") + "><span><b>" + esc(x.name || u) + "</b>" + (x.cls ? " · " + esc(x.cls) : "") + (cw ? '<small> · ' + esc(cw.replace(/^[^:]*: /, "")) + "</small>" : "") + (sl ? '<small> · ' + esc(sl) + "</small>" : "") + "</span></label>"; }).join("") +
    (alone != null && pv.ticked.length ? '<div class="row" style="justify-content:flex-start"><button class="ghost" id="pvAlone">Attack alone</button></div>' : "") + "</div>";
  if (match == null) h += '<div class="nomatch"><b>Not possible with these supporters.</b> ' + esc(supWhy(pv.ticked, pv.src)) + "</div>";

  h += (function () { var er = enemyReactions(), seen = {}, rows = er.list.filter(function (r) { var k = r.name + r.title; if (seen[k]) return false; seen[k] = 1; return true; }); if (!rows.length && !er.hidden) return "";
      return '<div class="alt" style="margin-top:6px"><p style="margin:0 0 3px;font-size:calc(12.5px * var(--ts));color:#8fc8ff"><b>The enemy may react.</b> Ready cards with a Reaction:</p>' + rows.map(function (r) { return '<p style="margin:2px 0;font-size:calc(12px * var(--ts));color:var(--dim)"><b style="color:' + (/cancel|intercept/i.test(r.body) ? "#ff9a7a" : "var(--ink)") + '">' + esc(r.name) + " · " + esc(r.title) + (/cancel|intercept/i.test(r.body) ? " (can cancel)" : "") + ":</b> " + esc(r.body) + "</p>"; }).join("") + (er.hidden ? '<p style="margin:2px 0;font-size:calc(12px * var(--ts));color:var(--dim)">' + er.hidden + " Hidden enemy card" + (er.hidden === 1 ? "" : "s") + " may also react.</p>" : "") + "</div>"; })();
  h += '</div><button type="button" class="pvmore" tabindex="-1" aria-hidden="true">More ▼</button><div class="row pvf"><button class="ghost" id="pvX">Cancel</button>' + (match != null ? '<button class="primary" id="pvFire" data-i="' + match + '">Fire</button>' : '<button class="primary" disabled aria-disabled="true">Fire</button>') + "</div>";
  var pb0 = el.querySelector(".pvb"), keep = pvOpen() && pb0 ? pb0.scrollTop : 0, prevKey = el.dataset.nk || "", nk = [match, atk, dm, cost].join("|"); el.className = "atk"; el.innerHTML = h; el.style.display = "flex"; pvFit(el); var pb = el.querySelector(".pvb"); if (pb) { pb.scrollTop = keep; pb.addEventListener("scroll", function () { pvCue(el); }, { passive: true }); } pvCue(el);
  if (prevKey && prevKey !== nk && !G.rm) { var n = el.querySelector(".pvn"); if (n) { n.classList.remove("flash"); void n.offsetWidth; n.classList.add("flash"); } } el.dataset.nk = nk; G.pvDst = pv.dst; G.pvMatch = match;
}
/* v0.21: the preview never runs off the top of the screen, and its Cancel and Fire row is pinned at its foot (its body scrolls) */
function pvFit(el) {   // phones: a sheet from the bottom of the screen up to just under the top bar; wide screens: a panel above the dock
  var pb = el.querySelector(".pvb"), ft = el.querySelector(".pvf"), hd = el.querySelector(".pvh"); if (!pb) return; var wide = W >= 900 && H >= 521, top = Math.round(($("top").getBoundingClientRect().bottom || 0) + 8);
  el.classList.toggle("sheet", !wide); el.classList.toggle("col", isDesk());
  var cs = getComputedStyle(document.documentElement), cTop = parseFloat(cs.getPropertyValue("--colTop")) || top, cBot = parseFloat(cs.getPropertyValue("--colBot")) || 40;
  el.style.bottom = isDesk() ? cBot + "px" : wide ? (H - (FR ? FR.B : H) + 14) + "px" : "0px";
  var avail = isDesk() ? Math.max(200, H - cTop - cBot) : wide ? Math.max(200, (FR ? FR.B : H) - 14 - top) : Math.max(200, H - top); el.style.maxHeight = avail + "px";
  pb.style.maxHeight = Math.max(80, avail - (ft ? ft.offsetHeight : 0) - (hd ? hd.offsetHeight : 0) - 20) + "px"; el.style.setProperty("--pvf", (ft ? ft.offsetHeight : 64) + "px");
}
function pvOpen() { var d = $("preview").style.display; return !!d && d !== "none"; }
function pvCue(el) { if (!el.dataset.cut) { el.dataset.cut = "1"; var pbx = el.querySelector(".pvb"); if (pbx && !pbx.scrollTop) { pbx.dataset.mh = pbx.style.maxHeight; unslice(pbx, el.classList.contains("more") ? 0 : 30); } el.dataset.cut = ""; } pvCue0(el); }
function pvCue0(el) { var pb = el.querySelector(".pvb"); if (pb) el.classList.toggle("more", pb.scrollHeight - pb.clientHeight - pb.scrollTop > 6); }
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
function closePreview() { $("preview").style.display = "none"; G.pvDst = null; G.pv = null; G.pvMatch = null; }
$("preview").onclick = function (e) { var b = e.target.closest("button"); if (!b || b.disabled) return; if (b.classList.contains("pvmore")) { var pb = $("preview").querySelector(".pvb"); if (pb) pb.scrollBy({ top: Math.max(40, pb.clientHeight * .8), behavior: G.rm ? "auto" : "smooth" }); return; } if (b.id === "pvX") { closePreview(); return; } if (b.id === "pvAlone" && G.pv) { G.pv.ticked = []; SFX.select(); return pvAttack(); } if (b.dataset.i != null) choose(+b.dataset.i); };
$("preview").addEventListener("change", function (e) { var c = e.target; if (!c || !c.dataset || c.dataset.sup == null || !G.pv) return; var u = c.dataset.sup, k = G.pv.ticked.indexOf(u); if (c.checked && k < 0) G.pv.ticked.push(u); if (!c.checked && k >= 0) G.pv.ticked.splice(k, 1); SFX.select(); pvAttack(); });

/* ================= input (v0.21, WP3 and WP4: tap looks, move plays; Prototype Design Spec 1.3) =================
   A tap or click on any card opens the Inspector: the card large, its rules as text and, when it can act, one button per legal move. A press
   that moves past the slop (input.js) drags. Time never decides: there is no hold, and no tap ever plays a card by itself. A move is made only
   by a button that names it, by tapping a ringed target while targeting, or by letting go of a drag over a place that takes the card. */
function liveDecision() { return !!(G.pend && !G.playing && !G.busy && !G.replay); }
function inspectObj(o, extra) {   // the Inspector for a card, contact or Base on the table
  extra = extra || {};
  if (!o) return;
  if (o.type === "contact") return zoom({ name: "UNKNOWN CONTACT" }, Object.assign({ canvas: staticC, caption: "A Hidden enemy card. Attacking it costs ISR and reveals it.", act: { uid: o.uid }, rules: ["A Hidden enemy card: face down, so its name and rules are secret until it is revealed. Attacking it costs ISR and reveals it."] }, extra));
  if (o.type === "base") return zoom(o.u, Object.assign({ canvas: drawBase(o.u, o.side), base: true, side: o.side, act: { uid: o.uid }, caption: o.u.kind + ". Survivability " + o.u.surv + ", Concealment " + o.u.conc + " ISR to target." }, extra));
  zoom(o.u, Object.assign({ side: o.side, act: { uid: o.uid } }, extra));
}
function cancelTargeting() { if (!G.sel && !G.pvDst) return false; G.sel = null; G.selT = null; closePreview(); handKey = ""; render(); return true; }
function chooseTarget(id, M) {   // a legal target was tapped while targeting: an attack shows its preview first; any other move is made at once
  var d = M.dsts[id]; SFX.click(); if (d.length === 1 && (G.pend.meta[d[0]] || {}).t !== "attack") return choose(d[0]); return preview(d);
}
function tapObj(o) {
  if (liveDecision()) {
    var M = maps(), pend = G.pend;
    if (!o) { cancelTargeting(); return; }   // empty table while targeting: targeting stops, nothing is played
    var id = o.uid;
    if (G.sel && M.dsts[id]) return chooseTarget(id, M);
    if (G.sel && id === G.sel) { cancelTargeting(); return; }   // the acting card again: stop targeting
    if (G.sel) return inspectObj(o, { notTarget: "Not a target for " + selName() + ". Close this to carry on choosing, or press Cancel." });
    if (isMulti(pend) && M.src[id]) return inspectObj(o, { pick: pickFor(id) });
    if (pend.kind === "target" && M.src[id] && M.src[id].length === 1 && !(pend.meta[M.src[id][0]] || {}).dst) { SFX.click(); return choose(M.src[id][0]); }   // the engine is asking for a target: a glowing card is one (spec 1.3, "a legal target while targeting")
  }
  if (o) inspectObj(o);
}
function pickFor(id, ix) {   // the PICK button in the Inspector while choosing several cards
  var pend = G.pend, cfg = MULTI[pend.kind], on = !!(G.multi && G.multi.kind === pend.kind && G.multi.picked.some(function (x) { return x.id === id && (ix == null || x.ix === ix); }));
  return { on: on, label: on ? (pend.kind === "discard" ? "Keep this card" : "Do not " + cfg.verb.toLowerCase()) : cfg.verb + " this card", fn: function () { multiToggle(id, ix); } };
}
function readCard(c, ix) {   // the Inspector for a card in your hand
  var M = liveDecision() ? maps() : null;
  if (M && isMulti(G.pend) && M.card[c.id]) return zoom(c, { hand: true, pick: pickFor(c.id, ix), act: { card: c.id } });
  zoom(c, { hand: true, act: { card: c.id } });
}
function tapHand(c, ix) {
  if (liveDecision() && G.sel) { var M = maps(); if (M.dsts[c.id]) return chooseTarget(c.id, M); }
  readCard(c, ix);
}
var ray = new THREE.Raycaster(), press = null;
function objAt(x, y) { ray.setFromCamera({ x: x / W * 2 - 1, y: -(y / H) * 2 + 1 }, camera); var hh = ray.intersectObjects(pickables); return hh.length ? hh[0].object.userData.obj : null; }
/* the drop target under a point: the card under it, or else a legal target whose outline, grown by 12 px, holds the point (spec 1.3) */
function targetAt(x, y, dsts) {
  var o = objAt(x, y); if (o && (!dsts || dsts[o.uid])) return o; if (!dsts) return o;
  var best = null, bd = 1e9; Object.keys(dsts).forEach(function (uid) { var q = O[uid]; if (!q || !q.alive) return; var r = objRect(q); if (!SSInput.inRect(SSInput.grow(r), x, y)) return; var d = Math.hypot((r.l + r.r) / 2 - x, (r.t + r.b) / 2 - y); if (d < bd) { bd = d; best = q; } });
  return best || o;
}
function nearObj(x, y) { var o = objAt(x, y); if (o) return o; var best = null, bd = 1e9; Object.keys(O).forEach(function (uid) { var q = O[uid]; if (!q.alive) return; var r = objRect(q); if (!SSInput.inRect(SSInput.grow(r), x, y)) return; var d = Math.hypot((r.l + r.r) / 2 - x, (r.t + r.b) / 2 - y); if (d < bd) { bd = d; best = q; } }); return best; }
function overTrack(x, y) { var mt = $("mtrack"); if (!mt || !mt.offsetWidth) return false; var r = mt.getBoundingClientRect(); return SSInput.inRect(SSInput.grow({ l: r.left, r: r.right, t: r.top, b: r.bottom }), x, y); }
$("gl").addEventListener("pointerdown", function (e) { $("menu").hidden = true; if (!okPointer(e)) { press = null; return; } press = SSInput.press(e, { kind: "table", o: objAt(e.clientX, e.clientY) }); });
/* v0.19.1: with a mouse, pointing at a card on the table shows the whole printed card beside the table (RD-153 (2)) */
var peekT = null, peekKey = "", peekCv = {};
function peekHide() { clearTimeout(peekT); peekT = null; peekKey = ""; var el = $("peek"); if (el) { el.style.display = "none"; el.style.left = ""; el.style.bottom = ""; } }
function peekAt(x, y) {
  if (G.dir || drag || !G.view || $("zoom").style.display === "flex") return peekHide(); var o = objAt(x, y); if (!o || o.type === "contact" || !o.u || !o.u.name) return peekHide();
  var key = o.uid + "|" + faceKey({ u: o.u, type: o.type, side: o.side }) + "|" + (x < W / 2 ? "r" : "l"); if (key === peekKey) return; peekKey = key; clearTimeout(peekT);
  peekT = setTimeout(function () { var el = $("peek"); if (!el) { el = document.createElement("div"); el.id = "peek"; el.innerHTML = '<img alt=""><small>Click to read it, with its keywords</small>'; document.body.appendChild(el); }
    var ck = o.type + ":" + faceKey({ u: o.u, type: o.type, side: o.side }); if (!peekCv[ck]) try { peekCv[ck] = (o.type === "base" ? drawBase(o.u, o.side) : drawCard(Object.assign({}, o.u, { ex: false, spot: false }), 1.6, {})).toDataURL("image/jpeg", .9); } catch (er) { return; }
    el.querySelector("img").src = peekCv[ck]; el.className = (o.type === "base" ? "base " : "") + (x < W / 2 ? "r" : "l"); el.style.display = "block"; }, 260);
}
$("gl").addEventListener("pointermove", function (e) { if (e.pointerType === "mouse") peekAt(e.clientX, e.clientY); });
/* v0.21 (spec 1.3, hover): with a mouse, after a quarter second on a hand card its full-size copy shows above the dock, centred on the card */
function handPeek(im, c) {
  if (G.dir || drag || $("zoom").style.display === "flex") return; clearTimeout(peekT); peekKey = "h:" + c.id;
  peekT = setTimeout(function () { if (peekKey !== "h:" + c.id || drag || !document.contains(im)) return; var el = $("peek"); if (!el) { el = document.createElement("div"); el.id = "peek"; el.innerHTML = '<img alt=""><small>Click to read it, with its keywords</small>'; document.body.appendChild(el); }
    var ck = "hand:" + c.id + c.name; if (!peekCv[ck]) try { peekCv[ck] = drawCard(Object.assign({}, (G.faces || {})[c.name] || {}, c), 1.6, {}).toDataURL("image/jpeg", .9); } catch (er) { return; }
    var r = im.getBoundingClientRect(), hb = $("hand").getBoundingClientRect(); el.querySelector("img").src = peekCv[ck]; el.className = "hand"; el.style.left = Math.round(Math.max(170, Math.min(W - 170, r.left + r.width / 2))) + "px"; el.style.bottom = Math.round(H - hb.top + 34) + "px"; el.style.display = "block"; }, 250);
}
/* v0.20.2 (Prototype Design Spec 1.3, mouse buttons): the right button never drags. A right-click cancels a drag, a preview or targeting; with
   nothing selected it opens the Inspector on the card or Base under the pointer */
function rightCancel() { if (drag) { dragCancel(); return true; } if (G.sel || G.pvDst || pvOpen()) { cancelTargeting(); return true; } return false; }
$("gl").addEventListener("contextmenu", function (e) { e.preventDefault(); if (rightCancel()) return; var o = objAt(e.clientX, e.clientY); if (o && o.u) inspectObj(o); });
$("gl").addEventListener("pointerleave", peekHide); $("gl").addEventListener("pointerdown", peekHide);
$("gl").addEventListener("pointermove", function (e) { if (e.pointerType === "mouse" && G.sel && G.pend && !G.playing) { var M2 = maps(), ho = targetAt(e.clientX, e.clientY, M2.dsts); G.hoverDst = ho && M2.dsts[ho.uid] ? ho.uid : null; } });
/* the press: one pointer at a time. Moving past the slop makes it a drag (or nothing); letting go inside the slop is a tap, on the up event */
addEventListener("pointermove", function (e) { if (press && e.pointerId === press.id) SSInput.moved(press, e); }, true);
addEventListener("pointercancel", function (e) { if (press && e.pointerId === press.id) press = null; }, true);
/* v0.21 (lead's phone notes 6): robust by construction, not by timing. A button in the reader (Inspector), the attack preview or the panel, or the reader's
   dimmed backdrop, accepts a pointer activation only when the press itself began on that same control after the sheet opened. A phone's late
   click from the tap that opened the sheet (iOS sends one about 300 ms after the finger lifts, where the finger was) can then press nothing.
   Keyboard activation (Enter or Space, a click with no pointer) is unaffected. */
function ctlKey(el) { if (!el) return ""; if (el.id === "zScrim") return "zScrim"; var b = el.closest && el.closest("button"); return b ? (b.id || "") + "|" + (b.dataset.i || "") + "|" + (b.dataset.tg || "") + "|" + (b.dataset.sup || "") + "|" + b.textContent.slice(0, 24) : ""; }
var lastDown = { key: "", t: 0 };
/* RC2 (coordinator's ruling on the checkers' scope point): outside the game panel, reader and preview, menus and settings keep the phone's
   ordinary touch help; but a press that is hard to take back or sends something counts only where the finger came down inside the button:
   abandoning or leaving a game (menu, panel, debrief), Redeploy, sending feedback, deleting a saved replay, showing the tips again, quitting */
/* RC2 (checkers): a reload or the browser's Back in the middle of a game or lesson would drop it silently (no save and continue yet), so the
   browser asks "Leave this page?" while a game is in progress with at least one choice made; never on the menus, after the game has ended
   or in the debrief, or in a replay. Provide Feedback sends in the background and never leaves the page. */
function leaveGuard() { return !!(G.started && G.info && !G.replay && !G.over && G.lastChosen && $("cover").style.display === "none"); }
addEventListener("beforeunload", function (e) { if (!leaveGuard()) return; e.preventDefault(); e.returnValue = ""; return ""; });
var STRICT_BTNS = "#bQuit, #bQuitApp, #suQuit, button[data-send], button[data-del], #sTipsAgain, #dNew, #dRedeploy";
addEventListener("pointerdown", function (e) { var bd = e.target.closest ? e.target.closest("button") : null; lastDown = { key: ctlKey(bd || (e.target.id === "zScrim" ? e.target : null)), t: Date.now(), x: e.clientX, y: e.clientY, r: bd ? bd.getBoundingClientRect() : null }; }, true);   /* r: where the button was when the finger came down (a panel that moves before the click does not refuse a true press) */
addEventListener("click", function (e) { if (e.detail === 0 || !e.target.closest) return; var c = e.target.closest("#zoom button, #preview button, #preview input, #zScrim, #prompt button, " + STRICT_BTNS); if (!c) return;
  var opened = c.closest("#zoom") ? (G.zoomAt || 0) : c.closest("#preview") ? (G.pvAt || 0) : 0, ok = lastDown.t >= opened && lastDown.key === ctlKey(c.tagName === "INPUT" ? c.closest("label") || c : c);
  if (c.tagName === "INPUT") ok = lastDown.t >= opened;   // a tick box: the press began inside the preview after it opened
  if (ok && c.tagName === "BUTTON" && lastDown.x != null) { var br = lastDown.r || c.getBoundingClientRect(); if (lastDown.x < br.left || lastDown.x >= br.right || lastDown.y < br.top || lastDown.y >= br.bottom) ok = false; }   /* v0.21 (tip fault on 791fe46): a phone moves a touch that lands near a button onto it ("touch adjustment"); the press counts only where the finger really came down, inside the button (RC2: the same edge rule as the browser's own hit test: the left and top edges in, the right and bottom edges out) */
  if (ok && c.tagName !== "INPUT") lastDown.key = "";   // one press, one activation: a second (late) click from the same press is refused
  if (!ok) { e.stopPropagation(); e.preventDefault(); if (window.SS_REC) window.SS_REC("blocked late click on " + ctlKey(c)); } }, true);
document.addEventListener("contextmenu", function (e) { if (e.target && (e.target.tagName === "IMG" || e.target.tagName === "CANVAS")) e.preventDefault(); });   /* v0.21 (lead's phone notes 5): a long press on a card picture never opens the browser's image menu; it is a tap (it opens the reader) */
document.addEventListener("dragstart", function (e) { if (e.target && e.target.tagName === "IMG") e.preventDefault(); });
var ghostClick = null;   // the browser's own click that follows a tap we have already acted on: swallowed, so it cannot press what the tap just opened
addEventListener("click", function (e) { var g = ghostClick; if (!g || e.detail === 0) return; ghostClick = null; if (Date.now() - g.t < 700 && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 40) { e.stopPropagation(); e.preventDefault(); } }, true);
addEventListener("pointerup", function (e) {
  var p = press; if (!p || e.pointerId !== p.id) return; press = null;
  if (p.moved || multiT || p.dead || (drag && drag.on)) return;
  ghostClick = { t: Date.now(), x: e.clientX, y: e.clientY };
  if (p.kind === "hand") return tapHand(p.c, p.ix);
  if (p.kind === "table") { var o = p.o && p.o.alive ? p.o : nearObj(e.clientX, e.clientY); return tapObj(o); }   // v0.21 (checkers): a card that was still moving when pressed is found where the finger lifts, or within 12 px of it
});
/* v0.17.1: pointing at an option button draws the aim line from the card that acts to its target */
$("prompt").addEventListener("mouseover", function (e) { var b = e.target.closest && e.target.closest("button[data-i]"); var m = b && G.pend && G.pend.meta && G.pend.meta[+b.dataset.i]; G.btnAim = m && m.src && m.dst ? { a: m.src, b: m.dst } : null; });
$("prompt").addEventListener("mouseleave", function () { G.btnAim = null; });
$("prompt").addEventListener("click", function (e) { var t = e.target.closest && e.target.closest(".ftip"); if (t && !e.target.closest("button")) { t.classList.toggle("open"); requestAnimationFrame(function () { unslice($("prompt").querySelector(".pbody"), $("prompt").classList.contains("more") ? 0 : 28); promptCue(); }); } });   // the first-time tip is folded to two lines; a tap unfolds it
$("prompt").onclick = function (e) {
  var b = e.target.closest("button"); if (!b) return;
  if (b.classList.contains("pmore")) { G.pbUser = true; }
  if (b.classList.contains("pmore")) { var pb = $("prompt").querySelector(".pbody"); if (pb) pb.scrollBy({ top: Math.max(30, pb.clientHeight * .8), behavior: G.rm ? "auto" : "smooth" }); return; }
  if (b.dataset.i != null) return choose(+b.dataset.i);
  if (b.id === "pCancel") { cancelTargeting(); return render(); }
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
  if (b.id === "cMom") return momentGo(false);
  if (b.id === "cMomB") return momentGo(true);
  if (b.id === "cPlay") { SET.mode = "bot"; return quit(true); }
  if (b.id === "tipX" && G.tipNow && G.tipNow.key) { tipSeen(G.tipNow.key); G.tipNow = { key: null, n: G.tipNow.n }; return render(); }   /* one tip a prompt: the next waits for the next prompt */
};
$("mtrack").onclick = function (e) { var c = e.target.closest("[data-tr]"); if (!c || !G.view) return; var t = (c.dataset.own === "1" ? G.view.you : G.view.bot).track[+c.dataset.tr]; if (!t) return;
  zoom({ name: t.name, cls: t.cls, id: t.id, cap: false, gen: "", sub: t.kind === "inf" ? "Operator" : "Mission Track", lines: String(t.text).split(" / ") }, { caption: (c.dataset.own === "1" ? "Yours. " : "The enemy's. ") + (t.space <= 0 ? "Resolves at H-Hour." : t.space + " round" + (t.space === 1 ? "" : "s") + " to H-Hour.") }); };

/* ================= select, then confirm (discard, readying, COUNTERATTACK) ================= */
var MULTI = { discard: { verb: "Discard", done: "Keep the rest and draw", max: 99 }, counterattack: { verb: "Ready", done: "Ready none", max: 2 },
  flip: { verb: "Flip", done: "Flip none", max: 2, hint: "Tick the PICK box on each of your glowing cards to flip face down, then confirm." }, paralyze: { verb: "Exhaust", done: "Exhaust none", max: 2, hint: "Tick the PICK box on each glowing enemy card to exhaust, then confirm." },
  strike: { verb: "Ready", done: "Ready none", max: 2, hint: "Tick the PICK box on each glowing FIRES card to ready, then confirm." } };
function isMulti(p) { return !!(p && MULTI[p.kind] && !p.coach); }   /* v0.17: Basic Training asks one card at a time. RC2 (Council F1): readying is never a PICK step: the list's buttons (Ready all first) and each card's reader do it, one way */
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
  var rl = readyList(G.pend, M); if (rl) { var ix = h.indexOf('<p class="instr">'), end = ix >= 0 ? h.indexOf("</p>", ix) : -1; h = end >= 0 ? h.slice(0, end + 4) + rl + h.slice(end + 4) : rl + h; }   // the list sits right under the instruction, Ready all first
  var pend = G.pend, cfg = MULTI[pend.kind], k = (G.multi && G.multi.kind === pend.kind) ? G.multi.picked.length : 0, cost = multiCost();
  var names = (G.multi && G.multi.kind === pend.kind ? G.multi.picked : []).map(function (x) { var u = findUnit(x.id); if (u) return u.name; var c = (G.view.you.hand || []).filter(function (c) { return c.id === x.id; })[0]; return c ? c.name : x.id; });
  h += '<p class="h tip">' + (cfg.hint || (pend.kind === "discard" ? "Tick the PICK box on each card you want to discard, then confirm. Tap a card to read it." : "Tick the PICK box on each glowing card you want to ready, then confirm. Tap a card to read it.")) + (cfg.max < 99 ? " Up to " + cfg.max + "." : "") + "</p>" +
    (k ? '<p class="why" style="color:var(--ink)">Selected: ' + esc(names.join(", ")) + (cost ? " · costs " + cost + " Supply" : "") + "</p>" : "") +
    '<div class="btns"><button class="go" id="mGo">' + (k ? cfg.verb + " " + k + (pend.kind === "discard" ? " and draw" : "") : esc(cfg.done)) + "</button>" + (k ? '<button class="ghost" id="mClr">Clear</button>' : "") + (G.canUndo ? '<button class="ghost" id="pUndo" aria-label="Undo"><span class="ic">↶</span><span class="tx"> Undo</span></button>' : "") + "</div>";
  setPrompt(el, h, false);
}
/* v0.21 (lead's phone notes: readying one card at a time is tedious). While you ready cards, the panel lists one button per card that can be
   readied, with its cost, and "Ready all" when you can afford every one. A list button acts at once (it is a button, so the press must begin on
   it); a tap on the card itself still only opens the reader. "Ready all" makes the same choices one after another and stops if one is no
   longer offered. In Basic Training only the lesson's card is listed and "Ready all" is not offered. */
function readyList(pend, M) {
  var rep = pend.kind === "ready"; if ((pend.kind !== "ready_select" && !rep) || !G.view) return ""; var allow = pend.coach && pend.coach.allow, sup = G.view.you.sup;
  /* v0.21 (engine v0.17.2): repair is one list too. "Repair X · 2 Supply (2 of 4 → 3)"; Repair all presses each card once per point of damage */
  var items = Object.keys(M.src).filter(function (id) { return O[id] && O[id].side === "own"; }).map(function (id) { var i = optFor(id), l = i >= 0 ? pend.options[i] : "", c = +((l.match(/^Pay (\d+)/) || [])[1] || 0), u = findUnit(id) || {}, d = l.match(/\((\d+) of (\d+) Durability left, (\d+) after\)/);
      return { id: id, i: i, c: c, name: u.name || id, pts: rep ? Math.max(1, (u.dmg || (d ? +d[2] - +d[1] : 1))) : 1, dur: d ? d[1] + " of " + d[2] + " → " + d[3] : "" }; })
    .filter(function (x) { return x.i >= 0 && (!allow || allow.indexOf(x.i) >= 0); });
  if (!items.length) return ""; var tot = items.reduce(function (a, x) { return a + x.c * x.pts; }, 0), verb = rep ? "Repair" : "Ready";
  return '<p class="rsup">You have <b>' + sup + "</b> Supply.</p>" + '<div class="rlist">' + ((items.length > 1 || (rep && items[0].pts > 1)) && tot <= sup && !pend.coach ? '<button class="go" id="mAll" data-rep="' + (rep ? 1 : 0) + '">' + verb + " all · " + tot + " Supply</button>" : "") +
    items.map(function (x) { return '<button class="' + (pend.coach ? "go" : "ghost") + ' rone" data-i="' + x.i + '" data-uid="' + esc(x.id) + '"' + (x.c > sup ? " disabled" : "") + ' aria-label="' + esc(verb + " " + x.name + ", " + x.c + " Supply" + (x.dur ? ", Durability " + x.dur.replace(" → ", ", ") + " after" : "")) + '">' + verb + " " + esc(x.name) + " · " + x.c + " Supply" + (x.dur ? ' <small>(' + esc(x.dur) + ")</small>" : "") + "</button>"; }).join("") + "</div>"; }
/* v0.21 (RC2, the Withdraw trial): in Command the panel lists each card you may withdraw, with what it costs and what comes back; a tap on the card reads it, as always */
function wdList(pend) { var items = []; (pend.options || []).forEach(function (l, i) { var m = (pend.meta || [])[i] || {}; if (m.t !== "wd") return; var u = findUnit(m.src) || {}, pr = (l.match(/\(([^)]*)\)/) || [])[1] || "", dest = /discard pile/.test(l) ? "to the discard pile" : "to your hand";
    items.push('<button class="ghost rone" data-i="' + i + '" data-uid="' + esc(m.src || "") + '" aria-label="' + esc("Withdraw " + (u.name || "") + " " + dest + ", " + pr) + '">Withdraw ' + esc(u.hidden ? "face-down " + (u.name || "card") : (u.name || "card")) + " · " + esc(dest) + (pr ? " <small>(" + esc(pr) + ")</small>" : "") + "</button>"); });
  return items.length && G.wdOpen ? '<div class="wdh"><p class="rsup">Withdraw a card (trial rule):</p><button class="ghost" id="wdT" aria-expanded="true" aria-label="Hide the Withdraw list">HIDE ▴</button></div><div class="rlist">' + items.join("") + "</div>" : ""; }   /* RC2 (Council F1): opened by the WITHDRAW button in the panel's button row, so no Withdraw choice hides behind More while Done deploying shows; opened, the panel grows (listGrow) */
function wdCount(pend) { return (pend.options || []).filter(function (l, i) { return ((pend.meta || [])[i] || {}).t === "wd"; }).length; }
function readyAll() { var pend = G.pend, M = maps(); if (!pend || (pend.kind !== "ready_select" && pend.kind !== "ready")) return; var ids = [];
  Object.keys(M.src).forEach(function (id) { if (!(O[id] && O[id].side === "own" && optFor(id) >= 0)) return; var n = pend.kind === "ready" ? Math.max(1, (findUnit(id) || {}).dmg || 1) : 1; for (var k = 0; k < n; k++) ids.push(id); });
  G.multi = null; G.autoQ = { kind: pend.kind, ids: ids }; autoStep(); }   /* each choice is re-read from the list the engine sends back; a card no longer listed is skipped, then Done (No more repairs) */
function listHi(uid) { if (G.listHi === uid) return; G.listHi = uid || null; }
$("prompt").addEventListener("pointerover", function (e) { var b = e.target.closest && e.target.closest("button.rone"); listHi(b ? b.dataset.uid : null); });
$("prompt").addEventListener("focusin", function (e) { var b = e.target.closest && e.target.closest("button.rone"); listHi(b ? b.dataset.uid : null); });
$("prompt").addEventListener("focusout", function () { listHi(null); }); $("prompt").addEventListener("pointerleave", function () { listHi(null); });
function multiGo() { var pend = G.pend; if (!pend) return; var picked = (G.multi && G.multi.kind === pend.kind) ? G.multi.picked.map(function (x) { return x.id; }) : []; G.multi = null; G.autoQ = { kind: pend.kind, ids: picked }; autoStep(); }
function autoStep() {
  var q = G.autoQ, pend = G.pend; if (!q || !pend || pend.kind !== q.kind) { G.autoQ = null; return; }
  while (q.ids.length) { var i = optFor(q.ids.shift()); if (i >= 0) return choose(i); }
  G.autoQ = null; choose(finalOpt());
}
$("prompt").addEventListener("click", function (e) { var ci = e.target.closest && e.target.closest(".instr.clamp2, .instr.cl-open"); if (ci && !e.target.closest("button")) { G.instrOpen = !G.instrOpen; ci.classList.toggle("clamp2", !G.instrOpen); ci.classList.toggle("cl-open", G.instrOpen); return; } var b = e.target.closest("button"); if (!b) return; if (b.id === "hitsAll") { G.hitsAll = !G.hitsAll; return render(); } if (b.id === "wdT") { G.wdOpen = !G.wdOpen; return render(); } if (b.id === "mAll") return readyAll(); if (b.id === "mGo") multiGo(); if (b.id === "mClr") { G.multi = null; handKey = ""; render(); } });

/* ================= drag and drop: hand to table or Mission Track; your card to a target; the marker along the route ================= */
var drag = null, dragged = false;
function handDown(e, c, ix, im) { if (!okPointer(e)) return; press = SSInput.press(e, { kind: "hand", c: c, ix: ix, im: im }); if (!liveDecision() || isMulti(G.pend)) return; drag = { kind: "card", c: c, ix: ix, x: e.clientX, y: e.clientY, im: im, on: false, id: e.pointerId, type: e.pointerType }; }
/* v0.20.1: one finger (or the left mouse button) drags. A drag follows only the pointer that started it; a second finger anywhere cancels
   any drag under way and nothing is played; taps are ignored until every finger is up (and a quarter second after).
   v0.21: a thumb resting on the screen's edge or on a bar's bare background is not a second finger until it moves (input.js, resting) */
var touches = {}, touchN = 0, multiT = false, multiTT = null;
function okPointer(e) { return !multiT && SSInput.primary(e); }   // the right or middle mouse button never drags, taps or plays a card
function cancelGestures() { press = null; dragCancel(); }
function secondFinger() { if (touchN > 1) { multiT = true; clearTimeout(multiTT); cancelGestures(); } }
addEventListener("pointerdown", function (e) { if (e.pointerType !== "touch") return touchReset(); touchSafe(); if (e.isPrimary) { touches = {}; touchN = 0; }
  if (!touches[e.pointerId]) { var rest = SSInput.resting(e); touches[e.pointerId] = { rest: rest, x: e.clientX, y: e.clientY }; if (!rest) touchN++; }
  secondFinger(); }, true);   // capture: before the card's own handlers; a mouse or pen press clears any stuck finger count
function touchUp(e) { var t = e.pointerType === "touch" && touches[e.pointerId]; if (!t) return; touchSafe(); delete touches[e.pointerId]; if (!t.rest) touchN = Math.max(0, touchN - 1); if (!touchN && multiT) { clearTimeout(multiTT); multiTT = setTimeout(function () { multiT = false; }, 250); } }
addEventListener("pointerup", touchUp, true); addEventListener("pointercancel", touchUp, true);
addEventListener("click", function (e) { if (multiT && e.detail !== 0) { e.stopPropagation(); e.preventDefault(); } }, true);   // a two-finger touch never presses a button or plays a card (a keyboard press, detail 0, always goes through)
/* v0.20.2: the finger count can never stick. If a finger's "up" is lost (the browser or the phone swallowed it), the count clears when the window
   loses focus or is hidden, on any mouse or pen press, on any key, and 2 seconds after the last touch event of any kind */
var touchST = null;
function touchReset() { clearTimeout(touchST); clearTimeout(multiTT); touches = {}; touchN = 0; multiT = false; }
function touchSafe() { clearTimeout(touchST); touchST = setTimeout(touchReset, 2000); }
addEventListener("pointermove", function (e) { if (e.pointerType !== "touch") return; var t = touches[e.pointerId]; if (touchN || t) touchSafe(); if (t && t.rest && SSInput.restMoved(t, e)) { t.rest = false; touchN++; secondFinger(); } }, true);   // a resting thumb that moves becomes a finger like any other
addEventListener("blur", function () { touchReset(); if (drag) dragCancel(); });
document.addEventListener("visibilitychange", function () { touchReset(); if (drag) dragCancel(); });
addEventListener("keydown", function () { if (touchN || multiT) touchReset(); }, true);
function infOpt(uid) { var M = maps(), l = M.src[uid] || []; for (var k = 0; k < l.length; k++) if (/to infiltrate/.test(G.pend.options[l[k]])) return l[k]; return -1; }   /* an Operator's INFILTRATE option */
function ghostAt(x, y, type) { var g = $("dragGhost"); g.style.left = x + "px"; g.style.top = (type === "touch" ? y - SSInput.LIFT : y) + "px"; }   // v0.21: on touch the card rides above the finger
/* v0.21 (rules audit, drag hint): whether an option goes to the Mission Track is decided from the option's data, never from its wording.
   Orders and Missions are tagged "effect" by the engine; a Reaction card played from the hand is tagged "react" (it goes to the Mission
   Track and happens at once: Decision Register draft entry H). A Reaction by a card on the table (cover, intercept) is not a track play. */
function trackOpt(i) { var m = ((G.pend && G.pend.meta) || [])[i] || {}; return m.t === "effect" || (m.t === "react" && !!m.card); }
function trackOpts(list) { return (list || []).filter(trackOpt); }
function trackHint(c) {   // what letting go over the Mission Track will do, from the card's own timer (Missions wait; Orders and Reactions happen now)
  var f = (G.faces || {})[c.name] || c, tm = +f.timer || 0;
  return "Let go: to the Mission Track · " + (tm > 0 && f.sub !== "Reaction" ? tm + " round" + (tm === 1 ? "" : "s") + " to H-Hour" : "H-Hour: happens now");
}
/* v0.19.4 (his 16 Nov note): while you drag, the places that take the card light up, and a line under the card says what letting go will do */
function shortOpt(t) { return mvShort(String(t).split(/ \(|: /)[0]); }
/* v0.21 (lead's phone notes 6): your own table cards can be dragged between your Frontline and your Rear Area while you arrange the rows;
   each row lights up as a drop band, and letting go anywhere else (or Esc, a second finger, the dock) moves nothing */
var ROWZ = { front: 1.72, rear: 4.12 };
function rowRect(z) { var hw = RW / 2 + .25, hz = 1.2, pts = [[-hw, z - hz], [hw, z - hz], [-hw, z + hz], [hw, z + hz]].map(function (q) { return screenPos(new THREE.Vector3(q[0], .42, q[1])); });
  var r = { l: Math.min.apply(0, pts.map(function (q) { return q.x; })), r: Math.max.apply(0, pts.map(function (q) { return q.x; })), t: Math.min.apply(0, pts.map(function (q) { return q.y; })), b: Math.max.apply(0, pts.map(function (q) { return q.y; })) };
  if (FR) { r.l = Math.max(r.l, FR.L); r.r = Math.min(r.r, FR.R); r.t = Math.max(r.t, FR.T); r.b = Math.min(r.b, FR.B); } return r; }
function rowOpts(uid) { var M = maps(), out = {}; (M.src[uid] || []).forEach(function (i) { var l = G.pend.options[i]; if (/^Move .* up to the Frontline/.test(l)) out.front = i; else if (/^Move .* back to the Rear Area/.test(l)) out.rear = i; }); return out; }
function rowAt(x, y) { var f = rowRect(ROWZ.front), r = rowRect(ROWZ.rear), mid = (f.b + r.t) / 2, inX = function (q) { return x >= q.l - 8 && x <= q.r + 8; };
  if (inX(f) && y >= f.t && y < mid) return "front"; if (inX(r) && y >= mid && y <= r.b) return "rear"; return null; }
function rowMove(d, x, y) { if (!d || d.kind !== "unit" || !G.pend) return -1; var ro = rowOpts(d.uid), w = rowAt(x, y); return w && ro[w] != null ? ro[w] : -1; }
function rowBands(d, x, y) { var el = $("rowband"); if (!d) { if (el) el.innerHTML = ""; return; } var ro = rowOpts(d.uid); if (ro.front == null && ro.rear == null) return;
  if (!el) { el = document.createElement("div"); el.id = "rowband"; el.setAttribute("aria-hidden", "true"); document.body.appendChild(el); }
  var w = x == null ? null : rowAt(x, y), h = ""; ["front", "rear"].forEach(function (k) { if (ro[k] == null) return; var q = rowRect(ROWZ[k]); h += '<div class="' + (w === k ? "hov" : "") + '" style="left:' + Math.round(q.l) + "px;top:" + Math.round(q.t) + "px;width:" + Math.round(q.r - q.l) + "px;height:" + Math.round(q.b - q.t) + 'px"><span>' + (k === "front" ? "Let go: Frontline" : "Let go: Rear Area") + "</span></div>"; }); el.innerHTML = h; }
function dragStartHints(d) { var M = maps(), l = d.kind === "card" ? (M.card[d.c.id] || []) : (M.src[d.uid] || []);
  d.canTrack = d.kind === "card" ? trackOpts(l).length > 0 : infOpt(d.uid) >= 0; $("mtrack").classList.toggle("can", !!d.canTrack); document.body.classList.add("dragging"); }
function dragTip(d, x, y) { var g = $("dragGhost"), tip = g.querySelector(".dtip"); if (!tip) { tip = document.createElement("div"); tip.className = "dtip"; g.appendChild(tip); }   // dtip, not tip: Settings > Tips hides .tip
  var M = maps(), pend = G.pend, over = document.elementFromPoint(x, y), onTrack = overTrack(x, y), onHand = !!(over && over.closest && over.closest("#hand,#bot")), mine = d.kind === "card" ? (M.card[d.c.id] || []) : [], o = targetAt(x, y, M.dsts), t = "", ok = false;
  if (!pend) t = "";
  else if (d.kind === "card" && onTrack && !d.canTrack && isCap((G.faces || {})[d.c.name] || d.c)) t = "Only Effect cards and Operators go on the Mission Track";
  else if (d.kind === "card" && !mine.length) t = (tableFull() && pend.kind === "deploy" && isCap((G.faces || {})[d.c.name] || d.c) ? "Table full (" + tableFull() + "): withdraw a card or upgrade" : (pend.hand_notes || {})[d.c.name] || "This card cannot be played right now");
  else if (d.kind === "card" && dropOff(x, y, d)) t = "Let go: back to your hand";
  else if (d.kind === "unit" && dropOff(x, y, d)) t = "Let go: cancel";
  else if (d.kind === "unit" && rowMove(d, x, y) >= 0) { ok = true; t = "Let go: " + shortOpt(pend.options[rowMove(d, x, y)]); }
  else if (onTrack) { ok = !!d.canTrack; t = ok ? (d.kind === "card" ? trackHint(d.c) : "Let go: infiltrate the Mission Track") : d.kind === "card" ? "Only Effect cards and Operators go on the Mission Track" : "Only Operators infiltrate the Mission Track"; }
  else if (o && M.dsts[o.uid] && (d.kind === "unit" || mine.some(function (i) { return M.dsts[o.uid].indexOf(i) >= 0; }))) { var dd = M.dsts[o.uid]; ok = true; t = dd.length === 1 ? "Let go: " + shortOpt(pend.options[dd[0]]) + (o.u && o.u.name && shortOpt(pend.options[dd[0]]).indexOf(o.u.name) < 0 ? " → " + o.u.name : "") : "Let go: choose how, on " + (o.u && o.u.name || "this card"); }
  else if (d.kind === "card") { var pick = mine.filter(function (i) { return !(pend.meta[i] || {}).dst && !trackOpt(i); }), up = pick.filter(function (i) { return !/face down|decoy/.test(pend.options[i]); });
    if (d.canTrack && !pick.length) t = "Drag it onto the Mission Track"; else if (up.length === 1) { ok = true; t = "Let go: " + shortOpt(pend.options[up[0]]); } else if (pick.length === 1) { ok = true; t = "Let go: " + shortOpt(pend.options[pick[0]]); } else if (pick.length) { ok = true; t = "Let go: choose how to play it"; } else t = "Drag it onto a target"; }
  else t = d.canTrack ? "Drag onto a target or the Mission Track" : "Drag it onto a target";
  tip.textContent = t; tip.style.display = t ? "" : "none"; g.classList.toggle("ok", ok); tip.style.marginLeft = "0px"; if (t) { var tr = tip.getBoundingClientRect(), sh = tr.left < 6 ? 6 - tr.left : tr.right > innerWidth - 6 ? innerWidth - 6 - tr.right : 0; if (sh) tip.style.marginLeft = Math.round(sh) + "px"; } }   // kept on screen near the edges (the Mission Track sits at the left)
/* v0.20.2: where a drag may land. Let go outside the window, at the very edge of the screen, or on the dock (the hand band, the panel, your
   status) and nothing is played: the card goes back. Cards and targets are always inside the table's frame, and the Mission Track has its own drop. */
function dropOff(x, y, d) {
  if (!(x > 3 && y > 3 && x < innerWidth - 3 && y < innerHeight - 3)) return "edge";
  if (d && d.kind === "marker") return "";
  if (overTrack(x, y)) return "";
  var hit = function (el) { if (!el || !el.offsetWidth) return false; var r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  var band = isPh() && (function () { var r = $("hand").getBoundingClientRect(); return y >= r.top - 60 && y <= r.bottom && x >= r.left - 12 && x <= r.right + 12; })();   // the drawer's "back to your hand" band (58 px over the handle), measured from the handle: the hidden strip's own box must not count
  if (band && d && d.kind !== "marker") { var Mb = maps(), ob = targetAt(x, y, Mb.dsts), mineB = d.kind === "card" ? (Mb.card[d.c.id] || []) : (Mb.src[d.uid] || []); if (ob && Mb.dsts[ob.uid] && Mb.dsts[ob.uid].some(function (i) { return mineB.indexOf(i) >= 0; })) band = false; }   // a legal target under the band wins: the band never hides a card you can drop on
  if (band || hit($("bot")) || hit($("hand")) || hit($("prompt")) || hit($("me"))) return "dock";   // v0.21: the whole dock (the hand tucks away while a card is lifted, so its place still counts as the hand)
  if (FR && (y > FR.B + 6 || y < FR.T - 6)) return "dock";
  return "";
}
function dragEndHints() { rowBands(null); $("mtrack").classList.remove("can"); document.body.classList.remove("dragging"); var g = $("dragGhost"); g.classList.remove("ok", "unit"); }
function dragLift(d) {   // past the slop: the card lifts, the places that take it light up, and the hand tucks out of the way (CSS, body.dragging)
  d.on = true;
  if (d.kind === "card") { var g = $("dragGhost"); g.innerHTML = ""; var im = new Image(); im.src = d.im.src; im.draggable = false; g.appendChild(im); g.style.display = "block"; var M = maps(); if (M.card[d.c.id]) { G.sel = d.c.id; G.selT = null; render(); } }
  if (d.kind === "unit") { var gu = $("dragGhost"), ou = O[d.uid]; gu.innerHTML = ""; gu.classList.add("unit"); try { var iu = new Image(); iu.src = drawCard(ou.u, 1, { side: ou.side, glance: PREF.glance }).toDataURL("image/jpeg", .85); gu.appendChild(iu); } catch (e2) { } gu.style.display = "block"; if (d.start) { d.start(); d.start = null; } }   // v0.19.4: a table card you drag travels with the pointer too
  if (d.kind !== "marker") dragStartHints(d);
  if (d.kind === "unit") rowBands(d);
}
addEventListener("pointermove", function (e) {
  if (!drag || (drag.id != null && e.pointerId !== drag.id)) return;
  if (e.pointerType !== "touch" && !e.buttons) return dragCancel();   // v0.20.2: the mouse button was let go outside the window: nothing is played
  if (drag.dead) return;
  if (drag.hs) { var st0 = $("hand").querySelector(".strip"); if (st0) st0.scrollLeft = drag.hs.x0 - (e.clientX - drag.x); e.preventDefault(); return; }   // v0.21 (WP9): the open drawer scrolls sideways under the finger
  if (!drag.on) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) <= SSInput.slop(e.pointerType)) return; if (multiT) return dragCancel();
    var st1 = drag.kind === "card" && isPh() && $("hand").querySelector(".strip");
    if (st1) { var ddx = e.clientX - drag.x, ddy = e.clientY - drag.y;   // v0.21 (checkers): from the phone drawer a card lifts only when the move is more upward than sideways (within 45 degrees of straight up) at the moment it leaves the slop
      if (!(-ddy > Math.abs(ddx))) { if (st1.scrollWidth - st1.clientWidth > 2 && Math.abs(ddx) >= Math.abs(ddy)) { drag.hs = { x0: st1.scrollLeft }; return; } drag.dead = true; return; } }   // sideways scrolls the strip if it can; otherwise (or downward) the press does nothing at all
    dragLift(drag); drawerAuto(); }
  e.preventDefault();
  if (drag.kind !== "marker") { ghostAt(e.clientX, e.clientY, e.pointerType); dragTip(drag, e.clientX, e.clientY); if (drag.kind === "unit") rowBands(drag, e.clientX, e.clientY); }
  if (drag.kind === "card") { $("mtrack").classList.toggle("drop", !!drag.canTrack && overTrack(e.clientX, e.clientY)); var M2 = maps(), ho = targetAt(e.clientX, e.clientY, M2.dsts); G.hoverDst = ho && M2.dsts[ho.uid] ? ho.uid : null; }
  if (drag.kind === "unit") { var M3 = maps(), ho2 = targetAt(e.clientX, e.clientY, M3.dsts); G.hoverDst = ho2 && M3.dsts[ho2.uid] ? ho2.uid : null; $("mtrack").classList.toggle("drop", overTrack(e.clientX, e.clientY) && infOpt(drag.uid) >= 0); }
  if (drag.kind === "marker") routeHover(e.clientY);
}, { passive: false });
/* v0.21 (Decision Register draft entry H): a card let go on the Mission Track is shown landing there, at H-Hour, before it is played */
function landOnTrack(i, d) {
  var g = $("dragGhost"), mt = $("mtrack"), hhs = mt.querySelectorAll(".ms.hh"), hh = hhs[hhs.length - 1] || mt, r = hh.getBoundingClientRect();
  if (G.rm || G.skip || !g.firstChild) return choose(i);
  G.landing = true; g.classList.add("land"); g.style.display = "block"; var tip = g.querySelector(".dtip"); if (tip) tip.style.display = "none";
  g.style.left = Math.round(r.left + r.width / 2) + "px"; g.style.top = Math.round(r.top + r.height / 2) + "px";
  mt.classList.add("drop"); hhPulse(); SFX.deploy();
  setTimeout(function () { G.landing = false; g.classList.remove("land"); g.style.display = "none"; mt.classList.remove("drop"); choose(i); }, 420);
}
addEventListener("pointerup", function (e) {
  if (drag && drag.id != null && e.pointerId !== drag.id) return;   // another finger lifted: the drag carries on
  var d = drag; drag = null; if (d && d.hs) return; if (G.landing) return; $("dragGhost").style.display = "none"; $("mtrack").classList.remove("drop"); dragEndHints(); if (fitHeld) { fitHeld = false; requestFit(); } if (!d || !d.on) return; dragged = true; setTimeout(function () { dragged = false; }, 50); G.hoverDst = null;
  if (!liveDecision()) return; var M = maps(), pend = G.pend, x = e.clientX, y = e.clientY;
  if (dropOff(x, y, d)) { routeZones().forEach(function (z) { z.classList.remove("hov"); }); if (d.kind !== "marker") { G.sel = null; G.selT = null; handKey = ""; } return render(); }   // v0.20.2: off the table: nothing is played
  if (d.kind === "card") {
    var mine = M.card[d.c.id] || [], over = document.elementFromPoint(x, y), onTrack = overTrack(x, y), onHand = !!(over && over.closest && over.closest("#hand,#bot"));
    var back = function () { G.sel = null; G.selT = null; handKey = ""; return render(); };
    if (!mine.length) { if (tableFull() && pend.kind === "deploy") feed("Table full (" + tableFull() + "): withdraw a card or upgrade."); return back(); }   // (letting go on the hand or its band was handled by dropOff above)   // v0.21: a card that cannot be played goes back (the line under it said why); a drag never opens the Inspector
    if (onTrack) { var tr = trackOpts(mine); if (tr.length === 1) { $("dragGhost").style.display = "block"; return landOnTrack(tr[0], d); } return back(); }   // only an Effect (or a Reaction, in a reaction prompt) goes on the track
    var o = targetAt(x, y, M.dsts);
    if (o && M.dsts[o.uid]) { var dd = M.dsts[o.uid].filter(function (i) { return mine.indexOf(i) >= 0; }); if (dd.length) { if (dd.length === 1 && (pend.meta[dd[0]] || {}).t !== "attack") return choose(dd[0]); return preview(dd); } }   // onto a card: upgrade it, or aim at it
    var pick = mine.filter(function (i) { return !(pend.meta[i] || {}).dst && !trackOpt(i); });
    if (!pick.length) return back();   // an Effect let go on the field is not played: it goes on the Mission Track ("Drag it onto the Mission Track")
    var up = pick.filter(function (i) { return !/face down|decoy/.test(pend.options[i]); }); if (up.length === 1) return choose(up[0]); if (!up.length && pick.length === 1) return choose(pick[0]);
    G.sel = d.c.id; G.selT = null; handKey = ""; return render();   // more than one way to play it: the choices are listed in the panel
  }
  if (d.kind === "unit") { if (overTrack(x, y) && infOpt(d.uid) >= 0) return choose(infOpt(d.uid)); var rmv = rowMove(d, x, y); if (rmv >= 0) { G.sel = null; G.selT = null; return choose(rmv); }
    var t = targetAt(x, y, M.dsts); if (t && M.dsts[t.uid]) { var ds = M.dsts[t.uid]; if (ds.length === 1 && (pend.meta[ds[0]] || {}).t !== "attack") return choose(ds[0]); return preview(ds); } G.sel = null; G.selT = null; return render(); }
  if (d.kind === "marker") routeDrop(y);
});
function dragCancel() { var d = drag; if (!d) return; drag = null; if (d.hs) return; if (G.landing) return; $("dragGhost").style.display = "none"; $("mtrack").classList.remove("drop"); dragEndHints(); G.hoverDst = null; routeZones().forEach(function (z) { z.classList.remove("hov"); }); if ((d.kind === "card" || d.kind === "unit") && d.on) { G.sel = null; G.selT = null; handKey = ""; } if (d.on) render(); if (fitHeld) { fitHeld = false; requestFit(); } }
addEventListener("pointercancel", function (e) { if (drag && drag.id != null && e.pointerId !== drag.id) return; dragCancel(); });   // the phone took the touch away (a call, a system gesture): drop nothing, clear the drag
$("gl").addEventListener("pointerdown", function (e) { if (!liveDecision() || isMulti(G.pend) || !okPointer(e)) return; var o = objAt(e.clientX, e.clientY), M = maps(); if (o && M.src[o.uid] && M.src[o.uid].some(function (i) { return (G.pend.meta[i] || {}).dst || /to infiltrate|^Move .* (up to the Frontline|back to the Rear Area)/.test(G.pend.options[i]); })) drag = { kind: "unit", uid: o.uid, x: e.clientX, y: e.clientY, on: false, id: e.pointerId, type: e.pointerType, start: function () { G.sel = o.uid; G.selT = null; render(); } }; });
/* Escape cancels: a drag, then the Inspector, then an attack preview, then targeting (spec 1.3) */
addEventListener("keydown", function (e) {
  if (e.key !== "Escape" || e.defaultPrevented) return; var t = e.target; if (t && t.closest && t.closest("input,textarea,select,#notice")) return;
  if (drag) { e.preventDefault(); return dragCancel(); }
  if ($("zoom").style.display === "flex") { e.preventDefault(); return closeInspector(); }
  var pan = [["send", "sendX"], ["settings", "setX"], ["log", "logX"], ["piles", "pilesX"], ["fm", "fmX"], ["lib", "libX"]].filter(function (q) { var el = $(q[0]); return el && el.style.display === "block" && $(q[1]); })[0];   // v0.21 (checkers): Esc closes the open panel, and focus goes back to what opened it
  if (pan) { e.preventDefault(); $(pan[1]).click(); var rf = G.retFocus; G.retFocus = null; try { if (rf && rf.focus && document.contains(rf)) rf.focus({ preventScroll: true }); } catch (x) { } return; }
  if (pvOpen()) { e.preventDefault(); closePreview(); handKey = ""; return render(); }   // one level per press: the preview first, then targeting
  if (G.sel || G.pvDst) { e.preventDefault(); cancelTargeting(); }
});
function routeZones() { return Array.prototype.slice.call($("route").querySelectorAll("div")); }
function routeMoves() { var pend = G.pend, out = {}; if (!pend || pend.kind !== "maneuver") return out; pend.options.forEach(function (o, i) { var m = o.match(/^Advance (\d+) Zone/); if (m) out[+m[1]] = i; else if (/^Fall back/.test(o)) out[-1] = i; else if (/^Hold/.test(o)) out[0] = i; }); return out; }
function zoneAtY(y) { var zs = routeZones(), v = G.view; for (var k = 0; k < zs.length; k++) { var r = zs[k].getBoundingClientRect(); if (y >= r.top - 2 && y <= r.bottom + 2) return v.Z - k; } return null; }
function routeHover(y) { var z = zoneAtY(y), v = G.view; routeZones().forEach(function (d, k) { d.classList.toggle("hov", z != null && v.Z - k === z); }); }
function routeDrop(y) { var z = zoneAtY(y), v = G.view, mv = routeMoves(); routeZones().forEach(function (d) { d.classList.remove("hov"); }); if (z == null) return; var steps = z - v.you.marker;   // you move up the route toward the enemy
  if (mv[steps] != null) return choose(mv[steps]); feed(steps > 0 && !Object.keys(mv).some(function (k) { return +k > 0; }) ? "You cannot advance right now." + ((G.pend.notes || [])[0] ? " " + G.pend.notes[0] : "") : "That move is not allowed. Your choices: " + G.pend.options.join(", ") + "."); }
$("route").addEventListener("pointerdown", function (e) { if (!G.pend || G.playing || G.pend.kind !== "maneuver" || !okPointer(e)) return; e.preventDefault(); drag = { kind: "marker", x: e.clientX, y: e.clientY, on: false, id: e.pointerId, type: e.pointerType }; });
$("route").addEventListener("click", function (e) { if (dragged || !G.pend || G.playing || G.pend.kind !== "maneuver") return; routeDrop(e.clientY); });

/* ================= Basic Training: the coach (v0.17, Stage D) ================= */
function coachPages(p) { return (p.coach && p.coach.pages) || []; }
function pgT(x) { return x && typeof x === "object" ? x.t || "" : String(x || ""); }   /* v0.19: a lesson page is a sentence or {t, h, spot} */
function coachReady(p) { return !p.coach || (G.cpage[p.n] || 0) >= coachPages(p).length; }
function coachBox(p) {
  var c = p.coach; if (!c) return "";
  var pg = coachPages(p), k = Math.min(G.cpage[p.n] || 0, pg.length), reading = k < pg.length, h = '<div class="coach' + (c.drift ? " drift" : "") + '">';
  var pk = reading && pg[k] && typeof pg[k] === "object" && pg[k].h ? pg[k] : null;   // v0.19: a briefing page carries its own heading
  h += '<p class="ck">' + esc(pk ? (pk.lesson || "Briefing") + " · " + (pk.k || "") : c.free ? "Basic Training" : (c.lesson ? c.lesson + " · " : "") + "step " + c.n + " of " + c.of) + '</p><p class="ct">' + esc(pk ? pk.h : c.title || "") + "</p>";
  if (reading) h += '<p class="cx">' + esc(pgT(pg[k])) + '</p><div class="btns">' + (k ? '<button class="ghost" id="cBack">Back</button>' : "") + '<button class="cgo" id="cNext">Next' + (function () { var own = pg.filter(function (x) { return !(x && x.lesson); }), j = own.indexOf(pg[k]); return pk || own.length < 2 ? "" : " (" + (j + 1) + " of " + own.length + ")"; })() + "</button></div>";
  else { if (k && pg.length) h += '<p class="cr"><button class="ghost lk" id="cBack">Read the note again</button></p>';
    h += '<p class="cd">' + esc(c.do || "") + "</p>" + (G.nudge && G.nudge.n === p.n ? '<p class="cn">' + esc(c.nudge || "Not that one yet. " + (c.do || "")) + "</p>" : ""); }
  return h + "</div>";
}
/* v0.19 (Basic Training v0.3): a moment explains an event as it happens; the game waits until Continue */
function momentFor(f) {
  var t = G.info && G.info.tutorial, ms = (t && t.moments) || []; if (!ms.length || G.replay || G.skip || (G.info && G.info.spectate)) return null; G.momDone = G.momDone || {};
  for (var i = 0; i < ms.length; i++) { var m = ms[i]; if (G.momDone[i] || (m.round && f.view && f.view.round !== m.round)) continue; var re; try { re = new RegExp(m.match); } catch (e) { continue; } if (re.test(f.text)) { G.momDone[i] = 1; return { m: m, k: 0 }; } }
  return null;
}
function momentBox() {
  var mo = G.moment, m = mo.m, pg = m.pages || [], k = Math.min(mo.k, pg.length - 1), last = k >= pg.length - 1;
  return '<div class="coach moment"><p class="ck">' + esc((m.lesson ? m.lesson + " · " : "") + "what just happened") + '</p><p class="ct">' + esc(m.title || "") + '</p><p class="cx">' + esc(pgT(pg[k])) + '</p><div class="btns">' + (k ? '<button class="ghost" id="cMomB">Back</button>' : "") + '<button class="cgo" id="cMom">' + (last ? "Continue" : "Next (" + (k + 1) + " of " + pg.length + ")") + "</button></div></div>";
}
function momentGo(back) {
  var mo = G.moment; if (!mo) return; var n = (mo.m.pages || []).length;
  if (back) { mo.k = Math.max(0, mo.k - 1); return render(); }
  if (mo.k < n - 1) { mo.k++; SFX.select && SFX.select(); return render(); }
  G.moment = null; SFX.select && SFX.select(); render(); var gen = G.pgen; after(.35, function () { if (gen === G.pgen) playNext(); });
}
/* v0.19: the coach points at what it is talking about (a part of the screen, or a row of the table) */
var SPOTS = { hand: ["hand", "Your hand"], route: ["route", "The route: 5 Zones"], mtrack: ["mtrack", "Mission Track"], you: ["you", "Your status bar"], foe: ["foe", "Enemy status bar"], phase: ["phase", "Round and phase"], prompt: ["prompt", ""], win: ["bWin", "How to win"],
  front: [1.72, "Your Frontline"], rear: [4.12, "Your Rear Area"], bases: [5.84, "Your Bases"], efront: [-1.72, "Enemy Frontline"], erear: [-4.12, "Enemy Rear Area"], ebases: [-5.84, "Enemy Bases"] };
function spotNow() {
  if (G.over && !G.playing) return null;
  if (G.moment) { var mp = (G.moment.m.pages || [])[G.moment.k]; return mp && mp.spot; }
  var p = G.pend; if (!p || G.playing || !p.coach || coachReady(p)) return null; var pg = coachPages(p)[G.cpage[p.n] || 0]; return pg && pg.spot;
}
function spotTarget(name) {   /* v0.21 (lead's phone notes 4): the live box of the thing a coach highlight names, measured now */
  var d = SPOTS[name]; if (!d) return null; var r = null;
    if (typeof d[0] === "string") { var t = $(d[0]); if (!t || t.hidden || getComputedStyle(t).display === "none") return null; var b = t.getBoundingClientRect(); if (b.width < 2 || b.height < 2) return null; r = { l: b.left, t: b.top, r: b.right, b: b.bottom };
      if (name === "hand" && isPh() && !t.classList.contains("open")) { var hb = t.querySelector(".hhandle"); if (hb) { var hq = hb.getBoundingClientRect(); r = { l: hq.left, t: hq.top, r: hq.right, b: hq.bottom }; } }   // v0.21 (lead's phone notes 4): a tucked hand is its handle; the hidden strip's cards are not where the hand is
      else if (name === "hand") { var ims = t.querySelectorAll(".strip img"); if (ims.length) { r = { l: 1e9, t: 1e9, r: -1e9, b: -1e9 }; Array.prototype.forEach.call(ims, function (im) { var q = im.getBoundingClientRect(); r.l = Math.min(r.l, q.left); r.t = Math.min(r.t, q.top); r.r = Math.max(r.r, q.right); r.b = Math.max(r.b, q.bottom); }); var sq = t.querySelector(".strip").getBoundingClientRect(); r.l = Math.max(r.l, sq.left); r.r = Math.min(r.r, sq.right); } } }   // v0.20.1: the hand's outline sits on the cards, not on the whole strip
    else { var hw = name.indexOf("bases") >= 0 ? 2.75 : RW / 2 + .25, hz = name.indexOf("bases") >= 0 ? .5 : 1.02, pts = [[-hw, d[0] - hz], [hw, d[0] - hz], [-hw, d[0] + hz], [hw, d[0] + hz]].map(function (q) { return screenPos(new THREE.Vector3(q[0], .42, q[1])); });
      r = { l: Math.min.apply(0, pts.map(function (q) { return q.x; })), r: Math.max.apply(0, pts.map(function (q) { return q.x; })), t: Math.min.apply(0, pts.map(function (q) { return q.y; })), b: Math.max.apply(0, pts.map(function (q) { return q.y; })) };
      if (FR) { r.l = Math.max(r.l, FR.L); r.r = Math.min(r.r, FR.R); r.t = Math.max(r.t, FR.T - 8); r.b = Math.min(r.b, FR.B - 2); } }   // v0.20.1: a table row's outline stays inside the table's frame, off the coach panel and the rails
    if (typeof d[0] === "string" && name !== "hand" && name !== "prompt" && name !== "you") { var pt = $("prompt").getBoundingClientRect(); if (pt.height && r.l < pt.right && r.r > pt.left) r.b = Math.min(r.b, pt.top - 7); }   // v0.20.2: an outline above the panel stops short of it
  return r;
}
function spotCheck() { var out = []; Array.prototype.forEach.call(document.querySelectorAll("#spots .spot"), function (x) { var name = x.dataset.name, r = name && spotTarget(name); if (!r) return; var q = x.getBoundingClientRect(), want = { l: Math.max(2, r.l - 4), t: Math.max(2, r.t - 4), r: Math.min(W - 2, r.r + 4), b: Math.min(H - 4, r.b + 4) }; out.push({ name: name, off: Math.round(Math.max(Math.abs(q.left - want.l), Math.abs(q.top - want.t), Math.abs(q.right - want.r), Math.abs(q.bottom - want.b))) }); }); return out; }
function spotlight() {
  try { pickTable(); targetPlates(); } catch (e) { }   // v0.21: the PICK boxes and TARGET plates follow the table as the outlines do
  var el = $("spots"); if (!el) { el = document.createElement("div"); el.id = "spots"; document.body.appendChild(el); }
  var sp = spotNow(), list = !sp ? [] : Array.isArray(sp) ? sp : [sp], key = list.join(",") + "|" + W + "x" + H + "|" + (G.fitN || 0) + "|" + (camEase ? "e" : "");
  if (el.dataset.k === key) return; el.dataset.k = key; el.innerHTML = "";
  list.forEach(function (name) {
    var d = SPOTS[name]; if (!d) return; var r = spotTarget(name); if (!r) return;
    var pad = 4, x = document.createElement("div"); x.className = "spot"; x.dataset.name = name; x.style.left = Math.max(2, r.l - pad) + "px"; x.style.top = Math.max(2, r.t - pad) + "px"; x.style.width = Math.max(10, Math.min(W - 4, r.r + pad) - Math.max(2, r.l - pad)) + "px"; x.style.height = Math.max(10, Math.min(H - 4, r.b + pad) - Math.max(2, r.t - pad)) + "px";
    if (d[1]) { var lb = document.createElement("span"); lb.textContent = d[1]; x.appendChild(lb); var pb = $("prompt").getBoundingClientRect(), onPr = typeof d[0] === "string" && pb.height > 0 && r.t - 28 < pb.bottom && r.t > pb.top && r.l < pb.right && r.r > pb.left;   // v0.20.1: a label that would sit on the coach panel goes inside the outline, at the right
      lb.className = (typeof d[0] !== "string" ? "in" : onPr ? "in rt" : r.t < 30 ? "below" : "") + (typeof d[0] === "string" && !onPr && r.r > W - 170 ? " rt" : "");
      if (name.indexOf("bases") >= 0) lb.style.cssText = "top:50%;transform:translateY(-50%);" + ((FR ? FR.R - r.r : W - r.r) >= (FR ? r.l - FR.L : r.l) ? "left:calc(100% + 6px)" : "left:auto;right:calc(100% + 6px)"); }   // v0.20.1: the Bases are small on a phone: their label goes beside them, not on them
    el.appendChild(x);   // table rows: the label sits inside, so stacked rows do not collide
    var lbx = x.querySelector("span"); if (lbx && typeof d[0] === "string") { var lq = lbx.getBoundingClientRect(), pq = $("prompt").getBoundingClientRect(); var onP = function (q) { return pq.height && q.right > pq.left && q.left < pq.right && q.bottom > pq.top && q.top < pq.bottom; }; if (onP(lq)) { lbx.className = "in"; if (onP(lbx.getBoundingClientRect())) lbx.remove(); } }   /* no room for it anywhere: the outline alone, the coach's words name the place */   // v0.20.2: a label that would sit on the panel's text goes inside its outline
  });
}
function coachEnd() {
  var t = G.info.tutorial || {}, e = (t.end || {})[G.over.winner === "You" ? "win" : "other"] || {}, pages = e.pages || [];
  return '<div class="coach end"><p class="ck">' + esc(t.name || "Basic Training") + ' · complete</p><p class="ct">' + esc(e.title || "Basic Training is over") + "</p>" + (e.next ? '<p class="cd">' + esc(e.next) + "</p>" : "") +
    '<div class="btns">' + (SITE ? '<button class="cgo" id="pSend">✉ Provide Feedback</button><button class="ghost" id="cPlay">Play the bot</button>' : '<button class="cgo" id="cPlay">Play the bot</button>') + '<button class="ghost" id="cFM">Field Manual</button><button class="ghost" id="pDebrief">Debrief</button><button class="ghost" id="pNew">Exit to the Main Menu</button></div>' + pages.map(function (x) { return '<p class="cx">' + esc(x) + "</p>"; }).join("") + "</div>";
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
    '<div class="fmb" data-fm="how">' + (groups.length ? groups.map(function (g) { return "<h4>" + esc(g.lesson) + "</h4>" + g.items.map(function (x) { return '<p class="fq">' + esc(x.title) + "</p>" + x.pages.map(function (y) { return "<p>" + esc(pgT(y)) + "</p>"; }).join(""); }).join(""); }).join("") : "<p>Basic Training is not on this copy of the page.</p>") + "</div>" +
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
  ["deploy", function (p) { return p.kind === "deploy"; }, "Command: deploy cards from your hand. Each costs its Deploy number in Supply and 1 Lift. New cards arrive in your Rear Area. Tap any card to read all of it; drag a card to the table to deploy it, or tap it and choose Deploy."],
  ["hidden", function (p) { return p.kind === "deploy" && p.options.some(function (o) { return /face down/.test(o); }); }, "Deploying face down makes a Hidden card: it costs no Supply now, and the enemy pays {hidden_isr} more ISR to attack it. Revealing it later costs its Deploy cost."],
  ["upgrade", function (p) { return p.kind === "deploy" && p.options.some(function (o) { return /^Upgrade /.test(o); }); }, "Upgrade: a Generation II or III card can replace a card in play that its Upgrades From line names. You pay only the difference in Supply."],
  ["discard", function (p) { return p.kind === "discard"; }, "Command starts with a choice: discard any cards you will not use soon, then draw back up to 5."],
  ["arrange", function (p) { return p.kind === "arrange"; }, "Frontline cards fight and count for Frontline Strength. Rear Area cards are safe from close attacks. The Frontline holds a limited number of cards."],
  ["maneuver", function (p) { return p.kind === "maneuver"; }, "Move your Force Marker: advance, hold or fall back. When both markers share a Zone the forces are in Contact."],
  ["action", function (p) { return p.kind === "action"; }, "Operations: you and the enemy take turns, one action each. Tap a glowing card to act. Two passes in a row end the phase."],
  ["contact", function (p, v) { return v && v.contact && (p.kind === "action" || p.kind === "maneuver"); }, "In Contact: Close attacks can reach, and at Assessment the higher Frontline Strength wins the contest. The loser falls back and loses 1 Homefront."],
  ["operator", function (p) { return p.kind === "action" && p.options.some(function (o) { return /to infiltrate/.test(o); }); }, "Operators reach the Mission Track one way: from your Frontline, in Operations, by their INFILTRATE line (1 ISR). They act at H-Hour, then return to your Rear Area."],
  ["effect", function (p) { return p.kind === "action" && (p.meta || []).some(function (m) { return m && m.t === "effect"; }); }, "Effect cards all go to the Mission Track. An Order lands at H-Hour and happens right away; a Mission waits on the track and acts when it reaches H-Hour. Drag a card onto the Mission Track, or tap it and choose Play to Mission Track."],
  ["etrack", function (p, v) { return v && v.bot.track.length > 0; }, "The enemy has a card on its Mission Track. It acts at H-Hour; tap it on the track to read it."],
  ["reaction", function (p) { return p.kind === "reaction"; }, "A Reaction answers the enemy's move. Using it exhausts the card, or spends the Reaction card from your hand: drag that card onto the Mission Track, where it happens at once, or choose it below."],
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
  return G.tipNow && G.tipNow.key ? '<div class="ftip tip"><button class="ghost lk" id="tipX">Got it</button><p><b>First time:</b> ' + esc(G.tipNow.text) + "</p></div>" : "";
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
function needsConfirm(i) { var p = G.pend, l = String(p.options[i] || ""), m = (p.meta || [])[i] || {}; return (p.kind === "action" && m.t !== "attack" && (m.t === "effect" || /^(Pass|Play |Use |Send |Reveal )/.test(l))) || (p.kind === "deploy" && /^Done deploying/.test(l)) || p.kind === "maneuver"; }
function choose(i, sure) {
  if (!G.pend || G.busy) return;
  var co = G.pend.coach; if (co && co.allow && co.allow.indexOf(i) < 0) { G.nudge = { n: G.pend.n }; SFX.select && SFX.select(); return render(); }
  if (co && !coachReady(G.pend)) { G.cpage[G.pend.n] = 99; }
  if (!co && G.tipNow && G.tipNow.key && G.tipNow.n === G.pend.n) tipSeen(G.tipNow.key);
  if (PREF.confirm && !sure && needsConfirm(i)) { G.confirm = { i: i, n: G.pend.n }; SFX.select && SFX.select(); return render(); }
  G.confirm = null; var n = G.pend.n; G.lastChosen = { i: i, n: n, label: G.pend.options[i], meta: (G.pend.meta || [])[i] || null }; SFX.click(); G.hits = []; G.hitsAll = false; G.instrOpen = false; if (G.hgrp) G.hgrp = G.hgrp.own ? null : { cause: G.hgrp.cause, lines: [] };   /* an exchange your choice interrupted (a reaction, a target) keeps its cause for what follows */ closePreview(); closeInspector(true); G.sel = null; G.selT = null; G.pend = null; G.latestPend = null; G.busy = true; handKey = ""; render();
  api("/play/choose", { i: i, n: n }).then(poll, fail);
}
function undo() { if (G.busy) return; G.busy = true; G.sel = null; G.selT = null; G.pend = null; closePreview(); render(); api("/play/undo", {}).then(poll, fail); }
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
  if (G.over && !G.overShown) { G.overShown = true; if (!G.replay) { storeGame(); $("bQuit").textContent = "Exit game"; } var won = G.over.winner === "You", gen = G.pgen; banner(G.info && G.info.spectate || G.replay ? G.over.winner : won ? "Victory" : G.over.winner === "The bot" ? "Defeat" : "Draw", overHow(G.over)); (won ? SFX.win : SFX.lose)(); if (SND) { setMood("debrief", true); if (!(G.info && G.info.spectate)) vox(won ? "win" : "lose", { delay: .5 }); } if (G.info && G.info.tutorial) { if (won) try { localStorage.setItem("ss.trained", "1"); } catch (e) { } } else setTimeout(function () { if (gen === G.pgen && G.over) showDebrief(); }, 1900); }
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
    else if (/^Frontline contest/.test(text) && G.stand && G.standRound !== f.view.round) { G.standRound = f.view.round; var home = f.view.you.marker === 1 ? ((G.info && G.info.names) || ["You"])[0] : ((G.info && G.info.names) || ["", "The bot"])[1]; banner("Last stand", home + " " + (home === "You" ? "defend" : "defends") + " the home edge"); SFX.react(); vox(home === "You" ? "stand" : "advance"); shake = .25; wait = 1.9;
      var cm = text.match(/^Frontline contest: (.+?) (\d+), (.+?) (\d+)\./), nm2 = (G.info && G.info.names) || ["You", "The bot"], youHome = f.view.you.marker === 1;   // v0.21 (ruling B): the result is REPELLED or ROUTED, from the player's side
      if (cm && !(G.info && G.info.spectate)) { var ys = cm[1] === nm2[0] ? +cm[2] : +cm[4], bs = cm[1] === nm2[0] ? +cm[4] : +cm[2], held = youHome ? ys >= bs : bs >= ys; var g2 = G.pgen;
        after(1.6, function () { if (g2 === G.pgen) banner(held ? "REPELLED" : "ROUTED", youHome ? (held ? "You held your home edge" : "You were driven off your home edge") : (held ? "The enemy held its home edge" : "You drove the enemy off its home edge")); }); wait = 3.2; } }
    else if ((pm = text.match(/ (plays|puts) ([A-Z0-9][A-Z0-9 '\-]+?)( on the Mission Track \((\d+) round|[:.])/)) && showcase(pm[2], pm[1] === "puts" ? "On the Mission Track: " + pm[4] + " round" + (pm[4] === "1" ? "" : "s") + " to H-Hour" : isOrder(pm[2]) ? "Mission Track · H-Hour: happens now" : "Played", false)) { SFX.ability(); wait = Math.max(wait, 1.5); if (pm[1] === "plays" && isOrder(pm[2])) hhPulse(); }
    else if ((pm = text.match(/ fires ([A-Z0-9][A-Z0-9 '\-]+?):/)) && showcase(pm[1], "Reaction", true)) { SFX.react(); wait = Math.max(wait, 2.2); }
    else if (/reveals a Hidden card/.test(text)) { wait += .4; }
    else if (/in Contact/.test(text)) { banner("In Contact", "The Frontlines meet"); SFX.round(); vox("contact", { delay: .3 }); wait = 1.4; }
    else if (/ cancels .+ on the Mission Track/.test(text)) vox(/ cancels Your /.test(text) ? "disrupted" : "cyber");
    else if (/^You air-assault/.test(text)) vox("air");
    var isAtk = fx.kind === "attack" && /attack/.test(text) && f.n !== G.lastFx, held = G.heldAtk; G.heldAtk = null;
    sync(f.view, text); feed(text);
    if (prev && G.info && !G.info.spectate && !G.replay) {   /* RC2 (Council F5): "Since your last move" keeps whole exchanges: the line that caused it, then every line that followed, for anything of yours damaged, destroyed, exhausted, revealed or moved, and every Homefront change with its reason */
      var cz0 = isCause(text, fx), gp = G.hgrp, hfl = /\bHomefront\b/.test(text) && /\b(lose|loses|gain|gains)\b/.test(text) && /\b(You|Your|each side)\b/.test(text);
      if (/^--- /.test(text)) G.hgrp = null;   // a new round or phase ends the exchange
      else if (hfl && !(gp && G.hits.indexOf(gp) >= 0 && /lost\)/.test(text))) { G.hits.push({ cause: "", lines: [text] }); wait = Math.max(wait, 2.4); }   // a Homefront change is its own line, with its reason (after a loss in an exchange, it joins that exchange)
      else {
        if (/^You (?!lose|gain)/.test(text)) gp = G.hgrp = { cause: text, lines: [], own: true };   // your own move starts its own exchange (not repeated back to you), unless something of yours is then hit in it
        else if (cz0 || !gp) { gp = G.hgrp = { cause: cz0 ? text : "", lines: cz0 ? [] : [text] }; }
        else gp.lines.push(text);
        if (mineTouched(prev, f.view, text) && !(gp.own && !gp.lines.length)) { if (G.hits.indexOf(gp) < 0) G.hits.push(gp); wait = Math.max(wait, 2.4); } }
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
  var mo = momentFor(f); if (mo) { var g0 = G.pgen; after(Math.min(wait, 1.1), function () { if (g0 === G.pgen) { if (!G.queue.length && G.latest) { G.view = G.latest; sync(G.view); } G.moment = mo; SFX.turn && SFX.turn(); render(); } }); return; }   // v0.19: explain it now; Continue resumes
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
  var gr = $("libGrid"); gr.innerHTML = list.map(function (f) { return '<button data-card="' + esc(f.name) + '"><img alt="' + esc(f.name) + '" draggable="false" data-src="' + esc(f.name) + '">' + esc(f.name) + "</button>"; }).join("");
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
  var de = document.documentElement; de.style.setProperty("--tsz", String(PREF.text)); de.classList.toggle("bigtext", PREF.text >= 1.5); G.rm = reducedMotion(); de.classList.toggle("rm", G.rm); de.classList.toggle("notips", !PREF.tips);
  G.calm = !PREF.shake || G.rm; G.assist = PREF.badges; if (window.SSInput) SSInput.steady = !!PREF.steady; if (redraw !== false) { if (G.view) sync(G.view); fit(); handKey = ""; render(); } speedLabel();
}
function segRow(key, label, sub, opts) { return '<div class="row"><span>' + esc(label) + (sub ? "<small>" + esc(sub) + "</small>" : "") + '</span><div class="seg2" data-pref="' + key + '">' + opts.map(function (o) { return '<button data-v="' + esc(JSON.stringify(o[0])) + '" aria-pressed="' + (PREF[key] === o[0]) + '">' + esc(o[1]) + "</button>"; }).join("") + "</div></div>"; }
function showSettings() { audioInit(); unlock(); SFX.open && SFX.open(); G.retFocus = document.activeElement;
  var el = $("settings"), d = G.setupData || {}, L = window.SS_LOGOS || [], CR = window.SS_CREDITS || [], MU = window.SS_MUSIC || [];
  var rng = function (id, label, v) { return '<div class="row"><span>' + label + '</span><input type="range" id="' + id + '" min="0" max="100" value="' + Math.round(v * 100) + '"></div>'; };
  el.innerHTML = '<div class="sb"><div class="shead"><button class="ghost" id="setX">Close</button></div><h3 class="t">Settings</h3><p class="hint">Saved on this device. Changes apply at once.</p>' +
    "<h4>Display</h4>" + segRow("text", "Text size", "", [[1, "100%"], [1.25, "125%"], [1.5, "150%"], [1.75, "175%"], [2, "200%"]]) +
    segRow("motion", "Reduced motion", "Stills the screen effects. Follows your device setting unless you choose.", [["auto", "Follow device"], ["on", "On"], ["off", "Off"]]) +
    segRow("shake", "Screen shake", "", [[true, "On"], [false, "Off"]]) +
    segRow("opening", "Opening film", "Plays before the Main Menu each time the game opens. Skip or Esc goes straight to the menu; Reduced motion skips it.", [[true, "On"], [false, "Off"]]) +
    segRow("glance", "Card faces", "Glance: cards in your hand and on the table show their cost, key numbers and ability tags, large. Tap or click any card to read all of it. Full print: the printed card, shrunk.", [[true, "Glance"], [false, "Full print"]]) +
    segRow("shapes", "Side markers", "Adds a shape to the side colours: your cards a rectangle, the enemy's a diamond, as on a map.", [[false, "Colour only"], [true, "Colour and shape"]]) +
    "<h4>Sound</h4>" + '<div class="row"><span>Mute everything</span><label class="ck"><input type="checkbox" id="sMute"' + (G.muted ? " checked" : "") + "> Mute</label></div>" + rng("sFx", "Effects", G.volFx) + rng("sMus", "Music", G.volMus) + rng("sVox", "Radio voices", G.volVox) +
    "<h4>Gameplay</h4>" + segRow("speed", "Speed", "How fast the bot's moves play out.", [[.5, "½×"], [1, "1×"], [2, "2×"]]) +
    segRow("steady", "Steadier touch", "How far a finger or pointer may wander before a press becomes a drag. Steadier allows twice as far (20 px for a finger), for a shaky hand or a slow press. Holding still never matters.", [[false, "Standard"], [true, "Steadier"]]) +
    segRow("confirm", "Ask before moves you cannot take back", "Passing, playing a card, using an ability, moving the Force Marker and ending deployment ask you to confirm.", [[false, "Off"], [true, "On"]]) +
    segRow("tips", "Tips", "First-time tips, and the one-line hints in the prompt.", [[true, "On"], [false, "Off"]]) + '<div class="row"><span>First-time tips<small>Show each one again, as in your first game.</small></span><button class="ghost" id="sTipsAgain">Show them again</button></div>' +
    segRow("badges", "Attack badges", "The attack value on cards on the table.", [[true, "On"], [false, "Off"]]) +
    "<h4>Accessibility</h4>" + segRow("captions", "Captions for radio calls", "Shows each radio call as text, also when the voices are off.", [[false, "Off"], [true, "On"]]) +
    "</div>";   /* v0.21 (lead's note): Settings holds settings only; the credits, versions and the notice moved to About */
  el.style.display = "block"; el.scrollTop = 0; try { $("setX").focus({ preventScroll: true }); } catch (x) { }
  $("sMute").onchange = function () { G.muted = this.checked; if (master) master.gain.value = G.muted ? 0 : .9; saveSound(); };
  $("sFx").oninput = function () { G.volFx = this.value / 100; if (sfxBus) sfxBus.gain.value = G.volFx; saveSound(); }; $("sFx").onchange = function () { SFX.thud(); };
  $("sMus").oninput = function () { G.volMus = this.value / 100; if (musBus) musBus.gain.value = G.volMus; saveSound(); };
  $("sVox").oninput = function () { G.volVox = this.value / 100; if (voxBus) voxBus.gain.value = G.volVox; saveSound(); }; $("sVox").onchange = function () { if (SND) vox("ack", { vol: 1 }); };
}
$("settings").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; if (b.id === "sNotice") return showNotice(true); if (b.id === "setX") { $("settings").style.display = "none"; SFX.close && SFX.close(); var rf = G.retFocus; G.retFocus = null; try { if (rf && rf.focus && document.contains(rf)) rf.focus({ preventScroll: true }); } catch (x) { } return; }
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
    el.innerHTML = '<button class="ghost" id="logX">Close</button><h3 class="t">Game record</h3><p style="color:' + (ok ? "var(--teal)" : "var(--amber)") + '"><b>' + (ok ? (SITE ? "Copied. Provide Feedback sends this with your notes." : "Copied. Paste it into your chat with Claude.") : (SITE ? "Could not copy automatically. Provide Feedback sends this with your notes." : "Could not copy automatically. Select all of the text below, copy it, and paste it to Claude.")) + '</b></p><p style="color:var(--dim)">' + (SITE ? "This game and its notes are kept in this browser until you send them." : G.stored ? "This game and its notes are also saved in the game store, where Claude can read them." : "Not in the game store yet: games are stored when you save a note or the game ends.") + '</p><textarea readonly style="width:100%;height:40vh;font:12px monospace;user-select:text;-webkit-user-select:text"></textarea>';
    el.querySelector("textarea").value = r; el.style.display = "block"; $("logX").onclick = function () { el.style.display = "none"; }; if (!ok) el.querySelector("textarea").select(); };
  try { navigator.clipboard.writeText(r).then(function () { show(true); }, function () { show(false); }); } catch (e) { show(false); } }, fail); };
/* ---- the game store: every game with its notes is saved where Claude can read it back (the artifact's database) ---- */
var DB = null, gameId = "";
var dbP = null;
function dbReady() { if (DB) return Promise.resolve(DB); if (SITE && window.SS_LOCALDB) { DB = window.SS_LOCALDB; return Promise.resolve(DB); } if (!window.claude || !window.claude.use) return Promise.resolve(null);
  if (!dbP) dbP = Promise.race([window.claude.use("db"), new Promise(function (r) { setTimeout(function () { r(null); }, 11000); })]).then(function (d) { DB = d || null; if (!DB) dbP = null; return DB; }, function () { dbP = null; return null; });
  return dbP; }
var LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) && !(window.claude && window.claude.use) && !window.SS_SITE;   // served by the Workbench on the project lead's computer
var SITE = (!(window.claude && window.claude.use) && window.SS_SITE) || null;   // v0.17.2: the playtest website (site.js): games, notes and replays stay in this browser; Provide Feedback posts to the Google Form
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
function saveNotes() { try { localStorage.setItem("ss_notes", JSON.stringify({ seed: G.info && G.info.seed, notes: G.notes, stored: false })); } catch (e) { } storeGame().then(function (ok) { feed(ok ? (LOCAL ? "Note saved on this computer, in 04. Workbench/data/games (" : SITE ? "Note saved in this browser. It goes to the team when you press Provide Feedback (" : "Note saved to the game store (") + G.notes.length + ")." : "Note kept on this device only: the game store could not be reached. Use Game record and notes to copy it."); }); }
function notesText() { return G.notes.map(function (n, i) { return (i + 1) + ". Round " + n.round + ", " + n.phase + (n.card ? " · " + n.card : "") + " [" + n.kind + "]: " + n.text; }).join("\n"); }
function noteForm(card) {
  var was = G.paused; if (G.playing) pause(true); var v = G.view || {}, el = $("log"), cards = {};
  if (v.you) [v.you, v.bot].forEach(function (p) { p.front.concat(p.rear).forEach(function (u) { if (u.cls) cards[u.name] = 1; }); (p.hand || []).forEach(function (c) { cards[c.name] = 1; }); p.track.forEach(function (t) { cards[t.name] = 1; }); });
  if (card) cards[card] = 1;   /* a card picked in the card library need not be on the table (v0.16.1) */
  el.classList.toggle("over", $("lib").style.display === "block");   /* in front of the card library when opened from it */
  el.innerHTML = '<button class="ghost" id="logX">Close</button><h3 class="t">Add a note</h3><p style="color:var(--dim)">Saved with this game\'s record: Round ' + (v.round || "–") + ", " + esc(v.phase || "") + ". The game is paused while this is open." + (SITE ? " Your notes go to the team when you press ✉ Provide Feedback (in the ☰ menu, or at the end of the game)." : "") + "</p>" +
    '<div class="form" style="max-width:640px"><div><label>About (optional)</label><select id="nCard"><option value="">The game in general</option>' + Object.keys(cards).sort().map(function (n) { return '<option' + (n === card ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select></div>" +
    '<div><label>Kind of note</label><select id="nKind"><option>Observation</option><option>Feels too strong</option><option>Feels too weak</option><option>Cost or value</option><option>Unclear or confusing</option><option>Bug or wrong result</option><option>Idea</option></select></div></div>' +
    '<textarea id="nText" placeholder="What did you notice, and why does it matter right now?" style="width:100%;max-width:640px;height:22vh;margin-top:10px;font:15px Barlow,system-ui,sans-serif;background:#18201b;color:var(--ink);border:1px solid var(--line);padding:8px;user-select:text;-webkit-user-select:text"></textarea>' +
    '<div class="btns" style="display:flex;gap:8px;margin:10px 0"><button id="nSave">Save note</button></div><h3 class="t" style="font-size:calc(14px * var(--ts))">Notes this game (' + G.notes.length + ')</h3><pre style="white-space:pre-wrap;font:13px Barlow,system-ui,sans-serif;color:var(--dim)">' + esc(notesText() || "None yet.") + "</pre>";
  el.style.display = "block"; el.scrollTop = 0; var done = function () { el.style.display = "none"; el.classList.remove("over"); if (!was) pause(false); };
  $("logX").onclick = done; $("nSave").onclick = function () { var t = $("nText").value.trim(); if (t) { G.notes.push({ round: v.round || 0, phase: v.phase || "", event: G.shownN || 0, card: $("nCard").value, kind: $("nKind").value, text: t }); saveNotes(); } done(); };
  setTimeout(function () { try { $("nText").focus(); } catch (e) { } }, 50);
}
$("bNote").onclick = function () { $("menu").hidden = true; noteForm(); };
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
/* ================= v0.17.2: the playtest website. Provide Feedback (v0.20.2; was Send notes) posts the tester's answers, notes and game record to the project lead's Google Form ================= */
function siteWelcome() {
  var seen = false; try { seen = !!localStorage.getItem("ss.welcomed"); } catch (e) { }
  return '<div class="welcome" id="welcome"' + (seen ? ' data-seen="1"' : "") + '><p class="wk">Playtest · please do not share this address</p>' +
    "<p><b>Welcome, and thank you for testing.</b> Start with <b>Basic Training</b>, selected for you below: a guided battle of about 15 minutes that teaches the game one step at a time.</p>" +
    "<p>When you finish, press <b>✉ Provide Feedback</b>: a few quick questions, then your answers, your notes and the game's record go to the team. No sign-in is needed. During a game, <b>✎ Add note</b> in the ☰ menu keeps a note; your notes go to the team when you press Provide Feedback.</p>" +
    '<p><button class="ghost" id="wNotice">Read the playtest notice</button></p>' +
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
if (SITE) { sendCss(); (function () { var sb = document.createElement("button"); sb.className = "ghost"; sb.id = "bSend"; sb.textContent = "✉ Provide Feedback"; $("bNote").parentNode.insertBefore(sb, $("bNote").nextSibling); sb.onclick = function () { $("menu").hidden = true; showSend(); }; var d = document.createElement("div"); d.id = "send"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Provide Feedback"); document.body.appendChild(d); })(); }
/* ================= v0.20.2 (WP2): the first-play playtest notice (Prototype Design Spec 5.3) =================
   Shown once on the playtest website, after the opening film (or its Skip) and before the Main Menu can be used; again whenever its wording
   version changes. It must be acknowledged: Escape does not close it and focus stays in it. "Text size and sound" opens Settings first.
   It can be read again from the Main Menu's welcome box and from Settings > About. */
// DRAFT, awaiting the project lead's and legal approval: wording from docs/narrative/Screen_Copy_Drafts_v0.1.md, section (d), verbatim.
var NOTICE_V = "d1-2026-11-18";   // change this whenever the wording changes, so every player sees the new wording once
var NOTICE = { title: "PLAYTEST BUILD", ok: "I UNDERSTAND", paras: [
  "This is a playtest build of a game still under development. Expect changes and rough edges.",
  "After a game, the team may ask for your feedback. It is anonymous and voluntary. We do not ask you to sign in, and we do not collect your email. Your notes and the record of your game go to the project team.",
  "Shadows & Steel is a work of fiction made as a teaching tool. It is not an official position of any government body."] };
function noticeSeen() { try { return localStorage.getItem("ss.notice") === NOTICE_V; } catch (e) { return false; } }
function noticeGate() { if (!noticeSeen() && !$("notice")) showNotice(false); }
function showNotice(again) {
  if ($("notice")) return; noticeCss(); var back = document.activeElement, d = document.createElement("div"); d.id = "notice"; if (again) d.className = "again";
  d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "ntH"); d.setAttribute("aria-describedby", "ntB");
  d.innerHTML = '<div class="nt"><h2 id="ntH">' + esc(NOTICE.title) + '</h2><div id="ntB">' + NOTICE.paras.map(function (x) { return "<p>" + esc(x) + "</p>"; }).join("") + "</div><p class=\"ntm\" aria-hidden=\"true\">More below ▼</p>" +
    '<div class="ntb"><button class="big" id="ntOk">' + esc(NOTICE.ok) + '</button>' + (again ? "" : '<button class="ghost" id="ntSet">Text size and sound</button>') + "</div></div>";
  document.body.appendChild(d); var cov = $("cover"); if (!again && cov) cov.inert = true;
  var close = function () { if (!again) { try { localStorage.setItem("ss.notice", NOTICE_V); } catch (e) { } if (cov) cov.inert = false; } d.remove(); document.removeEventListener("focusin", keep, true); SFX.select && SFX.select(); if (back && back.focus && document.body.contains(back)) try { back.focus(); } catch (e) { } };
  var keep = function (e) { if (!document.body.contains(d) || d.contains(e.target)) return; if ($("settings").style.display === "block" && $("settings").contains(e.target)) return; $("ntOk").focus(); };   // focus stays in the notice (Settings may take it while open)
  document.addEventListener("focusin", keep, true);
  d.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return; }   // it must be acknowledged: Escape does nothing
    if (e.key === "Tab") { var f = Array.prototype.slice.call(d.querySelectorAll("button")), i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus(); } });
  d.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; if (b.id === "ntOk") return close(); if (b.id === "ntSet") { showSettings(); } });
  var nb = $("ntB"), cue = function () { d.firstChild.classList.toggle("more", nb.scrollHeight - nb.clientHeight - nb.scrollTop > 4); };   // a cue while the text has more below
  nb.addEventListener("scroll", cue, { passive: true }); addEventListener("resize", cue); cue();
  try { $("ntOk").focus({ preventScroll: true }); } catch (e) { $("ntOk").focus(); }
}
function noticeCss() { if ($("noticeCss")) return; var st = document.createElement("style"); st.id = "noticeCss"; st.textContent =
  "#notice{position:fixed;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,9,8,.88);overflow-y:auto;touch-action:pan-y}#notice.again{z-index:16}" +
  "#notice .nt{max-width:560px;width:100%;max-height:100%;display:flex;flex-direction:column;background:#111612;border:1px solid var(--line);border-left:3px solid var(--amber);padding:16px 18px;box-sizing:border-box}" +
  "#notice h2{margin:0 0 10px;font:400 calc(22px * var(--ts))/1.1 \"Black Ops One\",Impact,sans-serif;letter-spacing:.06em;color:var(--amber)}#notice p{margin:0 0 10px;font-size:calc(16px * var(--ts));line-height:1.45;color:var(--ink)}" +
  "#notice #ntB{flex:1 1 auto;min-height:0;overflow-y:auto;touch-action:pan-y}#notice h2,#notice .ntb,#notice .ntm{flex:none}#notice .ntm{display:none;margin:4px 0 0;text-align:right;color:var(--amber);font-weight:600;font-size:calc(13px * var(--ts))}#notice .nt.more .ntm{display:block}#notice .nt.more #ntB{-webkit-mask-image:linear-gradient(#000 80%,transparent);mask-image:linear-gradient(#000 80%,transparent)}#notice .ntb{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}#notice .ntb .big{min-height:52px}#notice .ntb .ghost{font-family:Barlow,system-ui,sans-serif;text-transform:none;letter-spacing:0;font-weight:600;font-size:calc(14px * var(--ts));min-height:44px}" +
  "#notice button:focus-visible{outline:3px solid var(--teal);outline-offset:3px}";
  document.head.appendChild(st); }
function showSend() { var el = $("send"); if (!el) return; var was = G.paused; G.retFocus = document.activeElement; if (G.playing && !G.paused) pause(true);
  el.innerHTML = '<div class="sb"><button class="ghost" id="sendX">Close</button><h3 class="t" style="margin:2px 0">Provide Feedback</h3><div id="sendBox"></div></div>'; el.style.display = "block"; el.scrollTop = 0;
  $("sendX").onclick = function () { el.style.display = "none"; if (!was && G.playing) pause(false); var rf = G.retFocus; G.retFocus = null; try { if (rf && rf.focus && document.contains(rf)) rf.focus({ preventScroll: true }); } catch (x) { } }; sendForm($("sendBox")); try { $("sendX").focus({ preventScroll: true }); } catch (x) { } }
function lastStoredGame() {   // the newest game kept in this browser, for Provide Feedback from the Main Menu
  return dbReady().then(function (d) { if (!d) return null; return d.collection("games").orderBy("savedAt", "desc").limit(1).get().then(function (s) { return s.docs.length ? s.docs[0].data() : null; }); }).catch(function () { return null; }); }
function gameNow() {   // what Provide Feedback carries about the game: the one on the table, or the newest one kept in this browser
  if (G.info && !G.replay) return api("/play/record", {}).then(function (r) { var o = G.over;
    return { record: r, notes: G.notes.slice(), tutorial: !!(G.info.tutorial), spectate: !!G.info.spectate, you: G.info.you, bot: G.info.bot, terrain: G.info.terrain, finished: !!o, winner: o ? o.winner : "", how: o ? o.how : "", round: (G.view && G.view.round) || 0, id: gameId || "" }; }, function () { return null; });
  return lastStoredGame().then(function (g) { if (!g) return null; var r = null; try { r = JSON.parse(g.record || "null"); } catch (e) { }
    return { record: r, notes: g.notes || [], tutorial: !!(r && r.tutorial), spectate: !!g.spectate, you: g.you, bot: g.bot, terrain: g.terrain, finished: g.finished, winner: g.winner, how: g.how, round: g.round, id: "", saved: g.savedAt }; }); }
function gameLine(g) { if (!g) return "No game played on this device yet.";
  var what = g.tutorial ? "Basic Training" : g.spectate ? "Watched the bot play itself" : "Play the bot"; var res = g.finished ? (/^Nobody/.test(g.winner) ? "a draw" : (g.winner === "You" ? "you won" : g.winner + " won")) + (g.how ? " (" + g.how + ")" : "") + " in round " + g.round : "not finished, round " + (g.round || 1);
  var gr = g.rules || (g.record && g.record.rules), tr = (gr && (+gr.table_cap || +gr.withdraw) ? " " + trialLine(gr) + "." : "") + (gr && +gr.concepts ? " " + BEN_NOTE : ""); return what + ": " + (g.you || "") + " against " + (g.bot || "") + " on " + (g.terrain || "") + ", " + res + "." + tr; }
function deviceLine() {   // v0.20.2: the kind of device, the browser family and the input, in plain words (no version numbers or other identifying detail)
  var ua = navigator.userAgent || "", mm = function (q) { try { return matchMedia(q).matches; } catch (e) { return false; } }, coarse = mm("(pointer: coarse)"), fine = mm("(any-pointer: fine)"), sd = Math.min(screen.width || innerWidth, screen.height || innerHeight);
  var kind = coarse ? (sd < 600 ? "phone" : "tablet") : "desktop or laptop";
  var br = /Edg(e|A|iOS)?\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\/|FxiOS/.test(ua) ? "Firefox" : /CriOS|Chrome\/|Chromium/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "another browser";
  return kind + ", " + br + ", " + (coarse && fine ? "touch and mouse" : coarse ? "touch" : "mouse or trackpad");
}
function notesOf(list) { return (list || []).map(function (n, i) { return (i + 1) + ". Round " + n.round + ", " + n.phase + (n.card ? " · " + n.card : "") + " [" + n.kind + "]: " + n.text; }).join("\n"); }
function sendForm(root) {
  if (!root || !SITE) return; var S = SITE, A = { overall: "", fair: "", pacing: "", unb: [] }, who = ""; try { who = localStorage.getItem("ss.tester") || ""; A = Object.assign(A, JSON.parse(localStorage.getItem("ss.answers") || "{}")); } catch (e) { }
  var req = S.required || [], star = function (k) { return req.indexOf(k) >= 0 ? " <i>*</i>" : ""; };
  var scale = function (k) { return '<div class="scale" data-k="' + k + '">' + [1, 2, 3, 4, 5].map(function (v) { return '<button class="ghost" data-v="' + v + '" aria-pressed="' + (String(A[k]) === String(v)) + '">' + v + "</button>"; }).join("") + "</div>" + ((S.ends || {})[k] ? '<p class="qh">1 = ' + esc(S.ends[k][0]) + ", 5 = " + esc(S.ends[k][1]) + "</p>" : ""); };
  root.innerHTML = '<div class="sf"><p class="qh">Your answers, your notes and this game\'s record go to the project team\'s form. No sign-in, and no email address is collected.</p><p class="gn" data-g="1">What you played: looking for your game…</p>' +
    '<p class="q">What is your playtester handle or name?' + star("name") + '</p><input type="text" data-f="name" maxlength="80" autocomplete="nickname" value="' + esc(who) + '">' +
    '<p class="q">How would you rate your overall experience with the playtest build?' + star("overall") + "</p>" + scale("overall") +
    '<div data-bal="1" hidden><p class="q">Balance: Did the game feel fair?' + star("fair") + '</p><div class="opt" data-k="fair">' + (S.fairChoices || []).map(function (c) { return '<button class="ghost" data-v="' + esc(c) + '" aria-pressed="' + (A.fair === c) + '">' + esc(c) + "</button>"; }).join("") + "</div>" +
    '<p class="q">How would you rate the pacing of the game during matches?' + star("pacing") + "</p>" + scale("pacing") +
    '<p class="q">Which specific elements or mechanics contributed most to the game feeling unbalanced?' + star("unbalanced") + '</p><p class="qh">Pick any that apply, or none.</p><div class="opt" data-k="unb" data-multi="1">' + (S.unbalancedChoices || []).map(function (c) { return '<button class="ghost" data-v="' + esc(c) + '" aria-pressed="' + (A.unb.indexOf(c) >= 0) + '">' + esc(c) + "</button>"; }).join("") + "</div></div>" +
    '<p class="q">Your notes' + star("notes") + '</p><p class="qh">Notes you added during the game are sent too, each with its round, phase and card:</p><p class="gn" data-n="1">None yet.</p><textarea data-f="more" placeholder="Anything else? What was clear, what was confusing, what you enjoyed, what you would change."></textarea>' +
    '<div class="go2"><button class="big" data-send="1">Send feedback</button></div><p class="st" aria-live="polite"></p>' +
    '<details><summary>A copy of what is sent</summary><p class="qh">If sending fails, copy this text and send it to the person who gave you this link.</p><textarea readonly data-copy="1"></textarea></details></div>';
  var q = function (sel) { return root.querySelector(sel); }, G2 = null;
  var keep = function () { try { localStorage.setItem("ss.answers", JSON.stringify(A)); localStorage.setItem("ss.tester", q('[data-f="name"]').value.trim()); } catch (e) { } };
  var payload = function () {
    var g = G2, nm = q('[data-f="name"]').value.trim(), more = q('[data-f="more"]').value.trim(), notes = notesOf(g && g.notes);
    var body = "Game: " + (g ? gameLine(g) : "none") + "\nScreen: " + innerWidth + " x " + innerHeight + (matchMedia("(pointer: coarse)").matches ? " (touch)" : "") + "\nDevice: " + deviceLine() + "\n\nNotes during the game:\n" + (notes || "None.") + "\n\nOther notes:\n" + (more || "None.");
    var code = g && g.record ? JSON.stringify(Object.assign({}, g.record, { notes: g.notes || [] })) : "";
    var F = S.form, tut = !!(g && g.tutorial), ok = function (v, list) { return (list || []).indexOf(v) >= 0 ? v : ""; }, pairs = [[F.name, nm], [F.build, S.build], [F.overall, A.overall], [F.mode, g && S.modeChoices ? S.modeChoices[tut ? 0 : 1] : ""], [F.fair, tut ? "" : ok(A.fair, S.fairChoices)], [F.pacing, tut ? "" : A.pacing]];   // the form has two pages; balance is not asked after a tutorial; a choice the form no longer has is not sent (it would void the whole answer)
    if (S.form.pages) pairs.push(["pageHistory", S.form.pages]);
    if (!tut) A.unb.forEach(function (c) { if (ok(c, S.unbalancedChoices)) pairs.push([F.unbalanced, c]); }); pairs.push([F.notes, body]); pairs.push([F.code, code]);
    return { pairs: pairs.filter(function (x) { return x[1] !== "" && x[1] != null; }), text: "Name: " + nm + "\nBuild: " + S.build + "\nOverall: " + (A.overall || "-") + "\nFair: " + (A.fair || "-") + "\nPacing: " + (A.pacing || "-") + "\nUnbalanced: " + (A.unb.join("; ") || "-") + "\n\n" + body + "\n\nGame code:\n" + code };
  };
  var refresh = function () { var c = q('[data-copy="1"]'); if (c) c.value = payload().text; };
  gameNow().then(function (g) { G2 = g; q('[data-g="1"]').textContent = "What you played: " + gameLine(g); q('[data-bal="1"]').hidden = !g || !!g.tutorial;   /* v0.20.2: the balance questions are not shown after a tutorial (they are not sent either) */ q('[data-n="1"]').textContent = notesOf(g && g.notes) || "None yet."; refresh(); });
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
        b.textContent = "Send again"; b.disabled = false; st.className = "st ok"; st.textContent = "Sent. Thank you! Your feedback is on its way to the team.";
        try { localStorage.setItem("ss.lastSent", new Date().toISOString()); localStorage.removeItem("ss.answers"); } catch (e) { }   /* the name is remembered; the answers start fresh for the next game */ feed("Feedback sent to the team.");
      }, function () { b.textContent = "Try again"; b.disabled = false; st.className = "st bad"; st.textContent = "Could not send: check the internet connection, then try again. Or open “A copy of what is sent” below, copy it and send it to the person who gave you this link."; root.querySelector("details").open = true; });
    } });
}
$("bSaveRep").onclick = function () { $("menu").hidden = true; if (!G.info || G.replay) return; saveReplay(null, null); };
function reset() { G.wdOpen = false; G.hgrp = null; G.lastChosen = null; G.cpage = {}; G.moment = null; G.momDone = {}; G.nudge = null; G.tipNow = null; tweens = []; clearBoard(); G.hint = null; G.hints = 0; G.view = null; G.latest = null; G.pend = null; G.latestPend = null; G.queue = []; G.playing = false; G.since = 0; G.sel = null; G.over = null; G.overShown = false; G.err = null; G.stand = false; G.standRound = 0; G.hoverDst = null; G.heldAtk = null; G.lastAtk = null; G.explain = ""; G.aar = []; G.aarEv = []; G.aarLast = null; G.why = null; G.histWhy = {}; G.rate = {}; gameId = ""; G.startedAt = new Date().toISOString(); G.stored = false; G.hist = []; G.hits = []; G.cause = ""; $("bQuit").textContent = "Abandon game"; G.multi = null; G.autoQ = null; G.notes = []; G.paused = false; G.replay = null; G.savedReplay = null; G.lastRec = null; G.pgen = (G.pgen || 0) + 1; G.ordersRound = 0; G.shuffled = false; document.body.classList.remove("replaying"); $("debrief").style.display = "none"; $("bQuit").textContent = "Abandon game"; G.waiting = false; G.lastN = 0; G.skip = false; G.started = false; G.busy = false; G.caption = ""; lastHf = {}; handKey = ""; $("feed").innerHTML = ""; closePreview(); }
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
/* v0.21 (RC2): the Withdraw trial. The live page has one switch (off by default) with the destination and refund fixed here; test pages offer every setting */
var TRIAL_LIVE = { withdraw: "3", withdraw_refund: "2" };   /* the lead's ruling (19 Nov): where a withdrawn card goes (3: face-up to the discard pile, face-down to hand) and the refund (2: half of what was paid, rounded down): one line to change */
var TRIAL_LIVE_NOTE = "At most 10 cards on each side of the table. In Command, spend 1 Lift to withdraw a Ready card (not a PINNED card, and not a Frontline card while in Contact): a face-up card goes to your discard pile and you get back half the Supply you paid for it, rounded down; a face-down card returns to your hand. A withdrawn card cannot come back this round.";
function trialSettings() { return window.SS_TEST_NAME ? { table_cap: "10", withdraw: SET.wdest || "3", withdraw_refund: SET.wref || "2", withdraw_fix: SET.wfix || "0" } : { table_cap: "10", withdraw: TRIAL_LIVE.withdraw, withdraw_refund: TRIAL_LIVE.withdraw_refund, withdraw_fix: "0" }; }
var SET = { trial: window.SS_TEST_NAME ? "1" : "0", wdest: "3", wref: "2", wfix: "0", mode: (function () { try { return localStorage.getItem("ss.trained") ? "bot" : "train"; } catch (e) { return "train"; } })(), you: "", bot: "", terrain: "", first: "", concepts: "0", fd: "0", end: "0" };
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
  var sc = SET.screen || "menu", bk = $("suBack"); if (bk) bk.hidden = sc === "menu"; var cv = $("cover"); if (cv) cv.dataset.screen = sc;
  if (sc === "menu") return menuBody(el, d);
  if (sc === "about") return aboutBody(el, d);
  if (sc === "library") return libraryBody(el);
  if (SET.mode === "replays" || sc === "replays") return replayList(el);
  if (SET.mode === "train" || sc === "train") return trainBody(el, d);
  var cs = d.concepts, watch = SET.mode === "watch", tr = d.terrain.filter(function (t) { return t.name === SET.terrain; })[0];
  el.innerHTML = '<div class="seg" data-set="mode"><button data-v="bot" aria-pressed="' + !watch + '">Play the bot</button><button data-v="watch" aria-pressed="' + watch + '">Watch the bot play itself</button></div>' + '<section class="step"><h2><i>1</i>' + (watch ? "South side" : "Your force") + '</h2><div class="forces you">' + cs.map(function (c) { return forceTile(c, "you"); }).join("") + "</div></section>" +
    '<section class="step"><h2><i>2</i>' + (watch ? "North side" : "The enemy") + '</h2><div class="forces bot">' + cs.map(function (c) { return forceTile(c, "bot"); }).join("") + "</div></section>" +
    '<section class="step"><h2><i>3</i>The ground</h2><div class="chips2" data-set="terrain"><button data-v="" aria-pressed="' + (!SET.terrain) + '">Random</button>' + d.terrain.map(function (t) { return '<button data-v="' + esc(t.name) + '" aria-pressed="' + (SET.terrain === t.name) + '">' + esc(t.name.charAt(0) + t.name.slice(1).toLowerCase()) + "</button>"; }).join("") +
    '</div><p class="hint">' + (tr ? esc(tr.text) : "A battlefield from the two boxes in play, chosen at random.") + "</p></section>" +
    '<details class="more"' + (SET.open ? " open" : "") + '><summary>Rules for this game</summary><div class="opts">' +
    '<div><label>Goes first in round 1</label>' + seg("first", [["", "Random"], ["you", watch ? "South" : "You"], ["bot", watch ? "North" : "The bot"]]) + "</div>" +
    '<div><label>Concept benefits</label><p class="hint">Held for campaign play.</p></div>' +   /* v0.21 (ruling AS item 12): no switch; the base game is played without them */
    '<div><label>Hand at the end of the round</label>' + seg("fd", [["0", "Keep it"], ["1", "Draw 5 new"]]) + "</div>" +
    '<div><label>The game ends</label>' + seg("end", [["0", "At Assessment"], ["1", "The instant a condition is met"]]) + "</div>" +
    (!watch ? (window.SS_TEST_NAME ? '<div><label>Trial rule (test page): table limit of 10 and Withdraw</label>' + seg("trial", [["0", "Off"], ["1", "On"]]) + "</div>" + (SET.trial === "1" ? '<div><label>Withdrawn cards go to</label>' + seg("wdest", [["1", "Hand"], ["2", "Discard pile"], ["3", "Face-up to discard, face-down to hand"]]) + '</div><div><label>Withdraw gives back</label>' + seg("wref", [["0", "Nothing"], ["1", "1 Supply"], ["2", "Half of what you paid"], ["3", "All of it, less its damage"], ["4", "Relief: next deploy costs less"]]) + '</div><div><label>An enemy FIX stops Frontline withdrawals</label>' + seg("wfix", [["0", "Off"], ["1", "On"]]) + "</div>" : "")
      : '<div><label>Trial rule: table limit of 10 and Withdraw (experimental)</label>' + seg("trial", [["0", "Off"], ["1", "On"]]) + '<p class="hint">' + esc(TRIAL_LIVE_NOTE) + "</p></div>") : "") + "</div></details>" +
    '<div class="go"><button id="pgo" class="big">' + (watch ? "Watch the game" : "Start the game") + '</button><p>' + esc(SET.you) + " against " + esc(SET.bot) + (SET.terrain ? ", " + esc(SET.terrain.toLowerCase()) : ", random ground") + (SET.mode === "bot" && SET.trial === "1" ? " · trial rule on" : "") + '</p></div><pre id="serr"></pre>';
}
/* v0.21 (WP8, spec 5.2; Menu, About and Briefing content pack v0.1, section 3): the Main Menu is one big action and four short ones.
   START BASIC TRAINING is the primary until training is done, then PLAY (with the last setup under it) and TRAINING joins the list.
   Each label's description is its accessible description; only the primary's is printed. */
function buildTag(d) { return "Battlefield table v0.21" + (d && d.version ? " · game " + d.version : "") + (d && d.cards ? " · " + d.cards : ""); }
/* v0.21 (checkers A): the lead edits notices.js by hand, so its data is checked once: lists that are not lists become empty, entries
   without a text id, title and body are dropped, and anything unusable hides the bell; the Main Menu never depends on it */
(function () { try { var N = window.SS_NOTICES; if (!N || typeof N !== "object" || Array.isArray(N)) { window.SS_NOTICES = null; return; }
  var ok = function (x) { return !!x && typeof x === "object" && typeof x.id === "string" && !!x.id && typeof x.title === "string" && typeof x.body === "string" && (x.date == null || typeof x.date === "string") && (x.until == null || typeof x.until === "string"); };
  var lst = function (a) { return Array.isArray(a) ? a.filter(ok) : []; }, w = N.welcome && typeof N.welcome === "object" ? N.welcome : {};
  var full = typeof w.full === "string" && w.full.trim() ? w.full : "", short = typeof w.short === "string" && w.short.trim() ? w.short : (full.split(/\n\s*\n/)[0] || "");
  var out = { welcome: short || full ? { short: short, full: full || short } : null, whatsNew: lst(N.whatsNew), devNotes: lst(N.devNotes) };
  window.SS_NOTICES = out.welcome || out.whatsNew.length || out.devNotes.length ? out : null; } catch (e) { window.SS_NOTICES = null; } })();
var SPLASH_BIG = "menu/keyart_wide_2560";   /* screens 1024 px wide and more: the upscaled key art (WebP, else JPEG); phones keep the 1280 poster */
function splashErr(im) { var p = im.parentNode; if (p && p.tagName === "PICTURE" && !im.dataset.f) { im.dataset.f = "1"; Array.prototype.slice.call(p.querySelectorAll("source")).forEach(function (s) { s.remove(); }); im.src = SPLASH_ART; } else im.style.display = "none"; }   // the large file failed: the poster; that failed too: the plain background
window.splashErr = splashErr;
var SPLASH_ART = "opening/poster_wide.jpg";   /* the Main Menu key art: swap this one name for a larger copy (the same picture the opening already loads, so it is cached) */
function menuBody(el, d) {
  var last = (SET.you && SET.bot ? SET.you + " vs " + SET.bot : "") + " · " + (SET.terrain || "RANDOM GROUND");
  var item = function (go, lab, desc, prim) { var id = "md_" + go; return '<button class="' + (prim ? "big mprim" : "ghost mi") + '" data-go="' + go + '" aria-describedby="' + id + '"><span>' + lab + '</span><i aria-hidden="true">' + (prim ? "↗" : "→") + "</i></button>" + (prim ? '<p class="mline" id="' + id + '">' + esc(desc) + "</p>" : '<span class="sr" id="' + id + '">' + esc(desc) + "</span>"); };
  var N = window.SS_NOTICES, unread = 0, wel = false; try { unread = noticesUnread(); wel = !!(N && N.welcome && !welcomeSeen()); } catch (e) { N = null; }
  /* v0.21 (lead's notes, 19 Nov): the key art fills the top of the Main Menu (a band on a phone held upright, the backdrop elsewhere); the
     welcome note shows over it on a first visit only, and afterwards lives behind the bell and in About. PLAY and the buttons never move. */
  var h = '<div class="splash" aria-hidden="false"><picture><source media="(min-width: 1024px)" type="image/webp" srcset="' + SPLASH_BIG + '.webp"><source media="(min-width: 1024px)" srcset="' + SPLASH_BIG + '.jpg"><img src="' + SPLASH_ART + '" alt="" aria-hidden="true" draggable="false" onerror="splashErr(this)"></picture><i class="scr" aria-hidden="true"></i>' +
    '<h1 class="t">Shadows <span>&amp;</span> Steel<small> 2045</small></h1>' +
    (N ? '<button class="ghost bell" id="nBell" aria-haspopup="dialog" aria-expanded="false" aria-label="' + (unread ? "Notices, " + unread + " new" : "Notices") + '"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/></svg>' + (unread ? '<b class="cnt" aria-hidden="true">' + unread + "</b>" : "") + "</button>" : "") +
    (wel ? '<div class="wnote" id="wNote" role="note" aria-label="Welcome"><button class="ghost wx" id="wX" aria-label="Close the welcome note">✕</button><div class="wtx" tabindex="0"><i class="wsp" aria-hidden="true"></i><p class="wk">Welcome · playtest</p><p class="wm">' + md(N.welcome.short) + '</p><p class="wm2">' + md(N.welcome.tiny || WELCOME_TINY) + '</p><p class="wl">You can read this again under the bell, and in About.</p></div><div class="row"><button class="ghost" id="wGot">GOT IT</button></div></div>' : "") + "</div>";
  var trained = false; try { trained = !!localStorage.getItem("ss.trained"); } catch (e) { }   /* RC2 (Council F3, guide 6): until Basic Training has been completed once on this device, TRAINING is the gold main action; then PLAY (the same flag today's live page sets) */
  h += '<nav class="mm" aria-label="Main Menu">' + (trained ? item("play", "PLAY", last, true) : item("train", "TRAINING", "Basic Training: a guided battle of about 15 minutes.", true)) + '<div class="mlist">' + (trained ? item("train", "TRAINING", "Basic Training, and more lessons as they come.") : item("play", "PLAY", "A battle against the bot.")) +
    item("library", "LIBRARY", "Cards, the Field Manual and saved replays.") + item("settings", "SETTINGS", "Text size, sound, motion and controls.") + item("about", "ABOUT", "The game, the film and the team.") + "</div>" +
    ((SITE || LOCAL) ? '<div class="msec">' + (SITE ? '<button class="ghost lk" id="suSend" aria-describedby="md_fb">PROVIDE FEEDBACK</button><span class="sr" id="md_fb">Tell the team what worked and what did not.</span>' : "") + (LOCAL ? '<button class="ghost lk" id="suQuit">QUIT</button>' : "") + "</div>" : "") + "</nav>";
  el.innerHTML = h; splashFit();
}
/* the band is about 36% of a phone's height (250 px or more), smaller only if the menu would otherwise need scrolling */
var WELCOME_TINY = "Thank you for testing. New here? Start with **TRAINING**: a guided battle of about 15 minutes. Please do not share this page's address.";   /* RC2 (Council F4): the welcome note's words when the full note cannot show whole above the title (small phones) */
/* RC2 (Council F4): on a phone the welcome note sits whole inside the picture band, above the title: its height stops 6 px above the title;
   if the full words do not fit, the short version shows with GOT IT in the top row (no separate close); if even that cannot fit, its text scrolls */
function noteFit() { var n = $("wNote"), t = document.querySelector("#suBody .splash h1"); if (!n || !t) return; n.classList.remove("tiny"); n.style.maxHeight = "";
  if (!(innerWidth < 600 && innerHeight > innerWidth)) return; var room = Math.floor(t.getBoundingClientRect().top - n.getBoundingClientRect().top - 6); 
  var tx = n.querySelector(".wtx"), over = function () { return tx && tx.scrollHeight > tx.clientHeight + 1; };
  if (room >= 60) { n.style.maxHeight = room + "px"; if (over()) n.classList.add("tiny"); if (!over()) return; }
  n.classList.add("tiny"); n.style.maxHeight = "none"; var sp = n.parentNode, th = t.getBoundingClientRect().height;   /* large text: even the short words do not fit; the band grows to hold the note whole above the title (the menu then scrolls, on this first visit only) */
  sp.style.height = Math.ceil(10 + n.getBoundingClientRect().height + 6 + th + 10) + "px"; }
function splashFit() { var sp = document.querySelector("#suBody .splash"), mm = document.querySelector("#suBody .mm"); if (!sp || !mm) return; sp.style.height = "";
  var w = innerWidth, h = innerHeight, cv = $("cover"); if (!(w < 600 && h > w)) return noteFit(); var want = Math.max(250, Math.round(h * .36)); sp.style.height = want + "px";
  var over = Math.round(mm.getBoundingClientRect().bottom + cv.scrollTop + 8 - h); if (over > 0) sp.style.height = Math.max(120, want - over) + "px"; noteFit(); }   // PLAY, the four buttons and Provide Feedback fit without scrolling; the build tag below may scroll
addEventListener("resize", function () { if (G.setupData && (!SET.screen || SET.screen === "menu")) splashFit(); });
/* notices (game/notices.js, the lead's own file): plain text, **bold** only; nothing from the file is inserted unescaped */
function md(t) { return esc(t || "").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>"); }
function mdP(t) { return String(t || "").split(/\n\s*\n/).map(function (p) { return "<p>" + md(p) + "</p>"; }).join(""); }
function welcomeSeen() { try { return !!(localStorage.getItem("ss.welcomeSeen") || localStorage.getItem("ss.welcomed")); } catch (e) { return !!G.welcomeSeen; } }
function noticeItems() { var N = window.SS_NOTICES || {}, today = new Date().toISOString().slice(0, 10); return { news: (N.whatsNew || []).slice(), dev: (N.devNotes || []).filter(function (x) { return !x.until || x.until >= today; }) }; }
function noticesSeen() { try { var raw = localStorage.getItem("ss.noticesSeen"); if (raw === null) { var it = noticeItems(), ids = it.news.concat(it.dev).map(function (x) { return x.id; }); localStorage.setItem("ss.noticesSeen", JSON.stringify(ids)); return ids; } return JSON.parse(raw); } catch (e) { if (!G.noticesSeen) { var it2 = noticeItems(); G.noticesSeen = it2.news.concat(it2.dev).map(function (x) { return x.id; }); } return G.noticesSeen; } }   /* a first visit counts nothing as new: only entries added after it do */
function noticesUnread() { if (!window.SS_NOTICES) return 0; var it = noticeItems(), seen = noticesSeen(); return it.news.concat(it.dev).filter(function (x) { return seen.indexOf(x.id) < 0; }).length; }
function showNotices(open) { try { showNotices0(open); } catch (e) { var el = $("notices"); if (el) el.remove(); var b = $("nBell"); if (b) b.hidden = true; } }
function showNotices0(open) { var N = window.SS_NOTICES; if (!N) return; var el = $("notices"), bell = $("nBell");
  if (!open) { if (el) el.remove(); if (bell) { bell.setAttribute("aria-expanded", "false"); try { bell.focus({ preventScroll: true }); } catch (x) { } } return; }
  var it = noticeItems(), seen = noticesSeen(), entry = function (x) { return '<div class="nent"><p class="nt"><b>' + esc(x.title) + "</b>" + (seen.indexOf(x.id) < 0 ? ' <span class="nnew">NEW</span>' : "") + ' <small>' + esc(x.date || "") + "</small></p><p>" + md(x.body) + "</p></div>"; };
  el = document.createElement("div"); el.id = "notices"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "nTitle");
  el.innerHTML = '<div class="npanel"><div class="nhead"><h2 class="t" id="nTitle">NOTICES</h2><button class="ghost" id="nClose">CLOSE</button></div><div class="nbody">' +
    (N.welcome ? '<details open><summary>WELCOME</summary>' + mdP(N.welcome.full) + '<p><button class="ghost" id="wNotice">Read the playtest notice</button></p></details>' : "") +
    '<details' + (it.news.some(function (x) { return seen.indexOf(x.id) < 0; }) ? " open" : "") + "><summary>WHAT'S NEW</summary>" + (it.news.length ? it.news.map(entry).join("") : "<p>No changes to report yet.</p>") + "</details>" +
    (it.dev.length ? '<details open><summary>FROM THE DEV TEAM</summary>' + it.dev.map(entry).join("") + "</details>" : "") + "</div></div>";
  $("cover").appendChild(el); if (bell) bell.setAttribute("aria-expanded", "true");
  var all = it.news.concat(it.dev).map(function (x) { return x.id; }); try { localStorage.setItem("ss.noticesSeen", JSON.stringify(all)); } catch (x) { G.noticesSeen = all; }
  if (bell) { bell.setAttribute("aria-label", "Notices"); var c = bell.querySelector(".cnt"); if (c) c.remove(); }
  try { $("nClose").focus({ preventScroll: true }); } catch (x) { } }
document.addEventListener("pointerdown", function (e) { var el = $("notices"); if (el && !e.target.closest(".npanel") && !e.target.closest("#nBell")) showNotices(false); }, true);
addEventListener("keydown", function (e) { if (e.key === "Escape" && $("notices")) { e.preventDefault(); e.stopImmediatePropagation(); showNotices(false); } }, true);
function libraryBody(el) {
  var row = function (id, lab, desc) { return '<button class="ghost mi" id="' + id + '"><span>' + lab + '<small>' + esc(desc) + '</small></span><i aria-hidden="true">→</i></button>'; };
  el.innerHTML = '<nav class="mm lib" aria-label="Library"><h2 class="mh2">LIBRARY</h2><div class="mlist">' + row("suLib", "CARDS", "Every card in the game, in full.") + row("suFM", "FIELD MANUAL", "Every lesson and every rules word.") + row("suReps", "SAVED REPLAYS", "Watch your saved battles again.") + "</div></nav>";
}
/* v0.21 (WP8, spec 5.4; content pack section 4, in its order): About. The credits are live text, exactly as printed on card A2. The
   digital-edition line and the disclaimer were approved by the lead on 19 Nov as worded. The film is fetched only when PLAY VIDEO is pressed. No logos (decision 3). */
var TEAM = [["Command & Control:", "Samuel White, James Markley, COL Franklin Scherra"], ["Director:", "LTC Kurt Reynolds"], ["Design:", "Kris Wheaton & Joe Wheaton"], ["Developer:", "Steven Cunliffe"], ["Presentation & Playtesting:", "MAJ Gabriel Landowski"], ["Senior Editing:", "COL James Starling"], ["Rules Editing:", "Tracy Johnson"], ["Proof Reading:", "Walter Barnes"], ["Consultation & Design Inspiration:", "LTC Daniel T. Brooks"], ["Statistics:", "Kasthuri Kannan"], ["Cover Art:", "Kevin Boyce"], ["Fabrication & Procurement:", "Brett Rodgers, Michael Kelly"], ["Department of Strategic Wargaming:", "LTC Chris Miller, Matthew Wechsler, Brian Foster, Mark Leno, Ed Zukowski, CPT Jacob Kessler"]];
var FILM = "media/hype_540.mp4";
function aboutBody(el, d) {
  var rm = reducedMotion();
  el.innerHTML = '<article class="about2">' +
    '<h2 class="mh2">ABOUT SHADOWS &amp; STEEL 2045</h2><h3>THE GAME</h3><p>Shadows &amp; Steel is a card game about force design and concept development. It explores innovation in multi-domain warfare through strategic, competitive play. The game is in playtesting, and your feedback shapes it. Play a battle, then tell the team what you think.</p>' +
    '<h3>THE FILM</h3><div class="film"><video id="abV" preload="none" playsinline controls hidden></video><button class="big" id="abPlay">PLAY VIDEO</button></div><p class="cap">A short film about the game and why it is being built. 2 min 25 s.</p><p class="cap" id="abErr" role="status"></p>' +
    '<p><button class="ghost" id="abOpening" aria-describedby="md_op"' + (rm ? " disabled" : "") + '>WATCH THE OPENING</button> <span class="cap" id="md_op">' + (rm ? "Reduced motion is on, so the opening film is skipped." : "Play the opening film again.") + "</span></p>" +
    (window.SS_NOTICES && window.SS_NOTICES.welcome ? '<h3>WELCOME</h3>' + mdP(window.SS_NOTICES.welcome.full) + '<p><button class="ghost lk" id="wNotice">Read the playtest notice</button></p>' : "") +
    '<h3>CREDITS</h3><h4 class="sub4">The team</h4><p class="sub">Beta 3.0 printed edition</p><ul class="team">' + TEAM.map(function (r) { return "<li><b>" + esc(r[0]) + "</b> " + esc(r[1]) + "</li>"; }).join("") + "</ul>" +
    '<p>' + "Digital edition: designed and built by the Shadows &amp; Steel digital studio for the project team.</p>" +
    (function () { var CR = window.SS_CREDITS || [], MU = window.SS_MUSIC || []; return '<h4 class="sub4">Sound and music</h4><ul>' + CR.map(function (c) { return "<li>" + esc(c.source) + ": " + esc(String(c.what).replace(/\b(\d+) musics\b/, "$1 tracks")) + "</li>"; }).join("") + "</ul>" + (MU.length ? "<p>Music: " + esc(MU.join(", ")) + ".</p>" : ""); })() +
    '<h4 class="sub4">Card art</h4><p>Made for the project (Art Pass v6.0 and earlier passes); some cards show Beta 3 art until the next Art Pass.</p>' +
    '<h4 class="sub4">Fonts and software</h4><p>Fonts: Rajdhani, Barlow and JetBrains Mono, under the SIL Open Font License.</p><p>Software: three.js (MIT License) and Pyodide (Mozilla Public License 2.0).</p>' +
    '<h3>FEEDBACK</h3><p>Questions and ideas reach the whole team at:</p><p><a href="mailto:ShadowsAndSteel@armywarcollege.edu">ShadowsAndSteel@armywarcollege.edu</a></p><p>Or use Provide Feedback after a game.</p>' +
    '<h3>NOT AN OFFICIAL PRODUCT</h3><p>' + "Shadows &amp; Steel is an unofficial educational game. The views in it are the designers' and do not reflect the official policy or position of the U.S. Army War College, the Department of the Army, the Department of Defense or the U.S. Government. Doctrine is quoted from publicly released publications for teaching purposes, and no endorsement is implied.</p>" +
    (window.SS_NOTICES && window.SS_NOTICES.welcome ? "" : '<h3>PLAYTEST NOTICE</h3><p><button class="ghost lk" id="wNotice">Read the playtest notice again</button></p>') +
    '<h3>THIS BUILD</h3><p>' + esc(buildTag(d)) + (d.training && d.training.version ? " · Basic Training v" + esc(d.training.version) : "") + (d.decks ? " · " + esc(d.decks) : "") + "</p></article>";
}
function aboutFilm() { var v = $("abV"), b = $("abPlay"), er = $("abErr"); if (!v) return; er.textContent = "";
  var vol = function (on) { try { if (musBus) musBus.gain.value = on ? (G.volMus == null ? 1 : G.volMus) : 0; } catch (x) { } };   // the menu music pauses while the film plays
  if (!v.src) { v.src = FILM; v.addEventListener("error", function () { v.hidden = true; b.hidden = false; b.disabled = true; er.textContent = "The film is not in this copy of the game yet."; vol(true); }); v.addEventListener("play", function () { vol(false); }); v.addEventListener("pause", function () { vol(true); }); v.addEventListener("ended", function () { vol(true); }); }
  v.hidden = false; b.hidden = true; v.volume = G.muted ? 0 : 1; var pr = v.play(); if (pr && pr.catch) pr.catch(function () { }); try { v.focus(); } catch (x) { } }
function trainBody(el, d) {   /* v0.17 (Stage D): Basic Training on the Main Menu */
  var t = d.training;
  if (!t) { el.innerHTML = '<section class="step"><h2>Basic Training</h2><p class="hint">Basic Training is not on this copy of the page (basic_training.json is missing).</p></section>'; return; }
  var done = false; try { done = !!localStorage.getItem("ss.trained"); } catch (e) { }
  el.innerHTML = '<section class="step train"><h2><i>★</i>' + esc(t.name) + '</h2><p class="lead2">New to Shadows &amp; Steel? Start here. A short guided battle teaches the game one step at a time: about ' + esc(t.minutes) + ' minutes. Each step accepts only the move it asks for, so you always know what to do next.</p>' +
    '<ol class="tl">' + ["The board: the route, Zones, your Force Marker and Contact", "Deploying cards, and your Frontline and Rear Area", "Attacking, and what Survivability and Durability mean", "Operators, the Mission Track and H-Hour", "Effect cards, Sustainment and Assessment", "How to win"].map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>" +
    '<p class="hint">' + (done ? "You have finished Basic Training on this device. Play it again any time." : "The coach explains each step. Read it, tap Next, then do what it asks.") + ' The Field Manual holds every lesson to read again later.</p></section>' +
    '<div class="go"><button id="pgo" class="big">Start Basic Training</button><p><button class="ghost" id="tFM">Read the Field Manual</button></p></div><pre id="serr"></pre>';
}
function logoBand() { var L = window.SS_LOGOS || []; return L.length ? '<div class="logos" aria-label="U.S. Army, U.S. Army War College, Department of Strategic Wargaming">' + L.map(function (x) { return '<img class="' + x.key + '" alt="' + esc(x.alt) + '" src="' + x.src + '">'; }).join("") + "</div>" : ""; }
function showSetup() {
  G.battleMus = false; reset(); render(); $("bot").style.visibility = "hidden"; $("debrief").style.display = "none";   // the setup screen covers the table: keep the game buttons out from behind it
  api("/play").then(function (d) {
    G.meta = d.meta || {}; G.bases = d.bases || {}; G.faces = d.faces || {}; G.builds = d.builds || []; G.gloss = (G.builds[0] || {}).glossary || d.glossary || G.gloss; G.decklists = (G.builds[0] || {}).decklists || G.decklists; G.buildOn = null; handCv = {}; MUS.on = false; MUS.target = 0; $("vig").className = "fx"; if (d.game) { $("cover").style.display = "none"; return poll(); }
    G.setupData = d; var cs = d.concepts; if (!SET.you) SET.you = cs[0].name; if (!SET.bot) SET.bot = (cs[1] || cs[0]).name;
    $("cover").style.display = "block"; $("cover").classList.add("map");
    $("cover").firstElementChild.innerHTML = '<canvas class="contours" id="suMap"></canvas><div class="su"><header class="su-h"><h1 class="t">Shadows <span>&amp;</span> Steel<small> 2045</small></h1>' +
      '<button class="ghost gear" id="suBack" hidden>‹ Main Menu</button></header>' +
      '<div id="suBody"></div><footer class="su-f" id="suTag">' + esc(buildTag(d)) + "</footer></div>";   // v0.21 (WP8, spec 5.2): the build tag only; no logos (content pack decision 3)
    if (G.autoStart) SET.screen = SET.mode === "train" ? "train" : "play"; setupBody(d); if (G.autoStart) { G.autoStart = false; setTimeout(function () { var pg = $("pgo"); if (pg && !pg.disabled) pg.click(); }, 60); } requestAnimationFrame(function () { contourMap($("suMap"), SET.terrain); if (window.SSOpening && window.SSOpening.menuShown) window.SSOpening.menuShown(); });
    if (SITE) noticeGate();   // v0.20.2: the playtest website asks for the notice once before the Main Menu can be used
  }, function (e) { $("cover").style.display = "block"; $("cover").firstElementChild.innerHTML = "<h1 class='t'>Shadows &amp; Steel</h1><p class='lead'>The game engine did not start.</p><pre>" + esc(e.message) + "</pre>"; });
}
$("cover").addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (b && G.setupData && (b.dataset.go || b.id === "suBack" || b.id === "suReps")) { var go = b.id === "suBack" ? "menu" : b.id === "suReps" ? "replays" : b.dataset.go; SFX.select && SFX.select();
    if (go === "settings") return showSettings(); if (go === "train") SET.mode = "train"; else if (go === "play" && SET.mode !== "watch") SET.mode = "bot"; else if (go === "replays") SET.mode = "replays";
    SET.screen = go; setupBody(G.setupData); try { (go === "menu" ? document.querySelector("#suBody .mprim") : $("suBack")).focus({ preventScroll: true }); } catch (x) { } return; }   // v0.21 (WP8): one screen at a time; Back returns to the Main Menu
  if (b && b.id === "nBell") return showNotices(!$("notices")); if (b && b.id === "nClose") return showNotices(false);
  if (b && (b.id === "wGot" || b.id === "wX")) { try { localStorage.setItem("ss.welcomeSeen", "1"); } catch (x) { G.welcomeSeen = true; } var wn = $("wNote"); if (wn) wn.remove(); try { var pp = document.querySelector("#suBody .mprim"); if (pp) pp.focus({ preventScroll: true }); } catch (x) { } return; }
  if (b && b.id === "abPlay") return aboutFilm(); if (b && b.id === "abOpening") { try { sessionStorage.setItem("ss.opAgain", "1"); } catch (x) { } return location.reload(); }
  if (b && b.id === "suGear") return showSettings(); if (b && b.id === "suQuit") return quitApp(b); if (b && b.id === "suSend") return showSend(); if (b && b.id === "wNotice") return showNotice(true); if (b && b.id === "wHide") { try { localStorage.setItem("ss.welcomed", "1"); } catch (er) { } var wl = $("welcome"); if (wl) wl.remove(); return; } if (b && (b.id === "suFM" || b.id === "tFM")) return showManual(); if (b && b.id === "suLib") return showLibrary(); if (!b || !G.setupData) return; var d = G.setupData, grp = b.closest("[data-set]");
  if (b.dataset.you || b.dataset.bot) { if (b.dataset.you) SET.you = b.dataset.you; else SET.bot = b.dataset.bot; SFX.select && SFX.select(); return setupBody(d); }
  if (grp && b.dataset.v != null) { SET[grp.dataset.set] = b.dataset.v; SET.open = !!document.querySelector("#cover details.more[open]");
    if (grp.dataset.set === "mode") { Array.prototype.forEach.call(grp.children, function (x) { x.setAttribute("aria-pressed", x === b); }); $("pgo") && ($("pgo").disabled = false); }
    if (grp.dataset.set === "terrain") { var tn = SET.terrain || "OPEN PLAIN"; TER.set(tn); TER.load(tn).then(function () { var m = $("suMap"); if (m) contourMap(m, SET.terrain); }, function () { }); }
    return setupBody(d); }
  if (b.id === "pgo") { audioInit(); unlock(); b.disabled = true; b.textContent = "Setting up…";
    if (SND && AC && !G.muted) { G.battleMus = true; setMood("approach", true); }   // v0.19.3: the battle music starts with the battle, on this tap (a phone allows a new track only from a tap)
    var trialOn = SET.mode === "bot" && SET.trial === "1", tset = trialOn ? trialSettings() : {}; if (trialOn) try { if (window.SS_REC) window.SS_REC("trial rules on: " + JSON.stringify(tset)); } catch (x) { }
    api("/play/start", SET.mode === "train" ? { tutorial: "basic" } : Object.assign(tset, { build: "", seed: SET.seed || "", spectate: SET.mode === "watch" ? "1" : "", you: SET.you, bot: SET.bot, terrain: SET.terrain, first: SET.first, concepts: "0", forced_discard: SET.fd, instant_end: SET.end }))
      .then(function () { $("cover").style.display = "none"; reset(); fit(); MUS.on = true; return poll(); }, function (e) { b.disabled = false; b.textContent = "Start the game"; $("serr").textContent = e.message; }); }
});
addEventListener("keydown", function (e) { if (e.key !== "Escape" || !G.setupData || $("cover").style.display === "none" || !SET.screen || SET.screen === "menu") return;   /* v0.21 (checkers): Esc goes back one screen from Play, Training, Library and About too */
  var open = ["settings", "lib", "fm", "piles", "notice", "send"].some(function (id) { var x = $(id); return x && x.style.display && x.style.display !== "none"; }); if (open) return; var bk = $("suBack"); if (bk && !bk.hidden) { e.preventDefault(); bk.click(); } });
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
  return Promise.all([get("index.html"), get("three.min.js"), get("heights.js"), get("art.js"), get("cardface.js"), get("battle.js"), TER.embed(tname), get("terrain.js"), get("input.js")]).then(function (a) {
    var js = function (t) { return "<script>" + t.replace(/<\/script/gi, "<\\/script") + "<\/script>"; }, html = a[0].replace(/<script type="module">[\s\S]*?<\/script>/, "");
    var put = function (src, body) { html = html.replace('<script src="' + src + '"></script>', function () { return body; }); };
    put("three.min.js", js(a[1])); put("heights.js", js(a[2])); put("art.js", js(a[3] + "\nwindow.ART_HI=[];")); put("cardface.js", js(a[4])); put("terrain.js", js(a[7])); put("input.js", js(a[8])); put("sound.js", ""); put("brand.js", ""); put("site.js", ""); put("opening/opening.js", "");
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
    if (benOn(G.latest)) feed(BEN_NOTE);   /* v0.21 (RC1 item d): a game recorded with Concept benefits on plays as recorded, and says so */
  });
}
var BEN_NOTE = "Recorded with Concept benefits on, as the rules allowed then. New games are played without them: they are held for campaign play.";
function benOn(v) { var b = v && v.you && v.you.benefit; return !!b && !/switched off/i.test(b); }
function R0(opts) { return opts && opts.standalone ? "Stop the replay" : "Exit replay"; }
function replayJump(i) {   // to the start of a round
  var R = G.replay; if (!R) return; var fr = R.body.frames; i = Math.max(0, Math.min(fr.length - 1, i));
  G.pgen = (G.pgen || 0) + 1; G.queue = fr.slice(i); G.playing = false; G.waiting = false; G.skip = false; G.over = null; G.overShown = false; $("debrief").style.display = "none";
  G.hist = fr.slice(0, i).map(function (f) { return f.text; }); G.aar = []; G.aarEv = []; G.aarLast = null; fr.slice(0, i).forEach(aarNote);
  if (i) { G.view = fr[i - 1].view; sync(G.view); } $("feed").innerHTML = ""; playNext();
}
function exitReplay() { var R = G.replay; document.body.classList.remove("replaying"); G.replay = null; G.pgen = (G.pgen || 0) + 1;
  if (R && R.standalone) { reset(); render(); $("cover").style.display = "block"; $("cover").firstElementChild.innerHTML = standaloneCover(R.rec); return; }
  SET.mode = "replays"; SET.screen = "replays"; showSetup(); }
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
    '<p class="dbs">' + esc(overHow(o)) + ". Final Homefront: " + esc(nm[0]) + " " + o.you_hf + ", " + esc(nm[1]) + " " + o.bot_hf + ".</p>" + (trialLine() ? '<p class="dbs dtr">' + esc(trialLine()) + ".</p>" : "") +
    (rows.length > 1 ? '<div class="dbc"><p class="dbl">Homefront by round</p><canvas id="dbC"></canvas></div>' : "") +
    '<div class="dbt"><p class="dbl">Turning points</p><ol>' + (turningPoints().map(function (e) { return "<li><b>Round " + e.round + "</b> " + esc(e.text) + "</li>"; }).join("") || "<li>None recorded.</li>") + "</ol></div>" +
    '<div class="dba">' + (R ? '<button class="big" id="dAgain">Watch again</button>' : '<button class="big" id="dRedeploy">Redeploy</button>' + (SITE ? '<button id="dFeedback">✉ Provide Feedback</button>' : "") + '<button class="ghost" id="dSave">Save replay</button>') + '<button class="ghost" id="dAAR">After-action review</button><button class="ghost" id="dLog">Battle log</button>' +
    (R ? (R.standalone ? "" : '<button class="ghost" id="dBack">Saved replays</button>') : '<button class="ghost" id="dNew">Exit to the Main Menu</button>') + '<button class="ghost" id="dClose">Look at the board</button></div><p id="dMsg" class="dbm">' + (G.savedReplay ? savedText(G.savedReplay) : "") + "</p>" + (SITE && !R ? '<div class="dbn"><p class="dbl">✉ Provide Feedback: your verdict, for the team</p><div id="dSendBox"></div></div>' : "") + "</div>";
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
  if (b.id === "dRedeploy") { $("debrief").style.display = "none"; G.autoStart = true; return quit(true); }   // v0.21 (Council M11): the same matchup again
  if (b.id === "dFeedback") return showSend();
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
    if (M) { if (M.src[uid]) on = .5 + Math.sin(T * 4 + o.tx) * .25; if (G.sel === uid || G.listHi === uid) { on = 1; col = 0xffffff; } if (M.sups[uid]) { on = .9; col = 0x6aa8ff; } if (M.dsts[uid]) { ring = 1; if (G.pvDst === uid) { on = 1; col = 0xff8a66; } } if (G.multi && G.multi.picked.some(function (x) { return x.id === uid; })) { on = 1; col = 0xffd27a; } }
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
  camStep(raw); aimUpdate(raw); if (G.dirCam) try { G.dirCam(raw, camBase, camTarget, camera); } catch (e) { G.dirCam = null; }
  if (G.calm) shake = 0; shake *= Math.pow(.004, raw); camera.position.set(camBase.x + (Math.random() - .5) * shake, camBase.y + (Math.random() - .5) * shake, camBase.z + (Math.random() - .5) * shake * .6); camera.lookAt(camTarget);
  renderer.render(scene, camera);
}

/* ================= start ================= */
/* v0.20.2 (WP1): the full-screen grain overlay is gone (a blended layer over the 3D table, redrawn every frame; Prototype Design Spec 7.2) */
drawStatic(); applyPrefs(false); fit(); requestAnimationFrame(frame);
if (window.matchMedia) try { matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", function () { applyPrefs(); }); } catch (e) { }
var artReady = Promise.all(Object.keys(ART).map(function (k) { return new Promise(function (r) { var im = new Image(); im.onload = function () { IMG[k] = im; r(); }; im.onerror = r; im.src = ART[k]; }); }));
var fontReady = (document.fonts && document.fonts.load) ? Promise.race([Promise.all([document.fonts.load('30px "Black Ops One"'), document.fonts.load("600 20px Barlow")]), new Promise(function (r) { setTimeout(r, 1800); })]).catch(function () { }) : Promise.resolve();
[1500, 6000, 15000].forEach(function (ms) { setTimeout(function () { dbReady().then(function (d) { if (d) recoverNotes(); }); }, ms); });
(function () { var rj = document.getElementById("ss-replay"); if (!rj) return; try { window.SS_REPLAY = JSON.parse(rj.textContent); } catch (e) { return; }   // a saved-replay file: no engine, just the game
  Promise.all([artReady, fontReady]).then(function () { $("cover").classList.add("map"); $("cover").firstElementChild.innerHTML = standaloneCover(window.SS_REPLAY); requestAnimationFrame(function () { contourMap($("suMap"), (window.SS_REPLAY.meta || {}).terrain || window.SS_TNAME || ""); }); }); })();
window.SS = { render: function () { if (G.pend) G.pend = Object.assign({}, G.pend); handKey = ""; $("prompt").dataset.h = ""; render(); }, unslice: unslice, spotCheck: spotCheck, rowRect: function (k) { return rowRect(ROWZ[k]); }, sendForm: sendForm, showSend: showSend, site: SITE, copyWhere: copyWhere, optWhere: optWhere, quitApp: quitApp, winTrack: winTrack, showLibrary: showLibrary, toggleWin: toggleWin, glossFor: glossFor, hintBox: hintBox, PREF: PREF, applyPrefs: applyPrefs, showSettings: showSettings, caption: caption, TER: TER, SND: SND, readCard: readCard, showPiles: showPiles, hitsBox: hitsBox, isCause: isCause, saveReplay: saveReplay, playReplay: playReplay, buildReplayFile: buildReplayFile, listReplays: listReplays, loadReplay: loadReplay, showDebrief: showDebrief, replayJump: replayJump, set: SET, drawCard: function (u, S) { return drawCard(u, S || 1); }, engine: function (handle) { Promise.all([artReady, fontReady]).then(function () { engineOk(handle); G.engineUp = true; var gate = window.SSOpening && window.SSOpening.gate && window.SSOpening.gate(); (gate || Promise.resolve()).then(showSetup); }); }, op: OPDIR, G: G, api: api, objs: function () { return O; }, fitInfo: fitInfo, choose: choose, tapObj: tapObj, objAt: objAt, peekAt: peekAt, zoom: zoom, resume: function () { $("cover").style.display = "none"; reset(); fit(); MUS.on = true; return poll(); } };
})();
