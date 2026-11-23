"""Halo helper: a small localhost bridge between Halo (in the browser) and this Windows laptop.

Spec: HALO.md section 2b. Listens on 127.0.0.1:47800 only. Every request needs the
X-Halo-Token header. Read only for everything except the laptop controls Halo asks for.
"""

from __future__ import annotations

import asyncio
import gc
import hmac
import inspect
import io
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from halo_extras import (
    ClipboardHistory,
    Notifications,
    Unavailable,
    probe_airplane,
    probe_night,
    write_clipboard,
)

HOST = "127.0.0.1"
PORT = 47800
VERSION = "1.0.0"

ALLOWED_ORIGINS = [
    "https://liam-ohalloran.github.io",
    "http://localhost:5173",
    # The Halo desktop app (card 25) loads its own files from this origin.
    "http://tauri.localhost",
    "https://tauri.localhost",
]

IS_WINDOWS = sys.platform == "win32"

# ---------------------------------------------------------------------------
# Token
# ---------------------------------------------------------------------------


def token_path() -> Path:
    base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    return Path(base) / "HaloHelper" / "token.txt"


def load_or_create_token(path: Optional[Path] = None) -> str:
    """Return the pairing token, creating a random one on first run."""
    path = path or token_path()
    try:
        existing = path.read_text(encoding="utf-8").strip()
        if existing:
            return existing
    except FileNotFoundError:
        pass
    path.parent.mkdir(parents=True, exist_ok=True)
    token = secrets.token_urlsafe(32)
    path.write_text(token, encoding="utf-8")
    return token


def token_is_valid(supplied: Optional[str], expected: str) -> bool:
    if not supplied:
        return False
    return hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8"))


# ---------------------------------------------------------------------------
# Windows backends. Imported lazily so the API (and tests) load on any machine.
# Each returns plain data or raises Unavailable with a plain sentence.
# ---------------------------------------------------------------------------


def _com_init() -> None:
    if IS_WINDOWS:
        try:
            import comtypes  # type: ignore

            comtypes.CoInitialize()
        except Exception:
            pass


def _com_call(fn, *args):
    """Run a call that uses Windows COM (pycaw, volume and so on) and clean up on the same thread.

    comtypes objects can end up in reference cycles. If Python's garbage collector frees one later, on whichever thread
    happens to be running (the web server's), the COM release happens on the wrong thread and crashes the whole helper
    with an access violation. Collecting here, on the thread that made the objects, releases them where they belong.
    """
    _com_init()
    try:
        return fn(*args)
    finally:
        gc.collect()


def friendly_source(app_id: str) -> str:
    low = (app_id or "").lower()
    known = [
        ("spotify", "Spotify"),
        ("msedge", "Edge"),
        ("chrome", "Chrome"),
        ("firefox", "Firefox"),
        ("brave", "Brave"),
        ("opera", "Opera"),
        ("zunemusic", "Media Player"),
        ("applemusic", "Apple Music"),
        ("itunes", "Apple Music"),
        ("vlc", "VLC"),
        ("youtube", "YouTube Music"),
    ]
    for key, name in known:
        if key in low:
            return name
    name = re.split(r"[!_]", app_id or "")[0]
    name = name.removesuffix(".exe")
    return name or "Unknown"


def pick_session(rows: list[dict]) -> int:
    """Which media session Music shows. `rows` are {app, playing, current}. Returns an index into them.

    Spotify is the default, but only wins while it is playing or nothing else is. A playing session from any other app
    beats a paused Spotify, so YouTube in Chrome shows up. Ties go to the one Windows calls current.
    """
    def spotify(r: dict) -> bool:
        return "spotify" in (r["app"] or "").lower()

    playing = [i for i, r in enumerate(rows) if r["playing"]]
    if playing:
        for i in playing:
            if spotify(rows[i]):
                return i
        for i in playing:
            if rows[i]["current"]:
                return i
        return playing[0]
    for i, r in enumerate(rows):
        if spotify(r):
            return i
    for i, r in enumerate(rows):
        if r["current"]:
            return i
    return 0


