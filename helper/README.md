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
| `GET /events` | | server sent events: `media`, `volume` (level and mute), `battery`, `brightness`, `mic`, `mic_level`, `wifi`, `bluetooth`, `power`, `output`, `apps`, and more (each carries the same JSON as its GET) |
| `GET /latency?n=15` | | how long the hot paths take inside the helper: `{target_ms, runs, results: {volume_get: {median_ms, p95_ms, max_ms}, ...}, slow, ok}`. Changes nothing (a set call sends the value that is already there) |

When a feature can't work (no brightness control, no Bluetooth radio), the endpoint returns `503` with `{"detail": "<plain sentence>"}`.

Night light and Focus aren't supported (no reliable public Windows API). They are listed in `/status` under `not_supported`.

### `/events`

The browser's `EventSource` can't send the token header, so read `/events` with `fetch()` and a stream reader. The stream sends `media` only when the track, play state or duration changes, or the position jumps (a seek). Halo should advance the position itself between events. A `: keep-alive` comment goes out every 5 seconds when nothing changed.

The first pass sends every state, so a page that just connected needs no other request. After that only changes are sent: volume, mute, the mic and its level (`mic_level`, steps of 1/36) and brightness are looked at every 150 ms, the rest (Wi-Fi, Bluetooth, power mode, outputs, the mixer's `apps`, battery, media) every second. Windows notifications are read in their own loop, because reading them takes about a second.

### Speed (card 29)

The hot paths do not start a program and do not rebuild Windows objects on each call (`halo_fast.py`):

- Volume, mute, the mic and the mixer use audio objects made once, on one thread that owns them (`ComLane`). The default device is looked at again once a second, so plugging in headphones is noticed.
- Brightness goes through one kept WMI connection (about 4 ms to read, 7 ms to set), and the monitor's DDC link on a desktop with no laptop panel.
- Power mode is `powrprof.dll` (`PowerGetActiveScheme`, `PowerSetActiveScheme`), Wi-Fi is `wlanapi.dll`. No `powercfg` and no `netsh`.

Measured here, medians in milliseconds, before then after: volume read 102 then 0.3, volume set 202 then 0.4, mute 200 then 0.3, mic 17 then 0.1, brightness read 51 then 4, power mode read 42 then 0.3. `GET /latency` measures it on your own laptop, and `HALO_LIVE=1` makes the pytest suite check it against the 50 ms target.

## Tests

```powershell
helper\.venv\Scripts\python.exe -m pytest helper\tests
```

Covers the token check, CORS and the Private Network Access preflight, the cached audio objects, brightness, power mode, Wi-Fi, `/latency` and the event stream, all with fakes. The Windows backends need a real laptop: `HALO_LIVE=1 helper\.venv\Scripts\python.exe -m pytest helper\tests -k live -s` times them against the 50 ms target.

## Notes

- Everything else on the laptop is untouched. The helper never reads files, messages or accounts.
- The tray menu has **Copy pairing token** and **Quit**.
- Run `python halo_helper.py --no-tray` to run without the tray icon while debugging.

## Inside the Halo desktop app

The desktop app bundles this helper as a sidecar and starts it itself, so nothing here needs installing. It passes `HALO_TOKEN` (from the Windows Credential Manager), `HALO_PORT` and `HALO_NO_TRAY=1`. The old stand alone install above keeps working and can be removed once the app is installed. New in the helper: `/clipboard`, `/notifications/access`, `/notifications/request`, and the events `notification`, `clipboard`, `airplane` and `night`. See `docs/desktop.md`.
