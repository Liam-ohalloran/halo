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

## Card 13 · Music tab (superseded by card 24, skip)
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

## Card 14 · Controls tab (superseded by card 24, skip)
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

## Shared rules for cards 16 to 24 (the approved prototype)
- **The design source is `design/prototype/index.html`.** Open it in Chrome, click each tab, and copy it exactly: sizes, colours, gradients, glows, radii, fonts, spacing and motion. The old `design/boards/` files are superseded for anything the prototype shows. If a board and the prototype disagree, the prototype wins.
- The prototype is one HTML file with fake data. Port its CSS and markup into the real components and wire them to the real data sources. Never ship the fake numbers (they are marked "sample" or "mock" in the prototype).
- **Four tab families, never a new theme per tab:**
  1. **Colour tiles** (Home uses its dense grid variant, Money, Study, Marks): gradient tiles, caps label, big number, one visual each.
  2. **Black island** (Pay, Alerts, Night, Sixers, Audio): black cards, glowing lines, rounded pills, shaped glows.
  3. **Glass** (Claude, Shelf, Music, Launch): liquid glass cards over blurred colour blobs.
  4. **Compact grid** (Week, Widgets, Controls): #1c1c1e tiles, 1 px border, blue selection.
- Tab order: Home, Pay, Week, Study, Music, Sixers, Money, Controls, Audio, Launch, Alerts, Claude, Night, Marks, Shelf, Widgets. Arrow keys step through them.
- Window 600 × 290, the island IS the window (card 15b). Content area 564 × 226. **Nothing ever scrolls.** If there is more data than fits, show the top items and "+N more".
- Fonts: Inter Tight (UI and numbers) and Geist Mono (caps labels), self-hosted in `public/fonts/`. Tabular numbers everywhere.
- **No flash on interaction.** Pressing something inside a tab updates only what changed. Never rebuild the whole tab, never fade it out and back in. The entrance animation (tiles pop in, rings fill, numbers count up) plays only when you switch to a tab.
- Text never overflows, clips or overlaps. Run the overflow check from `scripts/check-overflow.mjs` (port it from the audit in the prototype handover, see card 16) on every tab before opening the PR.
- No em dashes, hyphens used as dashes or semicolons in on-screen copy.
- Keep every existing feature and data source working. Respect `prefers-reduced-motion`. Every button has hover, active and focus-visible states.
- Done means: Playwright screenshots at 600 × 290 of every state in `screenshots/card-NN/`, overflow check passing, PR opened, not merged.

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
## Card 16 · Prototype foundations, then Home, Pay and Study
**Model:** Sonnet · **Size:** large · **Needs:** 15b merged · **Source:** `design/prototype/index.html` (tabs Home, Pay, Study)

**Goal:** bring the prototype's look into the real app and rebuild the three main tabs on real data.

**Build:**
1. Foundations: copy the prototype's `:root` tokens (colours, `--spring`, `--ease`, `--slow`), the tile colour classes (amber, green, blue, cobalt, mag, purple, red, gold, night, teal, dark, ink), the pop in animation and the SVG helpers (`ring`, `arc`, `curve`, `spark`) into `src/styles/proto.css` and `src/ui/charts.ts`. Swap Onest for Inter Tight and Geist Mono.
2. `scripts/check-overflow.mjs`: Playwright opens every tab and fails if any text is truncated, clipped by its card or overlapping other text (copy the logic from the `audit` notes at the bottom of this card).
3. **Home** (dense widget grid, 5 × 3): next shift with countdown bar, pay this week with sparkline, Perth weather, laptop battery ring, study streak, Spotify (wide), Sixers score (wide), ATAR, alerts, daily games, coming up (wide, 3 items), Claude orb. Each widget opens its tab. Widgets whose data source isn't built yet (ATAR, alerts, games) show a quiet empty state, not fake numbers.
4. **Pay** (black island): THIS/NEXT week toggle, charging bar with the overtime stripes past 10 h, cumulative pay curve, four pills (tax, take home, Sunday rate, the other week). Uses `src/lib/pay.ts`.
5. **Study** (colour tiles): dotted ring timer with 25/50 lengths, today, streak, this week, top subject, subject rows. Keeps the existing timer logic.

**Done when**
- [ ] Real Supabase data in all three, empty states styled
- [ ] Overflow check passes on all three
- [ ] Screenshots filled and empty
- [ ] **REVIEW WITH OPUS**

**Overflow audit logic:** for every visible element with its own text: fail if `scrollWidth > clientWidth` with overflow not visible (truncated), if its box sticks out of the nearest ancestor with overflow hidden (clipped), or if its text box intersects another text box that isn't its parent or child (overlap). Skip panels that are meant to sit on top (player card, add sheet) when they are closed.

