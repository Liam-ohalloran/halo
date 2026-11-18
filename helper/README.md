# Halo helper

A small Python program that runs on Liam's Windows laptop and gives Halo safe access to music and laptop controls. Spec: `HALO.md` section 2b.

- Listens on `http://127.0.0.1:47800` only.
- CORS allows only `https://liam-ohalloran.github.io` and `http://localhost:5173`, with the Private Network Access header.
- Every request needs the `X-Halo-Token` header. No token or a wrong one gets `401`.
- The token is created on first run in `%APPDATA%\HaloHelper\token.txt`.

## Install

```powershell
powershell -ExecutionPolicy Bypass -File helper\install.ps1
```

This creates a Python 3.12 venv in `helper\.venv`, installs the requirements, registers a Task Scheduler task called `HaloHelper` that starts at logon, and starts it now. A tray icon appears.

Remove it with:

```powershell
powershell -ExecutionPolicy Bypass -File helper\uninstall.ps1
```

## Pair with Halo

Right-click the tray icon, choose **Copy pairing token**, then paste it in Halo, Settings, Pair helper.

## Try it

```powershell
$t = (Get-Content "$env:APPDATA\HaloHelper\token.txt").Trim()
curl.exe -H "X-Halo-Token: $t" http://127.0.0.1:47800/media
curl.exe -i http://127.0.0.1:47800/media   # 401, no token
```

## Endpoints

| Method and path | Body | Returns |
|---|---|---|
| `GET /status` | | `{ok, version, time, not_supported}` |
| `GET /media` | | `{available, title, artist, album, source, playing, position, duration, has_art}` (seconds) |
| `GET /media/art` | | PNG, or 404 when there is none |
| `POST /media/{play,pause,toggle,next,previous}` | | `{ok}` |
| `POST /media/seek` | `{"seconds": 42}` | `{ok}` |
| `GET /volume`, `POST /volume` | `{"level": 0-100}` | `{level, muted}` |
| `POST /mute` | `{"muted": true}` or empty to toggle | `{level, muted}` |
| `GET /brightness`, `POST /brightness` | `{"level": 0-100}` | `{level}` |
| `GET /battery` | | `{present, percent, charging, minutes_left}` |
| `GET /wifi`, `POST /wifi` | `{"enabled": true}` | `{enabled, connected, ssid}` |
| `GET /bluetooth`, `POST /bluetooth` | `{"enabled": true}` | `{enabled, connected_device}` |
| `GET /power-mode`, `POST /power-mode` | `{"mode": "battery\|balanced\|performance"}` | `{mode}` |
| `GET /events` | | server sent events `media`, `volume`, `battery` (each carries the same JSON as its GET) |

When a feature can't work (no brightness control, no Bluetooth radio), the endpoint returns `503` with `{"detail": "<plain sentence>"}`.

Night light and Focus aren't supported (no reliable public Windows API). They are listed in `/status` under `not_supported`.

### `/events`

The browser's `EventSource` can't send the token header, so read `/events` with `fetch()` and a stream reader. The stream sends `media` only when the track, play state or duration changes, or the position jumps (a seek). Halo should advance the position itself between events. A `: keep-alive` comment goes out every second when nothing changed.

## Tests

```powershell
helper\.venv\Scripts\python.exe -m pytest helper\tests
```

Covers the token check, CORS and the Private Network Access preflight. The Windows backends need a real laptop, so they are checked by hand.

## Notes

- Everything else on the laptop is untouched. The helper never reads files, messages or accounts.
- The tray menu has **Copy pairing token** and **Quit**.
- Run `python halo_helper.py --no-tray` to run without the tray icon while debugging.