class Media:
    """Windows system media controls (GlobalSystemMediaTransportControls)."""

    def __init__(self) -> None:
        self._art_key: Any = None
        self._art_png: Optional[bytes] = None

    async def _session(self):
        if not IS_WINDOWS:
            raise Unavailable("Media controls only work on Windows.")
        from winsdk.windows.media.control import (  # type: ignore
            GlobalSystemMediaTransportControlsSessionManager as Manager,
        )

        mgr = await Manager.request_async()
        return await self._choose(mgr)

    async def _choose(self, mgr):
        """Music follows Spotify when it is there, but anything else that is playing (YouTube in Chrome, a video) shows
        while Spotify is paused. See pick_session."""
        from winsdk.windows.media.control import (  # type: ignore
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
        )

        sessions = list(mgr.get_sessions())
        if not sessions:
            return mgr.get_current_session()
        current = mgr.get_current_session()
        rows = [
            {"app": s.source_app_user_model_id, "playing": s.get_playback_info().playback_status == Status.PLAYING, "current": current is not None and s.source_app_user_model_id == current.source_app_user_model_id}
            for s in sessions
        ]
        return sessions[pick_session(rows)]

    async def info(self) -> dict:
        empty = {
            "available": False,
            "title": "",
            "artist": "",
            "album": "",
            "source": "",
            "playing": False,
            "position": 0.0,
            "duration": 0.0,
            "has_art": False,
        }
        session = await self._session()
        if session is None:
            return empty
        from winsdk.windows.media.control import (  # type: ignore
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
        )

        props = await session.try_get_media_properties_async()
        playback = session.get_playback_info()
        timeline = session.get_timeline_properties()
        playing = playback.playback_status == Status.PLAYING

        duration = max(0.0, (timeline.end_time - timeline.start_time).total_seconds())
        position = timeline.position.total_seconds()
        if playing and timeline.last_updated_time is not None:
            elapsed = (datetime.now(timezone.utc) - timeline.last_updated_time).total_seconds()
            position += max(0.0, elapsed)
        if duration:
            position = min(position, duration)

        key = (props.title, props.artist, props.album_title)
        if key != self._art_key:
            self._art_key = key
            self._art_png = None  # loaded on demand by /media/art
        return {
            "available": True,
            "title": props.title or "",
            "artist": props.artist or "",
            "album": props.album_title or "",
            "source": friendly_source(session.source_app_user_model_id),
            "playing": playing,
            "position": round(position, 2),
            "duration": round(duration, 2),
            "has_art": props.thumbnail is not None,
        }

    async def art(self) -> Optional[bytes]:
        session = await self._session()
        if session is None:
            return None
        props = await session.try_get_media_properties_async()
        key = (props.title, props.artist, props.album_title)
        if key == self._art_key and self._art_png is not None:
            return self._art_png
        if props.thumbnail is None:
            return None
        from winsdk.windows.storage.streams import DataReader  # type: ignore

        stream = await props.thumbnail.open_read_async()
        size = stream.size
        if not size:
            return None
        reader = DataReader(stream)
        await reader.load_async(size)
        raw = bytearray(size)
        reader.read_bytes(raw)

        from PIL import Image

        out = io.BytesIO()
        Image.open(io.BytesIO(bytes(raw))).convert("RGBA").save(out, format="PNG")
        self._art_key = key
        self._art_png = out.getvalue()
        return self._art_png

    async def control(self, action: str) -> bool:
        session = await self._session()
        if session is None:
            raise Unavailable("Nothing is playing.")
        calls = {
            "play": session.try_play_async,
            "pause": session.try_pause_async,
            "toggle": session.try_toggle_play_pause_async,
            "next": session.try_skip_next_async,
            "previous": session.try_skip_previous_async,
        }
        return bool(await calls[action]())

    async def seek(self, seconds: float) -> bool:
        session = await self._session()
        if session is None:
            raise Unavailable("Nothing is playing.")
        return bool(await session.try_change_playback_position_async(int(seconds * 10_000_000)))


