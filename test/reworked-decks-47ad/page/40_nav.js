// Sprint 7, package 16 (owner: number 40, ui-frontend): every Back goes up one level (the lead's play notes, 25 Nov).
// The page's own Back on the cover screens (#suBack) asks SSBack.up(screen) where it goes and what it says (patches_40_nav.py):
// SAVED REPLAYS goes back to LIBRARY; the Play screen goes back to PLAY's choice of CAMPAIGN or SKIRMISH (30_ops.js answers that one).
// The opening film watched again from ABOUT comes back to ABOUT when it ends or is skipped; the film's first run on a visit is unchanged.
(function () {
  "use strict";
  var FILM = "ss.s7nav.filmFrom";
  var UP = { replays: { go: "library", label: "‹ Library" } };
  window.SSBack = {
    up: function (sc) {   // {go, label} for the screen's Back, or null for the Main Menu
      var o = window.S7OPS && window.S7OPS.backUp && window.S7OPS.backUp(sc); if (o) return o;
      return UP[sc] || null; }
  };
  // WATCH THE OPENING reloads the page to play the film once more: remember the screen it was started from
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("#abOpening"); if (!b || b.disabled) return;
    var S = window.SS && window.SS.set; try { sessionStorage.setItem(FILM, (S && S.screen) || "about"); } catch (x) { } }, true);
  var from = ""; try { from = sessionStorage.getItem(FILM) || ""; sessionStorage.removeItem(FILM); } catch (x) { }
  if (from && from !== "menu" && window.SS && window.SS.set && !window.SS.set.screen) window.SS.set.screen = from;   // the first screen drawn after the film
})();
