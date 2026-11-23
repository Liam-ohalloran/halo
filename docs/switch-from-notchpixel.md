# Switching from NotchPixel to Halo (card 28)

Halo is now its own Windows app. Do this once, in order. Take your time: NotchPixel stays installed until every box below is ticked.

## 1. Install Halo

1. Open [the latest release](https://github.com/Liam-ohalloran/halo/releases/latest) and download **Halo-Setup.exe**.
2. Run it. Windows SmartScreen warns once, because Halo has no paid code signing. Click **More info**, then **Run anyway**.
3. Halo opens at the top of the screen. Sign in with your email and password.

Halo starts with Windows from now on (Settings, Laptop, "Launch at startup" turns it off).

## 2. Updates

Halo looks for an update about 20 seconds after it starts. When there is one, open Settings, Laptop. The Halo row says "Halo 0.x.0 is ready". Press **Install and restart**. You can also press **Check for updates** there, or in the tray menu.

Updates are signed. Halo only installs one that matches its own public key, so nobody else can send a build to your laptop.

## 3. The parity checklist

Everything NotchPixel does has to work in Halo before you remove NotchPixel. The middle column says where it was built. The last column is for you: tick it after you have tried it on your own laptop.

| Check on your laptop | Built in | Tried |
|---|---|---|
| Hover over the island, or click it, and it opens. Move away and it closes | Card 25 | [ ] |
| Island style (floating capsule) and Notch style (attached to the top). Settings, Laptop | Cards 25 and 27 | [ ] |
| Always on top, and it never steals the keyboard from what you are typing in | Card 25 | [ ] |
| Click through: clicks beside the island reach the app underneath | Card 25 | [ ] |
| Hides while a game or full screen video is on that screen, and comes back after | Card 25 | [ ] |
| Picks a monitor (Settings, Laptop, Screen) | Cards 25 and 27 | [ ] |
| Works at your display scale (tested at 150%, try others) | Card 25 | [ ] |
| Media for any app: Spotify, and YouTube in Chrome, show in Music | Cards 24 and 26 | [ ] |
| Scroll on the closed island changes the volume | Card 26 | [ ] |
| Volume and brightness pills appear when you change them | Card 17 | [ ] |
| Windows notifications show as banners | Cards 18 and 26 | [ ] |
| Phone notifications (Phone Link) show as banners | Card 26 | [ ] |
| Clipboard history (Shelf, Clip chip), and it can be switched off in Settings, Alerts | Cards 26 and 27 | [ ] |
| File shelf (Shelf tab): drop a file, copy a link | Card 22 | [ ] |
| Timer (Study tab) | Card 16 | [ ] |
| Weather (Home tab) | Card 16 | [ ] |
| Battery: the charging pill, and Battery on the Controls tab | Cards 17 and 24 | [ ] |
| Launches at startup | Card 25 | [ ] |
| Hotkey opens and closes it (Settings, Laptop shows which one it got) | Cards 25 and 27 | [ ] |
| Settings for look, blur, glow, animation speed and which tabs show | Card 27 | [ ] |

Anything in NotchPixel's own settings pages that is missing from this list: write it down here and tell Claude, so it can be built before you switch.

- [ ] Anything else NotchPixel does that you use: ______________________

## 4. Remove Halo from NotchPixel

Only when every box above is ticked:

1. Open NotchPixel's settings, then its websites ("Add a site").
2. Remove the Halo entry (`https://liam-ohalloran.github.io/halo/`).
3. Quit NotchPixel and uninstall it from Windows Settings, Apps. You can keep it installed for a week first if you would rather.

The phone is not affected. Halo on your iPhone is still the home screen app, and it reads the same settings row, so the tabs you pinned and the switches you set follow you there.

## If something goes wrong

- **The installer says "Windows protected your PC".** Click More info, then Run anyway.
- **An update says it did not install.** Your current Halo is untouched. Try again in a minute, or download Halo-Setup.exe again and run it over the top (your settings are kept).
- **Halo is not at the top of the screen.** Look in the tray (the small arrow by the clock) for the Halo icon, then Open. If it is not there, start Halo from the Start menu.
