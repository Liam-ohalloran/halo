# Halo task cards

**How to use:** open Claude Code in the `halo` folder, run `/model sonnet`, start a **fresh session per card**, and paste:

> Read HALO.md, then do TASKS.md card NN. Nothing else.

When a card is done, check its screenshots yourself. Only bring them back to Opus (in a fresh chat) when a card says **REVIEW WITH OPUS**.

Cards marked 🆓 have parts you can hand to free ChatGPT, Gemini or your local Ollama instead (listed under "Free AI can do").

---

## Card 01 · Repo and scaffold
**Model:** Sonnet · **Size:** small

**Goal:** an empty Halo app live on GitHub Pages.

**Build**
1. Create public repo `Liam-ohalloran/halo` with `gh repo create`, clone to `~/Documents/halo`.
2. Copy `HALO.md` and `TASKS.md` into the repo root.
3. Vite + TypeScript project. Folders: `src/components`, `src/panels`, `src/lib`, `src/styles`, `public/icons`.
4. `src/styles/tokens.css` with every token from HALO.md section 3.2 as CSS variables.
5. GitHub Actions workflow that builds and deploys to GitHub Pages on push to `main`. Set Vite `base` to `/halo/`.
6. Home page shows a black 200 × 34 resting island (HALO.md 3.3) at the top centre with the ears, on a `#0b0b10` background. Nothing else.
7. Install Playwright and add `npm run shots` that saves screenshots at 680 × 420 and 390 × 844 to `screenshots/<card>/`.

**Done when**
- [ ] `https://liam-ohalloran.github.io/halo/` shows the island
- [ ] `npm run build` and `npm run shots` both work
- [ ] Repo has HALO.md, TASKS.md, tokens.css, the workflow

---

## Card 02 · Foundations page 🆓
**Model:** Sonnet · **Size:** medium · **REVIEW WITH OPUS**

**Goal:** a `/foundations` page Liam uses to approve the type, icons and components. The font is already chosen: **Onest**.

**Build**
1. **Type**: self-host Onest, then show this specimen on a black card with the light spill glow behind it (HALO.md 3.1b):
   - Title 21/700: `MONTAGEM REBOLA`
   - Secondary 15/500: `ATLXS`
   - Compact pill row: `PA shift` 15/700 and `1:42` 17/700 amber
   - Numbers 28/700 tabular: `16:48   $187.85   98–94`
   - Label 11/700 uppercase tracked: `NEXT SHIFT`
   - Body 15/400: `Your next shift starts in 1 hour 42 minutes. Leave by 5:05.`
2. **Icons**: 16 Phosphor icons in two rows, regular (inactive) and fill (active), 24 px white on black: music-notes, clock, book-open, basketball, bell, wallet, house, sliders-horizontal, play, pause, skip-forward, skip-back, heart, speaker-high, moon, sparkle. Copy SVGs from `@phosphor-icons/core` into `public/icons/`, plus regular and fill of every tab icon in HALO.md 3.1e (adds `tray`, `squares-four`, `gear-six`).
3. **Components**: every component from HALO.md 3.4 shown in all 5 states side by side (rest, hover, pressed, focus-visible, disabled), plus a live row where they actually work.
**Free AI can do:** the list of Phosphor file names.

**Done when**
- [ ] Page live at `/halo/foundations`
- [ ] Screenshots saved
- [ ] Bring the screenshots to Opus, who approves or fixes the components

---

## Card 03 · Component library
**Model:** Sonnet · **Size:** large · **Needs:** card 02 approved

**Goal:** the reusable parts every screen is built from.

**Build** in `src/components/`, each with the 5 states and keyboard support:
- `Island` (compact ↔ expanded morph with spring, ears, tinted key line prop, alert banner mode)
- `Button`, `IconButton`, `Toggle`, `Slider`, `Segmented`, `Chip`
- `RingProgress` (size, stroke, colour, value 0–1, animates)
- `NumberRoll` (rolls digits on change, tabular)
- `Skeleton` (shimmer), `EmptyState`, `ErrorState` (sentence + retry)
- `Icon` (loads Phosphor SVG by name and weight)

- `TabBar` (HALO.md 3.1e: icons, sliding active dot, hide and reorder ready)
- `LightSpill` (HALO.md 3.1b glow, one fragment shader, pauses when hidden)

