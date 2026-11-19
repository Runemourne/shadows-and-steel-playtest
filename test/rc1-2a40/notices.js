/* Shadows & Steel: the notices behind the bell on the Main Menu (the welcome note, What's new, and From the dev team).
   Edit the text between the first { and the last }: it is plain JSON. Bold is **double asterisks**; paragraphs are separated by a blank
   line (\n\n). Newest first. Each entry has an id (never reuse one), a date (YYYY-MM-DD), a title (6 words or fewer) and a body
   (30 words or fewer; dev notes 40). A dev note may add "until": "YYYY-MM-DD" to hide it after that day. devNotes empty: the section is hidden.
   Source: docs/narrative/Notices_Content_Pack_v0.1.md, with What's new from docs/narrative/Notices_And_Lesson_Copy_Fixes_v0.1.md job 1. */
window.SS_NOTICES = {
  "welcome": {
    "short": "Welcome, and thank you for testing. New here? Start with **TRAINING**: Basic Training is a guided battle of about 15 minutes. After a game, tap **Provide Feedback**. Please do not share this page's address.",
    "full": "**Welcome, and thank you for testing.** This is a playtest build of Shadows & Steel 2045. Your games and your notes shape what it becomes.\n\n**Start with TRAINING.** Basic Training is a guided battle of about 15 minutes that teaches the game one step at a time. When you are ready, **PLAY** takes you into a battle against the bot.\n\n**Tell us what you think.** After a game, tap **✉ Provide Feedback**: a few quick questions, then your answers, your notes and the game's record go to the team. No sign-in is needed.\n\n**Keep notes as you play.** During a game, **✎ Add note** in the ☰ menu keeps a note. Your notes go to the team when you tap Provide Feedback.\n\n**Please do not share this page's address.** This is a private playtest."
  },
  "whatsNew": [
    {
      "id": "2026-11-19-ready-list",
      "date": "2026-11-19",
      "title": "Ready your cards in one go",
      "body": "When you ready cards, the panel lists each card with its cost. Tap one to ready it. Ready all appears when you can pay for every one."
    },
    {
      "id": "2026-11-19-tap-read-drag-play",
      "date": "2026-11-19",
      "title": "Tap to read, drag to play",
      "body": "Tapping a card opens it in full and never plays it. To play, drag it where it goes or use the reader's buttons. While setting rows, drag between them too."
    },
    {
      "id": "2026-11-19-attack-preview",
      "date": "2026-11-19",
      "title": "See an attack before you fire",
      "body": "Tap your card, then Attack…, then a ringed target. The preview shows what will happen. Tick the cards that support it, or tap Attack alone. Then FIRE."
    },
    {
      "id": "2026-11-19-hand-drawer",
      "date": "2026-11-19",
      "title": "Your hand, at the bottom edge",
      "body": "On phones your hand sits at the bottom edge with the card tops showing. It tucks away when your table cards can act, and opens when you need it."
    },
    {
      "id": "2026-11-19-camera",
      "date": "2026-11-19",
      "title": "A flatter view of the table",
      "body": "The camera now looks down on the table from higher up, on its own, so cards on the far side are easier to read."
    },
    {
      "id": "2026-11-19-menu-about",
      "date": "2026-11-19",
      "title": "New Main Menu, and the film",
      "body": "The Main Menu is down to what you need: PLAY and TRAINING come first. About holds the team credits and a short film about the game."
    },
    {
      "id": "2026-11-19-basic-training",
      "date": "2026-11-19",
      "title": "Basic Training, rewritten",
      "body": "Shorter pages that fit a phone, and each step names the buttons you see. \"Long shot\" is gone: an attack at Tactical or Theater range costs 1 more ISR."
    }
  ],
  "devNotes": []
};
