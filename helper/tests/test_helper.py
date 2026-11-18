import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import halo_helper as h  # noqa: E402

TOKEN = "test-token-123"
GOOD = "https://liam-ohalloran.github.io"


class FakeMedia:
    async def info(self):
        return {"available": True, "title": "Song", "artist": "A", "album": "B", "source": "Spotify",
                "playing": True, "position": 1.0, "duration": 100.0, "has_art": False}

    async def art(self):
        return None

    async def control(self, action):
        return True

    async def seek(self, seconds):
        return True


@pytest.fixture()
def client():
    return TestClient(h.create_app(TOKEN, media=FakeMedia()))


# --- token ---------------------------------------------------------------

def test_no_token_is_401(client):
    assert client.get("/status").status_code == 401


def test_wrong_token_is_401(client):
    assert client.get("/status", headers={"X-Halo-Token": "nope"}).status_code == 401


def test_right_token_is_200(client):
    r = client.get("/status", headers={"X-Halo-Token": TOKEN})
    assert r.status_code == 200 and r.json()["ok"] is True


def test_every_endpoint_needs_token(client):
    for path in ["/media", "/media/art", "/volume", "/brightness", "/battery", "/wifi", "/bluetooth", "/power-mode"]:
        assert client.get(path).status_code == 401, path
    for path in ["/media/play", "/media/seek", "/volume", "/mute", "/power-mode"]:
        assert client.post(path, json={}).status_code == 401, path


def test_media_with_token(client):
    r = client.get("/media", headers={"X-Halo-Token": TOKEN})
    assert r.json()["title"] == "Song"


def test_unknown_media_action_404(client):
    assert client.post("/media/explode", headers={"X-Halo-Token": TOKEN}).status_code == 404


def test_token_created_then_reused(tmp_path):
    p = tmp_path / "HaloHelper" / "token.txt"
    first = h.load_or_create_token(p)
    assert len(first) >= 32 and p.read_text() == first
    assert h.load_or_create_token(p) == first


def test_token_check_helper():
    assert h.token_is_valid("abc", "abc")
    assert not h.token_is_valid("abd", "abc")
    assert not h.token_is_valid(None, "abc")
    assert not h.token_is_valid("", "abc")


# --- CORS ----------------------------------------------------------------

def test_cors_allowed_origins(client):
    for origin in ["https://liam-ohalloran.github.io", "http://localhost:5173"]:
        r = client.get("/status", headers={"X-Halo-Token": TOKEN, "Origin": origin})
        assert r.headers["access-control-allow-origin"] == origin


def test_cors_blocks_other_origin(client):
    r = client.get("/status", headers={"X-Halo-Token": TOKEN, "Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_401_still_carries_cors_headers(client):
    r = client.get("/status", headers={"Origin": GOOD})
    assert r.status_code == 401
    assert r.headers["access-control-allow-origin"] == GOOD


def test_preflight_needs_no_token_and_allows_token_header(client):
    r = client.options("/media", headers={
        "Origin": GOOD,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-halo-token",
    })
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == GOOD
    assert "x-halo-token" in r.headers["access-control-allow-headers"].lower()


def test_preflight_private_network_header(client):
    r = client.options("/media", headers={
        "Origin": GOOD,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-halo-token",
        "Access-Control-Request-Private-Network": "true",
    })
    assert r.headers["access-control-allow-private-network"] == "true"


def test_no_private_network_header_for_other_origin(client):
    r = client.options("/media", headers={
        "Origin": "https://evil.example",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Private-Network": "true",
    })
    assert "access-control-allow-private-network" not in r.headers


def test_binds_localhost_only():
    assert h.HOST == "127.0.0.1" and h.PORT == 47800


def test_friendly_source():
    assert h.friendly_source("Spotify.exe") == "Spotify"
    assert h.friendly_source("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify") == "Spotify"
    assert h.friendly_source("Chrome") == "Chrome"