def _endpoint_volume():
    if not IS_WINDOWS:
        raise Unavailable("Volume only works on Windows.")
    _com_init()
    from pycaw.pycaw import AudioUtilities  # type: ignore

    dev = AudioUtilities.GetSpeakers()
    if hasattr(dev, "EndpointVolume"):  # newer pycaw
        return dev.EndpointVolume
    from comtypes import CLSCTX_ALL  # type: ignore
    from ctypes import POINTER, cast
    from pycaw.pycaw import IAudioEndpointVolume  # type: ignore

    iface = dev.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
    return cast(iface, POINTER(IAudioEndpointVolume))


def get_volume() -> dict:
    ev = _endpoint_volume()
    return {"level": round(ev.GetMasterVolumeLevelScalar() * 100), "muted": bool(ev.GetMute())}


def set_volume(level: int) -> dict:
    ev = _endpoint_volume()
    ev.SetMasterVolumeLevelScalar(max(0, min(100, level)) / 100, None)
    return get_volume()


def set_mute(muted: Optional[bool]) -> dict:
    ev = _endpoint_volume()
    ev.SetMute(int(not ev.GetMute()) if muted is None else int(muted), None)
    return get_volume()


def get_brightness() -> dict:
    try:
        import screen_brightness_control as sbc  # type: ignore

        values = sbc.get_brightness()
    except Exception:
        raise Unavailable("This screen doesn't allow brightness changes.")
    if not values:
        raise Unavailable("This screen doesn't allow brightness changes.")
    return {"level": int(values[0])}


def set_brightness(level: int) -> dict:
    try:
        import screen_brightness_control as sbc  # type: ignore

        sbc.set_brightness(max(0, min(100, level)))
    except Exception:
        raise Unavailable("This screen doesn't allow brightness changes.")
    return get_brightness()


def get_battery() -> dict:
    import psutil

    b = psutil.sensors_battery()
    if b is None:
        return {"present": False, "percent": None, "charging": False, "minutes_left": None}
    secs = b.secsleft
    minutes = None if secs in (psutil.POWER_TIME_UNLIMITED, psutil.POWER_TIME_UNKNOWN) else round(secs / 60)
    return {
        "present": True,
        "percent": round(b.percent),
        "charging": bool(b.power_plugged),
        "minutes_left": minutes,
    }


async def _radio(kind_name: str):
    if not IS_WINDOWS:
        raise Unavailable("Radios only work on Windows.")
    from winsdk.windows.devices.radios import Radio, RadioAccessStatus, RadioKind  # type: ignore

    access = await Radio.request_access_async()
    if access != RadioAccessStatus.ALLOWED:
        raise Unavailable("Windows won't let Halo change this. Check Settings, Privacy.")
    kind = getattr(RadioKind, kind_name)
    for radio in await Radio.get_radios_async():
        if radio.kind == kind:
            return radio
    raise Unavailable("This laptop has no " + ("Wi-Fi" if kind_name == "WI_FI" else "Bluetooth") + " radio.")


async def _set_radio(kind_name: str, enabled: bool) -> None:
    from winsdk.windows.devices.radios import RadioState  # type: ignore

    radio = await _radio(kind_name)
    await radio.set_state_async(RadioState.ON if enabled else RadioState.OFF)


def _run(cmd: list[str]) -> str:
    return subprocess.run(
        cmd, capture_output=True, text=True, timeout=10, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
    ).stdout


async def get_wifi() -> dict:
    from winsdk.windows.devices.radios import RadioState  # type: ignore

    radio = await _radio("WI_FI")
    enabled = radio.state == RadioState.ON
    ssid = None
    if enabled:
        out = await run_in_threadpool(_run, ["netsh", "wlan", "show", "interfaces"])
        m = re.search(r"^\s*SSID\s*:\s*(.+)$", out, re.MULTILINE)
        ssid = m.group(1).strip() if m else None
    return {"enabled": enabled, "connected": ssid is not None, "ssid": ssid}


