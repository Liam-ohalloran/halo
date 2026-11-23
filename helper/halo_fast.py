"""Halo helper hot paths (card 29): volume, mute, mic, brightness, power mode and Wi-Fi without a subprocess and without
rebuilding Windows objects on every call.

Why it was slow: every call built a device from scratch (pycaw reads the device's whole property store, about 100 ms),
and power mode and Wi-Fi started powercfg.exe and netsh.exe. Now:

- One dedicated thread per lane owns its COM objects (`ComLane`). The audio endpoint, the microphone meter and the session
  manager are made once on that thread and reused. COM objects must be used on the thread that made them, so nothing here is
  handed to another thread. The default device is looked at once a second, so plugging in headphones is noticed.
- Brightness goes through one kept WMI connection (WmiMonitorBrightness), and falls back to the monitor's DDC link
  (screen_brightness_control) for external screens.
- Power mode is powrprof.dll (PowerGetActiveScheme / PowerSetActiveScheme) through ctypes. Wi-Fi is wlanapi.dll.

Everything here is plain functions on plain data, so tests can run them with fakes on any machine.
"""
from __future__ import annotations

import asyncio
import ctypes
import gc
import struct
import sys
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Callable, Optional

from halo_extras import Unavailable

IS_WINDOWS = sys.platform == "win32"


# ---------------------------------------------------------------------------
# Lanes: one thread that owns COM objects
# ---------------------------------------------------------------------------


def _com_up() -> None:
    if not IS_WINDOWS:
        return
    try:
        import comtypes  # type: ignore

        comtypes.CoInitialize()
    except Exception:
        pass
    try:
        import pythoncom  # type: ignore

        pythoncom.CoInitialize()
    except Exception:
        pass


class ComLane:
    """A single thread. Everything submitted runs there, in order, so a COM object made by one call is safe to reuse in the
    next. `run()` awaits it without blocking the web server. After `collect_every` calls it collects garbage on this thread,
    so a comtypes object is never freed by the collector on some other thread (that crashed the helper once)."""

    def __init__(self, name: str, collect_every: int = 400):
        self.name = name
        self._calls = 0
        self._collect_every = collect_every
        self._ex = ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"halo-{name}", initializer=_com_up)

    def submit(self, fn: Callable, *args) -> Future:
        return self._ex.submit(self._wrap, fn, *args)

    def call(self, fn: Callable, *args):
        """Blocking, for tests and start up. Never call this from the event loop."""
        return self.submit(fn, *args).result()

    async def run(self, fn: Callable, *args):
        return await asyncio.wrap_future(self.submit(fn, *args))

    def _wrap(self, fn: Callable, *args):
        self._calls += 1
        try:
            return fn(*args)
        finally:
            if self._calls % self._collect_every == 0:
                gc.collect()

    def collect(self) -> None:
        self.submit(gc.collect)


# ---------------------------------------------------------------------------
# Audio: master volume, mute, microphone, app sessions, all on cached objects
# ---------------------------------------------------------------------------

RENDER, CAPTURE = 0, 1  # EDataFlow
RECHECK_SECONDS = 1.0  # how often the default device is looked at again


