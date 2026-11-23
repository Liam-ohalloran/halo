"""Card 26: notifications, clipboard history, airplane mode, night light, which media session shows, and the app config."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import halo_extras as x  # noqa: E402
import halo_helper as h  # noqa: E402


# ---- Windows notifications ------------------------------------------------------------------------------------

def test_a_message_never_carries_its_text():
    for app in ("WhatsApp", "Messages", "Snapchat", "Microsoft Teams", "Discord", "Outlook"):
        c = x.classify_notification(app, ["Mum", "Where are you? Dinner is ready"])
        assert c["type"] == "message" and c["hidden"] is True
        assert c["title"] == "New message"
        assert "Mum" not in c["title"] + c["body"] and "Dinner" not in c["title"] + c["body"]
        assert c["body"] == app


def test_phone_link_call_keeps_the_caller_but_a_phone_link_message_does_not():
    call = x.classify_notification("Phone Link", ["Mum", "Incoming call"])
    assert call["type"] == "call" and call["title"] == "Mum" and not call["hidden"]
    msg = x.classify_notification("Phone Link", ["Mum", "See you at 6"])
    assert msg["type"] == "message" and msg["hidden"] and msg["title"] == "New message" and "6" not in msg["body"]


def test_any_other_notification_shows_its_first_two_lines():
    c = x.classify_notification("Calendar", ["Chemistry test", "Tomorrow 9:00"])
    assert c == {"type": "notification", "title": "Chemistry test", "body": "Tomorrow 9:00", "hidden": False}
    assert x.classify_notification("", [])["title"] == "Windows"
    assert len(x.classify_notification("Calendar", ["a" * 500])["title"]) == 80


# ---- Clipboard history ----------------------------------------------------------------------------------------

def test_history_keeps_25_newest_first_and_moves_repeats_to_the_top():
    hist = x.ClipboardHistory()
    for i in range(30):
        hist.add({"kind": "text", "text": f"item {i}"})
    snap = hist.snapshot()
    assert len(snap) == 25 and snap[0]["text"] == "item 29" and snap[-1]["text"] == "item 5"
    hist.add({"kind": "text", "text": "item 10"})
    assert hist.snapshot()[0]["text"] == "item 10" and len(hist.snapshot()) == 25
    assert [s["text"] for s in hist.snapshot()].count("item 10") == 1


def test_history_ignores_empty_text_and_long_text_is_cut():
    hist = x.ClipboardHistory()
    assert hist.add({"kind": "text", "text": "   \n"}) is None
    clip = hist.add({"kind": "text", "text": "a" * (x.MAX_TEXT + 500)})
    assert len(clip.text) == x.MAX_TEXT
    assert len(hist.snapshot()[0]["text"]) == 400 and hist.snapshot()[0]["chars"] == x.MAX_TEXT


def test_history_holds_images_with_a_small_thumbnail():
    from PIL import Image
    import io

    buf = io.BytesIO()
    Image.new("RGBA", (800, 400), (255, 0, 0, 255)).save(buf, format="PNG")
    hist = x.ClipboardHistory()
    hist.add({"kind": "image", "png": buf.getvalue(), "w": 800, "h": 400})
    item = hist.snapshot()[0]
    assert item["kind"] == "image" and (item["w"], item["h"]) == (800, 400) and item["thumb"].startswith("data:image/png;base64,")


def test_password_manager_content_is_never_kept():
    # Marked private by the app that put it there
    assert x.should_skip_clip({"ExcludeClipboardContentFromMonitorProcessing"}, {}, "anything.exe")
    # Marked "not for clipboard history"
    assert x.should_skip_clip({"CanIncludeInClipboardHistory"}, {"CanIncludeInClipboardHistory": 0}, "x.exe")
    assert not x.should_skip_clip({"CanIncludeInClipboardHistory"}, {"CanIncludeInClipboardHistory": 1}, "x.exe")
    # Copied from a known password manager even when it set no flag
    for name in ("KeePassXC.exe", "1Password.exe", "Bitwarden.exe", "LastPass.exe", "Dashlane.exe", "NordPass.exe"):
        assert x.should_skip_clip(set(), {}, name), name
    assert not x.should_skip_clip(set(), {}, "chrome.exe")


def test_poll_reads_only_when_windows_says_the_clipboard_changed():
    seq = {"n": 1}
    reads = []
    items = [{"kind": "text", "text": "one"}, None, {"kind": "text", "text": "three"}]

    def read():
        reads.append(1)
        return items[len(reads) - 1]

    hist = x.ClipboardHistory(read=read, sequence=lambda: seq["n"])
    assert hist.poll().text == "one"
    assert hist.poll() is None and len(reads) == 1  # same sequence number: nothing read
    seq["n"] = 2
    assert hist.poll() is None  # changed, but private or empty: nothing kept
    seq["n"] = 3
    assert hist.poll().text == "three"
    assert [s["text"] for s in hist.snapshot()] == ["three", "one"]


def test_revision_goes_up_on_every_change_and_clear_empties_it():
    hist = x.ClipboardHistory()
    r0 = hist.revision
    hist.add({"kind": "text", "text": "a"})
    assert hist.revision > r0
    hist.clear()
    assert hist.snapshot() == []


# ---- Airplane mode and night light ----------------------------------------------------------------------------

def test_night_light_blob():
    on = bytes.fromhex("434201000a0201002a06b7f9afd3062a2b0e15434201001000d0")
    assert x.parse_night_light(on) is True
    assert x.parse_night_light(on[:18] + b"\x13" + on[19:]) is False
    assert x.parse_night_light(b"") is False


def test_airplane_mode_from_windows_or_from_the_radios():
    assert x.airplane_from(1, []) is True
    assert x.airplane_from(0, [True, True]) is False  # Windows says off, even with the radios off
    assert x.airplane_from(None, [True, True]) is True
    assert x.airplane_from(None, [True, False]) is False
    assert x.airplane_from(None, [True]) is None  # one radio cannot tell


# ---- Which media session Music shows --------------------------------------------------------------------------

def row(app, playing=False, current=False):
    return {"app": app, "playing": playing, "current": current}


def test_spotify_is_the_default_but_something_playing_beats_a_paused_spotify():
    assert h.pick_session([row("Chrome", True, True), row("Spotify.exe", True)]) == 1  # both playing: Spotify
    assert h.pick_session([row("Spotify.exe"), row("Chrome", True, True)]) == 1  # YouTube in Chrome playing, Spotify paused
    assert h.pick_session([row("Chrome"), row("Spotify.exe")]) == 1  # nothing playing: still Spotify
    assert h.pick_session([row("Chrome"), row("msedge", False, True)]) == 1  # no Spotify: the current one
    assert h.pick_session([row("Chrome", True), row("msedge", True, True)]) == 1  # two playing: the current one
    assert h.pick_session([row("a"), row("b")]) == 0


# ---- The app's settings and the new endpoints -----------------------------------------------------------------

def test_app_config():
    assert h.app_config({}) == {"token": None, "port": 47800, "no_tray": False, "app": False}
    c = h.app_config({"HALO_TOKEN": " abc ", "HALO_PORT": "47803", "HALO_NO_TRAY": "1"})
    assert c == {"token": "abc", "port": 47803, "no_tray": True, "app": True}
    assert h.app_config({"HALO_PORT": "nope"})["port"] == 47800


def test_the_desktop_app_origin_is_allowed():
    assert "http://tauri.localhost" in h.ALLOWED_ORIGINS and "https://tauri.localhost" in h.ALLOWED_ORIGINS
    with TestClient(h.create_app("t", media=object())) as c:
        r = c.options("/media", headers={"Origin": "http://tauri.localhost", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-halo-token"})
        assert r.headers.get("access-control-allow-origin") == "http://tauri.localhost"


class FakeNotes:
    async def access(self):
        return "allowed"

    async def request(self):
        return "allowed"

    async def poll(self):
        return []


def make(clip=None):
    return TestClient(h.create_app("tok", media=object(), notifications=FakeNotes(), clipboard=clip or x.ClipboardHistory(read=lambda: None, sequence=lambda: 0)))


def test_clipboard_endpoints_need_the_token_and_list_clear_and_copy_again(monkeypatch):
    hist = x.ClipboardHistory(read=lambda: None, sequence=lambda: 0)
    clip = hist.add({"kind": "text", "text": "hello"})
    copied = []
    monkeypatch.setattr(h, "write_clipboard", lambda c: copied.append(c.text))
    with make(hist) as c:
        assert c.get("/clipboard").status_code == 401
        r = c.get("/clipboard", headers={"X-Halo-Token": "tok"}).json()
        assert r["items"][0]["text"] == "hello"
        assert c.post(f"/clipboard/{clip.id}/copy", headers={"X-Halo-Token": "tok"}).json() == {"ok": True}
        assert copied == ["hello"]
        assert c.post("/clipboard/nope/copy", headers={"X-Halo-Token": "tok"}).status_code == 404
        assert c.post("/clipboard/clear", headers={"X-Halo-Token": "tok"}).json() == {"ok": True}
        assert c.get("/clipboard", headers={"X-Halo-Token": "tok"}).json()["items"] == []


def test_clipboard_history_can_be_switched_off_and_forgets_what_it_held():
    seq = {"n": 1}
    hist = x.ClipboardHistory(read=lambda: {"kind": "text", "text": f"copy {seq['n']}"}, sequence=lambda: seq["n"])
    assert hist.poll().text == "copy 1"
    with make(hist) as c:
        hdr = {"X-Halo-Token": "tok"}
        assert c.post("/clipboard/enabled", json={"on": False}).status_code == 401
        assert c.post("/clipboard/enabled", json={"on": False}, headers=hdr).json() == {"enabled": False}
        assert c.get("/clipboard", headers=hdr).json()["items"] == [], "switching it off clears what was kept"
        seq["n"] = 2
        assert hist.poll() is None, "while it is off nothing is kept"
        assert c.post("/clipboard/enabled", json={"on": True}, headers=hdr).json() == {"enabled": True}
        seq["n"] = 3
        assert hist.poll().text == "copy 3", "and the copy made while it was off never comes back"
        assert [i["text"] for i in c.get("/clipboard", headers=hdr).json()["items"]] == ["copy 3"]


def test_notification_access_endpoints():
    with make() as c:
        assert c.get("/notifications/access").status_code == 401
        assert c.get("/notifications/access", headers={"X-Halo-Token": "tok"}).json() == {"access": "allowed"}
        assert c.post("/notifications/request", headers={"X-Halo-Token": "tok"}).json() == {"access": "allowed"}


def test_status_lists_what_is_not_supported():
    with make() as c:
        s = c.get("/status", headers={"X-Halo-Token": "tok"}).json()
        assert "night_light" not in s["not_supported"] and "focus" in s["not_supported"] and "keyboard_light" in s["not_supported"]


def test_com_calls_collect_garbage_on_their_own_thread(monkeypatch):
    """A COM object freed later by the collector on another thread crashed the helper (access violation)."""
    calls = []
    monkeypatch.setattr(h.gc, "collect", lambda: calls.append("collect"))
    monkeypatch.setattr(h, "_com_init", lambda: calls.append("init"))
    assert h._com_call(lambda a, b: a + b, 1, 2) == 3
    assert calls == ["init", "collect"]
    calls.clear()
    with pytest.raises(ValueError):
        h._com_call(lambda: (_ for _ in ()).throw(ValueError("boom")))
    assert calls == ["init", "collect"]  # even when the call fails