async def get_bluetooth() -> dict:
    from winsdk.windows.devices.radios import RadioState  # type: ignore

    radio = await _radio("BLUETOOTH")
    enabled = radio.state == RadioState.ON
    device = None
    if enabled:
        try:
            from winsdk.windows.devices.bluetooth import (  # type: ignore
                BluetoothConnectionStatus,
                BluetoothDevice,
            )
            from winsdk.windows.devices.enumeration import DeviceInformation  # type: ignore

            selector = BluetoothDevice.get_device_selector_from_connection_status(
                BluetoothConnectionStatus.CONNECTED
            )
            found = await DeviceInformation.find_all_async_aqs_filter(selector)
            if len(found):
                device = found[0].name
        except Exception:
            device = None
    return {"enabled": enabled, "connected_device": device}


POWER_SCHEMES = {
    "battery": "a1841308-3541-4fab-bc81-f71556f20b4a",
    "balanced": "381b4222-f694-41f0-9685-ff5bb260df2e",
    "performance": "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
}


def get_power_mode() -> dict:
    if not IS_WINDOWS:
        raise Unavailable("Power modes only work on Windows.")
    out = _run(["powercfg", "/getactivescheme"]).lower()
    for mode, guid in POWER_SCHEMES.items():
        if guid in out:
            return {"mode": mode}
    return {"mode": "balanced"}


def set_power_mode(mode: str) -> dict:
    if not IS_WINDOWS:
        raise Unavailable("Power modes only work on Windows.")
    r = subprocess.run(
        ["powercfg", "/setactive", POWER_SCHEMES[mode]],
        capture_output=True,
        text=True,
        timeout=10,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if r.returncode != 0:
        raise Unavailable("Windows doesn't have that power mode on this laptop.")
    return {"mode": mode}


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


class VolumeBody(BaseModel):
    level: int = Field(ge=0, le=100)


class MuteBody(BaseModel):
    muted: Optional[bool] = None


class SeekBody(BaseModel):
    seconds: float = Field(ge=0)


class EnabledBody(BaseModel):
    enabled: bool


class ClipboardEnabledBody(BaseModel):
    on: bool


class PowerBody(BaseModel):
    mode: str = Field(pattern="^(battery|balanced|performance)$")


def _guard(fn, *args):
    """Run a blocking backend call off the event loop, turning Unavailable into a 503."""

    def call():
        return _com_call(fn, *args)

    async def go():
        try:
            return await run_in_threadpool(call)
        except Unavailable as e:
            raise HTTPException(503, str(e))

    return go()


async def _guard_async(coro):
    try:
        return await coro
    except Unavailable as e:
        raise HTTPException(503, str(e))


# ---------------------------------------------------------------------------
# Change probes for /events (card 17). Read only: they look, they never change a setting.
# Each returns the same shape the matching GET endpoint uses, or raises Unavailable.
# ---------------------------------------------------------------------------


def _capture_volume():
    if not IS_WINDOWS:
        raise Unavailable("Mic only works on Windows.")
    _com_init()
    from pycaw.pycaw import AudioUtilities  # type: ignore

    dev = AudioUtilities.GetMicrophone()
    if hasattr(dev, "EndpointVolume"):
        return dev.EndpointVolume
    from comtypes import CLSCTX_ALL  # type: ignore
    from ctypes import POINTER, cast
    from pycaw.pycaw import IAudioEndpointVolume  # type: ignore

    return cast(dev.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None), POINTER(IAudioEndpointVolume))


def probe_mic() -> dict:
    return {"muted": bool(_capture_volume().GetMute())}


def probe_caps() -> dict:
    if not IS_WINDOWS:
        raise Unavailable("Caps lock only works on Windows.")
    import ctypes

    return {"on": bool(ctypes.windll.user32.GetKeyState(0x14) & 1)}


def output_kind(name: str) -> str:
    n = name.lower()
    if any(w in n for w in ("headphone", "headset", "bluetooth", "buds", "airpods", "wh-")):
        return "headphones"
    if any(w in n for w in ("monitor", "hdmi", "display", "nvidia", "displayport")):
        return "monitor"
    return "speakers"


