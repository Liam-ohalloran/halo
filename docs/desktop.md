# Halo desktop app (card 25)

Halo as its own Windows app, built with Tauri v2 (Windows' own WebView2, about 40 MB of RAM). The web code is the same code that runs on GitHub Pages and on the phone. Only the window around it is new. The phone stays the PWA.

## Run it

You need Rust and the Visual Studio C++ Build Tools (once).

```powershell
winget install --id Rustlang.Rustup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

```powershell
npm run desktop:dev
```

Builds the installer (`desktop/src-tauri/target/release/bundle/nsis/Halo_0.1.0_x64-setup.exe`):

```powershell
npm run desktop:build
```

The installed app loads the built web app from inside itself (`dist-desktop`), so it works offline. `?desktop=1` tells the web code it is in the app. Windows SmartScreen will warn once on first install (no paid code signing). Click More info, then Run anyway.

## How it works

- **One window, one size.** Frameless, transparent, always on top, no taskbar button, never takes focus until the island is open. It sits at the top centre of the chosen monitor. It is made once, at startup, as big as the island ever gets (the open 600 x 290 panel with its ears, or the fanned stack of alert pills) plus a 24 px margin all round for the border glow, and it is **never resized again**: not to grow, not to shrink, not when the island closes, not when the style changes. (Resizing a transparent window after the close animation is what made the island glitch when it closed.) The page draws the island inside it with CSS, and the app only moves the click through regions (`set_regions`). Moving and placing is one `SetWindowPos` call. Switching tabs does not rebuild or fade a panel: panels are built once, stay mounted, and the one that is not showing is hidden. `scripts/desktop-tabs-probe.mjs` records a fast run through every tab and checks all of this (window changes, panel removals, fades, flicker frames).
- **Border glow.** The island always has a 2 px bright ring exactly on its edge (round the ears too in Notch style) and a soft glow about 24 px wide outside it, drawn by `.sh-halo` in `src/styles/desktop.css`. The colour is the live state's (amber shift, green charging, red leave now, blue game, Spotify green music, the HUD pill's or banner's colour), the open tab's accent while open, and Halo gold when idle. A brighter highlight sweeps round the ring every 6 s (off with reduced motion). `--glow-strength` on `:root` (default 1) scales the glow, for the slider in card 27. `node scripts/shots-glow.mjs` saves a screenshot of every state to `screenshots/card-27/`.
- **Click through.** A thread watches the cursor every 30 ms. Anywhere in the window that is not the island (or the stack of alert pills under it), the window ignores the mouse, so clicks reach whatever is underneath. Rounded corners and the ears are click through too. A click through window never sees the mouse leave, so the app tells the page when the pointer enters or leaves, and when a click lands anywhere else (which closes the island).
- **Styles.** Notch is attached to the top edge with the ears. Island floats 8 px below the top as a full rounded capsule with no ears. The window always starts at the very top, the island is drawn 8 px down inside it, and that gap is click through. Change it in the tray menu or Settings (More tab).
- **Full screen.** Hides while a full screen app (covering the whole monitor, taskbar included) is in front on Halo's monitor, and comes back after.
- **Monitors.** Pick one in the tray or Settings. It follows resolution, scale and monitor changes and wake from sleep (checked once a second).
- **Tray.** Open, Settings, Screen, Style, Launch at startup, Pause for 1 hour, Quit.
- **Launch at startup** is turned on the first time the installed app runs, and after that it is yours to switch (tray or Settings). It stays off in `desktop:dev`.
- **Hotkey.** Ctrl+Alt+Space opens or closes the island. Two other apps on Liam's laptop already own Ctrl+Alt+Space and Ctrl+Alt+H, so the app uses the first free one of Ctrl+Alt+Space, Ctrl+Alt+H, Ctrl+Alt+Shift+H and Ctrl+Alt+F9 and shows it in the tray tooltip. Right now that is Ctrl+Alt+Shift+H.
- **Sign in.** Same Supabase sign-in. The app registers a `halo://` link (tauri-plugin-deep-link, installed by the installer, registered at run time in `desktop:dev`). The magic link email is sent with `emailRedirectTo: halo://auth`, so clicking it opens Halo, which signs in with the tokens in the link. A second click while Halo runs goes to the running copy (no second window). `halo://auth` must be in the Supabase project's Redirect URLs (it is). "Paste the link instead" is the fallback: paste the link from the email and the app signs in with its one time token.
- **Security.** The window's page may only use its own files, the Supabase project, Google Fonts and Open-Meteo (Content Security Policy in `tauri.conf.json`). The dev server capability lives in `tauri.dev.conf.json`, which only `tauri dev` reads, so the installer never has it. Note for card 26: the helper's `http://127.0.0.1:47800` is not allowed by the policy yet, so Music and Controls from the old helper do not work in the app until card 26 adds the bundled helper to it.

## Checks

| What | How |
|---|---|
| Sizing and click through shapes (Rust) | `npm run test:desktop` |
| Sizing rules (web) | `npm test` |
| Web half in a browser (styles, Settings, sign-in, overflow) | `node scripts/shots-card25.mjs` |
| The real app: focus, always on top, click through, hover open, close, full screen | `npm run desktop:dev`, then `powershell -File scripts/desktop-probe.ps1` (moves your pointer) |
| Recording | `scripts/desktop-demo.mjs` (see the top of the file) |

## Known limits (for review)

- The light spill outside the island is not drawn in the app, because the window is only as big as the island and the glow would be cut off in a hard rectangle. The key line stays. Drawing the spill needs a second transparent click through overlay window, which the card does not ask for.
- Not tried on a second monitor, at other display scales than 150%, or through sleep and wake. The logic is there and unit tested.
- The tray menu clicks and the "paste the link" fallback were not driven by hand. The email link flow was tested once with the real email on the release exe (halo:// pointed at it by hand, as the installer would): it signed in.

## The helper inside the app (card 26)

- **Sidecar.** `npm run helper:build` bundles `helper/halo_helper.py` with PyInstaller into `desktop/src-tauri/binaries/halo-helper-x86_64-pc-windows-msvc.exe` (built in `helper/.build-venv`, so the old helper's venv is untouched). `desktop:dev` and `desktop:build` run it first. The installer carries it (35.6 MB in total).
- **Started and stopped by the app.** First free port from 47800 (an old stand alone helper on 47800 does not get in the way), restarted if it dies, stopped on quit, and tied to the app with a job object. Its output goes to `%TEMP%\halo-helper.log`.
- **Token.** Made once, kept in Windows Credential Manager (`helper-pairing-token.Halo`), passed to the helper in an environment variable and to the page through `helper_info`.
- **Media for any app.** Windows media controls, so Spotify, YouTube in Chrome or anything else shows in Music. Spotify is the default: it wins while it is playing or when nothing else is, and anything else that is playing beats a paused Spotify.
- **Scroll on the closed island** changes the volume 4 points a notch and fires the volume pill. It does not open the window.
- **Windows notifications and Phone Link** (Phone Link's phone notifications are Windows toasts) arrive as Halo banners and in the stack. Windows asks Liam once. A message only says "New message" and the app's name, the text is dropped in the helper. A Phone Link call keeps the caller's name. The banner button never does anything.
- **Clipboard history** (last 25 text and image items) in the Shelf tab: the Clip chip switches the tiles to history, Copy puts the item back. In memory only. Skipped: anything that carries `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory = 0`, or came from a known password manager.
- **Airplane mode and night light** change pills. Keyboard light: the Lenovo driver does not expose it here, so there is no pill.
- **CSP** now also allows the helper on `http://127.0.0.1:47800` to `47810`.
- **Checks:** `npm run test:helper` (pytest), `node scripts/shots-card26.mjs` (web half with a pretend helper), and with `npm run desktop:dev` running, `node scripts/desktop-helper-probe.mjs` (real helper, a real Windows toast, real volume scroll, real clipboard). `scripts/chrome-media-test.ps1` plays a silent track in Chrome for the media check.

## Staying signed in

Halo signs in with email and password (the magic link is "Email me a link instead"). Set the password in Settings, Account, "Set a sign-in code".

The session lasts until Sign out. In the app Supabase's session is kept in the Windows Credential Manager (`secret_get`, `secret_set`, `secret_delete` in `lib.rs`, entries named `Halo` / `session:sb-...`), not in web storage. Web storage in the app belongs to one origin (the installed app and `desktop:dev` on different ports have different ones), which is why a rebuild or a new dev port used to ask for a sign in again. A session already in web storage moves over the first time it is read. If Windows starts Halo before Wi-Fi is up, or the Wi-Fi is off, the stored session is read from the store and Halo opens on it at once (card 29): Supabase refreshes the token in the background and only a session the server rejects signs out. The web and the phone keep Supabase's own `persistSession` and `autoRefreshToken`.

## Installer and updates (card 28)

- **Installer.** `npm run desktop:build` makes the NSIS installer in `desktop/src-tauri/target/release/bundle/nsis/` (current user install, no admin prompt). The release workflow (`.github/workflows/release.yml`) builds it for every tag like `v0.2.0` and attaches it to the GitHub Release as `Halo-Setup.exe`, next to the signed update and `latest.json`. `scripts/set-version.mjs` stamps the tag's version into `tauri.conf.json` and `Cargo.toml` first, so the installer, the app and the update check agree.
- **Updates.** `tauri-plugin-updater`. About 20 seconds after an installed Halo starts it reads `https://github.com/Liam-ohalloran/halo/releases/latest/download/latest.json`. If the version there is newer, Settings, Laptop says so, and **Install and restart** downloads it, installs it and restarts. The tray has **Check for updates**. `desktop:dev` never checks by itself.
- **Signing.** Every update is signed. The public key is in `tauri.conf.json` (`plugins.updater.pubkey`), the private key is only in the repository secrets and in `%USERPROFILE%\.halo-updater\` on Liam's laptop (with its password). **Back that folder up.** If the key is lost, installed copies of Halo cannot be updated any more and need a fresh install. Never commit it.
- **SmartScreen.** There is no paid code signing certificate, so Windows warns once on the first install: More info, then Run anyway.
- **Trying an update by hand.** Build two versions (`node scripts/set-version.mjs v0.1.1`, then `npm run desktop:build` with `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` set), install the older one, publish the newer one as a release, and press Check for updates.

## Fast and offline (card 29)

- **Optimistic Controls and Audio.** A tap or drag is drawn first and sent to the helper in the background, the helper's reply settles the screen, and a "no" puts the control back with a small shake. Drags send one request per 50 ms (newest value wins, never two at once). The logic is `src/lib/optimistic.ts`.
- **Push, not poll.** Both tabs take every change from the helper's `/events` stream (volume, mute, mic and its level, brightness, Wi-Fi, Bluetooth, power mode, output, battery, media, the mixer). They read once when built and again when the stream comes back. Only while the stream is down do they poll, every 10 s.
- **Offline.** With the Wi-Fi off the app opens on the stored session, shows the "Offline" pill next to the clock, and every read from Supabase is kept on the laptop (`src/lib/offline-cache.ts`) so the panels fill with their last data at once. The helper is on `127.0.0.1`, which the content policy allows (ports 47800 to 47810), so Controls and Audio work as usual. Supabase reconnects by itself when the network is back.
- **Checks:** `npm test`, `npm run test:helper`, `node scripts/test-card29.mjs` (real helper, online) and `node scripts/test-card29.mjs --wifi-off` (also turns the Wi-Fi off from the tile, repeats everything, opens Halo from a stored session with no network, and turns the Wi-Fi back on; a watchdog restores it after 4 minutes if the script dies).
