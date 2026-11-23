"""Halo helper extras (card 26): Windows notifications, clipboard history, airplane mode and night light.

Kept apart from halo_helper.py so the pure parts (what to hide, what to skip, how history is kept) can be tested on any
machine. Everything that touches Windows is imported lazily and fails with a plain sentence instead of crashing.

Privacy rules (HALO.md section 5): Halo is read only on Liam's messages. A message notification only ever says that a
message arrived and from which app. The text is dropped here, before it leaves the helper. The clipboard history never
keeps anything a password manager marked as private, and it lives in memory only (nothing is written to disk).
"""

from __future__ import annotations

import base64
import hashlib
import io
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

IS_WINDOWS = sys.platform == "win32"


class Unavailable(Exception):
    """A feature can't be used right now. The message is safe to show to Liam."""


# ---------------------------------------------------------------------------
# Windows notifications (and Phone Link, whose phone notifications arrive as Windows toasts)
# ---------------------------------------------------------------------------

# Apps whose notifications are messages. Their text is never passed on.
MESSAGING_APPS = (
    "whatsapp", "messages", "message", "messenger", "telegram", "signal", "snapchat", "instagram", "discord", "teams",
    "slack", "imessage", "sms", "viber", "wechat", "line", "outlook", "mail", "gmail", "skype", "facebook",
)
PHONE_LINK_APPS = ("phone link", "your phone", "link to windows")
CALL_WORDS = ("incoming call", "is calling", "calling", "missed call", "call from")


def _has(haystack: str, words: tuple[str, ...]) -> bool:
    low = haystack.lower()
    return any(w in low for w in words)


def classify_notification(app: str, texts: list[str]) -> dict:
    """What Halo is told about a Windows notification.

    Returns {type, title, body, hidden}. `type` is one of Halo's alert types ('call', 'message') or 'notification'.
    A message never carries its text: title is "New message" and body is the app's name. A call from Phone Link keeps
    the caller's name, because the banner is what tells Liam who is ringing.
    """
    app = (app or "").strip() or "Windows"
    lines = [t.strip() for t in texts if t and t.strip()]
    joined = " ".join(lines)
    if _has(app, PHONE_LINK_APPS):
        if _has(joined, CALL_WORDS):
            title = lines[0] if lines else "Phone call"
            body = lines[1] if len(lines) > 1 else "Phone Link"
            return {"type": "call", "title": title[:80], "body": body[:160], "hidden": False}
        return {"type": "message", "title": "New message", "body": "Phone Link", "hidden": True}
    if _has(app, MESSAGING_APPS):
        return {"type": "message", "title": "New message", "body": app[:160], "hidden": True}
    title = lines[0] if lines else app
    body = " ".join(lines[1:]) if len(lines) > 1 else app
    return {"type": "notification", "title": title[:80], "body": body[:160], "hidden": False}


class Notifications:
    """Reads Windows toast notifications (UserNotificationListener). New ones come out of `poll()` once each."""

    def __init__(self) -> None:
        self._seen: set[int] = set()
        self._seeded = False
        self._listener: Any = None

    async def _get(self):
        if not IS_WINDOWS:
            raise Unavailable("Notifications only work on Windows.")
        if self._listener is None:
            from winsdk.windows.ui.notifications.management import UserNotificationListener  # type: ignore

            self._listener = UserNotificationListener.current
        return self._listener

    async def access(self) -> str:
        """'allowed', 'denied' or 'unspecified'. Reading needs Liam's yes in Windows Settings, Privacy, Notifications."""
        try:
            l = await self._get()
        except Unavailable:
            return "unsupported"
        return {0: "unspecified", 1: "allowed", 2: "denied"}.get(int(l.get_access_status()), "unspecified")

    async def request(self) -> str:
        l = await self._get()
        await l.request_access_async()
        return await self.access()

    async def poll(self) -> list[dict]:
        """New notifications since the last call. The first call only learns what is already there."""
        if await self.access() != "allowed":
            return []
        from winsdk.windows.ui.notifications import NotificationKinds  # type: ignore

        l = await self._get()
        items = await l.get_notifications_async(NotificationKinds.TOAST)
        out: list[dict] = []
        ids: set[int] = set()
        for n in items:
            ids.add(int(n.id))
            if int(n.id) in self._seen:
                continue
            try:
                app = n.app_info.display_info.display_name
                binding = n.notification.visual.get_binding("ToastGeneric")  # the generic toast template (winsdk has no constant for it)
                texts = [t.text for t in binding.get_text_elements()] if binding else []
            except Exception:
                continue
            c = classify_notification(app, texts)
            c.update({"id": f"win-{int(n.id)}", "app": app})
            out.append(c)
        self._seen = ids  # forget the ones that were dismissed, so ids can be reused
        if not self._seeded:
            self._seeded = True
            return []
        return out


