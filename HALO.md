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

v1 cannot control the laptop (no volume, Wi-Fi etc.). That is v2's job. Do not try to hack it into v1.

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

## 3. Design rules (non-negotiable)

These come from Apple's Live Activities guidelines, WWDC23 "Design dynamic Live Activities", and the best Mac notch apps (Alcove, NotchNook, boring.notch). Halo must never look AI-made.

### 3.1 The island

- **Pure black** `#000000`, attached to the top edge of the screen: flat top, rounded bottom corners, small inverse-curve "ears" where it meets the edge.
- **Colour comes only from content**: album art, team colours, subject colour. The island itself is never tinted purple or glassy.
- **Key line:** 1 px outline tinted to the content colour at ~30% opacity.
- **Compact layout:** leading content on the left, trailing content on the right, balanced, nothing in the middle unless it is tiny status text.
- **Alerts grow the island** (expanded banner) instead of a separate popup, then settle back.
- **Concentric corners:** inner radius = outer radius minus padding. Even margins all round. Nothing pokes into the rounded edge.
- Separate blocks with an inset rounded container or a thick line, never content running to the edge.

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

- **Font:** decided in task 02. Until then use `"Segoe UI Variable Display", "Segoe UI Variable Text", system-ui`. Never Inter.
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

Expanded padding: 22 top, 26 right, 22 bottom, 24 left. Album art 78 px, radius 20.

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

- Spring physics for every open, close and resize. Island **morphs** size; it never cross-fades between sizes.
- Suggested spring: stiffness 400, damping 32 (snappy, slight overshoot). Expand ~450 ms, collapse ~350 ms.
- Content swaps keep shared elements in place and move them; other elements fade and scale (0.96 → 1).
- Every animation under 2 seconds. `prefers-reduced-motion` = no bounce, no pulse, fades only.

### 3.6 Every state designed

Empty, loading (skeleton shimmer, not spinners), error (one plain sentence + retry), offline. Never a blank box or raw error text.

### 3.7 Copy rules

- Short, plain, Australian spelling.
- **No em dashes, no hyphens used as dashes, no semicolons** in any on-screen text. Use full stops or commas.
- Shift titles exactly as Liam writes them: `SATURDAY PA 5:30-9`.

### 3.8 Performance budget

- Under 80 MB RAM and under 1% CPU when idle.
- Animations and any WebGL/Three.js pause when the island is closed or the tab is hidden (`visibilitychange`).
- Three.js is allowed only for: wallpaper light spill and album art glow in the hero view. Never for basic UI.

## 4. Pay rules (for the Pay panel)

- Pay week runs **Monday to Sunday**.
- Read rates from the `settings` table, never hardcode. Current values to seed: base ~$17.89/hr (includes casual loading and Crew Coach allowance), Sunday ×1.25, public holiday ×2.
- **30 minutes unpaid break on any shift over 5 hours.**
- Tax estimate: 15 cents per dollar earned over $350 in the week.
- Show: hours, gross, after-tax estimate, and each shift with its hours and pay.
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
