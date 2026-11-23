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
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import halo_fast
from halo_fast import (
    AUDIO,
    DISPLAY,
    POWER_SCHEMES,
    mode_for_guid,
    power_get_active_guid,
    power_set_active_guid,
    summarise,
)
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


# Hot paths (card 29). The backends live in halo_fast.py: cached Windows objects, each lane on one thread that owns them.
_audio = halo_fast.audio
_brightness = halo_fast.brightness
_wlan = halo_fast.wlan


def _need_windows(what: str) -> None:
    if not IS_WINDOWS:
        raise Unavailable(f"{what} only works on Windows.")


def get_volume() -> dict:
    _need_windows("Volume")
    return _audio.get_volume()


def set_volume(level: int) -> dict:
    _need_windows("Volume")
    return _audio.set_volume(level)


def set_mute(muted: Optional[bool]) -> dict:
    _need_windows("Volume")
    return _audio.set_mute(muted)


def get_brightness() -> dict:
    return _brightness.get()


def set_brightness(level: int) -> dict:
    return _brightness.set(level)


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


async def get_wifi() -> dict:
    """Radio and network straight from Windows' WLAN service (wlanapi), no netsh. A laptop the WLAN service does not know
    falls back to the Windows radio list, which can say on or off but not the network name."""
    _need_windows("Radios")
    found = await run_in_threadpool(_wlan.read)
    if found is not None:
        return found
    from winsdk.windows.devices.radios import RadioState  # type: ignore

    radio = await _radio("WI_FI")
    enabled = radio.state == RadioState.ON
    return {"enabled": enabled, "connected": False, "ssid": None}


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


def get_power_mode() -> dict:
    _need_windows("Power modes")
    return {"mode": mode_for_guid(power_get_active_guid())}


def set_power_mode(mode: str) -> dict:
    _need_windows("Power modes")
    power_set_active_guid(POWER_SCHEMES[mode])
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


class AppVolumeBody(BaseModel):
    level: int = Field(ge=0, le=100)


class LaunchBody(BaseModel):
    id: str = Field(min_length=1, max_length=300)


class OutputBody(BaseModel):
    id: str = Field(min_length=1, max_length=300)