# ---------------------------------------------------------------------------
# Clipboard history
# ---------------------------------------------------------------------------

MAX_CLIPS = 25
MAX_TEXT = 20_000
THUMB_PX = 200

# Windows tells clipboard managers to leave something alone with these formats. Password managers set them.
PRIVATE_FORMATS = ("ExcludeClipboardContentFromMonitorProcessing", "CanUploadToCloudClipboard")
PASSWORD_MANAGERS = (
    "keepass", "1password", "bitwarden", "lastpass", "dashlane", "nordpass", "enpass", "proton pass", "protonpass",
    "roboform", "keeper", "zoho vault", "psono", "buttercup", "authy",
)


def is_password_manager(process_name: str) -> bool:
    return _has(process_name or "", PASSWORD_MANAGERS)


def should_skip_clip(formats: set[str], flags: dict[str, int], owner: str) -> bool:
    """Never keep anything a password manager marked as private, or that came from one.

    `formats` are the registered clipboard format names on the clipboard, `flags` the DWORD values of the ones that carry
    one (CanIncludeInClipboardHistory: 0 means keep it out), `owner` the name of the process that put it there.
    """
    if any(f in formats for f in PRIVATE_FORMATS[:1]):
        return True
    if flags.get("CanIncludeInClipboardHistory") == 0:
        return True
    return is_password_manager(owner)


@dataclass
class Clip:
    id: str
    kind: str  # 'text' or 'image'
    at: float
    text: str = ""
    png: bytes = b""
    w: int = 0
    h: int = 0
    digest: str = field(default="", repr=False)


def _digest(kind: str, data: bytes) -> str:
    return kind + ":" + hashlib.sha1(data).hexdigest()


class ClipboardHistory:
    """The last 25 text and image items, newest first. In memory only.

    `read` returns {'kind': 'text', 'text': str} or {'kind': 'image', 'png': bytes, 'w': int, 'h': int}, or None when there is
    nothing to keep (empty, a format Halo doesn't hold, or private). `sequence` returns Windows' clipboard change counter.
    """

    def __init__(self, read: Optional[Callable[[], Optional[dict]]] = None, sequence: Optional[Callable[[], int]] = None, limit: int = MAX_CLIPS) -> None:
        self._read = read or read_clipboard
        self._sequence = sequence or clipboard_sequence
        self._limit = limit
        self._items: list[Clip] = []
        self._n = 0
        self._last_seq: Optional[int] = None
        self._lock = threading.Lock()
        self.revision = 0  # goes up on every change, so a page knows when to refresh
        self.enabled = True  # Settings (card 27) can switch the history off
        self._stop = threading.Event()

    # -- history
    def add(self, item: dict) -> Optional[Clip]:
        if item["kind"] == "text":
            text = item["text"][:MAX_TEXT]
            if not text.strip():
                return None
            dig = _digest("text", text.encode("utf-8", "ignore"))
            payload = dict(text=text)
        else:
            dig = _digest("image", item["png"])
            payload = dict(png=item["png"], w=item["w"], h=item["h"])
        with self._lock:
            self._items = [c for c in self._items if c.digest != dig]  # an old copy of the same thing moves to the top
            self._n += 1
            clip = Clip(id=f"c{self._n}", kind=item["kind"], at=time.time(), digest=dig, **payload)
            self._items.insert(0, clip)
            del self._items[self._limit:]
            self.revision += 1
            return clip

    def poll(self) -> Optional[Clip]:
        """Look at the clipboard if it changed since last time. Returns the new clip, if one was kept."""
        try:
            seq = self._sequence()
        except Exception:
            return None
        if seq == self._last_seq:
            return None
        first = self._last_seq is None
        self._last_seq = seq
        if not self.enabled:
            return None  # off: look at nothing, so what was copied while it was off is never kept
        try:
            item = self._read()
        except Exception:
            return None
        if not item:
            return None
        # What was already on the clipboard when Halo started is kept too: it is Liam's own last copy.
        _ = first
        return self.add(item)

    def get(self, clip_id: str) -> Optional[Clip]:
        with self._lock:
            return next((c for c in self._items if c.id == clip_id), None)

    def clear(self) -> None:
        with self._lock:
            self._items = []
            self.revision += 1

    def set_enabled(self, on: bool) -> None:
        """Switch the history on or off. Off, it forgets everything it holds and stops keeping copies."""
        self.enabled = on
        if not on:
            self.clear()

    def snapshot(self) -> list[dict]:
        with self._lock:
            items = list(self._items)
        out = []
        for c in items:
            if c.kind == "text":
                out.append({"id": c.id, "kind": "text", "text": c.text[:400], "chars": len(c.text), "at": c.at})
            else:
                out.append({"id": c.id, "kind": "image", "w": c.w, "h": c.h, "thumb": thumbnail_data_url(c.png), "at": c.at})
        return out

    # -- background polling
    def start(self, every: float = 0.5) -> threading.Thread:
        def run() -> None:
            while not self._stop.is_set():
                self.poll()
                self._stop.wait(every)

        t = threading.Thread(target=run, daemon=True, name="halo-clipboard")
        t.start()
        return t

    def stop(self) -> None:
        self._stop.set()