class AudioBackend:
    """Call every method on the audio lane (`AUDIO`). Holds the device enumerator, and per direction the default endpoint's
    volume, its meter and, for playback, its session manager."""

    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._enum = None
        self._slot: dict[int, dict] = {}

    # -- plumbing
    def _enumerator(self):
        if self._enum is None:
            import comtypes  # type: ignore
            from pycaw.api.mmdeviceapi import IMMDeviceEnumerator  # type: ignore
            from pycaw.constants import CLSID_MMDeviceEnumerator  # type: ignore

            self._enum = comtypes.CoCreateInstance(CLSID_MMDeviceEnumerator, IMMDeviceEnumerator, comtypes.CLSCTX_INPROC_SERVER)
        return self._enum

    def invalidate(self, flow: Optional[int] = None) -> None:
        for f in ([flow] if flow is not None else list(self._slot)):
            self._slot.pop(f, None)
        if flow is None:
            self._enum = None
        gc.collect()  # on this thread, where the objects were made

    def _activate(self, dev, iface):
        from comtypes import CLSCTX_ALL  # type: ignore

        return ctypes.cast(dev.Activate(iface._iid_, CLSCTX_ALL, None), ctypes.POINTER(iface))

    def _make_volume(self, dev):
        from pycaw.api.endpointvolume import IAudioEndpointVolume  # type: ignore

        return self._activate(dev, IAudioEndpointVolume)

    def _default(self, flow: int) -> dict:
        """The default device's slot, rebuilt when Windows' default changed (or on first use)."""
        slot = self._slot.get(flow)
        now = self._clock()
        if slot is not None and now - slot["checked"] < RECHECK_SECONDS:
            return slot
        try:
            dev = self._enumerator().GetDefaultAudioEndpoint(flow, 1)  # eMultimedia
            dev_id = dev.GetId()
        except Exception:
            self.invalidate(flow)
            raise Unavailable("No microphone found." if flow == CAPTURE else "No audio output.")
        if slot is not None and slot["id"] == dev_id:
            slot["checked"] = now
            return slot
        slot = {"id": dev_id, "dev": dev, "vol": self._make_volume(dev), "meter": None, "mgr": None, "name": None, "checked": now}
        self._slot[flow] = slot
        return slot

    def _with(self, flow: int, fn: Callable[[dict], Any]):
        """Run fn(slot). A stale object (device pulled out) gets one fresh try."""
        try:
            return fn(self._default(flow))
        except Unavailable:
            raise
        except Exception:
            self.invalidate(flow)
            return fn(self._default(flow))

    # -- master volume
    def get_volume(self) -> dict:
        return self._with(RENDER, lambda s: {"level": round(s["vol"].GetMasterVolumeLevelScalar() * 100), "muted": bool(s["vol"].GetMute())})

    def set_volume(self, level: int) -> dict:
        def go(s):
            s["vol"].SetMasterVolumeLevelScalar(max(0, min(100, level)) / 100, None)
            return {"level": round(s["vol"].GetMasterVolumeLevelScalar() * 100), "muted": bool(s["vol"].GetMute())}

        return self._with(RENDER, go)

    def set_mute(self, muted: Optional[bool]) -> dict:
        def go(s):
            s["vol"].SetMute(int(not s["vol"].GetMute()) if muted is None else int(muted), None)
            return {"level": round(s["vol"].GetMasterVolumeLevelScalar() * 100), "muted": bool(s["vol"].GetMute())}

        return self._with(RENDER, go)

    # -- microphone
    def mic_muted(self) -> bool:
        return self._with(CAPTURE, lambda s: bool(s["vol"].GetMute()))

    def mic_peak(self) -> float:
        def go(s):
            if s["meter"] is None:
                from pycaw.api.endpointvolume import IAudioMeterInformation  # type: ignore

                s["meter"] = self._activate(s["dev"], IAudioMeterInformation)
            return float(s["meter"].GetPeakValue())

        return self._with(CAPTURE, go)

    def mic_state(self) -> dict:
        muted = self.mic_muted()
        try:
            level = 0.0 if muted else self.mic_peak()
        except Exception:
            level = 0.0
        return {"muted": muted, "level": round(max(0.0, min(1.0, level)), 3)}

    def set_mic_mute(self, muted: Optional[bool]) -> dict:
        def go(s):
            s["vol"].SetMute(int(not s["vol"].GetMute()) if muted is None else int(muted), None)

        self._with(CAPTURE, go)
        return self.mic_state()

    # -- output name (the property store is read once per device, not once per call)
    def output_name(self) -> str:
        def go(s):
            if not s["name"]:
                from pycaw.pycaw import AudioUtilities  # type: ignore

                s["name"] = getattr(AudioUtilities.CreateDevice(s["dev"]), "FriendlyName", None) or ""
            return s["name"]

        name = self._with(RENDER, go)
        if not name:
            raise Unavailable("No audio output.")
        return name

    def output_id(self) -> str:
        return self._default(RENDER)["id"]

    # -- per app sessions
    def sessions(self) -> list:
        """(display name, ISimpleAudioVolume) for every app with an audio session. The session manager is kept."""

        def go(s):
            if s["mgr"] is None:
                from pycaw.api.audiopolicy import IAudioSessionManager2  # type: ignore

                s["mgr"] = self._activate(s["dev"], IAudioSessionManager2)
            from pycaw.api.audiopolicy import IAudioSessionControl2  # type: ignore
            from pycaw.utils import AudioSession  # type: ignore

            enum = s["mgr"].GetSessionEnumerator()
            out = []
            for i in range(enum.GetCount()):
                ctl = enum.GetSession(i)
                if ctl is None:
                    continue
                sess = AudioSession(ctl.QueryInterface(IAudioSessionControl2))
                proc = sess.Process
                if proc is None:
                    continue  # the "System sounds" session has no process
                try:
                    out.append((proc.name(), sess.SimpleAudioVolume))
                except Exception:
                    continue
            return out

        return self._with(RENDER, go)