class UrlBody(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


class PowerBody(BaseModel):
    mode: str = Field(pattern="^(battery|balanced|performance)$")


# Which thread runs which call. The audio lane owns the cached audio objects, the display lane owns WMI, and the devices lane
# takes the slow device list, so a slow call never queues in front of a volume tap. Plain calls need no COM at all.
_DEVICES = halo_fast.ComLane("devices")
_PLAIN: set = set()
_LANES: dict = {}


def _register_lanes() -> None:
    _PLAIN.update({get_battery, get_power_mode, set_power_mode})
    for fn in (get_volume, set_volume, set_mute, mic_state, set_mic_mute, probe_mic, probe_output, list_app_volumes, set_app_volume):
        _LANES[fn] = AUDIO
    for fn in (get_brightness, set_brightness):
        _LANES[fn] = DISPLAY
    for fn in (list_outputs, set_default_output):
        _LANES[fn] = _DEVICES


def _guard(fn, *args):
    """Run a blocking backend call off the event loop, turning Unavailable into a 503."""
    lane = _LANES.get(fn)

    async def go():
        try:
            if lane is not None:
                return await lane.run(fn, *args)
            if fn in _PLAIN:
                return await run_in_threadpool(fn, *args)
            return await run_in_threadpool(_com_call, fn, *args)
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


def probe_mic() -> dict:
    _need_windows("Mic")
    return {"muted": _audio.mic_muted()}


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
    _need_windows("Audio output")
    name = _audio.output_name()
    return {"name": name, "kind": output_kind(name)}


# ---------------------------------------------------------------------------
# Card 24: per app volume, the microphone, audio outputs and launching things
# ---------------------------------------------------------------------------


def merge_sessions(rows: list) -> list:
    """One row per app. Chrome has a session per tab, so rows with the same name are folded into one: the loudest level wins
    and it counts as muted only when every one of them is. `rows` are (name, level 0 to 100, muted)."""
    out: dict = {}
    for name, level, muted in rows:
        key = name.lower()
        row = out.get(key)
        if row is None:
            out[key] = {"id": key, "name": name, "level": level, "muted": bool(muted)}
        else:
            row["level"] = max(row["level"], level)
            row["muted"] = row["muted"] and bool(muted)
    return sorted(out.values(), key=lambda r: (-r["level"], r["name"].lower()))


def pretty_app(process: str) -> str:
    base = process[:-4] if process.lower().endswith(".exe") else process
    return base[:1].upper() + base[1:]


def _app_sessions():
    """(display name, SimpleAudioVolume) for every app that has an audio session right now."""
    _need_windows("The app mixer")
    return [(pretty_app(proc), vol) for proc, vol in _audio.sessions()]


def list_app_volumes() -> dict:
    rows = [(name, round(v.GetMasterVolume() * 100), bool(v.GetMute())) for name, v in _app_sessions()]
    return {"apps": merge_sessions(rows)}


def set_app_volume(app_id: str, level: int) -> dict:
    hit = False
    for name, v in _app_sessions():
        if name.lower() == app_id.lower():
            v.SetMasterVolume(max(0, min(100, level)) / 100, None)
            hit = True
    if not hit:
        raise Unavailable("That app isn't playing sound right now.")
    return list_app_volumes()


def mic_state() -> dict:
    _need_windows("The microphone")
    return _audio.mic_state()


def set_mic_mute(muted: Optional[bool]) -> dict:
    _need_windows("The microphone")
    return _audio.set_mic_mute(muted)


def _render_devices() -> list:
    """Active playback devices only (no microphones): [(id, name)]."""
    from pycaw.constants import DEVICE_STATE, EDataFlow  # type: ignore
    from pycaw.pycaw import AudioUtilities  # type: ignore

    seen, out = set(), []
    for d in AudioUtilities.GetAllDevices(data_flow=EDataFlow.eRender.value, device_state=DEVICE_STATE.ACTIVE.value):
        if d.FriendlyName and d.id not in seen:
            seen.add(d.id)
            out.append((d.id, d.FriendlyName))
    return out


def shape_outputs(devices: list, current_id: str) -> dict:
    """The Audio tab's list. `devices` is [(id, name)]. The device in use comes first, the rest keep Windows' order."""
    rows = [{"id": i, "name": n, "kind": output_kind(n), "current": i == current_id} for i, n in devices]
    rows.sort(key=lambda r: not r["current"])
    cur = next((r["name"] for r in rows if r["current"]), rows[0]["name"] if rows else "")
    return {"current": cur, "outputs": rows, "can_switch": len(rows) > 1}


_OUTPUTS_TTL = 5.0
_outputs_cache: dict = {"at": 0.0, "id": None, "value": None}


def list_outputs() -> dict:
    """Playback devices. Reading their names is slow (Windows' property store), so the list is kept for a few seconds and
    thrown away when the default device changes or Halo switches it. Runs on its own lane, never in front of a volume tap."""
    if not IS_WINDOWS:
        raise Unavailable("Audio outputs only work on Windows.")
    from pycaw.pycaw import AudioUtilities  # type: ignore

    spk = AudioUtilities.GetSpeakers()
    cur_id = getattr(spk, "id", None) or spk.GetId()
    c = _outputs_cache
    if c["value"] is not None and c["id"] == cur_id and time.monotonic() - c["at"] < _OUTPUTS_TTL:
        return c["value"]
    devices = _render_devices()
    if cur_id not in [i for i, _ in devices]:
        devices.insert(0, (cur_id, getattr(spk, "FriendlyName", None) or "Speakers"))
    value = shape_outputs(devices, cur_id)
    c.update(at=time.monotonic(), id=cur_id, value=value)
    return value


def set_default_output(device_id: str, switch=None, devices=None) -> dict:
    """Make a playback device the default for apps and for media (the IPolicyConfig SetDefaultEndpoint call EarTrumpet and
    SoundSwitch use). Only a device Windows lists as an active output is accepted. Any failure is a plain sentence."""
    if not IS_WINDOWS and switch is None:
        raise Unavailable("Audio outputs only work on Windows.")
    if switch is None:
        _com_init()
    try:
        known = devices if devices is not None else _render_devices()
        if device_id not in [i for i, _ in known]:
            raise Unavailable("Switch in Windows. That output isn't available any more.")
        if switch is None:
            from pycaw.constants import ERole  # type: ignore
            from pycaw.pycaw import AudioUtilities  # type: ignore

            AudioUtilities.SetDefaultDevice(device_id, [ERole.eConsole, ERole.eMultimedia])
            _outputs_cache["value"] = None
            AUDIO.submit(_audio.invalidate)
        else:
            switch(device_id)
    except Unavailable:
        raise
    except Exception:
        raise Unavailable("Switch in Windows. Halo couldn't change the output.")
    return list_outputs() if switch is None else {"ok": True}


# -- launching (the Launch tab). Only things that sit in the Start menu, or a web address, can be opened.

START_DIRS = (r"%ProgramData%\Microsoft\Windows\Start Menu\Programs", r"%APPDATA%\Microsoft\Windows\Start Menu\Programs")
_SKIP_APPS = ("uninstall", "readme", "help", "license", "release notes", "documentation")


def scan_start_menu(roots: list) -> list:
    """Apps in the Start menu: [{id, name}], where id is the shortcut's path under its Start menu folder (so it can be launched
    again, and only ever from inside those folders). Sorted by name, duplicates folded."""
    import os

    seen: dict = {}
    for root in roots:
        if not root or not os.path.isdir(root):
            continue
        for dirpath, _dirs, files in os.walk(root):
            for f in files:
                if not f.lower().endswith(".lnk"):
                    continue
                name = f[:-4]
                if any(w in name.lower() for w in _SKIP_APPS):
                    continue
                rel = os.path.relpath(os.path.join(dirpath, f), root).replace(os.sep, "/")
                seen.setdefault(name.lower(), {"id": rel, "name": name})
    return sorted(seen.values(), key=lambda a: a["name"].lower())


def _start_roots() -> list:
    import os

    return [os.path.expandvars(d) for d in START_DIRS]


def list_start_apps() -> dict:
    if not IS_WINDOWS:
        raise Unavailable("The Start menu only exists on Windows.")
    return {"apps": scan_start_menu(_start_roots())}


def resolve_start_app(app_id: str, roots: list) -> str:
    """The full path of a Start menu shortcut, or a plain refusal. A path that climbs out of the folders, or is not a shortcut, is refused."""
    import os

    if not app_id.lower().endswith(".lnk") or ".." in app_id.replace("\\", "/").split("/") or os.path.isabs(app_id):
        raise Unavailable("That isn't an app Halo can open.")
    for root in roots:
        full = os.path.normpath(os.path.join(root, app_id))
        if full.startswith(os.path.normpath(root) + os.sep) and os.path.isfile(full):
            return full
    raise Unavailable("That app is not in the Start menu any more.")


# -- icons for the Launch tab: an app's real icon, and a site's favicon. 64 px PNG data URLs, cached in memory and on disk.

ICON_PX = 64
_icon_mem: dict = {}


def _icon_cache_dir():
    import os

    d = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "HaloHelper", "icons")
    os.makedirs(d, exist_ok=True)
    return d


