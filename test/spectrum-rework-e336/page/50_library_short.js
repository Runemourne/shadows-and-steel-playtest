// Sprint 8, package 7d (ui-frontend, number 50): the Card library on a short screen (the page check's finding F1, mark 7).
// The Library's header (title, CLOSE, search and three rows of filters) stays fixed at the top as the cards scroll; at 430 x 405 it
// takes about 372 of 405 px, so the cards and the "What changed" way in cannot be reached. When the whole header would take more than
// 60% of the screen's height (430 x 405; the largest text sizes), the three filter rows move out of the fixed header to just under it, so
// they scroll away with the cards; the title, CLOSE and the search box stay fixed. Otherwise (430 x 745: 50%; 1482 x 863: 27%) the header
// is left exactly as it is. Test page only: the game's own Library (game/battle.js) is not changed.
(function () {
  "use strict";
  var SHARE = 0.6;
  function fit() {
    var lib = document.getElementById("lib"), lh = lib && lib.querySelector(".lh"), box = document.getElementById("s8LibF"); if (!lh) return;
    if (!lh.offsetHeight) return;   // the Library is closed: measured when it is next drawn
    var full = lh.offsetHeight + (box ? box.offsetHeight : 0), short = full > SHARE * innerHeight;
    if (short) {
      var rows = Array.prototype.filter.call(lh.children, function (e) { return e.classList.contains("row"); }).slice(1);   // the first row is the search box
      if (!rows.length) return;
      if (!box) { box = document.createElement("div"); box.id = "s8LibF"; box.className = "s8lf"; lh.parentNode.insertBefore(box, lh.nextSibling); }
      rows.forEach(function (r) { box.appendChild(r); });
    } else if (box) { while (box.firstChild) lh.appendChild(box.firstChild); box.remove(); }
  }
  function watch() { var lib = document.getElementById("lib"); if (!lib) return;
    try { new MutationObserver(fit).observe(lib, { childList: true }); } catch (e) { } fit(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();
  addEventListener("resize", fit);
  window.S8LIBSHORT = { fit: fit, share: SHARE };
})();
