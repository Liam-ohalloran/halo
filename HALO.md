# HALO.md — project bible

Read this file fully at the start of every session. It is the single source of truth for Halo.
If a task card and this file disagree, this file wins. If something here is wrong, say so and stop; do not guess.

## 1. What Halo is

Halo is Liam's personal Dynamic Island for his Windows 11 laptop, plus a matching iPhone app.
It shows one live thing at a time (shift soon, study timer, music, Sixers game) and opens into a hub
for his week: shifts, pay, study, sport, Claude, phone link.

- **Owner:** Liam (GitHub `Liam-ohalloran`), Year 11 student, Perth WA.
- **Time zone:** always `Australia/Perth` (UTC+8). Store timestamps as `timestamptz`, display in Perth time.
- **Spelling:** Australian English. Dates `Sat 21 Nov`, times `5:30 pm` in prose, `5:30` on the pill.

### Versions

| Version | What | Where it runs |
|---|---|---|
| **v1 (now)** | Web panel shown inside the NotchPixel app via its "Add a site" web tab, plus the same app as an iPhone home screen PWA | GitHub Pages + Supabase |
| **v2 (later)** | Native Windows island app (Tauri 2) that replaces NotchPixel | Liam's laptop |

v1 is a web page, so on its own it cannot control the laptop. The **Halo helper** (section 2b) fills that gap: a small local program that Halo talks to on `127.0.0.1`. Never try to control the laptop any other way from v1.

## 2. Stack

- **Frontend:** Vite + TypeScript, no heavy framework. Small reusable components in plain TS (or Preact if a card says so).
- **Hosting:** GitHub Pages from repo `Liam-ohalloran/halo`, deployed by GitHub Actions on push to `main`.
- **Backend:** Supabase project `halo`
  - Project ref: `brqrszaljxeduelpuyty`
  - URL: `https://brqrszaljxeduelpuyty.supabase.co`
  - Region: ap-southeast-2 (Sydney)
  - Get the publishable key with the Supabase MCP (`get_publishable_keys`). It is safe in the frontend.
  - **Never** put a secret key, service role key, Anthropic key or any API key in the frontend or the repo. Secrets live in Supabase edge function secrets only.
- **Auth:** Supabase magic link to Liam's email. One user. Every table has RLS: owner only.
- **Icons:** Phosphor Icons (`@phosphor-icons/core` SVGs). Regular weight = inactive, Fill weight = active. No other icon set, no emoji in UI.

### Database (already created, do not change schema without asking Liam)

| Table | Purpose | Key columns |
|---|---|---|
| `shifts` | McDonald's shifts | `title` (e.g. `SATURDAY PA 5:30-9`), `station`, `starts_at`, `ends_at`, `is_public_holiday`, `ticktick_id` |
| `tests` | Tests and assessments | `subject`, `title`, `due_at`, `ticktick_id` |
| `study_sessions` | Timer logs | `subject`, `started_at`, `ended_at`, `minutes` (generated) |
| `notifications` | Halo alerts | `source`, `title`, `body`, `read` |
| `commands` | Phone → laptop remote (v2) | `action`, `payload`, `status` |
| `settings` | Pay rates, theme | `weekday_rate`, `saturday_rate`, `sunday_multiplier`, `public_holiday_multiplier`, `theme` |

All tables have `owner_id uuid default auth.uid()`. Realtime is on for `notifications`, `commands`, `shifts`.

### 2b. Halo helper (laptop bridge)

A small Python program that runs in the background on Liam's Windows laptop and gives Halo safe access to music and laptop controls.

