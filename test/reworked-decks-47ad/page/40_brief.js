// Sprint 7, package 16 (owner: number 40, ui-frontend): the picture that opens a mission's order (the lead's play notes, 25 Nov).
// Drawn from the mission's own data alone: the ground is the page's own art for the mission's terrain (terrain/<key>.jpg, the
// same file the table loads for the battle), the route's five Zones run from the player's home edge (left) to the enemy's
// (right), each side's Force Marker stands in its starting Zone (scenario.sides[n].marker; Zone 1 and Zone 5 when not given),
// and the mission's task is drawn from its "picture" key: {task: "attack" | "defend", zone, label, alt}.
// Friendly is the game's blue rectangle, the enemy its red diamond (the shapes of Settings > Side markers); a friendly arrow
// has a solid edge, an enemy arrow a dashed one. Still: nothing moves. Words come from the data (copy.labels.zone, picture.label).
(function () {
  "use strict";
  var KEYS = { "OPEN PLAIN": "", "URBAN SPRAWL": "urban", "HIGH DESERT": "desert", "MOUNTAIN PASS": "mountain" };
  var IW = 2048, IH = 880, ZONES = 5, FR = "#7fb6d8", HO = "#d8674e", INK = "#0d0f0e";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function ground(m) { var k = KEYS[String(m.terrain || "").toUpperCase()]; return k ? "terrain/" + k + ".jpg" : "terrain.jpg"; }
  function sideOf(m, i) { var sd = ((m.scenario || {}).sides || [])[i] || {}; return sd; }
  function figure(m) { var p = m.picture || {};
    return '<figure class="s7pic" data-m="' + esc(m.id) + '" role="img" aria-label="' + esc(p.alt || "") + '"></figure>'; }
  function txt(x, y, s, anchor, cls) { return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + (anchor || "middle") + '" class="' + (cls || "") + '">' + esc(s) + "</text>"; }
  // a broad arrow (the axis of an attack) from x0 to x1 along y; its head is at x1
  function arrow(x0, x1, y, hw, col, dashed) { var d = x1 > x0 ? 1 : -1, hl = Math.min(Math.abs(x1 - x0) * .4, hw * 2.2), xh = x1 - d * hl;
    var pts = [[x0, y - hw], [xh, y - hw], [xh, y - hw * 2], [x1, y], [xh, y + hw * 2], [xh, y + hw], [x0, y + hw]];
    return '<polygon points="' + pts.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ") + '" fill="' + col + '" fill-opacity=".3" stroke="' + col + '" stroke-width="3" stroke-linejoin="round"' + (dashed ? ' stroke-dasharray="9 6"' : "") + "/>"; }
  function friendly(x, y, s) { return '<rect x="' + (x - 18 * s).toFixed(1) + '" y="' + (y - 12 * s).toFixed(1) + '" width="' + (36 * s).toFixed(1) + '" height="' + (24 * s).toFixed(1) + '" fill="' + FR + '" stroke="' + INK + '" stroke-width="3"/>'; }
  function hostile(x, y, s) { var r = 17 * s; return '<polygon points="' + [x, y - r, x + r, y, x, y + r, x - r, y].map(function (v) { return v.toFixed(1); }).join(",") + '" fill="' + HO + '" stroke="' + INK + '" stroke-width="3"/>'; }

  function draw(fig) {
    var O = window.S7OPS, m = O && O.byId && O.byId(fig.dataset.m); if (!m) return;
    var W = fig.clientWidth, H = fig.clientHeight; if (!W || !H) return; if (fig.dataset.w === W + "x" + H) return; fig.dataset.w = W + "x" + H;
    var p = m.picture || {}, op = O.op() || {}, zw = (((op.copy || {}).labels) || {}).zone || "", bw = W / ZONES, short = H < 110, s = short ? .85 : 1;
    // the ground: the route (the picture's height, player's end at the bottom) laid left to right, scaled to the width, centred on the
    // pass; across the route it is drawn at half that scale, so the slopes on each side of the pass are in the picture too
    var k = W / IH, ky = k / 3.2, f = H / 2 - (IW / 2) * ky;
    var h = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" aria-hidden="true" focusable="false">' +
      '<g transform="matrix(0 ' + ky.toFixed(5) + " " + (-k).toFixed(5) + " 0 " + (IH * k).toFixed(2) + " " + f.toFixed(2) + ')"><image href="' + ground(m) + '" x="0" y="0" width="' + IW + '" height="' + IH + '" preserveAspectRatio="none"/></g>' +
      '<rect width="' + W + '" height="' + H + '" fill="#0c1215" fill-opacity=".28"/>';
    // the Zones: phase lines between them and each Zone's number along the top
    for (var i = 1; i < ZONES; i++) h += '<line x1="' + (i * bw).toFixed(1) + '" y1="0" x2="' + (i * bw).toFixed(1) + '" y2="' + H + '" stroke="#e8ede8" stroke-opacity=".75" stroke-width="2" stroke-dasharray="6 5"/>';
    for (var z = 1; z <= ZONES; z++) h += txt((z - 1) * bw + 6, 19, (bw >= 72 && zw ? zw + " " : "") + z, "start", "zl");
    var fz = +sideOf(m, 0).marker || 1, ez = +sideOf(m, 1).marker || ZONES, y = short ? H * .5 : H * .55;
    var fx = (fz - .5) * bw, ex = (ez - .5) * bw, hw = short ? 8 : 13, task = "";
    if (p.task === "attack") {   // the axis of the attack: from our Force Marker to the objective (zone 6 or more: off the enemy's home edge)
      var to = +p.zone || ZONES + 1, x1 = to > ZONES ? W - 4 : (to - .5) * bw;
      task = arrow(fx + 20 * s, x1, y, hw, FR, false);
      if (p.label) task += txt(Math.min(Math.max((fx + ex) / 2, 70), W - 70), short ? y + 6 : y - hw * 2 - 8, p.label, "middle", "tl");   // a shallow picture: the label on the arrow
    } else if (p.task === "defend") {   // the position to hold, and the enemy's counterattack onto it
      var oz = +p.zone || fz, ox = (oz - 1) * bw;
      task = '<rect x="' + (ox + 4).toFixed(1) + '" y="26" width="' + (bw - 8).toFixed(1) + '" height="' + (H - 30).toFixed(1) + '" rx="10" fill="' + FR + '" fill-opacity=".14" stroke="' + FR + '" stroke-width="3"/>';
      if (ez > oz) task += arrow(ex - 20 * s, ox + bw + 4, y, hw, HO, true);
      if (p.label) task += txt(Math.min(Math.max(ox + bw / 2, 70), W - 70), H - 10, p.label, "middle", "tl");
    }
    h += task + friendly(fx, y, s) + hostile(ex, y, s);
    if (!short) h += txt(Math.max(fx, 46), y + 34, m.you, "middle", "nm fr") + txt(Math.min(ex, W - 46), y + 36, m.bot, "middle", "nm ho");
    fig.innerHTML = h + "</svg>";
  }
  function drawAll() { Array.prototype.forEach.call(document.querySelectorAll("#s7ops .s7pic"), draw); }
  function watch() { var el = document.getElementById("s7ops"); if (!el) return setTimeout(watch, 400);
    new MutationObserver(function () { if (!el.hidden) drawAll(); }).observe(el, { childList: true, attributes: true, attributeFilter: ["hidden"] }); }
  watch(); addEventListener("resize", drawAll);
  window.S7Picture = { figure: figure, draw: drawAll };
})();