def thumbnail_data_url(png: bytes) -> str:
    from PIL import Image

    img = Image.open(io.BytesIO(png)).convert("RGBA")
    img.thumbnail((THUMB_PX, THUMB_PX))
    out = io.BytesIO()
    img.save(out, format="PNG")
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode("ascii")


# -- the Windows side of the clipboard ----------------------------------------------------------------------------

CF_UNICODETEXT = 13
CF_DIB = 8


def clipboard_sequence() -> int:
    if not IS_WINDOWS:
        raise Unavailable("The clipboard only works on Windows.")
    import ctypes

    return int(ctypes.windll.user32.GetClipboardSequenceNumber())


def _owner_name() -> str:
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    user32.GetClipboardOwner.restype = wintypes.HWND
    hwnd = user32.GetClipboardOwner()
    if not hwnd:
        return ""
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    try:
        import psutil

        return psutil.Process(pid.value).name()
    except Exception:
        return ""


def read_clipboard() -> Optional[dict]:
    """Text or an image from the clipboard. None for anything private, empty or not text or an image."""
    if not IS_WINDOWS:
        raise Unavailable("The clipboard only works on Windows.")
    import ctypes
    from ctypes import wintypes

    user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.GetClipboardData.restype = wintypes.HANDLE
    user32.GetClipboardData.argtypes = [wintypes.UINT]
    user32.RegisterClipboardFormatW.argtypes = [wintypes.LPCWSTR]
    user32.IsClipboardFormatAvailable.argtypes = [wintypes.UINT]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalLock.argtypes = [wintypes.HANDLE]
    kernel32.GlobalUnlock.argtypes = [wintypes.HANDLE]

    for _ in range(5):
        if user32.OpenClipboard(None):
            break
        time.sleep(0.03)
    else:
        return None
    try:
        formats = {n for n in (*PRIVATE_FORMATS, "CanIncludeInClipboardHistory") if user32.IsClipboardFormatAvailable(user32.RegisterClipboardFormatW(n))}
        flags: dict[str, int] = {}
        if "CanIncludeInClipboardHistory" in formats:
            h = user32.GetClipboardData(user32.RegisterClipboardFormatW("CanIncludeInClipboardHistory"))
            p = kernel32.GlobalLock(h) if h else None
            if p:
                flags["CanIncludeInClipboardHistory"] = ctypes.c_uint32.from_address(p).value
                kernel32.GlobalUnlock(h)
        if should_skip_clip(formats, flags, _owner_name()):
            return None
        if user32.IsClipboardFormatAvailable(CF_UNICODETEXT):
            h = user32.GetClipboardData(CF_UNICODETEXT)
            p = kernel32.GlobalLock(h) if h else None
            if not p:
                return None
            try:
                return {"kind": "text", "text": ctypes.wstring_at(p)}
            finally:
                kernel32.GlobalUnlock(h)
        has_image = bool(user32.IsClipboardFormatAvailable(CF_DIB))
    finally:
        user32.CloseClipboard()
    if has_image:
        try:
            from PIL import Image, ImageGrab

            img = ImageGrab.grabclipboard()
            if isinstance(img, Image.Image):
                out = io.BytesIO()
                img.convert("RGBA").save(out, format="PNG")
                return {"kind": "image", "png": out.getvalue(), "w": img.width, "h": img.height}
        except Exception:
            return None
    return None


