// Shadows & Steel: card faces. One drawing for the Battlefield table and the Workbench, so a card looks the same everywhere.
// CardFace.draw(card, scale, options, pictures) returns a canvas 280 x 480 (times scale). card is the engine's face data
// (name, cls, gen, id, cap, lines, conc, surv, dur, costn, hf, timer, sub, tags ...); options.meta holds printed values the
// face data lacks (Investment Cost, requirements, ISR cost) by card name; pictures maps a card ID to a loaded Image.
(function () {
"use strict";
function cv(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
var IMG = {}, G = { meta: {} }, HI = {}, HIWAIT = {}, HIBASE = "art/hi/";   // HI: large pictures, loaded only when a card is shown big
var CLS = { FIRES: ["#7d3427", "#b8553f"], M2: ["#55552c", "#8b8a4a"], PROT: ["#2f4c66", "#5c86a8"], INFO: ["#4a3b66", "#8672ab"], INTEL: ["#24544f", "#4d9a90"], SUST: ["#66502a", "#a8884c"], C2: ["#3a3d42", "#7a8088"], JOINT: ["#40463a", "#8a927a"] };
var BOO = '"Black Ops One",Impact,sans-serif', BAR = "Barlow,system-ui,sans-serif";
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function cover(g, img, x, y, w, h) { var r = Math.max(w / img.width, h / img.height), sw = w / r, sh = h / r; g.drawImage(img, (img.width - sw) / 2, (img.height - sh) * .35, sw, sh, x, y, w, h); }
function wrap(g, text, x, y, maxW, lh, maxY) { var words = String(text).split(" "), ln = ""; for (var i = 0; i < words.length; i++) { if (g.measureText(ln + words[i]).width > maxW && ln) { if (y + lh > maxY) { g.fillText(ln.trim() + "…", x, y); return y + lh; } g.fillText(ln, x, y); y += lh; ln = ""; } ln += words[i] + " "; } g.fillText(ln, x, y); return y + lh; }
var UPCLS = { "Movement & Maneuver": "M2", "Command & Control": "C2", "Intelligence": "INTEL", "Information": "INFO", "Protection": "PROT", "Sustainment": "SUST", "Fires": "FIRES" };
function upShort(t) { return String(t).replace(/Movement & Maneuver|Command & Control|Intelligence|Information|Protection|Sustainment|Fires/g, function (m) { return UPCLS[m]; }).toUpperCase(); }
function isCap(u) { return u.cap !== false && (u.cap || u.dur > 0); }
var EFFWORD = { order: "ORDER", reaction: "REACTION", plan: "PLAN", operation: "PLAN", condition: "CONDITION", mission: "MISSION" };   // next update (draft entry AN.4): the waiting Effect kind is called Plan (was Operation, printed here as MISSION). v0.21.1 (the lead, 20 Nov): a Condition prints CONDITION, so the card says what it is (it printed MISSION under RD-145 (6)). "operation" stays so that a card file or saved replay from before cards v0.17.2 reads PLAN too
function subName(s) { return String(s || "").toLowerCase() === "operation" ? "Plan" : s; }
function typeWord(u, cap) { if (cap) return "CAPABILITY"; var s = EFFWORD[String(u.sub || "").toLowerCase()]; return "EFFECT" + (s ? " · " + s : ""); }
// The card face follows the project's Capability template (I. Card Production/02 Template, WARLORD reference): Generation badge top left,
// Concealment / Survivability / Durability down the left of the art, the Class bar, ability lines with "TIMING | NAME" headings and ATK at the right,
// then the value row. Colors come from Class_Colors.csv, Generation_Finishes.csv and Shared_Inks.csv.
var TPL = { M2: ["#5B6038", "#CEBB8E", "#DDDAC2"], FIRES: ["#9A3A31", "#E2CDB8", "#E3CBBD"], PROT: ["#4A7F7B", "#D5BD68", "#D2DACE"], INTEL: ["#3F6A86", "#D5D8DA", "#CFD6D1"], INFO: ["#3A4046", "#AEB4BB", "#D3D4CE"], C2: ["#B0622E", "#F4F1EA", "#E3D2BD"], SUST: ["#6E5A45", "#D8C79F", "#E2D8BE"], JOINT: ["#6A5280", "#D9CFE3", "#D8CECE"] };
var FIN = { 1: ["#D3AE8C", "#A97652", "#8A5C3D", "#5F3E28", "#20140C"], 2: ["#DADDE0", "#A8AFB6", "#868E97", "#59616B", "#15181B"], 3: ["#D9C07A", "#B99545", "#9C7B33", "#6E5622", "#1F180A"] };
var INK = "#24211B", INK2 = "#57513F", RULE = "#7A715A", BRICK = "#8E2B21", CARD_W = 280, CARD_H = 480;
function parseLine(l) {
  l = String(l); var m = l.match(/^([^:]{2,60}?):\s*(.*)$/), head = m ? m[1] : "", body = m ? m[2] : l, parts = head.split(" · "), timing = parts[0] || "", name = parts.slice(1).join(" · ");
  var costs = (timing.match(/\[[^\]]+\]/g) || []).map(function (c) { return c.replace(/[\[\]]/g, ""); }); timing = timing.replace(/\s*\[[^\]]*\]/g, "").trim(); var atk = null;
  if (/^ATTACK/.test(timing)) { var a = body.match(/ATK (\d+)\s*(·\s*)?/); if (a) { atk = a[1]; body = body.replace(a[0], ""); } body = body.replace(/\b(Close|Tactical|Theater)\b(?! range)/, "$1 range").replace(/ · /g, " | "); }
  return { timing: timing, name: name, body: body, costs: costs, atk: atk, red: /^(ATTACK|REACTION|ACTION|SUPPORT|CONTACT|INFILTRATE)/.test(timing) };
}
function statIcon(g, k, x, y) { g.save(); g.translate(x, y); g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 1.4;
  if (k === 0) { g.beginPath(); g.ellipse(0, 0, 8, 4.6, 0, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, 2, 0, 7); g.fill(); g.beginPath(); g.moveTo(-7, 6); g.lineTo(7, -6); g.stroke(); }
  else if (k === 1) { g.beginPath(); g.moveTo(0, -7); g.lineTo(6.5, -4.5); g.lineTo(6, 2); g.lineTo(0, 7.5); g.lineTo(-6, 2); g.lineTo(-6.5, -4.5); g.closePath(); g.stroke(); }
  else { g.strokeRect(-7.5, -6, 15, 12); g.beginPath(); g.moveTo(-5, 0); g.lineTo(-2, 0); g.lineTo(-.5, -3.5); g.lineTo(1.5, 3.5); g.lineTo(3, 0); g.lineTo(5.5, 0); g.stroke(); }
  g.restore(); }
/* The glance face (Battlefield v0.19.1, RD-153 (2)): what a card looks like when it is small, in the hand or on the table. Same size and
   frame as the print face, but only what a player needs at a glance, large: the cost, the type word, the name, the key numbers
   (ATK and range, Survivability, Durability left / full, Concealment) and one short tag per ability line. Holding a card still
   opens the full print face. Drawn from the same card data, so it cannot drift from the card file. Print cards are unchanged. */
var RNG = { Close: "CLOSE", Tactical: "TACTICAL", Theater: "THEATER" };
function glanceTags(u) {
  var out = [];
  (u.lines || []).forEach(function (l) { var p = parseLine(l); if (/^ATTACK/.test(p.timing)) { var kw = String(p.body).match(/\b(DEEP FIRES|FLANK|PRECISION \d|SUPPRESS|TANK KILLER|ANTI-AIR|vs [A-Z]+(?: or [A-Z]+)?)\b/); if (kw) out.push(kw[1]); return; }
    if (/^INFILTRATE/.test(p.timing)) { if (out.indexOf("INFILTRATE") < 0) out.push("INFILTRATE"); return; }
    var t = (p.name || p.timing || "").replace(/\s*\[[^\]]*\]/g, "").trim(); if (/^REQUIRES/.test(p.timing)) t = "REQUIRES " + String(p.body).replace(/^a\s+|friendly\s+/gi, "").split(/[ .,]/)[0].toUpperCase();
    if (t && out.indexOf(t) < 0) out.push(t); });
  return out;
}
function drawGlance(u, S, o) {
  var c = cv(CARD_W * S, CARD_H * S), g = c.getContext("2d"); g.scale(S, S);
  var tp = TPL[u.cls] || TPL.JOINT, cap = isCap(u), img = IMG[u.id], gn = Math.max(1, Math.min(3, String(u.gen || "I").length)), fin = FIN[gn], meta = (G.meta || {})[u.name] || {};
  rr(g, 0, 0, 280, 480, 16); g.fillStyle = tp[0]; g.fill(); rr(g, 8, 8, 264, 464, 11); g.fillStyle = tp[2]; g.fill(); g.strokeStyle = tp[1]; g.lineWidth = 1.5; g.stroke();
  // cost badge, top left: Deploy cost (a Capability) or Supply cost (an Effect), in the Generation finish
  var cs = String(u.cost || ""), cost = u.costn != null ? u.costn : (cs.match(/(\d+)\s*Supply/) || [])[1], isr = !cap && (meta.isr != null ? meta.isr : (cs.match(/(\d+)\s*ISR/) || [])[1]);
  rr(g, 16, 16, 66, 66, 12); var gg = g.createLinearGradient(0, 16, 0, 82); gg.addColorStop(0, fin[0]); gg.addColorStop(1, fin[2]); g.fillStyle = gg; g.fill(); g.strokeStyle = fin[3]; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = fin[4]; g.textAlign = "center"; g.font = "46px " + BOO; g.fillText(cost == null ? "–" : String(cost), 49, 66);
  if (isr) { rr(g, 50, 64, 40, 26, 7); g.fillStyle = "#24544f"; g.fill(); g.fillStyle = "#e8fbf6"; g.font = "19px " + BOO; g.fillText("+" + isr, 70, 84); }
  // type word and name
  g.textAlign = "left"; g.fillStyle = BRICK; g.font = "700 15px " + BAR; var tw = typeWord(u, cap).replace("EFFECT · ", ""); g.fillText(tw + (u.gen ? "  ·  GEN " + u.gen : ""), 94, 34);
  g.fillStyle = INK; var nm = String(u.name || ""), fs = 34; g.font = fs + "px " + BOO; while (g.measureText(nm).width > 170 && fs > 19) { fs--; g.font = fs + "px " + BOO; }
  if (g.measureText(nm).width > 170 && nm.indexOf(" ") > 0) { var ws = nm.split(" "), h = Math.ceil(ws.length / 2); g.font = "21px " + BOO; g.fillText(ws.slice(0, h).join(" "), 94, 58); g.fillText(ws.slice(h).join(" "), 94, 80); }
  else g.fillText(nm, 94, 70);
  // art, smaller than on the print face
  var ay = 92, ah = 112; if (img) cover(g, img, 16, ay, 248, ah); else { g.fillStyle = "#cfcbb8"; g.fillRect(16, ay, 248, ah); }
  g.strokeStyle = fin[1]; g.lineWidth = 2; g.strokeRect(16, ay, 248, ah);
  var y0 = ay + ah + 10;
  if (cap) {   // the key numbers, as large as the card allows
    var left = Math.max(0, (u.dur || 0) - (u.dmg || 0)), cells = [];
    if (u.atkn) cells.push(["ATK", String(u.atkn) + (u.boost ? "+1" : ""), RNG[u.range] || String(u.range || "").toUpperCase(), u.boost ? BRICK : INK]);
    cells.push(["SURV", String(u.surv == null ? "–" : u.surv), "", INK]);
    cells.push(["DUR", left + "/" + (u.dur || 0), u.dmg ? "DAMAGED" : "", u.dmg ? BRICK : INK]);
    cells.push(["CONC", String(u.conc == null ? "–" : u.conc), u.exposed ? "EXPOSED" : "", u.exposed ? BRICK : INK2]);
    var cw = 248 / cells.length;
    cells.forEach(function (ce, i) { var x = 16 + i * cw; rr(g, x + 2, y0, cw - 4, 112, 8); g.fillStyle = i === 0 && u.atkn ? "rgba(142,43,33,.12)" : "rgba(36,33,27,.07)"; g.fill();
      g.textAlign = "center"; g.fillStyle = INK2; g.font = "700 15px " + BAR; g.fillText(ce[0], x + cw / 2, y0 + 20);
      g.fillStyle = ce[3]; var f2 = ce[1].length > 3 ? 34 : ce[1].length > 2 ? 40 : 54; g.font = f2 + "px " + BOO; while (g.measureText(ce[1]).width > cw - 8 && f2 > 20) { f2--; g.font = f2 + "px " + BOO; } g.fillText(ce[1], x + cw / 2, y0 + 76);
      if (ce[2]) { g.fillStyle = ce[3] === BRICK ? BRICK : INK2; var f3 = 14; g.font = "700 " + f3 + "px " + BAR; while (g.measureText(ce[2]).width > cw - 6 && f3 > 9) { f3--; g.font = "700 " + f3 + "px " + BAR; } g.fillText(ce[2], x + cw / 2, y0 + 102); } });
    y0 += 124;
  } else {   // an Effect: when it acts, then what it does in a few large words
    var tm = +u.timer || 0, l0 = parseLine((u.lines || []).filter(function (l) { return !/^(REQUIRES|PULSE)/.test(String(l)); })[0] || (u.lines || [])[0] || ""), what = String(l0.body || "").replace(/\s+/g, " ");
    g.textAlign = "left"; g.fillStyle = BRICK; g.font = "22px " + BOO; g.fillText(tm ? tm + " ROUND" + (tm > 1 ? "S" : "") + " TO H-HOUR" : u.sub === "Reaction" ? "WHEN TRIGGERED" : "H-HOUR", 18, y0 + 22)   // v0.19.4 (his 16 Nov note): an Order lands at H-Hour, so the glance face says H-HOUR, not AT ONCE;
    g.fillStyle = INK; g.font = "600 21px " + BAR; y0 = wrap(g, what || l0.name || "", 18, y0 + 52, 244, 24, y0 + 52 + 24 * 3) + 4;
  }
  // one short tag for each ability line
  var tags = glanceTags(u).slice(0, 4), tx = 16, ty = Math.max(y0 + 6, 360); g.textAlign = "left";
  tags.forEach(function (t) { var f4 = 20; g.font = f4 + "px " + BOO; var w = g.measureText(t).width + 18; while (w > 248 && f4 > 12) { f4--; g.font = f4 + "px " + BOO; w = g.measureText(t).width + 18; }
    if (tx + w > 264) { tx = 16; ty += 38; } if (ty > 432) return;
    rr(g, tx, ty, w, 32, 7); g.fillStyle = INK; g.fill(); g.fillStyle = "#f3eedc"; g.fillText(t, tx + 9, ty + 23); tx += w + 6; });
  if (!tags.length && cap) { g.fillStyle = INK2; g.font = "600 15px " + BAR; g.fillText("No special abilities.", 18, ty + 22); }
  g.fillStyle = INK2; g.font = "600 12px " + BAR; g.textAlign = "center"; g.fillText("Tap to read the whole card", 140, 466); g.textAlign = "left";
  overlays(g, u, o); return c;
}
function overlays(g, u, o) {
  if (u.ex || (u.hidden && u.cls)) { g.fillStyle = "rgba(10,12,12,.5)"; rr(g, 0, 0, 280, 480, 16); g.fill(); g.fillStyle = "rgba(10,12,12,.88)"; g.fillRect(0, 136, 280, 36); g.fillStyle = u.hidden ? "#7fe0c8" : "#e0a85a"; g.font = "20px " + BOO; g.textAlign = "center"; g.fillText(u.hidden ? "FACE DOWN" : u.exposed ? "EXHAUSTED · EXPOSED" : "EXHAUSTED", 140, 161); g.textAlign = "left"; }
  if (u.spot || o.side) { g.strokeStyle = u.spot ? "#ffd27a" : o.side === "foe" ? "#d8674e" : "#7fb6d8"; g.lineWidth = u.spot ? 6 : 3.5; rr(g, 2, 2, 276, 476, 15); g.stroke(); }
  if (o.shapes && o.side) {   // Settings > Side markers: a shape as well as a colour (friendly rectangle, hostile diamond, as on a map)
    g.save(); g.lineWidth = 3; g.strokeStyle = "#0d0f0e"; g.fillStyle = o.side === "foe" ? "#d8674e" : "#7fb6d8"; g.beginPath();
    if (o.side === "foe") { g.moveTo(140, 446); g.lineTo(162, 468); g.lineTo(140, 490); g.lineTo(118, 468); } else { g.rect(116, 452, 48, 30); }
    g.closePath(); g.fill(); g.stroke(); g.restore(); }
}
function drawCard(u, S, o) {
  o = o || {}; if (o.glance) return drawGlance(u, S, o);
  var c = cv(CARD_W * S, CARD_H * S), g = c.getContext("2d"); g.scale(S, S);
  var tp = TPL[u.cls] || TPL.JOINT, cap = isCap(u), img = (S >= 1.5 && HI[u.id]) || IMG[u.id], gn = Math.max(1, Math.min(3, String(u.gen || "I").length)), fin = FIN[gn], meta = (G.meta || {})[u.name] || {};
  rr(g, 0, 0, 280, 480, 16); g.fillStyle = tp[0]; g.fill();
  var seed = 7; for (var q = 0; q < String(u.name).length; q++) seed = (seed * 31 + u.name.charCodeAt(q)) % 9973; var rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  g.save(); rr(g, 0, 0, 280, 480, 16); g.clip(); for (var k = 0; k < 260; k++) { g.fillStyle = k % 2 ? "rgba(0,0,0,.13)" : "rgba(255,255,255,.08)"; g.fillRect(Math.floor(rnd() * 28) * 10, Math.floor(rnd() * 80) * 6, 10 + (k % 3) * 10, 6); } g.restore();
  rr(g, 9, 9, 262, 462, 10); g.fillStyle = tp[2]; g.fill(); g.strokeStyle = tp[1]; g.lineWidth = 1.5; g.stroke();
  // Generation badge
  g.beginPath(); for (var i = 0; i < 8; i++) { var an = Math.PI / 8 + i * Math.PI / 4; g[i ? "lineTo" : "moveTo"](38 + Math.cos(an) * 27, 44 + Math.sin(an) * 27); } g.closePath();
  var gg = g.createLinearGradient(0, 17, 0, 71); gg.addColorStop(0, fin[0]); gg.addColorStop(.5, fin[1]); gg.addColorStop(1, fin[2]); g.fillStyle = gg; g.fill(); g.strokeStyle = fin[3]; g.lineWidth = 2; g.stroke();
  g.fillStyle = fin[4]; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.font = "600 8px " + BAR; g.fillText("GEN", 38, 34); g.font = "21px " + BOO; g.fillText(String(u.gen || "I"), 38, 58);
  g.fillStyle = fin[2]; g.fillRect(72, 36, 194, 1.5);
  // the type word above the name (RD-150 (2)): CAPABILITY, or EFFECT · ORDER / PLAN / MISSION / REACTION (RD-150 (2); AN.4: a Plan prints PLAN; v0.21.1: a Condition prints CONDITION, on the lead's ruling of 20 Nov)
  var tw = typeWord(u, cap); g.fillStyle = BRICK; g.font = "700 8.4px " + BAR; g.textAlign = "left"; if (g.letterSpacing !== undefined) g.letterSpacing = "1.2px"; g.fillText(tw, 72, u.upfrom ? 20 : 29); if (g.letterSpacing !== undefined) g.letterSpacing = "0px";
  if (u.upfrom) { var uf = "UPGRADES FROM " + upShort(u.upfrom); g.fillStyle = INK2; g.font = "600 7.6px " + BAR; g.textAlign = "left"; while (g.measureText(uf).width > 194 && uf.length > 20) uf = uf.slice(0, -2); g.fillText(uf, 72, 31); }
  g.textAlign = "left"; g.fillStyle = INK; var fs = 25; g.font = fs + "px " + BOO; while (g.measureText(u.name).width > 194 && fs > 12) { fs--; g.font = fs + "px " + BOO; } g.fillText(u.name, 72, 62);
  // left stat column and art
  var ax = 68, aw = 198;
  if (!cap) {   // left of the art: timing in the game's own terms (3, 2, 1, H), a bolt for a Reaction, a bold R for a requirement
    var l0 = String((u.lines || [])[0] || ""), tm = +u.timer || 0, hasReq = /^(REQUIRES|PULSE)/.test(l0) || ((meta.req || []).length > 0), cells = [[tm ? String(tm) : "H", tm ? "ROUNDS TO H-HOUR" : "H-HOUR", "clock"]];
    if (u.sub === "Reaction") cells.push(["", "REACTION", "bolt"]);
    if (hasReq) cells.push(["R", /^PULSE/.test(l0) ? "PULSE REQUIREMENT" : "REQUIREMENT", ""]);
    cells.forEach(function (ce, i) { var y = 88 + i * 52; g.save(); g.translate(38, y + (ce[2] === "bolt" ? 12 : 0)); g.strokeStyle = INK; g.lineWidth = 1.5;
      if (ce[2] === "clock") { g.beginPath(); g.arc(0, 0, 8, 0, 7); g.stroke(); g.beginPath(); g.moveTo(0, -5); g.lineTo(0, 0); g.lineTo(4, 2); g.stroke(); }
      else if (ce[2] === "bolt") { g.scale(1.9, 1.9); g.beginPath(); g.moveTo(2, -9); g.lineTo(-5, 1); g.lineTo(0, 1); g.lineTo(-2, 9); g.lineTo(5, -1); g.lineTo(0, -1); g.closePath(); g.fillStyle = INK; g.fill(); } g.restore();
      g.textAlign = "center"; g.fillStyle = INK; if (ce[0]) { g.font = (ce[2] ? 23 : 30) + "px " + BOO; g.fillText(ce[0], 38, y + (ce[2] ? 29 : 24)); }
      g.fillStyle = INK2; g.font = "600 5.2px " + BAR; var ws = ce[1].split(" "), half = Math.ceil(ws.length / 2); g.fillText(ws.slice(0, half).join(" "), 38, y + 38); if (ws.length > 1) g.fillText(ws.slice(half).join(" "), 38, y + 44); if (i < cells.length - 1) { g.fillStyle = RULE; g.fillRect(18, y + 47, 40, .8); } }); g.textAlign = "left"; }
  if (cap) { var left = Math.max(0, (u.dur || 0) - (u.dmg || 0)), hurt = u.dmg > 0;
    [[u.exposed ? "EXPOSED" : "CONCEALMENT", u.conc == null ? "–" : u.conc], ["SURVIVABILITY", u.surv], ["DURABILITY", left]].forEach(function (st, i) { var y = 88 + i * 52; statIcon(g, i, 38, y); g.textAlign = "center"; g.fillStyle = ((i === 2 && hurt) || (i === 0 && u.exposed)) ? BRICK : INK; g.font = "23px " + BOO; g.fillText(String(st[1]), 38, y + 29);
      g.fillStyle = INK2; g.font = "600 5.6px " + BAR; g.fillText(st[0], 38, y + 38); if (i < 2) { g.fillStyle = RULE; g.fillRect(18, y + 42.5, 40, .8); } }); g.textAlign = "left"; }
  if (img) cover(g, img, ax, 74, aw, 160); else {   // placeholder until the card has art: plainly not art
    g.save(); g.fillStyle = "#cfcbb8"; g.fillRect(ax, 74, aw, 160); g.beginPath(); g.rect(ax, 74, aw, 160); g.clip(); g.strokeStyle = "rgba(60,56,44,.18)"; g.lineWidth = 6; for (var hx = -160; hx < aw; hx += 18) { g.beginPath(); g.moveTo(ax + hx, 234); g.lineTo(ax + hx + 160, 74); g.stroke(); } g.restore();
    g.setLineDash([6, 4]); g.strokeStyle = "rgba(60,56,44,.6)"; g.lineWidth = 1.5; g.strokeRect(ax + 6, 80, aw - 12, 148); g.setLineDash([]);
    g.fillStyle = "rgba(36,33,27,.85)"; g.font = "17px " + BOO; g.textAlign = "center"; g.fillText("ART TO COME", ax + aw / 2, 154); g.font = "600 9px " + BAR; g.fillText("placeholder: new card", ax + aw / 2, 170); g.textAlign = "left"; }
  g.strokeStyle = fin[1]; g.lineWidth = 2; [[ax - 2, 72, 1, 1], [ax + aw + 2, 72, -1, 1], [ax - 2, 236, 1, -1], [ax + aw + 2, 236, -1, -1]].forEach(function (t) { g.beginPath(); g.moveTo(t[0] + 12 * t[2], t[1]); g.lineTo(t[0], t[1]); g.lineTo(t[0], t[1] + 12 * t[3]); g.stroke(); });
  // Class bar
  rr(g, 16, 242, 248, 24, 6); var cb = g.createLinearGradient(0, 242, 0, 266); cb.addColorStop(0, fin[0]); cb.addColorStop(1, fin[1]); g.fillStyle = cb; g.fill(); g.strokeStyle = fin[3]; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = fin[4]; g.font = "12.5px " + BOO; var bar = cap ? (u.cls || "") + (u.tags ? " | " + String(u.tags).split(" ").slice(0, 3).join(" · ") : "") : (u.cls || "JOINT") + " | " + String(subName(u.sub) || u.kind || "Effect").toUpperCase(); while (g.measureText(bar).width > 232) bar = bar.slice(0, -2); g.fillText(bar, 26, 259);
  // ability lines: every printed line is drawn; if they do not fit, the text is set smaller, never dropped
  var parsed = (u.lines || []).map(parseLine), top = 286, maxY = 400, fsz = 11.5;
  var rowsOf = function (text, fs) { g.font = "500 " + fs + "px " + BAR; var words = String(text).split(" "), ln = "", n = 1; for (var w = 0; w < words.length; w++) { if (g.measureText(ln + words[w]).width > 248 && ln) { n++; ln = ""; } ln += words[w] + " "; } return n; };
  var need = function (fs) { var h = 0; parsed.forEach(function (p, li) { h += (p.timing ? fs * 1.22 : 0) + (p.body ? rowsOf(p.body, fs) * fs * 1.13 : 0) + (li < parsed.length - 1 ? fs * .95 : 0); }); return h; };
  while (fsz > 6.5 && need(fsz) > maxY - top + 6) fsz -= .5;
  var y = top; parsed.forEach(function (p, li) {
    var x = 16, hs = fsz;
    if (li) { g.fillStyle = RULE; g.fillRect(16, y - fsz * 1.05, 248, .8); }
    if (p.timing) { p.costs.forEach(function (cst) { rr(g, x, y - hs * .87, hs * 1.13, hs * 1.04, 3); g.strokeStyle = INK; g.lineWidth = 1; g.stroke(); g.fillStyle = INK; g.font = "600 " + (hs * .6) + "px " + BAR; g.textAlign = "center"; g.fillText(/EXHAUST/.test(cst) ? "EX" : cst.slice(0, 2), x + hs * .56, y - hs * .13); g.textAlign = "left"; x += hs * 1.4; });
      g.font = hs + "px " + BOO; g.fillStyle = p.red ? BRICK : INK2; g.fillText(p.timing, x, y); x += g.measureText(p.timing).width;
      if (p.name) { g.fillStyle = INK; var nm = " | " + p.name, lim = (p.atk ? 212 : 264) - x; while (g.measureText(nm).width > lim && nm.length > 4) nm = nm.slice(0, -2); g.fillText(nm, x, y); }
      if (p.atk) { g.textAlign = "right"; g.fillStyle = INK2; g.font = "600 " + (hs * .7) + "px " + BAR; g.fillText("ATK", 264, y); g.fillStyle = INK; g.font = (hs * 1.4) + "px " + BOO; g.fillText(p.atk, 264 - hs * 1.6, y); g.textAlign = "left"; }
      y += fsz * 1.22; }
    if (p.body) { g.fillStyle = INK; g.font = "500 " + fsz + "px " + BAR; y = wrap(g, p.body, 16, y, 248, fsz * 1.13, 999); }
    y += fsz * .95;
  });
  // value row
  g.fillStyle = INK; g.fillRect(16, 404, 248, 1.4); g.textAlign = "center";
  if (cap) [["Deployment Cost", u.costn != null ? u.costn : u.cost, INK], ["Homefront Loss", u.hf, INK], ["Investment Cost", meta.inv != null ? meta.inv : "–", INK2]].forEach(function (v, i) { var x = 58 + i * 82; g.fillStyle = v[2]; g.font = "600 8.5px " + BAR; g.fillText(v[0], x, 418); g.font = "19px " + BOO; g.fillText(String(v[1] == null ? "–" : v[1]), x, 441); });
  else { var cs = String(u.cost || ""), sup = u.costn != null ? u.costn : (cs.match(/(\d+)\s*Supply/) || [])[1], isr = meta.isr != null ? meta.isr : (cs.match(/(\d+)\s*ISR/) || [])[1];   // costs at the bottom, in the same places as a Capability's value row
    [["Supply Cost", sup == null ? "–" : sup, INK], ["ISR Cost", isr == null ? "–" : isr, INK], ["Investment Cost", meta.inv != null ? meta.inv : "–", INK2]].forEach(function (v, i) { var x = 58 + i * 82; g.fillStyle = v[2]; g.font = "600 8.5px " + BAR; g.fillText(v[0], x, 418); g.font = "19px " + BOO; g.fillText(String(v[1]), x, 441); }); }
  g.textAlign = "right"; g.fillStyle = INK2; g.font = "500 7px " + BAR; g.fillText(String(u.id || ""), 264, 464); g.textAlign = "left"; g.fillText("Prototype · Shadows and Steel", 16, 464);
  // digital assists: not part of the printed card
  if (o.assist && cap && u.atkn) { rr(g, 206, 204, 56, 26, 6); g.fillStyle = "rgba(14,16,14,.88)"; g.fill(); g.strokeStyle = "#e0a85a"; g.lineWidth = 1.5; g.stroke(); g.fillStyle = "#e0a85a"; g.font = "16px " + BOO; g.textAlign = "center"; g.fillText(u.atkn + (u.boost ? "+1" : "") + " " + ((u.range || "")[0] || ""), 234, 223); g.textAlign = "left"; }
  overlays(g, u, o); return c;
}