# ---------------------------------------------------------------------------
# Brightness: one reused WMI connection, DDC for external screens
# ---------------------------------------------------------------------------


class BrightnessBackend:
    """Call on the display lane. `get()` and `set()` talk to WMI (WmiMonitorBrightness, the laptop's own panel) through one
    kept connection with the method's parameter block already made, about 4 ms to read and 7 ms to set. With no such panel
    (a desktop with a monitor) they use the monitor's DDC link through screen_brightness_control.

    Parameters are set by name. The wmi package sorts a method's parameters alphabetically, so passing them by position
    sent the level as the timeout and set the screen to 1%."""

    def __init__(self):
        self._svc = None
        self._path = None
        self._params = None
        self._method = None  # "wmi" or "ddc"

    def _connect(self) -> None:
        if self._svc is not None:
            return
        import win32com.client  # type: ignore

        svc = win32com.client.GetObject("winmgmts://./root/wmi")
        inst = next(iter(svc.ExecQuery("SELECT * FROM WmiMonitorBrightnessMethods")), None)
        if inst is None:
            raise LookupError("no panel")
        params = svc.Get("WmiMonitorBrightnessMethods").Methods_("WmiSetBrightness").InParameters.SpawnInstance_()
        params.Properties_("Timeout").Value = 0
        self._svc, self._path, self._params = svc, inst.Path_.Path, params

    def _drop(self) -> None:
        self._svc = self._path = self._params = None
        self._method = None

    def _pick(self) -> str:
        if self._method:
            return self._method
        try:
            self._connect()
            self._method = "wmi"
        except Exception:
            self._drop()
            self._method = "ddc"
        return self._method

    def get(self) -> dict:
        if self._pick() == "wmi":
            try:
                for row in self._svc.ExecQuery("SELECT CurrentBrightness FROM WmiMonitorBrightness"):
                    return {"level": int(row.CurrentBrightness)}
                raise LookupError("no panel")
            except Exception:
                self._drop()  # the connection went stale: make a new one next time
                raise Unavailable("This screen doesn't allow brightness changes.")
        return self._ddc_get()

    def set(self, level: int) -> dict:
        level = max(0, min(100, int(level)))
        if self._pick() == "wmi":
            try:
                self._params.Properties_("Brightness").Value = level
                self._svc.ExecMethod(self._path, "WmiSetBrightness", self._params)
            except Exception:
                self._drop()
                raise Unavailable("This screen doesn't allow brightness changes.")
            return {"level": level}
        try:
            import screen_brightness_control as sbc  # type: ignore

            sbc.set_brightness(level)
        except Exception:
            raise Unavailable("This screen doesn't allow brightness changes.")
        return self._ddc_get()

    @staticmethod
    def _ddc_get() -> dict:
        try:
            import screen_brightness_control as sbc  # type: ignore

            values = sbc.get_brightness()
        except Exception:
            raise Unavailable("This screen doesn't allow brightness changes.")
        if not values:
            raise Unavailable("This screen doesn't allow brightness changes.")
        return {"level": int(values[0])}


# ---------------------------------------------------------------------------
# Power mode: powrprof.dll, no powercfg.exe
# ---------------------------------------------------------------------------

POWER_SCHEMES = {
    "battery": "a1841308-3541-4fab-bc81-f71556f20b4a",
    "balanced": "381b4222-f694-41f0-9685-ff5bb260df2e",
    "performance": "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
}


