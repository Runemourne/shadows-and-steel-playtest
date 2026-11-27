/* Sprint 7 fix round (the table lane): while a mission is played (window.S7Mission set by the operation's screens lane), the player reads
   "The enemy" where the page shows "The bot": on the step line, the stop panel, the event line, the Battle Log, the prompt, the top bar and the
   ending's table. Only the text shown is changed; the seat's name in the game is not (the page tests it in places). From PLAY, "The bot" stays. */
(function () {
  var RX = [[/\bThe bot's\b/g, "The enemy's"], [/\bthe bot's\b/g, "the enemy's"], [/\bThe bot\b/g, "The enemy"], [/\bthe bot\b/g, "the enemy"], [/\bTHE BOT\b/g, "THE ENEMY"]];
  function on() { return !!window.S7Mission; }
  function fix(node) {
    if (node.nodeType === 3) { var v = node.nodeValue, w = v; if (!/bot/i.test(v)) return;
      RX.forEach(function (r) { w = w.replace(r[0], r[1]); });
      if (/^\s*bot\s*$/i.test(w)) w = w.replace(/bot/i, function (x) { return x === "BOT" ? "ENEMY" : x === "Bot" ? "Enemy" : "enemy"; });   // the top bar's side label (span.who "Bot", shown in capitals)
      if (w !== v) node.nodeValue = w; return; }
    if (node.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(node.nodeName)) return;
    var tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null), n; while ((n = tw.nextNode())) fix(n);
    if (node.hasAttribute && node.hasAttribute("aria-label")) { var a = node.getAttribute("aria-label"), b = a; RX.forEach(function (r) { b = b.replace(r[0], r[1]); }); if (a !== b) node.setAttribute("aria-label", b); } }
  function start() {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function (ms) { if (!on()) return; ms.forEach(function (m) { if (m.type === "characterData") fix(m.target); else Array.prototype.forEach.call(m.addedNodes, fix); }); })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
    var was = false; setInterval(function () { var now = on(); if (now && !was) fix(document.body); was = now; }, 500);   // the moment a mission starts, what is already on screen
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