def probe_output() -> dict:
    if not IS_WINDOWS:
        raise Unavailable("Audio output only works on Windows.")
    _com_init()
    from pycaw.pycaw import AudioUtilities  # type: ignore

    dev = AudioUtilities.GetSpeakers()
    name = getattr(dev, "FriendlyName", None)
    if not name:
        dev_id = dev.GetId()
        for d in AudioUtilities.GetAllDevices():
            if d.id == dev_id:
                name = d.FriendlyName
    if not name:
        raise Unavailable("No audio output.")
    return {"name": name, "kind": output_kind(name)}


def probe_brightness() -> dict:
    return get_brightness()


def probe_power() -> dict:
    return get_power_mode()


# (event name, run every N polls, probe, needs await)
EXTRA_PROBES: list[tuple[str, int, Any, bool]] = [
    ("brightness", 2, probe_brightness, False),
    ("mic", 1, probe_mic, False),
    ("caps", 1, probe_caps, False),
    ("output", 3, probe_output, False),
    ("wifi", 5, get_wifi, True),
    ("bluetooth", 5, get_bluetooth, True),
    ("power", 5, probe_power, False),
    # Card 26: pills when airplane mode or night light changes. Read only.
    ("airplane", 3, probe_airplane, True),
    ("night", 3, probe_night, False),
]


async def collect_extra(last: dict, ticks: int, probes=None) -> dict:
    """Runs the probes that are due and returns only the ones whose answer changed since `last` (which it updates)."""
    changed: dict[str, Any] = {}
    for name, every, probe, is_async in probes if probes is not None else EXTRA_PROBES:
        if ticks % every:
            continue
        try:
            if is_async:
                value = await probe()
            else:
                value = await run_in_threadpool(_com_call, probe)
        except Exception:
            continue  # not available on this laptop right now: say nothing
        if value != last.get(name):
            last[name] = value
            changed[name] = value
    return changed



