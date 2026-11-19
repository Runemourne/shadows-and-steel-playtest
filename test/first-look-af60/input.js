// Shadows & Steel: how a press on a card is read (Prototype Design Spec 1.3, work package 3). battle.js asks this file; it holds no game rules.
// One rule: time never decides, only movement does. A press that stays inside the slop is a tap, however long the finger stays down; a press
// that moves past it is a drag, however long it waited first. There is no hold and no double tap.
(function () {
"use strict";
var SLOP = { touch: 10, pen: 8, mouse: 5 }, STEADY = { touch: 20, pen: 16, mouse: 10 };   // px; "Steadier touch" (Settings > Gameplay) doubles them
var REST_EDGE = 16, REST_MOVE = 10;   // a resting thumb: see resting()
var I = {
  steady: false,
  LIFT: 56,   // on touch the dragged card sits this far above the finger, so the finger does not cover it
  slop: function (type) { var t = I.steady ? STEADY : SLOP; return t[type] != null ? t[type] : t.touch; },
  // the left mouse button (or any finger or pen) may press a card; the right and middle buttons never drag, tap or play
  primary: function (e) { return e.pointerType !== "mouse" || e.button === 0; },
  // a new press: where it started and with what
  press: function (e, extra) { var p = { x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType || "mouse", moved: false, t0: Date.now() }; if (extra) for (var k in extra) p[k] = extra[k]; return p; },
  // has this pointer left the press's slop? (once it has, the press is a drag or nothing, never a tap)
  moved: function (p, e) { if (!p) return false; if (p.moved) return true; if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > I.slop(p.type)) p.moved = true; return p.moved; },
  // which way it went: "x" when it is mostly sideways (more than 50 degrees from vertical), otherwise "y"
  axis: function (p, e) { var dx = Math.abs(e.clientX - p.x), dy = Math.abs(e.clientY - p.y); return Math.atan2(dx, dy) > 50 * Math.PI / 180 ? "x" : "y"; },
  /* A thumb resting on the phone: a touch that starts within 16 px of the screen's edge, or on the bare background of a bar (not on a button,
     card, the Mission Track or the route), does not count as a second finger while it stays within 10 px of where it landed. So holding the
     phone with a thumb on its edge no longer cancels the other finger's drag. Once it moves further it counts like any finger. */
  resting: function (e) {
    if (e.pointerType !== "touch") return false;
    var x = e.clientX, y = e.clientY;
    if (x < REST_EDGE || y < REST_EDGE || x > innerWidth - REST_EDGE || y > innerHeight - REST_EDGE) return true;
    var t = e.target; if (!t || !t.closest) return false;
    if (t.closest("button,a,input,select,textarea,label,img,canvas,[data-tr],[role=button],#route,#mtrack,#zoom,#preview")) return false;
    return !!t.closest("#top,#bot,#me,#tools,#prompt");
  },
  restMoved: function (r, e) { return Math.hypot(e.clientX - r.x, e.clientY - r.y) > REST_MOVE; },
  // the grown hit area of a drop target: its screen rectangle plus 12 px each side
  grow: function (r, px) { px = px == null ? 12 : px; return { l: r.l - px, r: r.r + px, t: r.t - px, b: r.b + px }; },
  inRect: function (r, x, y) { return !!r && x >= r.l && x <= r.r && y >= r.t && y <= r.b; }
};
window.SSInput = I;
})();
