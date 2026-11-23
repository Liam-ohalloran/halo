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
        assert {"anc", "equaliser", "switch_output"} <= set(ns)


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
