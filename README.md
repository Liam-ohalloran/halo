# Halo

A personal Dynamic Island layer: one compact web panel for [NotchPixel](https://notchpixel.com) on Windows 11 ("Add a site"), and the same page as an iPhone home-screen PWA.

**Live:** https://liam-ohalloran.github.io/halo/

## Install Halo on Windows (card 28)

1. Download **Halo-Setup.exe** from [the latest release](https://github.com/Liam-ohalloran/halo/releases/latest) and run it.
2. Windows SmartScreen warns once, because Halo has no paid code signing. Click **More info**, then **Run anyway**.
3. Halo finds its own updates and installs them with one click in Settings, Laptop. Moving over from NotchPixel: [docs/switch-from-notchpixel.md](docs/switch-from-notchpixel.md).

Making a release (Liam, once per version):

```powershell
git tag v0.2.0
git push origin v0.2.0
```

The `Release Halo for Windows` workflow builds the installer on a Windows runner, signs the update with the key kept in the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and attaches `Halo-Setup.exe`, the signed update and `latest.json` to a GitHub Release. The tag decides the version (`vX.Y.Z` only).

## Tabs

- **Now**: the current or next shift and the next test, with live countdowns.
- **Pay**: hours and gross for a Monday to Sunday pay week, from `shifts` and the rates in `settings`. Shifts that cross midnight are split so each part gets its own day's rate. Sunday and public holiday rates are `weekday_rate × multiplier`.
- **Study**: a focus timer that writes to `study_sessions` per subject, plus today's totals.

## Sixers (card 09)

- Edge function `supabase/functions/nba` fetches ESPN's public NBA scoreboard, boxscore and Sixers schedule server side (cdn.nba.com blocks automated requests) and returns only the Sixers game (teams, score, period, clock, status, Maxey's points, rebounds and assists, next game). Cached 20 seconds. Pure parsing lives in `supabase/functions/nba/parse.ts` and is covered by `npm test`.
- Deploy it once: `supabase functions deploy nba --project-ref brqrszaljxeduelpuyty`
- `/sixers/` is the dev page. It runs sample JSON from `tests/fixtures/nba` through the real parser, so every state (live, halftime, overtime, final, next game, empty, loading, error, offline) works without a game on.

## Stack

Vite + TypeScript, no UI framework. Supabase (auth by magic link, Postgres with owner-only RLS, realtime on `shifts`). Only the publishable key ships to the browser; anything secret goes in a Supabase edge function.

## Develop

```sh
npm install
npm run dev          # http://localhost:5173/halo/
npm run shots        # headless screenshots of every state at panel and iPhone size -> shots/
```

Dev-only fixtures: add `?mock=full|empty|loading|error|running|signedout` to the dev URL. They are stripped from production builds.

## Deploy

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/pages.yml`.
