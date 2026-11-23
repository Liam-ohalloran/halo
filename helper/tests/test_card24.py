"""Card 24: per app volume, the microphone, outputs and launching. The pure parts are tested here with fakes."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import halo_helper as h  # noqa: E402
from test_extras import FakeNotes  # noqa: E402
import halo_extras as x  # noqa: E402

HDR = {"X-Halo-Token": "tok"}


def make():
    return TestClient(h.create_app("tok", media=object(), notifications=FakeNotes(), clipboard=x.ClipboardHistory(read=lambda: None, sequence=lambda: 0)))


def test_one_row_per_app_the_loudest_level_wins_and_muted_only_when_all_are():
    rows = h.merge_sessions([("Chrome", 40, False), ("Spotify", 80, False), ("chrome", 70, True), ("Chrome", 10, True)])
    assert [r["name"] for r in rows] == ["Spotify", "Chrome"]
    chrome = rows[1]
    assert chrome["level"] == 70 and chrome["muted"] is False
    assert h.merge_sessions([("Teams", 30, True), ("teams", 20, True)])[0]["muted"] is True
    assert h.merge_sessions([]) == []


def test_process_names_are_tidied():
    assert h.pretty_app("chrome.exe") == "Chrome"
    assert h.pretty_app("Spotify.EXE") == "Spotify"
    assert h.pretty_app("discord") == "Discord"


def test_start_menu_scan_finds_shortcuts_skips_junk_and_folds_duplicates(tmp_path):
    a = tmp_path / "all"
    b = tmp_path / "user"
    (a / "Obsidian").mkdir(parents=True)
    b.mkdir()
    for p in (a / "Spotify.lnk", a / "Obsidian" / "Obsidian.lnk", a / "Uninstall Foo.lnk", a / "Readme.txt", b / "spotify.lnk", b / "Chrome.lnk"):
        p.write_text("x")
    apps = h.scan_start_menu([str(a), str(b), str(tmp_path / "missing")])
    assert [x_["name"] for x_ in apps] == ["Chrome", "Obsidian", "Spotify"]
    assert next(x_ for x_ in apps if x_["name"] == "Obsidian")["id"] == "Obsidian/Obsidian.lnk"
    assert len(apps) == 3, "the same app in both folders is listed once"


def test_only_shortcuts_inside_the_start_menu_folders_can_be_launched(tmp_path):
    root = tmp_path / "start"
    root.mkdir()
    (root / "Chrome.lnk").write_text("x")
    (tmp_path / "evil.lnk").write_text("x")
    assert h.resolve_start_app("Chrome.lnk", [str(root)]).endswith("Chrome.lnk")
    for bad in ("../evil.lnk", "..\\evil.lnk", "Chrome.exe", "C:/Windows/System32/cmd.exe", "nope.lnk", "/etc/x.lnk"):
        with pytest.raises(h.Unavailable):
            h.resolve_start_app(bad, [str(root)])


def test_new_endpoints_need_the_token_and_say_plainly_when_windows_cannot_do_it(monkeypatch):
    monkeypatch.setattr(h, "IS_WINDOWS", False)
    with make() as c:
        for method, path in (("get", "/apps/volume"), ("get", "/mic"), ("get", "/outputs"), ("get", "/launch/apps")):
            assert getattr(c, method)(path).status_code == 401
            assert getattr(c, method)(path, headers=HDR).status_code == 503
        assert c.post("/apps/volume/chrome", json={"level": 50}, headers=HDR).status_code == 503
        assert c.post("/launch/app", json={"id": "Chrome.lnk"}, headers=HDR).status_code == 503
        assert c.post("/apps/volume/chrome", json={"level": 500}, headers=HDR).status_code == 422, "a level past 100 is refused"
        assert c.post("/launch/app", json={"id": ""}, headers=HDR).status_code == 422


def test_status_says_what_is_not_supported():
    with make() as c:
        ns = c.get("/status", headers=HDR).json()["not_supported"]
        assert {"anc", "equaliser"} <= set(ns) and "switch_output" not in ns


def test_only_web_addresses_can_be_opened_by_url(monkeypatch):
    opened = []
    import webbrowser

    monkeypatch.setattr(webbrowser, "open", lambda u: opened.append(u))
    assert h.launch_url("https://github.com/x") == {"ok": True}
    for bad in ("file:///C:/Windows/System32/cmd.exe", "javascript:alert(1)", "calc.exe", "https://", "ftp://x.test"):
        with pytest.raises(h.Unavailable):
            h.launch_url(bad)
    assert opened == ["https://github.com/x"]
    with make() as c:
        assert c.post("/launch/url", json={"url": "https://x.test"}).status_code == 401


# ---- review fixes: output switching, real icons, favicons
def test_outputs_come_with_ids_current_first_and_say_whether_switching_makes_sense():
    r = h.shape_outputs([("a", "Speakers (Realtek)"), ("b", "WH-CH720N"), ("c", "LG monitor")], "b")
    assert [o["name"] for o in r["outputs"]] == ["WH-CH720N", "Speakers (Realtek)", "LG monitor"]
    assert r["current"] == "WH-CH720N" and r["can_switch"] is True
    assert [o["kind"] for o in r["outputs"]] == ["headphones", "speakers", "monitor"]
    assert h.shape_outputs([("a", "Speakers")], "a")["can_switch"] is False


def test_switching_the_output_only_accepts_a_listed_device_and_failure_is_a_plain_sentence():
    done = []
    devices = [("a", "Speakers"), ("b", "Headphones")]
    assert h.set_default_output("b", switch=done.append, devices=devices) == {"ok": True}
    assert done == ["b"]
    with pytest.raises(h.Unavailable, match="Switch in Windows"):
        h.set_default_output("zzz", switch=done.append, devices=devices)
    assert done == ["b"], "an id Windows does not list is never passed on"

    def boom(_):
        raise OSError("0x80004005")

    with pytest.raises(h.Unavailable, match="Switch in Windows"):
        h.set_default_output("a", switch=boom, devices=devices)


def test_switching_uses_the_console_and_media_roles(monkeypatch):
    if not h.IS_WINDOWS:
        pytest.skip("Windows only")
    from pycaw.constants import ERole  # type: ignore
    from pycaw.pycaw import AudioUtilities  # type: ignore

    calls = []
    monkeypatch.setattr(AudioUtilities, "SetDefaultDevice", staticmethod(lambda i, roles=None: calls.append((i, list(roles)))))
    monkeypatch.setattr(h, "_render_devices", lambda: [("a", "Speakers")])
    monkeypatch.setattr(h, "list_outputs", lambda: {"current": "Speakers", "outputs": [], "can_switch": False})
    h.set_default_output("a")
    assert calls == [("a", [ERole.eConsole, ERole.eMultimedia])]


def test_output_endpoints_need_the_token(monkeypatch):
    with make() as c:
        assert c.post("/outputs/default", json={"id": "a"}).status_code == 401
        assert c.post("/outputs/default", json={"id": ""}, headers=HDR).status_code == 422
        assert c.get("/launch/icon?id=Chrome.lnk").status_code == 401
        assert c.get("/launch/favicon?url=https://x.test").status_code == 401


def test_icons_are_64_px_png_data_urls_and_cached(tmp_path):
    import base64
    import io

    from PIL import Image

    big = Image.new("RGBA", (256, 128), (255, 0, 0, 255))
    url = h.png_data_url(big)
    assert url.startswith("data:image/png;base64,")
    out = Image.open(io.BytesIO(base64.b64decode(url.split(",")[1])))
    assert out.size == (64, 64)
    calls = []
    h._icon_mem.clear()
    assert h.cached_icon("k1", lambda: calls.append(1) or url, cache_dir=str(tmp_path)) == url
    assert h.cached_icon("k1", lambda: calls.append(1) or "other", cache_dir=str(tmp_path)) == url
    h._icon_mem.clear()
    assert h.cached_icon("k1", lambda: calls.append(1) or "other", cache_dir=str(tmp_path)) == url, "still there after the helper restarts (disk)"
    assert len(calls) == 1
    h._icon_mem.clear()
    assert h.cached_icon("miss", lambda: None, cache_dir=str(tmp_path)) is None
    assert h.cached_icon("miss", lambda: calls.append(2) or "late", cache_dir=str(tmp_path)) is None, "a miss is remembered too"


def test_a_real_start_menu_icon_comes_out_as_a_png():
    if not h.IS_WINDOWS:
        pytest.skip("Windows only")
    apps = h.list_start_apps()["apps"]
    if not apps:
        pytest.skip("no Start menu apps")
    h._icon_mem.clear()
    got = [h.app_icon(a["id"]) for a in apps[:5] if _ok(h.app_icon, a["id"])]
    assert got and all(g["icon"].startswith("data:image/png;base64,") for g in got)


def _ok(fn, *a):
    try:
        fn(*a)
        return True
    except h.Unavailable:
        return False


def test_favicon_is_found_from_the_page_then_the_site_root_and_never_from_this_laptop():
    page = '<html><head><link rel="stylesheet" href="x.css"><link rel="shortcut icon" href="/static/f.png"></head></html>'
    assert h.find_icon_href(page, "https://a.test/") == "https://a.test/static/f.png"
    assert h.find_icon_href('<link rel="icon" href="//cdn.test/i.ico">', "https://a.test/") == "https://cdn.test/i.ico"
    assert h.find_icon_href('<link rel="mask-icon" href="/m.svg">', "https://a.test/") is None
    assert h.find_icon_href("<p>nothing</p>", "https://a.test/") is None
    assert not h.is_public_host("localhost", resolve=lambda _h: ["127.0.0.1"])
    assert not h.is_public_host("router", resolve=lambda _h: ["192.168.1.1"])
    assert not h.is_public_host("meta", resolve=lambda _h: ["169.254.169.254"])
    assert not h.is_public_host("mixed", resolve=lambda _h: ["8.8.8.8", "10.0.0.1"])
    assert h.is_public_host("ok", resolve=lambda _h: ["93.184.216.34"])
    assert not h.is_public_host("gone", resolve=lambda _h: (_ for _ in ()).throw(OSError("dns")))


def test_favicon_reads_the_icon_the_site_serves():
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGBA", (32, 32), (0, 128, 255, 255)).save(buf, format="PNG")
    served = {"https://a.test/": (b'<link rel="icon" href="/i.png">', "text/html"), "https://a.test/i.png": (buf.getvalue(), "image/png")}
    fetch = lambda u: served.get(u, (None, None))  # noqa: E731
    url = h.favicon_for("https://a.test/some/page", fetch=fetch)
    assert url and url.startswith("data:image/png;base64,")
    only_root = {"https://b.test/favicon.ico": (buf.getvalue(), "image/png")}
    assert h.favicon_for("https://b.test", fetch=lambda u: only_root.get(u, (None, None))) is not None, "falls back to /favicon.ico"
    assert h.favicon_for("https://c.test", fetch=lambda u: (None, None)) is None
    assert h.favicon_for("ftp://c.test", fetch=fetch) is None
    assert h.favicon_for("https://d.test", fetch=lambda u: (b"not an image", "image/png")) is None
