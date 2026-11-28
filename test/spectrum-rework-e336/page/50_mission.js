// Sprint 9 (ui-frontend, number 50): a campaign game says which mission it was. When a mission starts (page/30_ops.js's start hook
// has just set window.S7Mission and the request's scenario), its id and title go on the start request as "mission";
// session/50_mission.py keeps them, with the scenario, in the game's record, which is the feedback form's game code. The form's
// summary line names the mission (patches_50_r2_play.py, gameLine). A Skirmish, a watched game and Basic Training are as before.
(function () {
  "use strict";
  if (!window.SSHooks) return;
  SSHooks.on("start", function (d) { var r = d.request || {}, m = window.S7Mission;
    if (r.tutorial || !r.scenario || !m || !m.id) { delete r.mission; return; }
    r.mission = { id: String(m.id), title: String(m.title || "") }; });
})();