def png_data_url(img) -> str:
    """A PIL image as a 64 px square PNG data URL (kept square, centred, transparent padding)."""
    import base64
    import io

    from PIL import Image  # type: ignore

    img = img.convert("RGBA")
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    img.thumbnail((ICON_PX, ICON_PX), Image.LANCZOS)
    canvas = Image.new("RGBA", (ICON_PX, ICON_PX), (0, 0, 0, 0))
    canvas.paste(img, ((ICON_PX - img.width) // 2, (ICON_PX - img.height) // 2), img)
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def cached_icon(key: str, make, cache_dir: Optional[str] = None, max_age: float = 7 * 86400) -> Optional[str]:
    """Memory first, then the disk, then `make()` (which returns a data URL or None). A miss for a site is remembered for a day."""
    import hashlib
    import os
    import time

    if key in _icon_mem:
        return _icon_mem[key] or None
    d = cache_dir or _icon_cache_dir()
    f = os.path.join(d, hashlib.sha256(key.encode("utf-8")).hexdigest()[:40] + ".txt")
    try:
        if os.path.isfile(f) and time.time() - os.path.getmtime(f) < max_age:
            val = open(f, encoding="utf-8").read()
            _icon_mem[key] = val
            return val or None
    except OSError:
        pass
    val = make() or ""
    _icon_mem[key] = val
    try:
        open(f, "w", encoding="utf-8").write(val)
    except OSError:
        pass
    return val or None


def _shortcut_icon_image(path: str):
    """The shortcut's icon as a PIL image, from the Windows shell's own icon lists (jumbo, 256 px, else extra large)."""
    import ctypes
    from ctypes import POINTER, Structure, WINFUNCTYPE, byref, c_int, c_uint, c_void_p, sizeof, windll, wintypes

    from PIL import Image  # type: ignore

    class SHFILEINFOW(Structure):
        _fields_ = [("hIcon", c_void_p), ("iIcon", c_int), ("dwAttributes", wintypes.DWORD), ("szDisplayName", wintypes.WCHAR * 260), ("szTypeName", wintypes.WCHAR * 80)]

    class ICONINFO(Structure):
        _fields_ = [("fIcon", wintypes.BOOL), ("xHotspot", wintypes.DWORD), ("yHotspot", wintypes.DWORD), ("hbmMask", c_void_p), ("hbmColor", c_void_p)]

    class BITMAP(Structure):
        _fields_ = [("bmType", wintypes.LONG), ("bmWidth", wintypes.LONG), ("bmHeight", wintypes.LONG), ("bmWidthBytes", wintypes.LONG), ("bmPlanes", wintypes.WORD), ("bmBitsPixel", wintypes.WORD), ("bmBits", c_void_p)]

    class BITMAPINFOHEADER(Structure):
        _fields_ = [("biSize", wintypes.DWORD), ("biWidth", wintypes.LONG), ("biHeight", wintypes.LONG), ("biPlanes", wintypes.WORD), ("biBitCount", wintypes.WORD), ("biCompression", wintypes.DWORD), ("biSizeImage", wintypes.DWORD), ("biXPelsPerMeter", wintypes.LONG), ("biYPelsPerMeter", wintypes.LONG), ("biClrUsed", wintypes.DWORD), ("biClrImportant", wintypes.DWORD)]

    shell32, user32, gdi32 = windll.shell32, windll.user32, windll.gdi32
    shell32.SHGetFileInfoW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, POINTER(SHFILEINFOW), wintypes.UINT, wintypes.UINT]
    shell32.SHGetFileInfoW.restype = c_void_p
    user32.GetIconInfo.argtypes = [c_void_p, POINTER(ICONINFO)]
    user32.DestroyIcon.argtypes = [c_void_p]
    user32.GetDC.argtypes = [c_void_p]
    user32.GetDC.restype = c_void_p
    user32.ReleaseDC.argtypes = [c_void_p, c_void_p]
    gdi32.GetObjectW.argtypes = [c_void_p, c_int, c_void_p]
    gdi32.GetDIBits.argtypes = [c_void_p, c_void_p, wintypes.UINT, wintypes.UINT, c_void_p, c_void_p, wintypes.UINT]
    gdi32.DeleteObject.argtypes = [c_void_p]

    info = SHFILEINFOW()
    # SHGFI_SYSICONINDEX (0x4000): ask for the icon's place in the system image list, then ask that list for a big copy.
    if not shell32.SHGetFileInfoW(path, 0, byref(info), sizeof(info), 0x4000):
        return None
    import uuid

    iid = (ctypes.c_ubyte * 16).from_buffer_copy(uuid.UUID("46EB5926-582E-4017-9FDF-E8998DAA0950").bytes_le)
    shell32.SHGetImageList.argtypes = [c_int, c_void_p, POINTER(c_void_p)]
    shell32.SHGetImageList.restype = ctypes.c_long
    for size in (4, 2):  # SHIL_JUMBO, SHIL_EXTRALARGE
        lst = c_void_p()
        if shell32.SHGetImageList(size, byref(iid), byref(lst)) != 0 or not lst:
            continue
        vtbl = ctypes.cast(ctypes.cast(lst, POINTER(c_void_p))[0], POINTER(c_void_p))
        get_icon = WINFUNCTYPE(ctypes.HRESULT, c_void_p, c_int, c_uint, POINTER(c_void_p))(vtbl[10])
        release = WINFUNCTYPE(c_uint, c_void_p)(vtbl[2])
        hicon = c_void_p()
        try:
            if get_icon(lst, info.iIcon, 1, byref(hicon)) != 0 or not hicon:
                continue
        except OSError:
            continue
        finally:
            release(lst)
        ii = ICONINFO()
        if not user32.GetIconInfo(hicon, byref(ii)):
            user32.DestroyIcon(hicon)
            continue
        try:
            bm = BITMAP()
            gdi32.GetObjectW(ii.hbmColor, sizeof(bm), byref(bm))
            w, h = bm.bmWidth, bm.bmHeight
            hdr = BITMAPINFOHEADER(sizeof(BITMAPINFOHEADER), w, -h, 1, 32, 0, 0, 0, 0, 0, 0)
            buf = (ctypes.c_ubyte * (w * h * 4))()
            dc = user32.GetDC(None)
            gdi32.GetDIBits(dc, ii.hbmColor, 0, h, buf, byref(hdr), 0)
            user32.ReleaseDC(None, dc)
            img = Image.frombuffer("RGBA", (w, h), bytes(buf), "raw", "BGRA", 0, 1)
            if img.getchannel("A").getextrema()[1] == 0:  # an old icon with no alpha channel: opaque
                img.putalpha(255)
            return img
        finally:
            gdi32.DeleteObject(ii.hbmColor)
            gdi32.DeleteObject(ii.hbmMask)
            user32.DestroyIcon(hicon)
    return None


def app_icon(app_id: str) -> dict:
    """The real icon of a Start menu app, as a 64 px PNG data URL. 404 (Unavailable) when it can't be read: the page shows a letter tile."""
    if not IS_WINDOWS:
        raise Unavailable("App icons only work on Windows.")
    path = resolve_start_app(app_id, _start_roots())

    def make():
        try:
            img = _shortcut_icon_image(path)
            return png_data_url(img) if img is not None else None
        except Exception:
            return None

    import os

    url = cached_icon(f"app:{app_id}:{int(os.path.getmtime(path))}", make)
    if not url:
        raise Unavailable("No icon for that app.")
    return {"icon": url}


# -- favicons. The helper fetches them (the page's own address list is not allowed to, and the desktop app only lets the page talk to Halo).

import re as _re

_ICON_LINK = _re.compile(r"<link\b[^>]*>", _re.I)


def find_icon_href(html: str, base: str) -> Optional[str]:
    """The address of a page's icon from its <link rel="icon">. The largest apple-touch-icon is no better than a plain icon at 64 px, so the first wins."""
    from urllib.parse import urljoin

    best = None
    for tag in _ICON_LINK.findall(html[:200_000]):
        rel = _re.search(r'rel\s*=\s*["\']([^"\']+)["\']', tag, _re.I)
        href = _re.search(r'href\s*=\s*["\']([^"\']+)["\']', tag, _re.I)
        if not rel or not href or "icon" not in rel.group(1).lower() or "mask" in rel.group(1).lower():
            continue
        url = urljoin(base, href.group(1).strip())
        if url.lower().startswith(("http://", "https://")):
            if "shortcut" in rel.group(1).lower() or best is None:
                best = url
                if "shortcut" in rel.group(1).lower():
                    break
    return best


def is_public_host(host: str, resolve=None) -> bool:
    """False for anything on this laptop or its network: loopback, private, link local and reserved addresses. A site's icon is never fetched from those."""
    import ipaddress
    import socket

    try:
        infos = (resolve or (lambda h: [i[4][0] for i in socket.getaddrinfo(h, None)]))(host)
    except OSError:
        return False
    if not infos:
        return False
    for addr in infos:
        ip = ipaddress.ip_address(addr)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False
    return True


def _fetch(url: str, limit: int = 600_000, timeout: float = 4.0):
    import urllib.request
    from urllib.parse import urlparse

    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname or not is_public_host(u.hostname):
        return None, None
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (HaloHelper favicon)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (scheme checked above)
        return r.read(limit), r.headers.get("content-type", "")


def favicon_for(page_url: str, fetch=None) -> Optional[str]:
    """A site's own icon as a 64 px PNG data URL, or None. Tries the page's <link rel=icon>, then /favicon.ico."""
    import io
    from urllib.parse import urlparse

    from PIL import Image  # type: ignore

    fetch = fetch or _fetch
    u = urlparse(page_url)
    if u.scheme not in ("http", "https") or not u.hostname:
        return None
    origin = f"{u.scheme}://{u.netloc}"
    candidates = []
    try:
        body, _ = fetch(origin + "/")
        if body:
            href = find_icon_href(body.decode("utf-8", "ignore"), origin + "/")
            if href:
                candidates.append(href)
    except Exception:
        pass
    candidates.append(origin + "/favicon.ico")
    for c in candidates:
        try:
            data, _ctype = fetch(c)
            if not data:
                continue
            img = Image.open(io.BytesIO(data))
            img.load()
            if img.format == "ICO":  # the biggest image inside an .ico
                sizes = sorted(img.info.get("sizes", []) or [img.size], key=lambda t: t[0])
                img.size = sizes[-1]
                img.load()
            return png_data_url(img)
        except Exception:
            continue
    return None


def site_icon(page_url: str) -> dict:
    url = cached_icon(f"site:{page_url.split('#')[0]}", lambda: favicon_for(page_url), max_age=7 * 86400)
    if not url:
        raise Unavailable("No icon for that site.")
    return {"icon": url}



def launch_url(url: str) -> dict:
    """Open a web address in the default browser. Only http and https, so nothing else can be started this way."""
    from urllib.parse import urlparse

    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.netloc:
        raise Unavailable("Halo only opens web addresses that start with http or https.")
    import webbrowser

    webbrowser.open(url)
    return {"ok": True}


def launch_app(app_id: str) -> dict:
    if not IS_WINDOWS:
        raise Unavailable("Opening apps only works on Windows.")
    import os

    os.startfile(resolve_start_app(app_id, _start_roots()))  # type: ignore[attr-defined]
    return {"ok": True}


async def probe_brightness() -> dict:
    return await DISPLAY.run(get_brightness)


async def probe_mic_async() -> dict:
    return await AUDIO.run(probe_mic)


async def probe_output_async() -> dict:
    return await AUDIO.run(probe_output)


async def probe_apps() -> dict:
    return await AUDIO.run(list_app_volumes)


async def probe_power() -> dict:
    return await run_in_threadpool(get_power_mode)


_SKIP = object()

# (event name, run every N polls, probe, needs await)
EXTRA_PROBES: list[tuple[str, int, Any, bool]] = [
    ("brightness", 1, probe_brightness, True),
    ("mic", 1, probe_mic_async, True),
    ("caps", 1, probe_caps, False),
    ("output", 1, probe_output_async, True),
    ("wifi", 3, get_wifi, True),
    ("bluetooth", 5, get_bluetooth, True),
    ("power", 2, probe_power, True),
    # The Audio tab's mixer. Apps open and close, so it is pushed too, not polled.
    ("apps", 2, probe_apps, True),
    # Card 26: pills when airplane mode or night light changes. Read only.
    ("airplane", 3, probe_airplane, True),
    ("night", 3, probe_night, False),
]


async def collect_extra(last: dict, ticks: int, probes=None) -> dict:
    """Runs the probes that are due, side by side, and returns only the ones whose answer changed since `last` (which it updates)."""
    due = [(name, probe, is_async) for name, every, probe, is_async in (probes if probes is not None else EXTRA_PROBES) if not ticks % every]

    async def one(probe, is_async):
        try:
            return await probe() if is_async else await run_in_threadpool(_com_call, probe)
        except Exception:
            return _SKIP  # not available on this laptop right now: say nothing

    values = await asyncio.gather(*(one(probe, is_async) for _, probe, is_async in due))
    changed: dict[str, Any] = {}
    for (name, _, _), value in zip(due, values):
        if value is not _SKIP and value != last.get(name):
            last[name] = value
            changed[name] = value
    return changed



FAST_SECONDS = 0.15
LATENCY_TARGET_MS = 50


async def measure_latency(n: int = 15) -> dict:
    """Times what a tap costs inside the helper: the same lanes and backends the endpoints use. Sets send the current value, so
    nothing on the laptop changes. A path this laptop can't do (no brightness panel, no Wi-Fi) says why instead of a time."""

    async def volume_set():
        v = await AUDIO.run(get_volume)
        await AUDIO.run(set_volume, v["level"])

    async def mute_set():
        v = await AUDIO.run(get_volume)
        await AUDIO.run(set_mute, v["muted"])

    async def mic_set():
        m = await AUDIO.run(mic_state)
        await AUDIO.run(set_mic_mute, m["muted"])

    async def brightness_set():
        b = await DISPLAY.run(get_brightness)
        await DISPLAY.run(set_brightness, b["level"])

    async def power_set():
        p = await run_in_threadpool(get_power_mode)
        await run_in_threadpool(set_power_mode, p["mode"])

    paths = {
        "volume_get": lambda: AUDIO.run(get_volume),
        "volume_set": volume_set,
        "mute_set": mute_set,
        "mic_get": lambda: AUDIO.run(mic_state),
        "mic_mute_set": mic_set,
        "brightness_get": lambda: DISPLAY.run(get_brightness),
        "brightness_set": brightness_set,
        "power_get": lambda: run_in_threadpool(get_power_mode),
        "power_set": power_set,
        "wifi_get": get_wifi,
        "apps_get": lambda: AUDIO.run(list_app_volumes),
    }
    results: dict[str, Any] = {}
    for name, fn in paths.items():
        times: list[float] = []
        try:
            await fn()  # the first run may build the cached objects; it is not counted
            for _ in range(n):
                t0 = time.perf_counter()
                await fn()
                times.append((time.perf_counter() - t0) * 1000)
            results[name] = summarise(times)
        except Unavailable as e:
            results[name] = {"unavailable": str(e)}
        except Exception as e:  # a backend that is broken must not take the report down
            results[name] = {"error": type(e).__name__}
    hot = ("volume_get", "volume_set", "mute_set", "mic_get", "mic_mute_set", "brightness_get", "brightness_set")
    slow = [k for k in hot if isinstance(results.get(k), dict) and results[k].get("p95_ms", 0) >= LATENCY_TARGET_MS]
    return {"target_ms": LATENCY_TARGET_MS, "runs": n, "results": results, "slow": slow, "ok": not slow}


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
            "not_supported": ["focus", "keyboard_light", "anc", "equaliser"],
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

    @app.get("/apps/volume")
    async def apps_volume_get():
        return await _guard(list_app_volumes)

    @app.post("/apps/volume/{app_id}")
    async def apps_volume_post(app_id: str, body: AppVolumeBody):
        return await _guard(set_app_volume, app_id, body.level)

    @app.get("/mic")
    async def mic_get():
        return await _guard(mic_state)

    @app.post("/mic/mute")
    async def mic_mute_post(body: Optional[MuteBody] = None):
        return await _guard(set_mic_mute, body.muted if body else None)

    @app.get("/outputs")
    async def outputs_get():
        return await _guard(list_outputs)

    @app.post("/outputs/default")
    async def outputs_default(body: OutputBody):
        return await _guard(set_default_output, body.id)

    @app.get("/launch/icon")
    async def launch_icon(id: str):
        return await _guard(app_icon, id)

    @app.get("/launch/favicon")
    async def launch_favicon(url: str):
        return await _guard(site_icon, url)

    @app.get("/launch/apps")
    async def launch_apps():
        return await _guard(list_start_apps)

    @app.post("/launch/app")
    async def launch_app_post(body: LaunchBody):
        return await _guard(launch_app, body.id)

    @app.post("/launch/url")
    async def launch_url_post(body: UrlBody):
        return await _guard(launch_url, body.url)

    @app.get("/battery")
    async def battery_get():
        return await _guard(get_battery)

    @app.get("/wifi")
    async def wifi_get():
        return await _guard_async(get_wifi())

    @app.post("/wifi")
    async def wifi_post(body: EnabledBody):
        await _guard_async(_set_radio("WI_FI", body.enabled))
        now = await _guard_async(get_wifi())
        # The adapter takes a second to say it has joined or left a network, so the reply says what was asked for.
        return {"enabled": body.enabled, "connected": now["connected"] and body.enabled, "ssid": now["ssid"] if body.enabled else None}

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

    @app.get("/latency")
    async def latency(n: int = 15):
        """How long the hot paths take inside the helper, over `n` runs each (3 to 60). Nothing changes: a set call sends the
        value that is already there. The Halo page adds its own few milliseconds of HTTP on top."""
        return await measure_latency(max(3, min(60, n)))

    @app.get("/events")
    async def events():
        """Server sent events. Emits `media`, `volume` (level and mute), `battery`, `brightness`, `mic` (muted), `mic_level`, `caps`, `output`, `wifi`, `bluetooth`, `power`, `apps` (the mixer), `airplane`, `night` and `clipboard` when they change, and `notification` for each new Windows notification. The first pass sends every state, so a page that just connected needs no other request.

        EventSource can't send headers, so Halo reads this with fetch() and a stream reader.
        """

        async def stream():
            last: dict[str, Any] = {}
            queue: asyncio.Queue = asyncio.Queue()

            def emit(name: str, data: Any) -> None:
                queue.put_nowait(f"event: {name}\ndata: {json.dumps(data)}\n\n")

            def changed(name: str, value: Any) -> bool:
                """True once per change. The loops below share `last`, so whichever sees a change first sends it, and only once."""
                if value == last.get(name):
                    return False
                last[name] = value
                return True

            async def fast():
                # What Liam changes with a key or a slider elsewhere, seen within about 150 ms: volume, mute, the mic and its level, brightness.
                n = 0
                shown: Optional[float] = None
                while True:
                    try:
                        m = await AUDIO.run(mic_state)
                        if changed("mic", {"muted": m["muted"]}):
                            emit("mic", last["mic"])
                        level = 0.0 if m["muted"] else round(m["level"] * 36) / 36  # steps of 1/36, sent only when it moves
                        if level != shown:
                            shown = level
                            emit("mic_level", {"level": round(level, 3)})
                    except Exception:
                        pass
                    try:
                        v = await AUDIO.run(get_volume)
                        if changed("volume", v):
                            emit("volume", v)
                    except Exception:
                        pass
                    if n % 3 == 0:
                        try:
                            b = await DISPLAY.run(get_brightness)
                            if changed("brightness", b):
                                emit("brightness", b)
                        except Exception:
                            pass
                    n += 1
                    await asyncio.sleep(max(0.05, min(poll_seconds, FAST_SECONDS)))

            async def slow():
                expected_pos: Optional[float] = None
                ticks = 0
                while True:
                    try:
                        m = await media.info()
                        # Position moves every second, so only a jump counts as a change.
                        jumped = expected_pos is not None and abs(m["position"] - expected_pos) > 2.5
                        expected_pos = m["position"] + (poll_seconds if m["playing"] else 0)
                        core = {k: m[k] for k in ("available", "title", "artist", "album", "source", "playing", "duration", "has_art")}
                        if core != last.get("media_core") or jumped:
                            last["media_core"] = core
                            emit("media", m)
                    except Exception:
                        pass
                    if ticks % 5 == 0:  # battery changes slowly
                        try:
                            b = await run_in_threadpool(get_battery)
                            if changed("battery", b):
                                emit("battery", b)
                        except Exception:
                            pass
                    for name, data in (await collect_extra(last, ticks)).items():
                        emit(name, data)
                    if clipboard.revision != last.get("clip_rev"):
                        last["clip_rev"] = clipboard.revision
                        emit("clipboard", {"revision": clipboard.revision})
                    ticks += 1
                    await asyncio.sleep(poll_seconds)

            async def notes():
                # Windows notifications take about a second to read, so they have a loop of their own and never hold up a state change.
                while True:
                    try:
                        for n in await notifications.poll():
                            emit("notification", n)
                    except Exception:
                        pass
                    await asyncio.sleep(poll_seconds)

            tasks = [asyncio.create_task(fast()), asyncio.create_task(slow()), asyncio.create_task(notes())]
            try:
                yield "retry: 2000\n\n"
                while True:
                    try:
                        yield await asyncio.wait_for(queue.get(), timeout=5)
                    except asyncio.TimeoutError:
                        yield ": keep-alive\n\n"
            finally:
                for t in tasks:
                    t.cancel()

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

    halo_fast.warm_up()  # build the cached Windows objects now, so the first tap is as quick as the hundredth
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


_register_lanes()


if __name__ == "__main__":
    sys.exit(main())
