"""Card 29: the helper's hot paths. Cached audio objects on one thread, brightness through a kept WMI connection, power mode
through powrprof, Wi-Fi through wlanapi, no subprocess, a /latency report, and the push stream. Fakes everywhere, so it runs on
any machine. HALO_LIVE=1 on a Windows laptop also times the real backends against the 50 ms target."""
import asyncio
import os
import socket
import struct
import sys
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import halo_fast as f  # noqa: E402
import halo_helper as h  # noqa: E402
import halo_extras as x  # noqa: E402
from test_extras import FakeNotes  # noqa: E402

HDR = {"X-Halo-Token": "tok"}
LIVE = os.environ.get("HALO_LIVE") == "1" and sys.platform == "win32"


class FakeMedia:
    async def info(self):
        return {"available": True, "title": "Song", "artist": "A", "album": "B", "source": "Spotify", "playing": True, "position": 1.0, "duration": 100.0, "has_art": False}

    async def art(self):
        return None

    async def control(self, action):
        return True

    async def seek(self, seconds):
        return True


def make():
    return TestClient(h.create_app("tok", media=FakeMedia(), notifications=FakeNotes(), clipboard=x.ClipboardHistory(read=lambda: None, sequence=lambda: 0)))


# --- one thread owns the COM objects -------------------------------------------------------------

def test_a_lane_runs_everything_on_one_thread_in_order():
    lane = f.ComLane("t")
    ids = {lane.call(threading.get_ident) for _ in range(5)}
    assert len(ids) == 1 and threading.get_ident() not in ids
    order = []
    futures = [lane.submit(order.append, i) for i in range(20)]
    [fu.result() for fu in futures]
    assert order == list(range(20))


def test_a_lane_can_be_awaited_without_blocking_the_loop():
    lane = f.ComLane("t")

    async def go():
        ticks = []

        async def ticker():
            for _ in range(5):
                ticks.append(1)
                await asyncio.sleep(0.01)

        slow = lane.run(time.sleep, 0.08)
        await asyncio.gather(slow, ticker())
        return len(ticks)

    assert asyncio.run(go()) == 5


def test_a_lane_collects_garbage_on_its_own_thread(monkeypatch):
    calls = []
    monkeypatch.setattr(f.gc, "collect", lambda: calls.append(threading.get_ident()))
    lane = f.ComLane("t", collect_every=3)
    for _ in range(6):
        lane.call(lambda: None)
    assert len(calls) == 2 and set(calls) == {lane.call(threading.get_ident)}


# --- audio objects are made once -----------------------------------------------------------------

class FakeVol:
    def __init__(self):
        self.level, self.muted, self.calls = 0.4, False, 0

    def GetMasterVolumeLevelScalar(self):
        self.calls += 1
        return self.level

    def SetMasterVolumeLevelScalar(self, v, ctx):
        self.level = v

    def GetMute(self):
        return int(self.muted)

    def SetMute(self, m, ctx):
        self.muted = bool(m)


class FakeEnum:
    def __init__(self):
        self.id, self.asked = "dev-a", 0

    def GetDefaultAudioEndpoint(self, flow, role):
        self.asked += 1
        outer = self

        class Dev:
            def GetId(self_inner):
                return outer.id

        return Dev()


def fake_audio(clock):
    class A(f.AudioBackend):
        made = 0
        enum = FakeEnum()

        def _enumerator(self):
            return self.enum

        def _make_volume(self, dev):
            A.made += 1
            return FakeVol()

    return A(clock=clock)


def test_the_endpoint_is_made_once_and_reused():
    now = [0.0]
    a = fake_audio(lambda: now[0])
    for _ in range(50):
        a.get_volume()
    assert type(a).made == 1 and type(a).enum.asked == 1
    assert a.set_volume(70) == {"level": 70, "muted": False}
    assert a.set_mute(None) == {"level": 70, "muted": True}
    assert type(a).made == 1


def test_a_new_default_device_is_noticed_within_a_second():
    now = [0.0]
    a = fake_audio(lambda: now[0])
    a.get_volume()
    type(a).enum.id = "dev-b"  # headphones plugged in
    a.get_volume()
    assert type(a).made == 1, "inside the second the cached device is used"
    now[0] += f.RECHECK_SECONDS + 0.01
    a.get_volume()
    assert type(a).made == 2
    now[0] += f.RECHECK_SECONDS + 0.01
    a.get_volume()
    assert type(a).made == 2, "same device again: still cached"


