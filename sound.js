// Shadows & Steel: recorded sound for the Battlefield table. Music that follows the battle, effects, and radio voices.
// audio/manifest.json (made by make_audio.py) lists the files and what each is for. battle.js asks for sounds by name;
// when a file is missing or not loaded yet (a saved replay file carries no audio), battle.js plays its generated sound instead.
(function () {
"use strict";
var COOL = { orders: 40, deploy: 16, attack: 9, fires: 9, kill: 5, loss: 5, hit: 12, incoming: 9, contact: 90, spotted: 10, unknown: 20, detected: 15,
  cyber: 15, disrupted: 10, base: 15, stand: 30, advance: 25, fallback: 25, air: 20, hhour: 8, win: 0, lose: 0, round: 60, ack: 30 };
var URGENT = { win: 3, lose: 3, stand: 2, contact: 2, base: 2, loss: 1, kill: 1, hhour: 1, detected: 1 };

function create(o) {   // o.ctx() -> AudioContext or null; o.bus(name) -> GainNode for "fx", "mus" or "vox"; o.base: folder of the audio
  var lastCall = null, base = o.base || "audio/", man = null, bufs = {}, loading = {}, lastPick = {}, voice = { until: 0, last: {} };
  var ready = (typeof fetch === "function" ? fetch(base + "manifest.json").then(function (r) { return r.ok ? r.json() : null; }) : Promise.resolve(null))
    .then(function (m) { man = m && m.fx ? m : null; return man; }, function () { return null; });
  function C() { return o.ctx(); }
  function load(file) {
    if (bufs[file]) return Promise.resolve(bufs[file]); if (loading[file]) return loading[file]; var c = C(); if (!c) return Promise.resolve(null);
    return (loading[file] = fetch(base + file).then(function (r) { if (!r.ok) throw new Error(file); return r.arrayBuffer(); })
      .then(function (ab) { return new Promise(function (res, rej) { var p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }); })
      .then(function (b) { bufs[file] = b; return b; }, function () { delete loading[file]; return null; }));
  }
  function files(name, kind) { return man ? ((kind === "vox" ? man.vox[name] : man.fx[name]) || []) : []; }
  function preload(names, kind) { return ready.then(function () { return Promise.all(names.reduce(function (a, n) { return a.concat(files(n, kind).map(load)); }, [])); }); }
  function preloadAll() { return ready.then(function () { if (!man) return; return preload(Object.keys(man.fx)).then(function () { return preload(Object.keys(man.vox), "vox"); }); }); }
  function pick(list, key) { if (list.length < 2) return list[0]; var i; do { i = Math.floor(Math.random() * list.length); } while (i === lastPick[key]); lastPick[key] = i; return list[i]; }
  function source(file, busName, vol, rate, when, pan) {
    var c = C(), b = bufs[file], bus = o.bus(busName); if (!c || !b || !bus) return null;
    var s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.playbackRate.value = rate || 1; g.gain.value = vol == null ? 1 : vol; s.connect(g);
    if (pan && c.createStereoPanner) { var p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(bus); } else g.connect(bus);
    s.start(c.currentTime + (when || 0)); if (window.SS_SOUNDLOG) window.SS_SOUNDLOG.push([performance.now(), file, busName, vol == null ? 1 : vol, when || 0]);   // only a review capture sets SS_SOUNDLOG
    return s;
  }
  function play(name, opt) {   // true when a recorded take of this sound starts; false (and it starts loading) when none is ready
    opt = opt || {}; var all = man && man.fx[name]; if (!all || !C()) return false;
    var list = all.filter(function (f) { return bufs[f]; }); if (!list.length) { all.forEach(load); return false; }
    return !!source(pick(list, name), "fx", opt.vol, (opt.rate || 1) * (1 + (Math.random() - .5) * (opt.jitter == null ? .06 : opt.jitter)), opt.when, opt.pan);
  }
  function say(ev, opt) {   // a radio call; routine chatter waits its turn or is dropped, so the net never gets crowded
    opt = opt || {}; var all = man && man.vox[ev], c = C(); if (!all || !c) return false;
    var now = c.currentTime, urgent = URGENT[ev] || 0;
    if (now - (voice.last[ev] == null ? -999 : voice.last[ev]) < (COOL[ev] == null ? 10 : COOL[ev])) return false;
    if (now < voice.until - .05 && urgent < 2) return false;
    var list = all.filter(function (f) { return bufs[f]; }); if (!list.length) { all.forEach(load); return false; }
    var f = pick(list, "v:" + ev), at = Math.max(now + (opt.delay || 0), voice.until), s = source(f, "vox", opt.vol == null ? 1 : opt.vol, 1, at - now); if (!s) return false;
    voice.until = at + bufs[f].duration + .35; voice.last[ev] = now; duck(at, bufs[f].duration); lastCall = { file: f, wait: at - now, dur: bufs[f].duration }; return f;   // the take that will play (truthy), for captions
  }

  /* music: two players that crossfade; each mood loops until the battle changes */
  var mus = { el: [], g: [], cur: -1, mood: "", duck: null, on: false }, SILENT = "";
  function silent() {   // a short silent clip, so a player can be started on a tap before it has music to play
    if (SILENT) return SILENT; var n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = function (o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
    return (SILENT = URL.createObjectURL(new Blob([b], { type: "audio/wav" })));
  }
  function players() {
    var c = C(); if (mus.el.length || !c || !o.bus("mus")) return !!mus.el.length;
    mus.duck = c.createGain(); mus.duck.connect(o.bus("mus"));
    for (var i = 0; i < 2; i++) { var a = new Audio(); a.loop = true; a.preload = "auto"; a.setAttribute("playsinline", ""); var g = c.createGain(); g.gain.value = .0001;
      try { c.createMediaElementSource(a).connect(g); } catch (e) { return false; } g.connect(mus.duck); mus.el.push(a); mus.g.push(g); }
    return true;
  }
  function bless() {   // phones let a page start audio only from a tap: start (and hold) both players now so later changes can play
    if (!players()) return; mus.el.forEach(function (a, i) { if (i === mus.cur || a.dataset.blessed) return; a.dataset.blessed = "1"; a.muted = true; if (!a.getAttribute("src")) a.src = silent();
      var p = a.play(); if (p && p.then) p.then(function () { if (i !== mus.cur) a.pause(); a.muted = false; }, function () { a.muted = false; a.dataset.blessed = ""; }); else { a.pause(); a.muted = false; } });
  }
  function music(mood, fade, fromStart) {   // true when this mood has a track (it plays now or is already playing). fromStart (v0.18): play it again from 0
    var m = man && man.music && man.music[mood]; if (!m || !players()) return false;
    if (mood === mus.mood && fromStart && mus.cur >= 0) { if (window.SS_SOUNDLOG) window.SS_SOUNDLOG.push([performance.now(), m.file, "music", 1, 0]); var ca = mus.el[mus.cur], cg = mus.g[mus.cur], cn = C().currentTime; try { ca.currentTime = 0; } catch (e) { } cg.gain.cancelScheduledValues(cn); cg.gain.setValueAtTime(1, cn); var p1 = ca.play(); if (p1 && p1.catch) p1.catch(function () { }); mus.on = true; return true; }
    if (mood === mus.mood) { if (mus.cur >= 0 && mus.el[mus.cur].paused) { var p0 = mus.el[mus.cur].play(); if (p0 && p0.catch) p0.catch(function () { }); } return true; }
    var c = C(), now = c.currentTime, fd = fade == null ? 2.5 : fade, nx = mus.cur < 0 ? 0 : 1 - mus.cur, a = mus.el[nx], g = mus.g[nx];
    if (mus.cur >= 0) { var og = mus.g[mus.cur], oa = mus.el[mus.cur]; og.gain.cancelScheduledValues(now); og.gain.setValueAtTime(Math.max(og.gain.value, .0001), now); og.gain.exponentialRampToValueAtTime(.0001, now + fd); setTimeout(function () { if (mus.el[mus.cur] !== oa) oa.pause(); }, fd * 1000 + 200); }
    a.src = base + m.file; try { a.currentTime = 0; } catch (e) { } var p = a.play(); if (p && p.catch) p.catch(function () { });
    g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(1, now + fd);
    mus.cur = nx; mus.mood = mood; mus.on = true; if (window.SS_SOUNDLOG) window.SS_SOUNDLOG.push([performance.now(), m.file, "music", 1, 0]); return true;
  }
  function silence(fade) {
    if (mus.cur < 0) return; var c = C(), now = c.currentTime, g = mus.g[mus.cur], a = mus.el[mus.cur], fd = fade == null ? 1.5 : fade;
    g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(Math.max(g.gain.value, .0001), now); g.gain.exponentialRampToValueAtTime(.0001, now + fd);
    setTimeout(function () { if (mus.mood === "") a.pause(); }, fd * 1000 + 200); mus.mood = ""; mus.on = false; if (window.SS_SOUNDLOG) window.SS_SOUNDLOG.push([performance.now(), "", "silence", fd, 0]);
  }
  function duck(at, dur) {
    if (!mus.duck) return; var d = mus.duck.gain; d.cancelScheduledValues(at); d.setTargetAtTime(.5, at, .06); d.setTargetAtTime(1, at + dur + .1, .4);
  }
  /* v0.18, the animated opening: its cue list names files, played on the same buses (so the Sound sliders and Mute work) */
  function loadFiles(list) { return ready.then(function () { return Promise.all(list.map(load)); }); }
  function cue(file, kind, vol) {   // kind "vox" or "fx"; a voice ducks the music and holds the net like a radio call. Returns the take's length, or false
    var c = C(), b = bufs[file]; if (!c || !b) { if (c) load(file); return false; }
    var s = source(file, kind === "vox" ? "vox" : "fx", vol == null ? 1 : vol, 1, 0); if (!s) return false;
    if (kind === "vox") { var now = c.currentTime; voice.until = now + b.duration + .35; duck(now, b.duration); lastCall = { file: file, wait: 0, dur: b.duration }; }
    return b.duration;
  }
  return { loadFiles: loadFiles, cue: cue, musicEl: function () { return mus.cur >= 0 ? mus.el[mus.cur] : null; }, lastCall: function () { return lastCall; }, ready: ready, preload: preload, preloadAll: preloadAll, play: play, say: say, music: music, silence: silence, bless: bless,
    mood: function () { return mus.mood; }, state: function () { return mus.el.map(function (a, i) { return { src: a.src.split('/').pop(), paused: a.paused, t: Math.round(a.currentTime * 10) / 10, gain: Math.round(mus.g[i].gain.value * 100) / 100 }; }); }, playing: function () { return mus.on; }, has: function (n, kind) { return files(n, kind).some(function (f) { return bufs[f]; }); }, manifest: function () { return man; } };
}
window.SSSound = { create: create };
})();
