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
6. Home page shows a black 300 × 40 resting island at the top centre with the ears, on a `#0b0b10` background. Nothing else.
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
2. **Icons**: 16 Phosphor icons in two rows, regular (inactive) and fill (active), 24 px white on black: music-notes, clock, book-open, basketball, bell, wallet, house, sliders-horizontal, play, pause, skip-forward, skip-back, heart, speaker-high, moon, sparkle. Copy SVGs from `@phosphor-icons/core` into `public/icons/`.
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

Add a `/components` page showing each one.

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
- Today timeline: today's TickTick-sourced items in time order.
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

## Backlog (Opus writes these cards later, don't start them)
- Claude edge function + Ask Claude, snip to Claude, explain selection, clipboard actions, draft in your voice
- Morning hello, morning briefing, Sunday recap, monthly wrap
- Phone remote and file sharing through `commands`
- v2: Tauri island app, HUDs, system controls, NotchPixel parity