def test_a_dead_endpoint_gets_one_fresh_try():
    now = [0.0]
    a = fake_audio(lambda: now[0])
    a.get_volume()
    slot = a._slot[f.RENDER]
    slot["vol"].GetMasterVolumeLevelScalar = lambda: (_ for _ in ()).throw(OSError("device pulled out"))
    assert a.get_volume() == {"level": 40, "muted": False}
    assert type(a).made == 2


def test_no_default_device_is_a_plain_sentence():
    class Broken(FakeEnum):
        def GetDefaultAudioEndpoint(self, flow, role):
            raise OSError("E_NOTFOUND")

    a = fake_audio(time.monotonic)
    type(a).enum = Broken()
    with pytest.raises(h.Unavailable, match="No audio output"):
        a.get_volume()
    with pytest.raises(h.Unavailable, match="No microphone"):
        a.mic_muted()
    type(a).enum = FakeEnum()


# --- brightness: kept connection, parameters by name ---------------------------------------------

class FakeProps:
    def __init__(self):
        self.values = {}

    def __call__(self, name):
        owner = self

        class P:
            @property
            def Value(self_inner):
                return owner.values.get(name)

            @Value.setter
            def Value(self_inner, v):
                owner.values[name] = v

        return P()


def fake_panel():
    b = f.BrightnessBackend()
    props = FakeProps()
    calls = []
    level = {"v": 88}

    class Row:
        @property
        def CurrentBrightness(self_inner):
            return level["v"]

    class Svc:
        def ExecQuery(self, q):
            return [Row()]

        def ExecMethod(self, path, method, params):
            calls.append((path, method, dict(props.values)))
            level["v"] = props.values["Brightness"]

    class Params:
        Properties_ = props

    b._svc, b._path, b._params, b._method = Svc(), "path", Params(), "wmi"
    return b, calls


def test_brightness_sets_the_level_by_name_never_as_the_timeout():
    b, calls = fake_panel()
    props = b._params.Properties_
    props("Timeout").Value = 0
    assert b.get() == {"level": 88}
    assert b.set(35) == {"level": 35}
    assert calls[-1][1] == "WmiSetBrightness" and calls[-1][2] == {"Timeout": 0, "Brightness": 35}
    assert b.get() == {"level": 35}


def test_brightness_is_clamped():
    b, calls = fake_panel()
    b._params.Properties_("Timeout").Value = 0
    assert b.set(250)["level"] == 100 and b.set(-5)["level"] == 0


def test_a_stale_wmi_connection_is_dropped_and_said_plainly():
    b = f.BrightnessBackend()

    class Gone:
        def ExecQuery(self, q):
            raise OSError("RPC server unavailable")

    b._svc, b._method = Gone(), "wmi"
    with pytest.raises(h.Unavailable, match="brightness"):
        b.get()
    assert b._svc is None and b._method is None, "the next call starts a new connection"


def test_a_desktop_without_a_laptop_panel_uses_the_monitor_link(monkeypatch):
    b = f.BrightnessBackend()
    monkeypatch.setattr(b, "_connect", lambda: (_ for _ in ()).throw(LookupError("no panel")))
    monkeypatch.setattr(f.BrightnessBackend, "_ddc_get", staticmethod(lambda: {"level": 61}))
    assert b.get() == {"level": 61} and b._method == "ddc"


# --- power mode: powrprof, no powercfg -----------------------------------------------------------

def test_guids_round_trip_and_unknown_schemes_count_as_balanced():
    for mode, guid in f.POWER_SCHEMES.items():
        assert f.guid_to_string(f.guid_from_string(guid)) == guid
        assert f.mode_for_guid(guid.upper()) == mode
    assert f.mode_for_guid("00000000-0000-0000-0000-000000000000") == "balanced"


def test_power_mode_reads_and_sets_without_a_subprocess(monkeypatch):
    def no_process(*a, **k):
        raise AssertionError("a hot path started a program")

    monkeypatch.setattr(h.subprocess, "run", no_process)
    monkeypatch.setattr(h.subprocess, "Popen", no_process)
    monkeypatch.setattr(h, "IS_WINDOWS", True)
    state = {"g": f.POWER_SCHEMES["performance"]}
    monkeypatch.setattr(h, "power_get_active_guid", lambda: state["g"])
    monkeypatch.setattr(h, "power_set_active_guid", lambda g: state.update(g=g))
    assert h.get_power_mode() == {"mode": "performance"}
    assert h.set_power_mode("battery") == {"mode": "battery"}
    assert h.get_power_mode() == {"mode": "battery"}
    assert state["g"] == f.POWER_SCHEMES["battery"]