window.CardFace = {
  typeWord: function (u) { return typeWord(u, isCap(u)); },
  draw: function (u, S, o, pictures) { o = o || {}; IMG = pictures || window.CardFace.pictures || {}; G.meta = o.meta || window.CardFace.meta || {}; return drawCard(u, S || 1, o); },
  pictures: null, meta: null,
  hiBase: function (b) { HIBASE = b; },
  hi: function (id, cb) {   // load the large picture for a card (once); cb(true) when it has arrived
    if (!id || !HIBASE) return; if (HI[id]) { if (cb) cb(false); return; } if (HIWAIT[id] === false) return;
    if (window.ART_HI && window.ART_HI.indexOf(id) < 0) { HIWAIT[id] = false; return; }   // no large picture for this card: keep the table picture
    if (HIWAIT[id]) { if (cb) HIWAIT[id].push(cb); return; } HIWAIT[id] = cb ? [cb] : [];
    var im = new Image(); im.onload = function () { HI[id] = im; var w = HIWAIT[id] || []; HIWAIT[id] = null; w.forEach(function (f) { try { f(true); } catch (e) {} }); };
    im.onerror = function () { HIWAIT[id] = false; }; im.src = HIBASE + encodeURIComponent(id) + ".jpg"; },
  upShort: upShort,
  loadPictures: function (art) {   // art: { ID: data URL } as in art.js; resolves when every picture has loaded (or failed)
    var out = {}; return Promise.all(Object.keys(art || {}).map(function (k) { return new Promise(function (r) { var im = new Image(); im.onload = function () { out[k] = im; r(); }; im.onerror = r; im.src = art[k]; }); })).then(function () { window.CardFace.pictures = out; return out; }); },
  CLS: CLS, TPL: TPL, BOO: BOO, BAR: BAR, rr: rr, cover: cover, wrap: wrap, isCap: isCap, parseLine: parseLine
};
})();