- **Lives in** `helper/` in the halo repo. Python 3.12, FastAPI + uvicorn, `winsdk` (media and radios), `pycaw` (volume), `screen-brightness-control`, `psutil` (battery), `pystray` (tray icon).
- **Listens on** `http://127.0.0.1:47800` only. Never `0.0.0.0`.
- **CORS** allows only `https://liam-ohalloran.github.io` and `http://localhost:5173`, and answers Private Network Access preflights with `Access-Control-Allow-Private-Network: true`.
- **Token:** on first run it creates a random token in `%APPDATA%\HaloHelper\token.txt`. Every request needs header `X-Halo-Token`. Halo stores the token in localStorage after Liam pastes it once in Settings (Pair helper).
- **Endpoints:** `GET /status`, `GET /media`, `GET /media/art`, `POST /media/{play|pause|toggle|next|previous}`, `POST /media/seek`, `GET|POST /volume`, `POST /mute`, `GET|POST /brightness`, `GET /battery`, `GET|POST /wifi`, `GET|POST /bluetooth`, `GET|POST /power-mode`, `GET /events` (server sent events for media, volume and battery changes).
- **Not supported yet:** Night light and Focus (no reliable public Windows API). Their tiles show "Not available yet".
- **Starts at logon** via a Task Scheduler task, shows a tray icon with Quit.
- **Read only for everything else.** It never touches files, messages or accounts.
- On the phone, or when the helper is not running, Music and Controls show a plain state ("Open Halo on your laptop" / "Start Halo helper") with a retry button. Never an error dump.

### 2c. Window size (from the approved redesign)

The open panel is **600 × 290**, radius 26, matching NotchPixel's panel. The current tab's colour tints the whole window (soft gradient plus one soft corner glow). Sections are split with thin lines and spacing, not boxes inside boxes. Reference: the "final style" boards in the Halo UI redesign canvas.

## 3. Design rules (non-negotiable)

> **3.0 Approved prototype (20 Nov 2026, wins over everything below).** The look is now `design/prototype/index.html`. Where this section disagrees with it (font, colours, card style, tab bar, Controls panel, Music card), the prototype wins. Fonts are Inter Tight and Geist Mono, not Onest. Four tab families: colour tiles, black island, glass, compact grid (see TASKS.md shared rules). Pressing something inside a tab only updates what changed, never re-renders or flashes the whole tab.

These come from Apple's Live Activities guidelines, WWDC23 "Design dynamic Live Activities", and the best Mac notch apps (Alcove, NotchNook, boring.notch). Halo must never look AI-made.

### 3.1 The island

- **Pure black** `#000000`, attached to the top edge of the screen: flat top, rounded bottom corners, small inverse-curve "ears" where it meets the edge.
- **Colour comes only from content**: album art, team colours, subject colour. The island itself is never tinted purple or glassy.
- **Key line:** 1 px outline tinted to the content colour at ~30% opacity.
- **Compact layout:** leading content on the left, trailing content on the right, balanced, nothing in the middle unless it is tiny status text.
- **Alerts grow the island** (expanded banner) instead of a separate popup, then settle back.
- **Concentric corners:** inner radius = outer radius minus padding. Even margins all round. Nothing pokes into the rounded edge.
- Separate blocks with an inset rounded container or a thick line, never content running to the edge.

### 3.1b Light spill (signature look, never drop this)

The island is black, but it **glows**. The content's colour spills as soft light onto whatever is behind it:
- Three stacked falloffs from the island edge: tight (~26 px), medium (~110 px) and wide (~300 px), added together and tone mapped so it never clips.
- Colour taken from the content: album art colours for music, team colours split left and right for a live game, amber for shifts, purple for study.
- A slow breathing pulse (about 14% brightness, ~4 s cycle). Music pulses faster, roughly with the beat.
- A thin travelling highlight along the key line.
- Reference: boards "Hero · Expanded Now Playing" and "Compact states" in the Halo v1 Design canvas. Match them.
- v1 (inside NotchPixel): the glow is drawn inside Halo's own panel only.
- v2 (native): a transparent, click-through overlay window draws the glow onto the real desktop.
- Pauses when hidden. Turned down to a static glow under Reduce motion or Battery saver.

### 3.1c Music card (expanded) — learned from NotchPixel

The one exception to the pure black island. When music is expanded:
- **Background = the album cover**: blurred (~60 px) and stretched into soft streaks, with a dark scrim on top that adapts to the cover's brightness so all text stays at 4.5:1 or better.
- **Edge glow** in the cover's main colour (light spill, 3.1b).
- **Cover art 88 px**, radius 20, on the left. Source badge (Spotify etc.) overlaps its bottom right corner, no container of its own.
- **Title** 21/700, **artist** 15/500 at 60% white. Long titles scroll slowly (marquee) with faded edges and a 2 s pause at the start. Never cut a word at both ends.
- **Controls** previous, play or pause, next: large Phosphor fill icons, no circles, right side.
- **Progress** = a wave line tinted with the cover's accent colour, a solid playhead, flat when paused. Elapsed and remaining times in Onest tabular, 13/600, 60% white.
- **Volume slider** in the card under the progress bar.
- Tab icons along the top, active tab = a small dot under it.
- Compact music pill stays black: cover 26 px on the left, visualiser bars tinted with the cover colour on the right.

