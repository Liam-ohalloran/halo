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

- **One window.** Frameless, transparent, always on top, no taskbar button, never takes focus until the island is open. It sits at the top centre of the chosen monitor and is only as big as the island: the web code measures the island and calls `halo.desktop.setSize(w, h, r)`. The window grows first (with 24 px of room for the open spring), then shrinks back once the island has been still for 700 ms.
- **Click through.** A thread watches the cursor every 30 ms. Anywhere in the window that is not the island (or the stack of alert pills under it), the window ignores the mouse, so clicks reach whatever is underneath. Rounded corners and the ears are click through too. A click through window never sees the mouse leave, so the app tells the page when the pointer enters or leaves, and when a click lands anywhere else (which closes the island).
- **Styles.** Notch is attached to the top edge with the ears. Island floats 6 px below the top as a capsule. Change it in the tray menu or Settings (More tab).
- **Full screen.** Hides while a full screen app (covering the whole monitor, taskbar included) is in front on Halo's monitor, and comes back after.
- **Monitors.** Pick one in the tray or Settings. It follows resolution, scale and monitor changes and wake from sleep (checked once a second).
- **Tray.** Open, Settings, Screen, Style, Launch at startup, Pause for 1 hour, Quit.
- **Launch at startup** is turned on the first time the installed app runs, and after that it is yours to switch (tray or Settings). It stays off in `desktop:dev`.
- **Hotkey.** Ctrl+Alt+Space opens or closes the island. Two other apps on Liam's laptop already own Ctrl+Alt+Space and Ctrl+Alt+H, so the app uses the first free one of Ctrl+Alt+Space, Ctrl+Alt+H, Ctrl+Alt+Shift+H and Ctrl+Alt+F9 and shows it in the tray tooltip. Right now that is Ctrl+Alt+Shift+H.
- **Sign in.** Same Supabase sign-in. The email link opens in the browser, which cannot hand the session to the app, so the app has a "paste the link from the email" box and signs in with the link's one time token.

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
- The tray menu clicks and the sign-in paste flow were not driven by hand.