---

## Card 17 · Island idle and live states
**Model:** Sonnet · **Size:** medium · **Needs:** 15b · **Source:** prototype, the LIVE buttons and the change buttons under the island

**Goal:** the closed island, resting and showing one live thing at a time.

**Build:**
1. Sizes: idle 200 × 34, compact 300 × 40, wide 400 × 40. Ears via `::before` and `::after` radial masks. Never put `overflow: hidden` on the element with the ears.
2. States, highest priority wins: Leave now, Live game, Study timer, Shift soon (within 2 hours), Music, Charging (3 seconds on plug in), Idle with unread (gold dot), Idle.
3. Copy each state from the prototype: Leave now 400 × 46 pulsing red with a minutes chip, Live game 400 × 40 (logos, scores, red live dot, quarter and clock), Study timer and Shift soon as the **outlined island** 380 × 64 (glowing coloured border, big time, pause and stop or leave by), Music 300 × 38 (art, title, moving bars), Charging 220 × 34 plus a separate floating pill under it with the green bar and time to full (gone after 3 s), Idle with a gold unread dot.
4. Size changes animate over 380 ms with `cubic-bezier(0.4, 0, 0.2, 1)`, content fades in after the size settles.
5. Music and Charging come from the helper and stay hidden if it isn't running. Live game comes from the `nba` function.
6. **HUD pills for every change Liam makes on the laptop** (prototype: the "Try a change" buttons and the − = [ ] M keys). The closed island grows to a 310 to 360 × 44 pill for about 1.7 s, then settles back. Repeat presses reset the timer and the bar slides live, it never re-pops.
   - Sliders (bar with knob and number, icon changes with level): volume (labelled with the output device), brightness, keyboard light.
   - Toggles (icon, title, sub line, On/Off chip, red when it's a mute): mute, mic, Bluetooth device connect and disconnect, Wi-Fi, airplane mode, night light, focus, noise cancelling, caps lock.
   - Choices (chips with the picked one lit): power mode, EQ preset, audio output switch.
   - Charging: plug in fills a green bar to the battery %, unplug shows "On battery".
   - Screenshot saved.
   The helper watches Windows for these (volume and mute through pycaw, brightness through WMI, the rest through its existing events) and pushes them over its websocket. HUD pills sit above every live state except Leave now.
7. A `/island` dev page with buttons to force each state and fire each HUD.

**Done when**
- [ ] Every state and every HUD on `/island`, screenshots of each
- [ ] Holding volume up shows the bar sliding, not flashing
- [ ] Priority order unit tested

---

## Card 18 · Notification banners and the alert animation
**Model:** Sonnet · **Size:** medium · **Needs:** 17, 20 · **Source:** prototype, the NOTIFY buttons under the island

**Goal:** alerts pop out of the island, then settle back.

**Build:**
1. Style Liam picked: **expanding stack.** New alerts appear as small pills stacked on top of the island, and hovering one expands it into a 520 × 84 card (icon tile, title and body single line, time, optional action).
2. Types with their colours: shift cover, leave reminder, new mark, call, Sixers final, battery low, task done, focus done.
3. Open over 520 ms with `cubic-bezier(0.34, 1.45, 0.5, 1)`, hold 4 s (hover pauses), close over 380 ms back to the live state.
4. Queue, one at a time. Fed from the `alerts` table (card 20) through Supabase realtime.
5. Actions only open things (a link, a tab) or snooze. Never post, reply or submit anything anywhere.
6. Every type on `/island` with a Play button.

**Done when**
- [ ] A row inserted into `alerts` shows within 2 seconds
- [ ] Screenshots of all types and a short recording

---

## Card 19 · Week tab
**Model:** Sonnet · **Size:** medium · **Needs:** 15b · **Source:** prototype Week tab

**Goal:** a standard week calendar.

**Build:**
1. Header row with day and date (tomorrow red circle, selected day white circle), times 6am to 10pm down the side, seven columns.
2. Events as coloured blocks from the TickTick sync tables: shifts amber, tutoring blue, sport green, Sixers red, tests in their subject colour.
3. Anything before 6am or without a time goes in the EARLY row at the top. Events that clash sit side by side.
4. Tap a day to select it, tap an event for its full title and time.

**Done when**
- [ ] Real data, busy week and empty week screenshots, overflow check passes

---

## Card 20 · Alerts tab and `alerts` table
**Model:** Sonnet · **Size:** medium · **Needs:** 15b · **Source:** prototype Alerts tab

**Build:**
1. Migration: `alerts` (id, user_id, type, title, body, action_label, action_url, created_at, read_at) with RLS and realtime.
2. Tab as the prototype: shaped glow banner for the most important alert, ALL/SCHOOL/WORK/PHONE filter, clear all, island pills that dismiss on tap.
3. Unread count feeds the island gold dot (card 17).
4. `docs/alerts.md`: how a scheduled task inserts a row (service role key only in the scheduled task, never in the repo or frontend).

**Done when**
- [ ] RLS tested with two users, screenshots with and without alerts

---

## Card 21 · Money and Marks tabs
**Model:** Sonnet · **Size:** medium · **Needs:** 16 · **Source:** prototype Money and Marks tabs

**Build:**
1. Money (colour tiles): earned this week and month from shifts and `src/lib/pay.ts`, spending by category, subscriptions, goals rings (`goals` table, editable), recent list, safe to spend. No bank connection in this card: spending and subscriptions are manual rows (`money_items` table with RLS). Never anything that moves money.
2. Marks (colour tiles): `marks` table (subject, assessment, score, out_of, weighting, date) with RLS and a manual entry form. ATAR ring, subject tiles with sparklines, best and most improved. No scraping SEQTA.

**Done when**
- [ ] Both work with real rows, filled and empty screenshots

---

## Card 22 · Claude, Shelf and Widgets tabs
**Model:** Sonnet · **Size:** medium · **Needs:** 16 · **Source:** prototype Claude, Shelf and Widgets tabs

**Build:**
1. Claude (glass): the orb, ask box and quick pills. Recent tasks from a `task_runs` table that scheduled tasks insert into. No API key in the frontend.
2. Shelf (glass): drop files, links or text into a private `shelf` bucket plus `shelf_items` table, both RLS. Phone, copy path, open, remove.
3. Widgets (compact grid): clock, week strip, countdowns (`countdowns` table: Doomsday 18 Dec, birthday 4 Dec, Christmas), year dot grid, daily games ticks, battery, next up. Perth weather from Open-Meteo.

**Done when**
- [ ] Shelf works between laptop and phone, screenshots of all three

---

## Card 23 · Night tab and tab order
**Model:** Sonnet · **Size:** small · **Needs:** 16

**Build:**
1. Night (black island): wind down time, sleep arc to tomorrow's first event, the four tick cards. Night mode switch dims the UI and mutes banners except leave reminders.
2. Hide and reorder tabs (Edit mode in Launch or a long press on the tab bar), saved in a `settings` row so the phone matches.
3. Swap the card 15 icon rail and the "Home Sat 21 Nov" title for the prototype's top bar: one glass pill of tab icons where the selected tab grows into a white pill with its label, the time on the right, and arrow keys stepping through tabs.

**Done when**
- [ ] Order survives reload on both devices, screenshots

---

## Card 24 · Music, Sixers, Controls, Audio and Launch
**Model:** Sonnet · **Size:** large · **Needs:** 12 merged, 16 · **Source:** prototype Music, Sixers, Controls and Launch tabs · **Replaces cards 13 and 14**

**Build:**
1. Music (glass, always Spotify): real album art from the helper, the two accent colours pulled from the cover tint the blurred background and the wave progress, play, skip, shuffle, like, up next. Hidden state when the helper is off.
2. Sixers (black island): restyle card 09's data into the scoreboard plus Box, Leaders, Team and Form views, sortable box score, player card. Times in Perth time.
3. Controls (compact grid with colour): brightness and volume sliders, Wi-Fi, Bluetooth, Night light, Focus, Mute, battery, power mode, audio output, all through the helper. Disabled look when the helper is off.
4. Audio (black island): big mute button (blue, red when muted), master volume slider, output device picker, mic mute with live level meter, headphone ANC toggle, per app mixer (Spotify, Chrome, Discord, Teams) and EQ presets. All through the helper (pycaw for per app volume).
5. Launch (glass): apps with real icons from the helper, sites grouped School, Work, Build, search with `/`, edit mode to remove and reorder, add sheet. Saved in Supabase.

**Done when**
- [ ] Works with the helper on and off, screenshots of every view
- [ ] **REVIEW WITH OPUS**

---


## Halo as its own Windows app (cards 25 to 28)
Halo stops living inside NotchPixel and becomes its own app, with **nothing NotchPixel does missing**. The tabs, island and pills stay the same web code; only the window around them changes. Built with **Tauri v2** (small, fast, uses Windows' own WebView2). The phone stays the PWA.

**Parity checklist (every box must work before NotchPixel is uninstalled):** hover or click to open, island and notch styles, always on top, never steals focus, click through everywhere outside the island, hides over fullscreen games and video, picks a monitor, works at any display scale, media for any app (not just Spotify), scroll on the island for volume, volume and brightness popups, Windows notifications, phone notifications, clipboard history, file shelf, timer, weather, battery, launch at startup, a hotkey, settings for look, blur, animation speed and widgets. Liam adds anything from NotchPixel's own settings pages that this list misses.

---

## Card 25 · Desktop app shell
**Model:** Sonnet · **Size:** large · **Needs:** 17 · **REVIEW WITH OPUS**

**Build:**
1. `desktop/` Tauri v2 project. One frameless, transparent, always-on-top window at the top centre of the chosen monitor, sized to the island's current state (idle 200 × 34 up to 600 × 290) and resized from the web code through a small `halo.desktop.setSize()` bridge, so the window never covers more than the island.
2. Click through everywhere outside the island shape, never takes focus until clicked, no taskbar button.
3. Two styles: **Island** (floating capsule, a few px below the top) and **Notch** (attached to the top edge with the ears).
4. Loads the built web app from inside the app (works offline), same Supabase sign-in. `?desktop=1` tells the web code it's in the app.
5. Hides while a fullscreen app (game, video) is on that monitor, comes back after.
6. Monitor picker, DPI aware, follows display changes and sleep or wake.
7. Tray icon: Open, Settings, Pause for 1 hour, Quit.
8. Launch at startup (on by default, switch in Settings) and a global hotkey, Ctrl+Alt+Space, to open or close.

**Done when**
- [ ] Runs from `npm run desktop:dev` and builds an installer
- [ ] Recording of hover open, close, a HUD pill and a banner over another app
- [ ] Clicking anything beside the island reaches the app underneath

---

## Card 26 · Fold the helper in, plus media, notifications and clipboard
**Model:** Sonnet · **Size:** large · **Needs:** 25

**Build:**
1. The helper ships inside the app as a sidecar (bundled exe), started and stopped by the app. No separate install, no PowerShell. Same pairing token, kept in the app's secure storage.
2. **Media for any app** through Windows media controls (Spotify, YouTube in Chrome, anything): title, artist, art, play, pause, skip, seek. Spotify stays the default for Music.
3. **Scroll on the island** changes volume and fires the volume pill.
4. **Windows notifications** (with Liam's permission through Windows' notification access) arrive as Halo banners and in the stack. Messages stay hidden until opened (HALO safety rules).
5. **Phone notifications** through Phone Link's notifications, same banners.
6. **Clipboard history** (last 25 text items and images, never passwords or anything from a password manager), shown in the Shelf tab with copy again.
7. Airplane mode and night light change pills (the leftovers from card 17), keyboard light if the Lenovo driver exposes it.

**Done when**
- [ ] Uninstalling the old helper changes nothing that works
- [ ] YouTube in Chrome shows in Music, a Windows notification shows as a banner

---

## Card 27 · Settings window
**Model:** Sonnet · **Size:** medium · **Needs:** 25 · **Source:** prototype styles

**Build:** a Settings tab (and tray item) covering: style (island or notch), size, blur, glow strength, animation speed, which live states and HUD pills are on, which tabs show and their order (ties into card 23), monitor, hotkey, launch at startup, notification sources, clipboard on or off, sign out. Saved in `settings` so the phone matches where it makes sense.

**Done when**
- [ ] Every switch works live without a restart, screenshots of each section

---

## Card 28 · Installer, updates and the switch from NotchPixel
**Model:** Sonnet · **Size:** small · **Needs:** 25, 26, 27

**Build:**
1. A GitHub Actions job builds `Halo-Setup.exe` on every version tag and attaches it to a GitHub Release.
2. The app checks for updates on launch and installs them with one click (Tauri updater, signed with an update key stored as a GitHub secret).
3. No paid code signing, so Windows SmartScreen will warn once on first install: README says to click More info, Run anyway.
4. `docs/switch-from-notchpixel.md`: go through the parity checklist above, tick each item, then remove Halo from NotchPixel's sites.

**Done when**
- [ ] Fresh install on Liam's laptop from the Release works, an update installs itself
- [ ] Every parity box ticked

---

## Backlog (Opus writes these cards later, don't start them)
- Claude edge function + Ask Claude, snip to Claude, explain selection, clipboard actions, draft in your voice
- Morning hello, morning briefing, Sunday recap, monthly wrap
- Phone remote and file sharing through `commands`
- v2: Tauri island app, HUDs, NotchPixel parity