def test_power_mode_endpoint_says_plainly_when_windows_refuses(monkeypatch):
    monkeypatch.setattr(h, "IS_WINDOWS", True)

    def refuse(g):
        raise h.Unavailable("Windows doesn't have that power mode on this laptop.")

    monkeypatch.setattr(h, "power_set_active_guid", refuse)
    with make() as c:
        r = c.post("/power-mode", json={"mode": "performance"}, headers=HDR)
        assert r.status_code == 503 and "power mode" in r.json()["detail"]


def test_the_hot_path_modules_never_name_a_subprocess_tool():
    src = Path(f.__file__).read_text(encoding="utf-8")
    assert "import subprocess" not in src and "subprocess." not in src
    for text in (src, Path(h.__file__).read_text(encoding="utf-8")):
        assert '"netsh"' not in text and '"powercfg"' not in text and "_run(" not in text


# --- Wi-Fi: wlanapi structures -------------------------------------------------------------------

def connection_buffer(state: int, ssid: bytes) -> bytes:
    buf = bytearray(600)
    struct.pack_into("<I", buf, 0, state)
    struct.pack_into("<I", buf, 520, len(ssid))
    buf[524 : 524 + len(ssid)] = ssid
    return bytes(buf)


def test_connection_attributes_give_the_network_name():
    assert f.parse_connection(connection_buffer(1, "VX220-03C1".encode())) == {"connected": True, "ssid": "VX220-03C1"}
    assert f.parse_connection(connection_buffer(1, "Café".encode("utf-8")))["ssid"] == "Café"
    assert f.parse_connection(connection_buffer(4, b"Old")) == {"connected": False, "ssid": None}, "disconnected: no name"
    assert f.parse_connection(connection_buffer(1, b"")) == {"connected": False, "ssid": None}


def test_radio_state_is_on_only_when_software_and_hardware_are_on():
    def buf(*phys):
        b = struct.pack("<I", len(phys))
        for i, (soft, hard) in enumerate(phys):
            b += struct.pack("<III", i, soft, hard)
        return b

    assert f.parse_radio_state(buf((1, 1))) is True
    assert f.parse_radio_state(buf((2, 1))) is False, "turned off in software"
    assert f.parse_radio_state(buf((1, 2))) is False, "the hardware switch is off"
    assert f.parse_radio_state(buf((2, 2), (1, 1))) is True
    assert f.parse_radio_state(buf()) is False


def test_wifi_comes_from_the_wlan_service_with_no_netsh(monkeypatch):
    monkeypatch.setattr(h, "IS_WINDOWS", True)
    monkeypatch.setattr(h.subprocess, "run", lambda *a, **k: (_ for _ in ()).throw(AssertionError("netsh")))
    monkeypatch.setattr(h._wlan, "read", lambda: {"enabled": True, "connected": True, "ssid": "Home"})
    assert asyncio.run(h.get_wifi()) == {"enabled": True, "connected": True, "ssid": "Home"}


def test_turning_wifi_off_answers_at_once_with_what_was_asked(monkeypatch):
    monkeypatch.setattr(h, "IS_WINDOWS", True)

    async def set_radio(kind, enabled):
        return None

    monkeypatch.setattr(h, "_set_radio", set_radio)
    monkeypatch.setattr(h._wlan, "read", lambda: {"enabled": True, "connected": True, "ssid": "Home"})
    with make() as c:
        assert c.post("/wifi", json={"enabled": False}, headers=HDR).json() == {"enabled": False, "connected": False, "ssid": None}
        assert c.post("/wifi", json={"enabled": True}, headers=HDR).json() == {"enabled": True, "connected": True, "ssid": "Home"}


# --- endpoints use the lanes; a slow call never blocks the server --------------------------------

def test_hot_endpoints_run_on_their_lanes_and_the_server_stays_free(monkeypatch):
    where = {}

    def vol():
        where["volume"] = threading.current_thread().name
        time.sleep(0.15)
        return {"level": 33, "muted": False}

    def bri():
        where["brightness"] = threading.current_thread().name
        return {"level": 70}

    monkeypatch.setattr(h, "get_volume", vol)
    monkeypatch.setattr(h, "get_brightness", bri)
    h._register_lanes()
    try:
        with make() as c:
            assert c.get("/volume", headers=HDR).json() == {"level": 33, "muted": False}
            assert c.get("/brightness", headers=HDR).json() == {"level": 70}

            async def both():
                # Two requests at once: the slow volume read must not hold up /status.
                import httpx

                transport = httpx.ASGITransport(app=c.app)
                async with httpx.AsyncClient(transport=transport, base_url="http://t") as ac:
                    t0 = time.perf_counter()
                    slow = asyncio.create_task(ac.get("/volume", headers=HDR))
                    await asyncio.sleep(0.02)
                    quick = await ac.get("/status", headers=HDR)
                    quick_ms = (time.perf_counter() - t0) * 1000
                    await slow
                    return quick.status_code, quick_ms

            code, quick_ms = asyncio.run(both())
            assert code == 200 and quick_ms < 120
        assert where["volume"].startswith("halo-audio") and where["brightness"].startswith("halo-display")
    finally:
        monkeypatch.undo()
        h._register_lanes()