Add a `/components` page showing each one, and the `/motion` page from HALO.md 3.5 with a ×0.25 slow-motion toggle. The pull-out must match 3.5 step by step. **REVIEW WITH OPUS** (send a screen recording of `/motion` at normal and slow speed).

**Done when**
- [ ] All components on `/components` with every state
- [ ] Reduced motion respected
- [ ] Screenshots saved

---

## Card 04 · Supabase client and sign-in
**Model:** Sonnet · **Size:** small

**Build**
1. `src/lib/supabase.ts` using the publishable key (get it via Supabase MCP).
2. Magic link sign-in screen styled to the design rules. Session persists.
3. Typed helpers: `getShiftsForWeek(date)`, `getNextShift()`, `getNextTest()`, `startStudySession(subject)`, `endStudySession(id)`, `getSettings()`.
4. A dev-only seed script (`npm run seed`) that inserts SAMPLE shifts, tests and settings for Liam's account so panels can be built before the sync exists. Mark seeded rows so they can be deleted later.

**Done when**
- [ ] Liam can sign in on laptop and phone
- [ ] Seed data shows in Supabase table editor
- [ ] No secret keys anywhere in the repo (`git grep -i "service_role"` returns nothing)

---

## Card 05 · TickTick → Supabase sync
**Model:** Sonnet (set up) · the scheduled task itself can run on **Haiku**

**Goal:** real shifts and tests flow into Supabase automatically.