### 3.1d Controls panel (v2, needs the native app) — learned from NotchPixel

Keep NotchPixel's layout, fix its look. Black panel, no purple haze, no sparkle dots.
- **Left:** two tall sliders, brightness and volume, 96 × 180, radius 28. Fill rises white from the bottom. Icon inside at the bottom changes with level (sun rays grow, speaker waves add). Percentage on top in Onest 15/700 tabular. Drag or scroll to change, value uses NumberRoll.
- **Right:** 3 × 2 tile grid, tiles 120 × 84, radius 22 (concentric with the panel). Tiles: Wi-Fi, Bluetooth, Night light, Focus, Mute, Battery.
  - **Off:** `--fill-2` background, white outline icon (Phosphor regular), label 15/600, state 13/500 at 60% white.
  - **On:** tile fills with its own colour (Wi-Fi and Bluetooth `#0A84FF`, Night light `#FF9F0A`, Focus `#BF5AF2`, Mute `#FF453A`), icon switches to Phosphor fill.
  - Battery tile shows percent, charging state and time left, green `#30D158` when charging.
  - Press = scale 0.96 spring. Right-click or hold opens detail: Wi-Fi network list, Bluetooth devices with battery, focus options.
- **Bottom:** power mode segmented control (Battery, Balanced, Performance) with icons, sliding selection.
- **Extras (Yes list):** audio output switch (speakers, headphones) and per-app volume as a second page of the panel.
- Tile order can be rearranged in Settings.
- Text contrast 4.5:1 everywhere, including "On" and "Off".

### 3.1e Tab bar (top of the open island)

Left to right. Phosphor icons, regular when inactive, fill plus a 4 px dot underneath when active. A thin divider before Settings. Liam can hide and reorder tabs in Settings; at most 8 visible.

| # | Tab | Icon | Contains |
|---|---|---|---|
| 1 | Now | `house` | Next shift (ring, leave-by), next test, today's timeline, morning hello and briefing, rain nudge |
| 2 | Music | `music-notes` | Music card (3.1c), top tracks |
| 3 | Study | `book-open` | Timer, subject balance, due tonight, exam week ring, formula sheet peek, snip to Claude |
| 4 | Pay | `wallet` | This week's pay, payday countdown, earnings history, savings goal |
| 5 | Sixers | `basketball` | Live or next game, post-game card, standings strip, Maxey tracker, bench clock |
| 6 | Claude | `sparkle` | Ask Claude, explain selection, clipboard actions, draft in your voice, voice to task |
| 7 | Alerts | `bell` | Last 24 notifications (PC, phone, Blink covers, new marks), clear all |
| 8 | Shelf | `tray` | Dropped files, clipboard history, send to and from phone, quick notes |
| 9 | Widgets | `squares-four` | Chess puzzle and rating, daily games hub, L-plate log, device health, gift ideas, weather |
| 10 | Controls | `sliders-horizontal` | Controls panel (3.1d), v2 only |
| — | Settings | `gear-six` | Opens the Settings window |

Opens on the last tab used, or Music while something is playing (setting).

**Tab picks (Liam, 18 Nov 2026).** Built or designed: Home, Music, Study, Pay, Sixers, Controls. Approved next: **Week** (7 day TickTick timeline), **Alerts**, **Claude**, **Shelf**, **Widgets**, **Marks** (results and ATAR target), **Money** (savings goal, earnings history, payday countdown), **Night** (bedtime and tomorrow), **Laptop** (battery, storage, warranty reminder). Declined as tabs: Games, Driving, Chicago, Fishing, Commute, Watchlist, Gifts. With this many tabs, Settings must let Liam hide and reorder them (at most 8 visible).

### 3.2 Tokens