class _GUID(ctypes.Structure):
    _fields_ = [("Data1", ctypes.c_uint32), ("Data2", ctypes.c_uint16), ("Data3", ctypes.c_uint16), ("Data4", ctypes.c_ubyte * 8)]


def guid_from_string(s: str) -> _GUID:
    return _GUID.from_buffer_copy(uuid.UUID(s).bytes_le)


def guid_to_string(g: _GUID) -> str:
    return str(uuid.UUID(bytes_le=bytes(g)))


def mode_for_guid(guid: str) -> str:
    """The Halo mode a power scheme GUID stands for. Anything Halo has no button for counts as Balanced."""
    g = guid.lower()
    for mode, scheme in POWER_SCHEMES.items():
        if scheme == g:
            return mode
    return "balanced"


def power_get_active_guid() -> str:
    pw = ctypes.WinDLL("powrprof", use_last_error=True)
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.LocalFree.argtypes = [ctypes.c_void_p]
    pw.PowerGetActiveScheme.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.POINTER(_GUID))]
    pw.PowerGetActiveScheme.restype = ctypes.c_uint32
    ptr = ctypes.POINTER(_GUID)()
    rc = pw.PowerGetActiveScheme(None, ctypes.byref(ptr))
    if rc != 0:
        raise Unavailable("Windows won't say which power mode is on.")
    try:
        return guid_to_string(ptr.contents)
    finally:
        k32.LocalFree(ptr)


def power_set_active_guid(guid: str) -> None:
    pw = ctypes.WinDLL("powrprof", use_last_error=True)
    pw.PowerSetActiveScheme.argtypes = [ctypes.c_void_p, ctypes.POINTER(_GUID)]
    pw.PowerSetActiveScheme.restype = ctypes.c_uint32
    g = guid_from_string(guid)
    if pw.PowerSetActiveScheme(None, ctypes.byref(g)) != 0:
        raise Unavailable("Windows doesn't have that power mode on this laptop.")


# ---------------------------------------------------------------------------
# Wi-Fi: wlanapi.dll, no netsh.exe
# ---------------------------------------------------------------------------

WLAN_INTF_OPCODE_RADIO_STATE = 4
WLAN_INTF_OPCODE_CURRENT_CONNECTION = 7
WLAN_STATE_CONNECTED = 1
DOT11_RADIO_ON = 1
_CONN_SSID_AT = 4 + 4 + 512  # isState, wlanConnectionMode, strProfileName[256] come first


def parse_connection(buf: bytes) -> dict:
    """WLAN_CONNECTION_ATTRIBUTES: the state at the start, the SSID (length then up to 32 bytes) after the profile name."""
    state = struct.unpack_from("<I", buf, 0)[0]
    n = min(struct.unpack_from("<I", buf, _CONN_SSID_AT)[0], 32)
    raw = bytes(buf[_CONN_SSID_AT + 4 : _CONN_SSID_AT + 4 + n])
    ssid = raw.decode("utf-8", "replace") if n else None
    return {"connected": state == WLAN_STATE_CONNECTED and ssid is not None, "ssid": ssid if state == WLAN_STATE_CONNECTED else None}


def parse_radio_state(buf: bytes) -> bool:
    """WLAN_RADIO_STATE: a count, then (phy index, software state, hardware state) per radio. On means both are on."""
    n = struct.unpack_from("<I", buf, 0)[0]
    for i in range(min(n, 64)):
        _phy, soft, hard = struct.unpack_from("<III", buf, 4 + 12 * i)
        if soft == DOT11_RADIO_ON and hard == DOT11_RADIO_ON:
            return True
    return False