**Build:** a Claude **scheduled task** (not code in the repo) that runs hourly 6 am to 10 pm Perth time and:
1. Reads TickTick list `💼Shifts` (id `68c56c0d1541076e9aacffc3`) and the subject lists (Human Biology, Chemistry, English, Spec, Methods, Religion) for the next 21 days, in two-week windows.
2. Upserts into `shifts` and `tests` by `ticktick_id` with the Supabase MCP. Parses shift titles like `SATURDAY PA 5:30-9` into station and times (pm for afternoon shifts, use the TickTick task time when present).
3. Deletes rows whose TickTick task was deleted.
4. Read only on TickTick. Never edits TickTick.
5. No text message for this one (it's hourly).

**Done when**
- [ ] Next 3 weeks of real shifts and tests in Supabase
- [ ] Re-running doesn't duplicate anything
- [ ] Remove the card 04 sample rows

---

## Card 06 · Now panel
**Model:** Sonnet · **Size:** medium · **REVIEW WITH OPUS**

**Build** the expanded **Now** view:
- Next shift: title, time, leave-by time (setting: travel minutes, default 25), countdown ring in `--shift`.
- Next test: subject chip, title, date, days left, study minutes this week for that subject.
- Today timeline: today's shifts, tests and study sessions from Supabase in time order (card 05 only syncs shifts and tests, so nothing else yet).
- Compact pill states: "shift soon" (within 2 hours), resting.
- Empty, loading, error states.

**Done when**
- [ ] Real data shows
- [ ] Screenshots at both sizes match the design rules

---

## Card 07 · Pay panel
**Model:** Sonnet · **Size:** medium

**Build** per HALO.md section 4: week Monday to Sunday, rates from `settings`, 30 min unpaid break over 5 hours, Sunday and public holiday multipliers, tax estimate. Bar per day (worked solid, upcoming outlined), list of shifts with hours and pay, total gross and after-tax with `NumberRoll`. Week switcher (previous, this, next).

**Free AI can do:** hand-check 5 sample weeks of pay maths and give expected totals as test cases.

**Done when**
- [ ] Unit tests for the pay maths pass, including a 6-hour shift, a Sunday and a public holiday
- [ ] Screenshots saved

---

## Card 08 · Study panel and timer
**Model:** Sonnet · **Size:** medium

**Build:** subject chips, 25-minute ring timer (start, pause, resume, reset), logs to `study_sessions`, survives a page reload mid-session, compact pill shows subject + time left in subject colour. Below: this week's minutes per subject as a horizontal bar, flagging the subject furthest behind for its next test.

**Done when**
- [ ] A session logs correctly to Supabase
- [ ] Reload mid-timer keeps the time
- [ ] Screenshots saved

---

## Card 09 · Sixers
**Model:** Sonnet · **Size:** medium

**Build**
1. Supabase edge function `nba` that fetches the NBA public scoreboard JSON server-side (avoids CORS) and returns only the Sixers game: teams, score, period, clock, status, and Maxey's points, rebounds, assists when live or final. Cache 20 seconds.
2. Compact pill during a live game: leading `PHI 98`, trailing `94 BOS` in team colours, tiny `Q4 3:12` with pulsing live dot.
3. Expanded card: score, quarter, Maxey line. Next game countdown in Perth time when no game.
4. Celebration: confetti burst (canvas, 1.5 s, respects reduced motion) when a Sixers win goes final.

**Done when**
- [ ] Works on a real game day (or with a recorded sample JSON in dev)
- [ ] Screenshots saved

---

## Card 10 · iPhone app (PWA)
**Model:** Sonnet · **Size:** small

**Build:** web manifest, icons (black rounded square with a thin gold ring), splash, `apple-mobile-web-app` meta, safe-area padding, the panels as a swipeable stack on 390 px width. Install guide page with 3 steps for Safari "Add to Home Screen".

**Done when**
- [ ] Installs on Liam's iPhone and opens full screen
- [ ] Signed-in session persists

---

## Card 11 · Add Halo to NotchPixel
**Model:** none (Liam does this, 2 minutes)

1. Open NotchPixel, go to the Web tab, open `https://liam-ohalloran.github.io/halo/`, sign in, press **Add site**.
2. Use it daily for two weeks. Keep a note of every annoyance in TickTick.
3. Bring the list to Opus in a fresh chat to plan v2.

---

## Card 12 · Halo helper
**Model:** Sonnet · **Size:** medium · **Runs on Liam's laptop** (open Claude Code in the halo folder on the laptop)

**Goal:** the helper from HALO.md 2b, running on the laptop and answering Halo.

**Build** in `helper/`:
1. `requirements.txt`, `halo_helper.py`, `README.md`. Python 3.12 venv in `helper/.venv` (git ignored).
2. Everything in HALO.md 2b: localhost only, CORS list, Private Network Access header, token in `%APPDATA%\HaloHelper\token.txt`, all endpoints.
3. Media uses Windows' system media controls (`winsdk` GlobalSystemMediaTransportControlsSessionManager): title, artist, album, source app, playing, position, duration, art (as PNG at `/media/art`). Works with Spotify, browsers, anything.
4. `/events` streams changes so Halo doesn't need to poll fast.
5. Tray icon with "Copy pairing token" and "Quit".
6. `helper/install.ps1`: creates the venv, installs requirements, registers a Task Scheduler task to start at logon, starts it now. `helper/uninstall.ps1` removes the task.
7. Tests: `pytest` for the token check and CORS headers.

**Done when**
- [ ] `install.ps1` runs clean and the tray icon appears
- [ ] `curl.exe -H "X-Halo-Token: <token>" http://127.0.0.1:47800/media` shows the song playing in Spotify
- [ ] A request without the token gets 401
- [ ] Liam knows how to copy the token (tray icon)

---

## Card 13 · Music tab
**Model:** Sonnet · **Size:** medium · **Needs:** card 12 · **REVIEW WITH OPUS**

**Goal:** the Music tab, matching the "Music · final style" board.

**Build:**
1. `src/lib/helper.ts`: typed client for the helper (base URL, token from localStorage, `getMedia()`, `control(action)`, `seek(sec)`, `getVolume()`, `setVolume(n)`, `subscribe(onEvent)` over `/events` with reconnect).
2. Settings: "Pair helper" field to paste the token, with a Test button showing Connected or the plain reason it failed.
3. Music tab per HALO.md 3.1c at 600 × 290: blurred album art background with an adaptive scrim (text 4.5:1), art 96 px radius 20 with source badge, title 21/600 with slow marquee for long titles, artist 15/500 at 62% white, previous / play-pause / next, wave progress (flat when paused) with elapsed and remaining in tabular 13/600, volume slider.
4. Compact pill when something is playing: art 26 px left, visualiser bars tinted with the art colour right.
5. States: nothing playing, helper not running ("Start Halo helper on your laptop" + retry), on the phone ("Music controls work on your laptop").
6. Add Music to the tab bar in the order Home, Music, Study, Pay, Sixers, | Controls.

**Done when**
- [ ] Play, pause, next, previous and seek control real Spotify from Halo inside NotchPixel
- [ ] Art, title and progress update within a second of a track change
- [ ] All three states render cleanly
- [ ] Screenshots at 600 × 290 and 390 × 844 saved; bring them to Opus

---

## Card 14 · Controls tab
**Model:** Sonnet · **Size:** medium · **Needs:** card 12

**Goal:** the Controls tab, matching the "Controls · final style" board, working through the helper.

**Build:**
1. Brightness and volume pill sliders (drag and scroll), percentage on top, NumberRoll.
2. Tiles: Wi-Fi, Bluetooth (shows the connected device name), Night light and Focus (disabled, "Not available yet"), Mute, Battery (percent, charging, time left). Tap toggles with optimistic UI that rolls back if the helper says no.
3. Power mode segmented control (Battery, Balanced, Performance).
4. Same helper not running / phone states as card 13.

**Done when**
- [ ] Each working tile changes the real setting and reflects changes made outside Halo within 2 seconds
- [ ] Screenshots saved

---

## Shared rules for cards 15 to 23 (the 600 × 290 redesign)
- The designs are in `design/boards/` (drop in from Opus). Open the matching `.dc.html` file in a browser and copy it exactly: sizes, colours, radii, spacing. Ignore `support.js` and the `{{ }}` holes, they are canvas tooling only.
- The tabs ARE the island. There is no separate panel. The 200 × 34 pill at the top of the screen grows into the 600 × 290 window, so the window is the island's expanded state: black, flat top edge joined to the top of the screen, the same ears at the top corners, rounded only at the bottom (radius 26). The boards show four rounded corners only because they are drawn floating on a canvas.
- Nothing ever scrolls. Every tab fits inside 600 × 290 with overflow hidden on an inner wrapper (never on the element with the ears). If there is more data than fits, show the top items and a "+3 more" line, never a scrollbar.
- Window 600 × 290, radius 26 (bottom corners). Background is the tab's colour as a tinted gradient plus a soft corner glow. Never remove the glow.
- Text: primary #F5F5F7, label rgba(245,245,247,0.85), meta rgba(245,245,247,0.5). `font-variant-numeric: tabular-nums` on every number. Font Onest.
- Cards: radius 12, 1 px border tinted with the tab colour, soft radial tint inside.
- Tab colours: amber #D39B65 (Home, Alerts, Laptop), violet #B59AE3 (Study, Night, Claude), sage #91BDA0 (Pay, Money), cyan #8FCFE0 (Marks, Shelf, Widgets), sky #88B5E0 (Sixers), gold #D8C28C (milestones, unread), rose #D99FB3 (Controls, warnings).
- No em dashes, hyphens used as dashes or semicolons in on-screen copy.
- Keep every existing feature and data source working. This is a restyle unless the card says new.
- Respect `prefers-reduced-motion`. Every button gets hover, active and focus-visible states.
- Done means: Playwright screenshots at 600 × 290 of every state in `screenshots/card-NN/`, no text overflow or wrapping that the board doesn't show, PR opened, not merged.

---

## Card 15 · Shell and nav at 600 × 290
**Model:** Sonnet · **Size:** medium · **Needs:** nothing · **Board:** any compact tab board (Home2.dc.html is the reference)

**Goal:** the panel frame every tab sits in, at the new size.

**Build:**
1. Panel 600 × 290, radius 26, padding and header exactly as Home2. The header has the tab title on the left and the time or chip on the right.
2. Icon nav rail in this order: Home, Music, Study, Pay, Sixers, Week, a divider, More, Controls. The active icon uses the tab colour. Tabs not built yet show an empty panel with the right colour and the text "Coming soon".
3. A `TabTheme` token map (colour, glow, label) in `src/styles/tabs.ts` so every later card just picks its key.
4. Switching tabs crossfades in 180 ms and must not freeze (the old opacity 0 bug stays fixed).
5. `?embed=1` still hides everything except the panel.

**Done when**
- [ ] All tabs reachable, each with its own tint and glow
- [ ] Screenshot of each tab shell

---

## Card 15b · The island is the window
**Model:** Sonnet · **Size:** medium · **Needs:** 15 · **Boards:** IslandLive, IslandDemo, Home2

**Goal:** fix card 15. The island and the tab panel are two separate things and the panel scrolls. They must be one object.

**Build:**
1. One element pinned top centre, flat top edge touching the top of the screen, ears at both top corners, black base with the tab's tint and glow layered on top when expanded.
2. Collapsed it is the island (200 × 34). Click, or hover for 300 ms, grows it into the 600 × 290 tab window. Click outside, Escape, or moving away for 1 s shrinks it back.
3. Grow: width, height and bottom radius over 520 ms with `cubic-bezier(0.34, 1.45, 0.5, 1)`. Shrink: 380 ms with `cubic-bezier(0.4, 0, 0.2, 1)`. Content fades in only after the size settles and fades out first when closing. Reduced motion: just a quick fade.
4. Remove the separate panel, the gap between pill and panel, and the page scrollbar. The "Signed in as" footer and "Add to Home Screen" move into Settings.
5. Every tab's content sits in an inner wrapper with overflow hidden. Home must fit next shift, next test and coming up (max 3 rows, then "+N more").
6. `?embed=1` shows only this object on a transparent background. On the phone PWA it sits under the real Dynamic Island the same way.

**Done when**
- [ ] No scrollbar anywhere at 600 × 290 on every tab
- [ ] Screenshots of collapsed, mid grow and expanded on each built tab
- [ ] Short recording of open and close
- [ ] PR opened, not merged

---
## Card 16 · Home, Pay and Study restyle
**Model:** Sonnet · **Size:** medium · **Needs:** 15b · **Boards:** Home2, Pay3, Study3

**Goal:** the three main tabs redone to match their boards, with the same live data as now.

**Build:**
1. Home: next shift card, today's tasks, coming up list, exactly as Home2. Times never wrap ("10 pm", "Sun 10:00").
2. Pay: this week total big, shift list chips (nowrap), weekday and weekend split, as Pay3.
3. Study: timer ring, subject chips, next test card, as Study3. Subject colours as now.

**Done when**
- [ ] Real Supabase data shows in all three
- [ ] Empty states styled (no shifts, no tasks, no tests)
- [ ] Screenshots of each, filled and empty

---

## Card 17 · Island idle and live states
**Model:** Sonnet · **Size:** medium · **Needs:** 15b · **Board:** IslandLive.dc.html

**Goal:** the island itself, resting and showing one live thing at a time.

**Build:**
1. Sizes: idle 200 × 34 r17, compact 300 × 40 r20, wide 400 × 40 r20. Ears drawn with `::before` and `::after` radial masks exactly like the board. Never put `overflow: hidden` on the element with the ears, clip an inner wrapper instead.
2. States, highest priority wins: Leave now, Live game, Study timer, Shift soon (within 2 hours), Music, Charging (3 seconds on plug in), Idle with unread (gold dot), Idle.
3. Each state has a thin bottom key line and a soft glow in its colour, as the board shows.
4. Size changes animate width, height and radius over 380 ms with `cubic-bezier(0.4, 0, 0.2, 1)`. Content fades in after the size settles.
5. Music and Charging come from the helper and just stay hidden if it isn't running. Live game comes from the `nba` function.
6. A `/island` dev page with buttons to force each state.

**Done when**
- [ ] Every state on `/island`, screenshots of each
- [ ] Priority order unit tested

---

## Card 18 · Notification banners and the alert animation
**Model:** Sonnet · **Size:** medium · **Needs:** 17, 20 · **Boards:** IslandAlerts.dc.html, IslandDemo.dc.html

**Goal:** the island grows into a 520 × 84 banner for an alert, then settles back.

**Build:**
1. Banner 520 × 84, radius 34: icon tile 44 round on the left, title and body (both single line, ellipsis), time top right, optional action button.
2. Eight types with their colours and icons from the board: shift cover, leave reminder, new mark, call, Sixers final, battery low, task done, focus done.
3. Animation: open over 520 ms with `cubic-bezier(0.34, 1.45, 0.5, 1)`, content fades in after 0.22 s, holds 4 s (hovering pauses the timer), closes over 380 ms back to whatever live state was showing.
4. A queue: one banner at a time, the next one waits.
5. Banners are fed from the `alerts` table (card 20) through Supabase realtime.
6. Actions only open things (a link, a tab) or snooze. Never post, reply or submit anything anywhere. "Open Blink" just opens Blink.
7. Add every type to `/island` with a "Play" button.

**Done when**
- [ ] A row inserted into `alerts` shows a banner within 2 seconds
- [ ] Screenshots of all 8 types, plus a short screen recording of one playing

---

## Card 19 · Week tab
**Model:** Sonnet · **Size:** medium · **Needs:** 15 · **Board:** Week.dc.html

**Goal:** the next 7 days at a glance.

**Build:**
1. Seven day columns as the board: shifts, tests and events from the existing Supabase tables (the TickTick sync).
2. Today highlighted, tests use the subject colour, shifts amber.
3. Titles may wrap to two lines, never truncate mid word.

**Done when**
- [ ] Matches the board with real data
- [ ] Screenshots of a busy week and an empty week

---

## Card 20 · Alerts tab and `alerts` table
**Model:** Sonnet · **Size:** medium · **Needs:** 15 · **Board:** Alerts.dc.html

**Goal:** one place where every alert lands, and the table the banners read.

**Build:**
1. Migration: table `alerts` (id, user_id, type, title, body, action_label, action_url, created_at, read_at) with RLS so a user only sees their own rows. Enable realtime on it.
2. The tab lists alerts newest first, unread with a gold dot, tap marks read. "Mark all read".
3. The island's unread dot (card 17) reads the unread count from here.
4. Write `docs/alerts.md` explaining how a scheduled task inserts a row (the insert uses the service role key in the scheduled task only, never in the repo or frontend).

**Done when**
- [ ] RLS tested with two users
- [ ] Screenshots of the tab with and without alerts

---

## Card 21 · Money and Marks tabs
**Model:** Sonnet · **Size:** medium · **Needs:** 15 · **Boards:** Money.dc.html, Marks.dc.html

**Goal:** two new tabs.

**Build:**
1. Money: earned this month and this year from the shifts data and the pay rules in HALO.md section 4, plus a savings goal (name, target, saved so far) stored in a new `goals` table with RLS, editable in the tab.
2. Marks: a `marks` table (subject, assessment, score, out_of, weighting, date) with RLS. Manual entry form in the tab. Shows each subject's running average in its colour and the latest results list. No scraping SEQTA.

**Done when**
- [ ] Both work with real rows
- [ ] Screenshots, filled and empty

---

## Card 22 · Claude, Shelf and Widgets tabs
**Model:** Sonnet · **Size:** medium · **Needs:** 15 · **Boards:** Claude.dc.html, Shelf.dc.html, Widgets.dc.html

**Goal:** three new tabs.

**Build:**
1. Claude: quick launch buttons (open claude.ai, open Claude Code docs) and a "Recent tasks" list read from a new `task_runs` table (name, status, finished_at, summary) with RLS that scheduled tasks can insert into. No API key anywhere in the frontend.
2. Shelf: drop files, links or text. Files go to a private Supabase Storage bucket `shelf`, metadata in a `shelf_items` table, both with RLS. Tap to open or copy, swipe or button to delete.
3. Widgets: Perth weather from Open-Meteo (free, no key), a clock, and countdowns stored in a `countdowns` table (for example Doomsday on 18 Dec).

**Done when**
- [ ] Shelf works between laptop and phone
- [ ] Screenshots of all three

---

## Card 23 · Night, Laptop, More and tab order
**Model:** Sonnet · **Size:** medium · **Needs:** 15, 12 · **Boards:** Night.dc.html, Laptop.dc.html, More.dc.html

**Goal:** the last three tabs plus hiding and reordering.

**Build:**
1. Night: tomorrow's first event and shift, a suggested bedtime, and a Night mode switch (role="switch") that dims the whole UI and mutes banners except leave reminders. Saved per device.
2. Laptop: battery health, storage, uptime from a new helper endpoint `GET /system` (add it to the helper with psutil, same token rules). Static warranty card: depot warranty until February 2027. Shows "Helper not running" when it's off.
3. More: a launcher grid of every tab. Long press or an Edit button lets you hide tabs and drag to reorder. At most 8 visible in the rail. Saved in a `settings` row in Supabase so the phone matches.

**Done when**
- [ ] Hidden and reordered tabs stay that way after reload on both devices
- [ ] Screenshots of all three

---

## Backlog (Opus writes these cards later, don't start them)
- Claude edge function + Ask Claude, snip to Claude, explain selection, clipboard actions, draft in your voice
- Morning hello, morning briefing, Sunday recap, monthly wrap
- Phone remote and file sharing through `commands`
- v2: Tauri island app, HUDs, NotchPixel parity