```css
/* colour */
--island: #000000;
--text-1: #FFFFFF;
--text-2: rgba(235,235,245,0.60);
--text-3: rgba(235,235,245,0.30);
--fill-1: rgba(255,255,255,0.16);   /* tracks, dividers */
--fill-2: rgba(255,255,255,0.08);   /* inset containers */
--accent: #FFB547;                  /* Halo gold: focus rings, toggles on */

/* content colours (only used for content) */
--shift:  #FF9F0A;   /* amber */
--study:  #BF5AF2;   /* purple */
--pay:    #30D158;   /* green */
--alert:  #FF9F0A;
--live:   #FF453A;   /* live dot */
--sixers: #4C8DFF;
--celtics-or-opponent: team colour from data

/* subject colours */
--hb: #FF6482; --chem: #BF5AF2; --meth: #0A84FF; --spec: #64D2FF; --english: #FFD60A; --religion: #AC8E68;

/* spacing: 4 px base, 8 px rhythm */
--s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 20px; --s6: 24px; --s8: 32px;

/* type scale (px) */
11, 13, 15, 17, 21, 28   /* nothing else */
```

- **Font:** **Inter Tight** (UI and numbers, 500 to 800) and **Geist Mono** (caps labels). Self-host the woff2 files in `public/fonts/` so it works offline. (Onest was the old choice, replaced by the prototype.)
- **Numbers:** always `font-variant-numeric: tabular-nums`. Numbers that change roll (animate digit by digit), never jump.
- **Weights inside the island:** 500 minimum. Titles 700.
- **Text contrast:** 4.5:1 minimum, including secondary text.

### 3.3 Island sizes (from the approved design canvas)

| State | Width | Height | Bottom radius |
|---|---|---|---|
| Resting | 200 | 34 | 17 |
| Compact (shift, study, music) | 300 | 40 | 20 |
| Compact wide (live game) | 400 | 40 | 20 |
| Alert banner | 520 | 84 | 34 |
| Expanded (Now Playing etc.) | 660 | 200 | 48 |

Expanded padding: 22 top, 26 right, 22 bottom, 24 left. Album art 88 px, radius 20 (see 3.1c).

### 3.4 Components (build once, reuse everywhere)

Every interactive component has **5 states designed**: rest, hover, pressed, focus-visible, disabled.

- **Button** (primary white on black, secondary `--fill-1`, tinted = content colour at 20% with content-colour text). Height 36 or 44. Pressed = scale 0.96 with spring.
- **IconButton** 44 × 44 hit area, icon 22.
- **Toggle** 51 × 31, on = `--accent`.
- **Slider** track 6 px, thumb 22 px white, thumb grows to 26 px while dragging.
- **Segmented control** pill with sliding selection.
- **Chip** for subjects, coloured by subject.
- **RingProgress** (used for shift countdown and study timer).
- **NumberRoll** for any changing number.
- **Island** shell: handles compact ↔ expanded morph.

### 3.5 Motion

**The pull-out (open) is the most important animation in Halo. It must feel like liquid being pulled down from the screen edge. Spend time here.**

Open sequence (hover past the open delay, or click):
1. **0–90 ms:** compact content fades out and scales to 0.94 with a 4 px blur. The island does a tiny anticipation squash (scaleX 1.03, scaleY 0.97).
2. **60–520 ms:** the shape springs to its expanded size, anchored to the top edge so it grows downward and outward. Width, height and corner radius all animate together on one spring (stiffness 380, damping 28, mass 1, about 6% overshoot). The ears stay attached the whole time.
3. **The light spill grows with the shape**, same spring, so the glow pours out with it.
4. **From ~55% of the shape motion:** expanded content staggers in. Each row fades in, rises 6 px and scales 0.98 → 1, clearing a 4 px blur, 30 ms apart, tab bar first.

Close: the reverse, about 30% faster (stiffness 420, damping 32), content gone before the shape finishes shrinking.

Rules:
- Springs must be **interruptible**: leaving mid-open reverses smoothly from wherever the shape is, never snapping or restarting.
- **Tab switch:** the island's height springs to the new tab's content height (no scrollbars where avoidable). Content slides 12 px left or right depending on tab order, with a quick cross-blur. The active dot slides along under the icons.
- **Compact state change** (e.g. music → shift): width springs to the new size, old content blurs out and new content blurs in.
- **Alerts:** the island stretches to the banner size with a slightly bouncier spring (damping 22) and a single glow flare, holds, then settles back.
- Numbers roll, never jump. Every animation under 2 seconds.
- 60 fps minimum, 120 fps on high refresh screens. Animate transform and opacity only, never layout properties, in v1. In v2 drive the native window size from the same spring.
- `prefers-reduced-motion` or Reduce motion: no squash, no overshoot, no blur, 200 ms fades and size changes only.
- Build a `/motion` test page with buttons for every transition and a slow-motion (×0.25) toggle so it can be tuned frame by frame.