def test_a_backend_that_is_unavailable_is_a_503_with_its_sentence(monkeypatch):
    monkeypatch.setattr(h, "IS_WINDOWS", False)
    with make() as c:
        for path in ("/volume", "/mic", "/power-mode", "/wifi"):
            r = c.get(path, headers=HDR)
            assert r.status_code == 503 and r.json()["detail"], path
        assert c.post("/mute", json={}, headers=HDR).status_code == 503
        assert c.post("/mic/mute", json={}, headers=HDR).status_code == 503


# --- /latency --------------------------------------------------------------------------------------

def test_latency_needs_the_token():
    with make() as c:
        assert c.get("/latency").status_code == 401


def test_latency_reports_every_hot_path_and_changes_nothing(monkeypatch):
    sets = []
    monkeypatch.setattr(h, "get_volume", lambda: {"level": 20, "muted": False})
    monkeypatch.setattr(h, "set_volume", lambda lv: sets.append(("vol", lv)) or {"level": lv, "muted": False})
    monkeypatch.setattr(h, "set_mute", lambda m: sets.append(("mute", m)) or {"level": 20, "muted": m})
    monkeypatch.setattr(h, "mic_state", lambda: {"muted": True, "level": 0.0})
    monkeypatch.setattr(h, "set_mic_mute", lambda m: sets.append(("mic", m)) or {"muted": m, "level": 0.0})
    monkeypatch.setattr(h, "get_brightness", lambda: {"level": 55})
    monkeypatch.setattr(h, "set_brightness", lambda lv: sets.append(("bri", lv)) or {"level": lv})
    monkeypatch.setattr(h, "IS_WINDOWS", True)
    monkeypatch.setattr(h, "power_get_active_guid", lambda: f.POWER_SCHEMES["balanced"])
    monkeypatch.setattr(h, "power_set_active_guid", lambda g: sets.append(("power", g)))
    monkeypatch.setattr(h, "list_app_volumes", lambda: {"apps": []})

    async def wifi():
        return {"enabled": True, "connected": False, "ssid": None}

    monkeypatch.setattr(h, "get_wifi", wifi)
    with make() as c:
        r = c.get("/latency?n=5", headers=HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["target_ms"] == 50 and body["runs"] == 5 and body["ok"] is True and body["slow"] == []
    for name in ("volume_get", "volume_set", "mute_set", "mic_get", "mic_mute_set", "brightness_get", "brightness_set", "power_get", "wifi_get"):
        row = body["results"][name]
        assert row["n"] == 5 and row["median_ms"] >= 0 and row["p95_ms"] >= row["median_ms"], name
    # Sets only ever send what is already there.
    assert {v for k, v in sets if k == "vol"} == {20} and {v for k, v in sets if k == "mute"} == {False}
    assert {v for k, v in sets if k == "mic"} == {True} and {v for k, v in sets if k == "bri"} == {55}
    assert {v for k, v in sets if k == "power"} == {f.POWER_SCHEMES["balanced"]}


def test_latency_names_the_slow_paths_and_survives_a_missing_one(monkeypatch):
    def slow_volume():
        time.sleep(0.02)
        return {"level": 20, "muted": False}

    def no_panel():
        raise h.Unavailable("This screen doesn't allow brightness changes.")

    monkeypatch.setattr(h, "get_volume", slow_volume)
    monkeypatch.setattr(h, "get_brightness", no_panel)
    monkeypatch.setattr(h, "LATENCY_TARGET_MS", 5)
    monkeypatch.setattr(h, "IS_WINDOWS", False)
    out = asyncio.run(h.measure_latency(3))
    assert "volume_get" in out["slow"] and out["ok"] is False
    assert out["results"]["brightness_get"] == {"unavailable": "This screen doesn't allow brightness changes."}


def test_summary_statistics():
    s = f.summarise([1, 2, 3, 4, 100])
    assert s["n"] == 5 and s["median_ms"] == 3 and s["max_ms"] == 100 and s["p95_ms"] == 100
    assert f.summarise([]) == {"n": 0, "median_ms": 0.0, "p95_ms": 0.0, "max_ms": 0.0}


# --- /events: every state is pushed, the first pass sends them all -------------------------------

def test_the_event_stream_pushes_every_state_on_connect_and_then_only_changes(monkeypatch):
    import httpx
    import uvicorn

    monkeypatch.setattr(h, "IS_WINDOWS", True)
    state = {"vol": {"level": 41, "muted": False}}
    monkeypatch.setattr(h, "get_volume", lambda: state["vol"])
    monkeypatch.setattr(h, "get_brightness", lambda: {"level": 60})
    monkeypatch.setattr(h, "probe_mic", lambda: {"muted": False})
    monkeypatch.setattr(h, "mic_state", lambda: {"muted": False, "level": 0.5})
    monkeypatch.setattr(h, "probe_output", lambda: {"name": "Speakers", "kind": "speakers"})
    monkeypatch.setattr(h, "list_app_volumes", lambda: {"apps": [{"id": "spotify", "name": "Spotify", "level": 80, "muted": False}]})
    monkeypatch.setattr(h, "get_battery", lambda: {"present": True, "percent": 80, "charging": False, "minutes_left": 120})
    monkeypatch.setattr(h, "get_power_mode", lambda: {"mode": "balanced"})

    async def wifi():
        return {"enabled": True, "connected": True, "ssid": "Home"}

    async def bt():
        return {"enabled": True, "connected_device": None}

    async def nothing():
        raise h.Unavailable("no")

    monkeypatch.setattr(h, "get_wifi", wifi)
    monkeypatch.setattr(h, "get_bluetooth", bt)
    monkeypatch.setattr(h, "probe_caps", lambda: {"on": False})
    monkeypatch.setattr(h, "probe_airplane", nothing)
    monkeypatch.setattr(h, "probe_night", lambda: (_ for _ in ()).throw(h.Unavailable("no")))
    monkeypatch.setattr(h, "EXTRA_PROBES", [
        ("brightness", 2, h.probe_brightness, True), ("mic", 1, h.probe_mic_async, True), ("caps", 1, h.probe_caps, False),
        ("output", 1, h.probe_output_async, True), ("wifi", 3, wifi, True), ("bluetooth", 5, bt, True),
        ("power", 2, h.probe_power, True), ("apps", 2, h.probe_apps, True),
    ])
    h._register_lanes()
    app = h.create_app("tok", media=FakeMedia(), poll_seconds=0.1, notifications=FakeNotes(), clipboard=x.ClipboardHistory(read=lambda: None, sequence=lambda: 0))
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    try:
        for _ in range(100):
            try:
                httpx.get(f"http://127.0.0.1:{port}/status", headers=HDR, timeout=0.5)
                break
            except Exception:
                time.sleep(0.05)
        seen: list[str] = []
        with httpx.stream("GET", f"http://127.0.0.1:{port}/events", headers=HDR, timeout=5) as r:
            assert r.status_code == 200
            t0 = time.time()
            # Something outside Halo (a volume key) changes the volume a moment after the page connected.
            threading.Timer(0.35, lambda: state.update(vol={"level": 55, "muted": True})).start()
            for line in r.iter_lines():
                if line.startswith("event: "):
                    seen.append(line[7:])
                if seen.count("volume") >= 2 or time.time() - t0 > 4:
                    break
        first = set(seen)
        assert {"media", "volume", "battery", "brightness", "mic", "mic_level", "output", "wifi", "bluetooth", "power", "apps"} <= first, first
        assert seen.count("volume") == 2, "one for the connect, one for the change, none for the polls in between"
        assert seen.count("wifi") == 1 and seen.count("power") == 1
    finally:
        server.should_exit = True
        t.join(timeout=5)
        monkeypatch.undo()
        h._register_lanes()


# --- the real backends, when asked ---------------------------------------------------------------

@pytest.mark.skipif(not LIVE, reason="HALO_LIVE=1 on a Windows laptop")
def test_live_hot_paths_are_under_fifty_milliseconds():
    f.warm_up()
    time.sleep(1.0)
    out = asyncio.run(h.measure_latency(25))
    print("LATENCY", {k: v for k, v in out["results"].items()})
    for name in ("volume_get", "volume_set", "mute_set", "mic_get", "mic_mute_set"):
        row = out["results"][name]
        if "unavailable" in row:
            continue
        assert row["median_ms"] < 50 and row["p95_ms"] < 50, (name, row)
    for name in ("brightness_get", "brightness_set"):
        row = out["results"][name]
        if "unavailable" not in row:
            assert row["median_ms"] < 50, (name, row)
