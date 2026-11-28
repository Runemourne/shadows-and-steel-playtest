// Sprint 9 round two, package 14c (ui-frontend, number 70): a question's sentence is never cut without "More".
// When a question's panel cannot hold everything, battle.js shows the sentence's first two lines (".instr.clamp2", a tap on the text
// opens it) and offers "More ▼" only when something follows the sentence in the panel. A sentence longer than two lines with nothing
// after it (SEAD STRIKE's target question at 430 x 405) was cut with an ellipsis and no More. Here: whenever the clamp actually cuts the
// sentence, the clamp is lifted for that question; the panel keeps its size, its text area is trimmed to whole lines (the page's own
// unslice) and scrolls, and the page's own More (44 px)
// shows because there is now text below what is shown (battle.js promptCue, called by the text area's scroll event). Nothing else changes:
// a sentence the clamp does not cut keeps the clamp exactly as before, and the answers stay where they were.
(function () {
  "use strict";
  var S = window.SSCut = { lifted: 0, last: null };
  function check() {
    var el = document.getElementById("prompt"), body = el && el.querySelector(".pbody"), ins = body && body.querySelector(".instr.clamp2");
    if (!ins) return;
    if (ins.scrollHeight <= ins.clientHeight + 2) return;   // the clamp hides nothing: leave it
    ins.classList.remove("clamp2"); ins.classList.add("r2cut"); ins.removeAttribute("title"); S.lifted++; S.last = ins.textContent.slice(0, 80);
    try { body.dataset.mh = ""; if (window.SS && SS.unslice) SS.unslice(body, 0); } catch (e) { }   // the text area shows whole lines only (no line sliced at its edge)
    try { body.dispatchEvent(new Event("scroll")); } catch (e) { }   // the page's own More cue looks again
  }
  function soon() { requestAnimationFrame(check); setTimeout(check, 150); }
  function watch() { var el = document.getElementById("prompt"); if (!el) return setTimeout(watch, 500); new MutationObserver(soon).observe(el, { childList: true, subtree: true }); }
  watch();
  if (window.SSHooks) SSHooks.on("pending", soon);
  addEventListener("resize", soon);
})();
