// Sprint 7, the vertical slice test page: the hooks layer (owner: the frame; changes are asked of the Studio Lead).
// SSHooks.on(name, fn) registers fn for one moment; the page (patches_00_hooks.py) calls SSHooks.fire(name, data) at it.
// Moments: frame, pending, over, menu, debrief, start (see the README). A hook that throws never stops the game: the error is
// logged to the console once per hook and moment (console.warn, so it is not counted as a page error), and the others still run.
(function () {
  "use strict";
  var list = {}, told = [], counts = {};
  function on(name, fn) { if (typeof fn !== "function") return; (list[name] = list[name] || []).push(fn); }
  function fire(name, data) {
    counts[name] = (counts[name] || 0) + 1;
    var fs = list[name]; if (!fs) return data;
    for (var i = 0; i < fs.length; i++) {
      try { fs[i](data); }
      catch (e) { if (told.indexOf(fs[i]) < 0) { told.push(fs[i]); try { console.warn("SSHooks: a '" + name + "' hook threw; the game goes on.", e); } catch (x) { } } }
    }
    return data;
  }
  window.SSHooks = { on: on, fire: fire, counts: counts };
})();