def write_clipboard(clip: Clip) -> None:
    """Put a kept item back on the clipboard (the Shelf tab's "copy again")."""
    if not IS_WINDOWS:
        raise Unavailable("The clipboard only works on Windows.")
    import ctypes
    from ctypes import wintypes

    user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
    kernel32.GlobalAlloc.restype = wintypes.HANDLE
    kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalLock.argtypes = [wintypes.HANDLE]
    kernel32.GlobalUnlock.argtypes = [wintypes.HANDLE]
    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]

    if clip.kind == "text":
        fmt, data = CF_UNICODETEXT, (clip.text + "\0").encode("utf-16le")
    else:
        from PIL import Image

        buf = io.BytesIO()
        Image.open(io.BytesIO(clip.png)).convert("RGB").save(buf, format="BMP")
        fmt, data = CF_DIB, buf.getvalue()[14:]  # a DIB is a BMP without its 14 byte file header
    handle = kernel32.GlobalAlloc(0x0002, len(data))  # GMEM_MOVEABLE
    ptr = kernel32.GlobalLock(handle)
    ctypes.memmove(ptr, data, len(data))
    kernel32.GlobalUnlock(handle)
    for _ in range(5):
        if user32.OpenClipboard(None):
            break
        time.sleep(0.03)
    else:
        raise Unavailable("The clipboard is busy. Try again.")
    try:
        user32.EmptyClipboard()
        user32.SetClipboardData(fmt, handle)
    finally:
        user32.CloseClipboard()


# ---------------------------------------------------------------------------
# Airplane mode and night light (read only: Halo shows a pill when they change, it never changes them)
# ---------------------------------------------------------------------------


def parse_night_light(blob: bytes) -> bool:
    """Night light's state lives in a CloudStore blob. Byte 18 is 0x15 while it is on and 0x13 while it is off."""
    return len(blob) > 18 and blob[18] == 0x15


def probe_night() -> dict:
    if not IS_WINDOWS:
        raise Unavailable("Night light only works on Windows.")
    import winreg

    path = (
        r"Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\DefaultAccount\Current"
        r"\default$windows.data.bluelightreduction.bluelightreductionstate\windows.data.bluelightreduction.bluelightreductionstate"
    )
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path) as k:
            blob = winreg.QueryValueEx(k, "Data")[0]
    except OSError:
        raise Unavailable("Night light isn't available on this laptop.")
    return {"on": parse_night_light(bytes(blob))}


def airplane_from(system_radio_state: Optional[int], radios_off: list[bool]) -> Optional[bool]:
    """Airplane mode is on when Windows says so, or, where Windows doesn't say, when every radio it can see is off.

    `system_radio_state` is the RadioManagement registry value (1 means airplane mode), None when the laptop has no such
    value. `radios_off` has one entry per Wi-Fi, Bluetooth or mobile radio. With fewer than two radios there is nothing
    to tell, so the answer is None and no pill shows.
    """
    if system_radio_state is not None:
        return system_radio_state == 1
    if len(radios_off) < 2:
        return None
    return all(radios_off)


async def probe_airplane() -> dict:
    if not IS_WINDOWS:
        raise Unavailable("Airplane mode only works on Windows.")
    import winreg

    state: Optional[int] = None
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\RadioManagement") as k:
            state = int(winreg.QueryValueEx(k, "SystemRadioState")[0])
    except OSError:
        state = None
    off: list[bool] = []
    if state is None:
        from winsdk.windows.devices.radios import Radio, RadioState  # type: ignore

        for r in await Radio.get_radios_async():
            off.append(r.state == RadioState.OFF)
    on = airplane_from(state, off)
    if on is None:
        raise Unavailable("Airplane mode isn't available on this laptop.")
    return {"on": on}