def create_app(token: str, media: Optional[Media] = None, poll_seconds: float = 1.0, notifications: Optional[Notifications] = None, clipboard: Optional[ClipboardHistory] = None) -> FastAPI:
    media = media or Media()
    notifications = notifications or Notifications()
    clipboard = clipboard or ClipboardHistory()

    def require_token(x_halo_token: Optional[str] = Header(default=None)) -> None:
        if not token_is_valid(x_halo_token, token):
            raise HTTPException(401, "Missing or wrong Halo token.")

    app = FastAPI(title="Halo helper", version=VERSION, dependencies=[Depends(require_token)])
    # The CORS middleware answers preflights itself (no token needed) and also decorates
    # the 401 responses, so the browser shows the real status instead of a CORS error.
    cors_options: dict[str, Any] = {}
    # Newer Starlette handles Private Network Access itself, and answers 400 to a
    # PNA preflight unless this is on. Older versions need our own middleware below.
    native_pna = "allow_private_network" in inspect.signature(CORSMiddleware.__init__).parameters
    if native_pna:
        cors_options["allow_private_network"] = True
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["X-Halo-Token", "Content-Type"],
        max_age=600,
        **cors_options,
    )
    if not native_pna:
        app.add_middleware(PrivateNetworkMiddleware)

    @app.get("/status")
    async def status():
        return {
            "ok": True,
            "version": VERSION,
            "time": datetime.now(timezone.utc).isoformat(),
            "not_supported": ["focus", "keyboard_light"],
        }

    @app.get("/media")
    async def get_media():
        return await _guard_async(media.info())

    @app.get("/media/art")
    async def get_art():
        png = await _guard_async(media.art())
        if png is None:
            raise HTTPException(404, "No album art.")
        return Response(png, media_type="image/png", headers={"Cache-Control": "no-store"})

    @app.post("/media/seek")
    async def post_seek(body: SeekBody):
        return {"ok": await _guard_async(media.seek(body.seconds))}

    @app.post("/media/{action}")
    async def post_media(action: str):
        if action not in ("play", "pause", "toggle", "next", "previous"):
            raise HTTPException(404, "Unknown media action.")
        return {"ok": await _guard_async(media.control(action))}

    @app.get("/volume")
    async def volume_get():
        return await _guard(get_volume)

    @app.post("/volume")
    async def volume_post(body: VolumeBody):
        return await _guard(set_volume, body.level)

    @app.post("/mute")
    async def mute_post(body: Optional[MuteBody] = None):
        return await _guard(set_mute, body.muted if body else None)

    @app.get("/brightness")
    async def brightness_get():
        return await _guard(get_brightness)

    @app.post("/brightness")
    async def brightness_post(body: VolumeBody):
        return await _guard(set_brightness, body.level)

    @app.get("/battery")
    async def battery_get():
        return await _guard(get_battery)

    @app.get("/wifi")
    async def wifi_get():
        return await _guard_async(get_wifi())

    @app.post("/wifi")
    async def wifi_post(body: EnabledBody):
        await _guard_async(_set_radio("WI_FI", body.enabled))
        return await _guard_async(get_wifi())

    @app.get("/bluetooth")
    async def bluetooth_get():
        return await _guard_async(get_bluetooth())

    @app.post("/bluetooth")
    async def bluetooth_post(body: EnabledBody):
        await _guard_async(_set_radio("BLUETOOTH", body.enabled))
        return await _guard_async(get_bluetooth())

    @app.get("/power-mode")
    async def power_get():
        return await _guard(get_power_mode)

    @app.post("/power-mode")
    async def power_post(body: PowerBody):
        return await _guard(set_power_mode, body.mode)

    @app.get("/notifications/access")
    async def notifications_access():
        return {"access": await notifications.access()}

    @app.post("/notifications/request")
    async def notifications_request():
        return {"access": await _guard_async(notifications.request())}

    @app.get("/clipboard")
    async def clipboard_list():
        return {"revision": clipboard.revision, "items": clipboard.snapshot(), "enabled": clipboard.enabled}

    @app.post("/clipboard/clear")
    async def clipboard_clear():
        clipboard.clear()
        return {"ok": True}

    @app.post("/clipboard/enabled")
    async def clipboard_enabled(body: ClipboardEnabledBody):
        """Card 27: Settings switches the clipboard history on or off. Off, it also forgets what it kept."""
        clipboard.set_enabled(body.on)
        return {"enabled": clipboard.enabled}

    @app.post("/clipboard/{clip_id}/copy")
    async def clipboard_copy(clip_id: str):
        clip = clipboard.get(clip_id)
        if clip is None:
            raise HTTPException(404, "That item is gone.")
        await _guard(write_clipboard, clip)
        return {"ok": True}

    @app.get("/events")
    async def events():
        """Server sent events. Emits `media`, `volume`, `battery`, `brightness`, `mic`, `caps`, `output`, `wifi`, `bluetooth`, `power`, `airplane`, `night` and `clipboard` when they change, and `notification` for each new Windows notification.

        EventSource can't send headers, so Halo reads this with fetch() and a stream reader.
        """

        async def stream():
            last: dict[str, Any] = {}
            expected_pos: Optional[float] = None
            yield "retry: 2000\n\n"
            ticks = 0
            while True:
                snapshots: dict[str, Any] = {}
                try:
                    m = await media.info()
                    # Position moves every second, so only a jump counts as a change.
                    jumped = expected_pos is not None and abs(m["position"] - expected_pos) > 2.5
                    expected_pos = m["position"] + (poll_seconds if m["playing"] else 0)
                    core = {k: m[k] for k in ("available", "title", "artist", "album", "source", "playing", "duration", "has_art")}
                    if core != last.get("media_core") or jumped:
                        last["media_core"] = core
                        snapshots["media"] = m
                except Exception:
                    pass
                try:
                    v = await run_in_threadpool(_com_call, get_volume)
                    if v != last.get("volume"):
                        last["volume"] = v
                        snapshots["volume"] = v
                except Exception:
                    pass
                if ticks % 5 == 0:  # battery changes slowly
                    try:
                        b = get_battery()
                        if b != last.get("battery"):
                            last["battery"] = b
                            snapshots["battery"] = b
                    except Exception:
                        pass
                snapshots.update(await collect_extra(last, ticks))
                if clipboard.revision != last.get("clip_rev"):
                    last["clip_rev"] = clipboard.revision
                    snapshots["clipboard"] = {"revision": clipboard.revision}
                new_notes: list[dict] = []
                try:
                    new_notes = await notifications.poll()
                except Exception:
                    pass
                ticks += 1
                for name, data in snapshots.items():
                    yield f"event: {name}\ndata: {json.dumps(data)}\n\n"
                for n in new_notes:
                    yield f"event: notification\ndata: {json.dumps(n)}\n\n"
                if not snapshots and not new_notes:
                    yield ": keep-alive\n\n"
                await asyncio.sleep(poll_seconds)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return app