### 3.6 Every state designed

Empty, loading (skeleton shimmer, not spinners), error (one plain sentence + retry), offline. Never a blank box or raw error text.

### 3.7 Copy rules

- Short, plain, Australian spelling.
- **No em dashes, no hyphens used as dashes, no semicolons** in any on-screen text. Use full stops or commas.
- Shift titles exactly as Liam writes them: `SATURDAY PA 5:30-9`.

### 3.8 Performance budget

- Under 80 MB RAM and under 1% CPU when idle.
- Animations and any WebGL/Three.js pause when the island is closed or the tab is hidden (`visibilitychange`).
- WebGL (Three.js or a single fragment shader) is used for the light spill and album art glow only. Never for basic UI.

## 4. Pay rules (for the Pay panel)

- Pay week runs **Monday to Sunday**.
- Read rates from the `settings` table, never hardcode. Current values to seed: base ~$17.89/hr (includes casual loading and Crew Coach allowance) as both `weekday_rate` and `saturday_rate` until Liam's payslip says otherwise, Sunday ×1.25, public holiday ×2.
- **30 minutes unpaid break on any shift over 5 hours.**
- Tax estimate: 15 cents per dollar earned over $350 in the week.
- Show: hours, gross, after-tax estimate, and each shift with its hours and pay.
- Overtime: +$2 an hour on hours past 10 in a pay week (from the payslip). The Pay "+$N OT" chip shows only that extra (hours over 10 × $2), not the pay for those hours.
- Liam should double-check rates against his payslip. Show a small "Rates from Settings" note with a link to edit.

## 5. Safety rules

- Halo is **read only** on Liam's work and social accounts (Blink, Snapchat, TikTok, myJob). It never posts, replies or submits.
- No crypto trading, only price alerts.
- Claude features run through a Supabase edge function holding the Anthropic key. The frontend never sees the key.
- "Draft in your voice" copies text to the clipboard. Halo never sends messages itself.

## 6. Feature decisions (from the build checklist)

**Yes (build):** celebrations, morning hello, sound pack, seasonal themes, wallpaper match, Sunday recap, monthly wrap, snip to Claude, explain selection, exam week ring, due tonight banner, formula sheet peek, focus session, new marks alert, payday countdown, shift prep nudge, earnings history, savings goal, leave-by alerts, rain nudge, L-plate log, next Sixers game, post-game card, standings strip, Maxey tracker, bench clock, daily chess puzzle, chess rating, daily games hub, top tracks, ring my laptop, send link to laptop, remote screenshot, quick note, morning briefing, draft in your voice, voice to task, clipboard actions, device health, storage nudge, audio output switch, per-app volume, layout presets, downloads sorter, custom buttons, bedtime mode, gift ideas, theme editor.

**Maybe (after v1):** time-of-day glow, idle flashcards, focus playlist, break reminder, hours goal, Transperth timetable, FuelWatch prices, anime alerts, fishing weather, coin alerts, song of the day.

**No:** streaks, coaching game day card, Road to Doomsday.

Plus everything NotchPixel already does (see `docs/notchpixel-parity.md` if present, or the Halo build checklist doc).

## 7. How to work (rules for Claude Code)

1. Read `HALO.md` and the task card. Do only that card.
2. Before writing code, list the files you will create or change and wait for "go" only if the card says `CONFIRM FIRST`.
3. Build mobile-first where it matters, test at **two sizes**: NotchPixel web tab (~ 680 × 420) and iPhone (390 × 844).
4. Take screenshots with Playwright (headless Chromium) at both sizes and save them to `screenshots/<task-number>/`. Look at them yourself and fix anything that breaks the design rules before saying done.
5. Run `npm run build` with zero errors and zero TypeScript errors.
6. Commit with a clear message. Push to `main` only when the card's "Done when" list is all true.
7. Finish with: what you built (3 lines max), the screenshot paths, and anything Liam must do by hand.
8. If a card is unclear or conflicts with this file, stop and ask. Never invent design.
9. Australian spelling in code comments and UI. PowerShell for any command Liam runs himself (he's on Windows).
