// Shadows & Steel: the ground under the cards, with one look for each terrain card.
// Open Plain uses terrain.jpg and heights.js. Urban Sprawl, High Desert and Mountain Pass use terrain/<key>.jpg and terrain/<key>.json,
// made by bake_terrains.py (the picture has its light and shadow baked in; the json holds the height grid, the colours of the haze and
// dust, and props such as the city blocks beside the board). A replay file carries the one terrain it needs (window.SS_T, window.SS_TIMG).
(function () {
"use strict";
var KEYS = { "OPEN PLAIN": "open", "URBAN SPRAWL": "urban", "HIGH DESERT": "desert", "MOUNTAIN PASS": "mountain" };
var OPEN_LOOK = { haze: "#2a302c", skirt: "#4a4c40", dust: "#d8d2c0", dustA: 1, shade: 0, fires: [] };
function keyOf(name) { return KEYS[String(name || "").toUpperCase()] || "open"; }

function create(o) {
  var THREE = window.THREE, scene = o.scene, renderer = o.renderer, TX = o.TX, base = o.base || "";
  var S0 = window.SS_H, geo = new THREE.PlaneGeometry(56, 24, S0.w - 1, S0.h - 1), pos = geo.attributes.position;
  var mat = new THREE.MeshBasicMaterial({ color: 0x1b1f1d }), mesh = new THREE.Mesh(geo, mat); mesh.rotation.x = -Math.PI / 2; scene.add(mesh);
  var skirt = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x4a4c40 })); skirt.rotation.x = -Math.PI / 2; skirt.position.y = -1.2; scene.add(skirt);
  // the Shadow side of the field stays darker on every terrain
  var c = document.createElement("canvas"); c.width = 8; c.height = 256; var g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "rgba(8,14,18,.55)"); gr.addColorStop(.85, "rgba(8,14,18,.42)"); gr.addColorStop(1, "rgba(8,14,18,0)"); g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
  var st = new THREE.CanvasTexture(c); st.anisotropy = 4;
  var shade = new THREE.Mesh(new THREE.PlaneGeometry(80, 12.6), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, fog: false }));
  shade.rotation.x = -Math.PI / 2; shade.position.set(0, .36, -6.4); scene.add(shade);
  var drift = [];
  for (var i = 0; i < 14; i++) { var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.smoke, transparent: true, depthWrite: false, opacity: 0, color: 0xd8d2c0 })); s.position.set(-26 + Math.random() * 52, 1.8 + Math.random() * 2.4, -10 + Math.random() * 19); var sc = 7 + Math.random() * 9; s.scale.set(sc, sc * .6, 1); scene.add(s); drift.push({ s: s, v: .25 + Math.random() * .45, a: .04 + Math.random() * .05 }); }
  var props = new THREE.Group(); scene.add(props);
  var fires = [], puffs = [], spare = [], tex = {}, data = {}, cur = "", want = "", fade = 1, look = OPEN_LOOK, clock = 0;

  function loadData(key) {
    if (data[key]) return Promise.resolve(data[key]);
    if (key === "open") return Promise.resolve(data.open = { w: S0.w, h: S0.h, s: S0.s, d: S0.d, look: OPEN_LOOK, props: {} });
    var T = (window.SS_T || {})[key]; if (T) return Promise.resolve(data[key] = T);
    return fetch(base + "terrain/" + key + ".json").then(function (r) { if (!r.ok) throw new Error("terrain/" + key + ".json is missing"); return r.json(); }).then(function (T) { return (data[key] = T); });
  }
  function imgUrl(key) { return key === "open" ? (window.SS_TERRAIN || base + "terrain.jpg") : ((window.SS_TIMG || {})[key] || base + "terrain/" + key + ".jpg"); }
  function loadTex(key) {
    if (tex[key]) return Promise.resolve(tex[key]);
    return new Promise(function (res, rej) { new THREE.TextureLoader().load(imgUrl(key), function (t) { t.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex[key] = t; res(t); }, undefined, function () { rej(new Error(imgUrl(key) + " did not load")); }); });
  }
  function load(name) { var key = keyOf(name); return Promise.all([loadData(key), loadTex(key)]).then(function (a) { return { key: key, D: a[0], t: a[1] }; }); }
  function set(name) {   // show this terrain; asking again for the one in view (or on its way) does nothing
    var key = keyOf(name); if (key === want) return Promise.resolve(key); want = key;
    return load(key === "open" ? "OPEN PLAIN" : name).then(function (r) { if (r.key === want) apply(r.key, r.D, r.t); return r.key; },
      function (e) { if (window.console) console.warn("Terrain " + key + ": " + e.message + ". Showing the open plain."); if (want === key && key !== "open") { want = ""; return set("OPEN PLAIN"); } });
  }
  function apply(key, D, t) {
    if (D.w !== S0.w || D.h !== S0.h) throw new Error("terrain " + key + " has a " + D.w + "x" + D.h + " grid; the board needs " + S0.w + "x" + S0.h);
    for (var i = 0; i < pos.count; i++) pos.setZ(i, (parseInt(D.d.substr(i * 2, 2), 16) / 255 - .30) * D.s);
    pos.needsUpdate = true; geo.computeBoundingSphere(); geo.computeBoundingBox();
    mat.map = t; mat.needsUpdate = true; cur = key; look = Object.assign({}, OPEN_LOOK, D.look || {});
    var hz = new THREE.Color(look.haze); renderer.setClearColor(hz); if (scene.fog) scene.fog.color.copy(hz);
    skirt.material.color.set(look.skirt);
    drift.forEach(function (d) { d.s.material.color.set(look.dust); });
    shade.material.depthTest = !look.shade; shade.renderOrder = look.shade ? -1 : 0; shade.material.needsUpdate = true;   // over tall ground too
    buildProps(D.props || {}); buildFires(look.fires || []); fade = 0;
  }

  /* city blocks beside the board: one box for each building, over its baked roof and shadow, lit by the same sun */
  var winTex = null;
  function windows() {
    if (winTex) return winTex; var c = document.createElement("canvas"); c.width = 32; c.height = 32; var g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 32, 32); g.fillStyle = "#5b6066"; g.fillRect(7, 8, 18, 13); g.fillStyle = "rgba(0,0,0,.10)"; g.fillRect(0, 27, 32, 5);
    winTex = new THREE.CanvasTexture(c); winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.anisotropy = 4; return winTex;
  }
  function buildProps(P) {
    while (props.children.length) { var ch = props.children.pop(); ch.geometry.dispose(); ch.material.dispose(); }
    if (!P.blocks || !P.blocks.length) return;
    var sun = new THREE.Vector3().fromArray(P.sun || [-.55, .72, -.5]).normalize(), amb = P.amb || [.46, .48, .55], sk = P.sc || [1.12, 1.05, .96], roofs = P.roofs || [[140, 140, 136]], wallMix = P.wall || [158, 150, 138];
    var rp = [], rc = [], wp = [], wc = [], wu = [];
    function lit(rgb, lam, k, out) { for (var j = 0; j < 3; j++) out.push(Math.min(1, rgb[j] / 255 * (amb[j] + sk[j] * lam) * k)); }
    P.blocks.forEach(function (b) {
      var x = b[0], z = b[1], w = b[2] / 2, d = b[3] / 2, h = b[4], a = b[5], roof = roofs[b[6] % roofs.length], ca = Math.cos(a), sa = Math.sin(a), y0 = -.08;
      var C = [[-w, -d], [w, -d], [w, d], [-w, d]].map(function (p) { return [x + p[0] * ca + p[1] * sa, z - p[0] * sa + p[1] * ca]; });
      var top = []; lit(roof, Math.max(0, sun.y), 1, top);
      [0, 1, 2, 0, 2, 3].forEach(function (k) { rp.push(C[k][0], h, C[k][1]); rc.push(top[0], top[1], top[2]); });
      var wall = [roof[0] * .35 + wallMix[0] * .65, roof[1] * .35 + wallMix[1] * .65, roof[2] * .35 + wallMix[2] * .65];
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (n, k) {
        var p = C[k], q = C[(k + 1) % 4], nx = n[0] * ca + n[1] * sa, nz = -n[0] * sa + n[1] * ca, lam = Math.max(0, nx * sun.x + nz * sun.z), col = []; lit(wall, lam * .9 + .05, .95, col);
        var len = Math.hypot(q[0] - p[0], q[1] - p[1]), U = Math.max(1, Math.round(len / .32)), V = Math.max(1, Math.round((h - y0) / .28));
        [[p, y0, 0, 0], [q, y0, U, 0], [q, h, U, V], [p, y0, 0, 0], [q, h, U, V], [p, h, 0, V]].forEach(function (v) { wp.push(v[0][0], v[1], v[0][1]); wc.push(col[0], col[1], col[2]); wu.push(v[2], v[3]); });
      });
    });
    function mk(p, cl, uv, map) {
      var bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); bg.setAttribute("color", new THREE.Float32BufferAttribute(cl, 3)); if (uv) bg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      var m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true, map: map || null, side: THREE.DoubleSide })); props.add(m);
    }
    mk(rp, rc); mk(wp, wc, wu, windows());
  }

  /* fires that burn on in the city: a flicker and a slow column of smoke */
  function buildFires(list) {
    fires.forEach(function (f) { scene.remove(f.s); f.s.material.dispose(); }); fires = [];
    puffs.forEach(function (p) { p.s.visible = false; spare.push(p.s); }); puffs = [];
    list.forEach(function (p) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow, color: 0xff7a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      s.position.set(p[0], .5, p[1]); s.scale.set(1.2, 1.2, 1); scene.add(s); fires.push({ s: s, x: p[0], z: p[1], f: Math.random() * 9, next: Math.random() * 2 });
    });
  }
  function puff(f) {
    var s = spare.pop(); if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.smoke, transparent: true, depthWrite: false, color: 0x34302c })); scene.add(s); }
    s.visible = true; s.position.set(f.x + (Math.random() - .5) * .3, .7, f.z + (Math.random() - .5) * .3); puffs.push({ s: s, t: 0, life: 5 + Math.random() * 2, vx: .16 + Math.random() * .1, vy: .45 + Math.random() * .2, a: .22 + Math.random() * .12 });
  }
  function tick(raw) {
    clock += raw;
    if (fade < 1) { fade = Math.min(1, fade + raw * 2.2); var k = fade * fade * (3 - 2 * fade); mat.color.setScalar(.3 + .7 * k); }
    drift.forEach(function (d) { d.s.position.x += d.v * raw; if (d.s.position.x > 30) d.s.position.x = -30; d.s.material.opacity = d.a * look.dustA; });
    fires.forEach(function (f) {
      f.f += raw * (7 + Math.random() * 5); var fl = .62 + Math.sin(f.f) * .14 + Math.sin(f.f * 2.3) * .1 + (Math.random() - .5) * .08;
      f.s.material.opacity = fl; var sc = 1.0 + fl * .5; f.s.scale.set(sc, sc, 1);
      if (clock > f.next) { f.next = clock + .5 + Math.random() * .5; puff(f); }
    });
    for (var i = puffs.length - 1; i >= 0; i--) {
      var p = puffs[i]; p.t += raw; var u = p.t / p.life;
      if (u >= 1) { p.s.visible = false; spare.push(p.s); puffs.splice(i, 1); continue; }
      p.s.position.x += p.vx * raw * (.4 + u); p.s.position.y += p.vy * raw; var sz = .6 + u * 2.8; p.s.scale.set(sz, sz, 1);
      p.s.material.opacity = p.a * (u < .15 ? u / .15 : 1 - (u - .15) / .85);
    }
  }
  function heights(name) { var D = data[name ? keyOf(name) : (cur || "open")]; return D ? { w: D.w, h: D.h, d: D.d } : { w: S0.w, h: S0.h, d: S0.d }; }
  function embed(name) {   // script text that makes a replay file carry this terrain (its picture as a data URL)
    var key = keyOf(name);
    return Promise.all([loadData(key), fetch(imgUrl(key)).then(function (r) { if (!r.ok) throw new Error("Could not read the " + key + " ground picture from this page."); return r.blob(); })]).then(function (a) {
      return new Promise(function (res) { var f = new FileReader(); f.onload = function () { res(f.result); }; f.readAsDataURL(a[1]); }).then(function (url) {
        if (key === "open") return "window.SS_TERRAIN=" + JSON.stringify(url) + ";";
        var o = {}; o[key] = url; return "window.SS_T=window.SS_T||{};window.SS_T[" + JSON.stringify(key) + "]=" + JSON.stringify(a[0]) + ";window.SS_TIMG=" + JSON.stringify(o) + ";";
      });
    });
  }
  return { set: set, load: load, tick: tick, heights: heights, embed: embed, key: function () { return cur; }, keyOf: keyOf };
}
window.SSTerrain = { create: create, keyOf: keyOf, KEYS: KEYS };
})();