class PrivateNetworkMiddleware:
    """Adds Access-Control-Allow-Private-Network to preflights that ask for it.

    Chrome sends `Access-Control-Request-Private-Network: true` when a public page
    (GitHub Pages) calls a localhost address. Without this header the call is blocked.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "OPTIONS":
            return await self.app(scope, receive, send)
        headers = {k.lower(): v for k, v in scope["headers"]}
        asks = headers.get(b"access-control-request-private-network", b"").lower() == b"true"
        origin = headers.get(b"origin", b"").decode()

        async def send_wrapper(message):
            if message["type"] == "http.response.start" and asks and origin in ALLOWED_ORIGINS:
                message.setdefault("headers", [])
                message["headers"] = list(message["headers"]) + [
                    (b"access-control-allow-private-network", b"true")
                ]
            await send(message)

        await self.app(scope, receive, send_wrapper)


# ---------------------------------------------------------------------------
# Tray icon and entry point
# ---------------------------------------------------------------------------


def _port_free(port: int = PORT) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((HOST, port)) != 0


def app_config(env: Optional[dict] = None) -> dict:
    """Settings the Halo desktop app passes in (card 26). HALO_TOKEN is the pairing token, which the app keeps in the
    Windows Credential Manager, so the helper does not write one to disk. HALO_PORT is the port the app found free.
    HALO_NO_TRAY=1 hides the tray icon (the app is the tray). With none of them it behaves as the stand alone helper."""
    env = os.environ if env is None else env
    token = (env.get("HALO_TOKEN") or "").strip() or None
    try:
        port = int(env.get("HALO_PORT") or PORT)
    except ValueError:
        port = PORT
    return {"token": token, "port": port, "no_tray": env.get("HALO_NO_TRAY") == "1", "app": token is not None}


def _copy_to_clipboard(text: str) -> None:
    subprocess.run(["clip"], input=text.encode("utf-16le"), check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def _tray_image():
    from PIL import Image, ImageDraw

    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((2, 2, 62, 62), radius=16, fill=(0, 0, 0, 255))
    d.ellipse((14, 14, 50, 50), outline=(255, 181, 71, 255), width=5)  # Halo gold ring
    return img


def main() -> int:
    # pythonw.exe (no console) leaves stdout and stderr as None, which crashes uvicorn's logging.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")
    cfg = app_config()
    if cfg["app"]:
        # The app keeps the helper's output in a log. A native crash (an access violation) then says where it happened.
        import faulthandler

        faulthandler.enable()
    if not _port_free(cfg["port"]):
        return 0  # already running
    import uvicorn

    token = cfg["token"] or load_or_create_token()
    clipboard = ClipboardHistory()
    app = create_app(token, clipboard=clipboard)
    server = uvicorn.Server(uvicorn.Config(app, host=HOST, port=cfg["port"], log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    clipboard.start()

    if "--no-tray" in sys.argv or cfg["no_tray"]:
        thread.join()
        return 0

    import pystray

    def copy_token(icon, item):
        _copy_to_clipboard(token)
        icon.notify("Pairing token copied. Paste it in Halo, Settings, Pair helper.", "Halo helper")

    def quit_app(icon, item):
        server.should_exit = True
        icon.stop()

    icon = pystray.Icon(
        "HaloHelper",
        _tray_image(),
        "Halo helper",
        menu=pystray.Menu(
            pystray.MenuItem("Copy pairing token", copy_token),
            pystray.MenuItem("Quit", quit_app),
        ),
    )
    icon.run()
    server.should_exit = True
    thread.join(timeout=5)
    return 0


if __name__ == "__main__":
    sys.exit(main())