class WlanBackend:
    """The Wi-Fi adapter's radio and connection straight from Windows' WLAN service. One handle is kept for the process."""

    def __init__(self):
        self._lock = threading.Lock()
        self._handle = None
        self._dll = None

    def _open(self):
        if self._handle is not None:
            return self._handle
        from ctypes import wintypes

        dll = ctypes.WinDLL("wlanapi", use_last_error=True)
        dll.WlanOpenHandle.argtypes = [wintypes.DWORD, ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(wintypes.HANDLE)]
        dll.WlanOpenHandle.restype = wintypes.DWORD
        dll.WlanEnumInterfaces.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
        dll.WlanEnumInterfaces.restype = wintypes.DWORD
        dll.WlanQueryInterface.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p]
        dll.WlanQueryInterface.restype = wintypes.DWORD
        dll.WlanFreeMemory.argtypes = [ctypes.c_void_p]
        dll.WlanCloseHandle.argtypes = [wintypes.HANDLE, ctypes.c_void_p]
        version, handle = wintypes.DWORD(), wintypes.HANDLE()
        if dll.WlanOpenHandle(2, None, ctypes.byref(version), ctypes.byref(handle)) != 0:
            raise Unavailable("This laptop has no Wi-Fi radio.")
        self._dll, self._handle = dll, handle
        return handle

    def _close(self) -> None:
        if self._handle is not None and self._dll is not None:
            try:
                self._dll.WlanCloseHandle(self._handle, None)
            except Exception:
                pass
        self._handle = None

    def read(self) -> Optional[dict]:
        """{enabled, connected, ssid}, or None when the laptop has no Wi-Fi adapter (the caller can try another way)."""
        with self._lock:
            try:
                return self._read()
            except Unavailable:
                raise
            except Exception:
                self._close()  # the service restarted: next call opens a fresh handle
                return None

    def _read(self) -> Optional[dict]:
        handle = self._open()
        dll = self._dll
        lst = ctypes.c_void_p()
        if dll.WlanEnumInterfaces(handle, None, ctypes.byref(lst)) != 0:
            self._close()
            return None
        try:
            # WLAN_INTERFACE_INFO_LIST: dwNumberOfItems, dwIndex, then items of 532 bytes (GUID 16, description 512, state 4)
            count = ctypes.c_uint32.from_address(lst.value).value
            if count == 0:
                return None
            first = lst.value + 8
            guid = ctypes.create_string_buffer(ctypes.string_at(first, 16), 16)
            enabled, connected, ssid = True, False, None
            size, data = ctypes.c_uint32(), ctypes.c_void_p()
            if dll.WlanQueryInterface(handle, guid, WLAN_INTF_OPCODE_RADIO_STATE, None, ctypes.byref(size), ctypes.byref(data), None) == 0:
                try:
                    enabled = parse_radio_state(ctypes.string_at(data.value, size.value))
                finally:
                    dll.WlanFreeMemory(data)
            if enabled:
                size, data = ctypes.c_uint32(), ctypes.c_void_p()
                if dll.WlanQueryInterface(handle, guid, WLAN_INTF_OPCODE_CURRENT_CONNECTION, None, ctypes.byref(size), ctypes.byref(data), None) == 0:
                    try:
                        c = parse_connection(ctypes.string_at(data.value, size.value))
                        connected, ssid = c["connected"], c["ssid"]
                    finally:
                        dll.WlanFreeMemory(data)
            return {"enabled": enabled, "connected": connected, "ssid": ssid}
        finally:
            dll.WlanFreeMemory(lst)


# ---------------------------------------------------------------------------
# The shared lanes and backends, and what /latency measures
# ---------------------------------------------------------------------------

AUDIO = ComLane("audio")
DISPLAY = ComLane("display")
audio = AudioBackend()
brightness = BrightnessBackend()
wlan = WlanBackend()


def warm_up() -> None:
    """Make the cached objects now, in the background, so the first tap is as fast as the hundredth."""
    if not IS_WINDOWS:
        return
    for lane, fn in ((AUDIO, audio.get_volume), (AUDIO, audio.mic_state), (AUDIO, audio.sessions), (DISPLAY, brightness.get)):
        lane.submit(lambda f=fn: _quiet(f))
    DISPLAY.submit(lambda: _quiet(wlan.read))


def _quiet(fn: Callable) -> None:
    try:
        fn()
    except Exception:
        pass


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    return s[min(len(s) - 1, max(0, int(round(p / 100 * (len(s) - 1)))))]


def summarise(ms: list[float]) -> dict:
    return {"n": len(ms), "median_ms": round(percentile(ms, 50), 2), "p95_ms": round(percentile(ms, 95), 2), "max_ms": round(max(ms), 2) if ms else 0.0}
