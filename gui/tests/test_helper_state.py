from __future__ import annotations

import os

import pytest

from xrayebator_gui.core.subscription import parse_link
from xrayebator_gui.helper.state import RouteStateStore, StateError


ROUTE = (
    "vless://11111111-1111-1111-1111-111111111111@vpn.example.com:443"
    "?type=tcp&security=reality&sni=www.example.com"
    "&pbk=public&sid=0123456789abcdef#Vision"
)


def test_state_round_trip_is_owner_only(tmp_path):
    path = tmp_path / "state" / "last-route.json"
    store = RouteStateStore(path, expected_uid=os.getuid())
    route = parse_link(ROUTE)
    assert route is not None

    store.save(route, "198.51.100.20")
    restored = store.load()

    assert restored is not None
    assert restored.route.raw == route.raw
    assert restored.resolved_address == "198.51.100.20"
    assert path.stat().st_mode & 0o777 == 0o600


def test_state_rejects_group_readable_secret(tmp_path):
    path = tmp_path / "last-route.json"
    store = RouteStateStore(path, expected_uid=os.getuid())
    route = parse_link(ROUTE)
    assert route is not None
    store.save(route, "198.51.100.20")
    path.chmod(0o640)

    with pytest.raises(StateError, match="owner/mode"):
        store.load()
