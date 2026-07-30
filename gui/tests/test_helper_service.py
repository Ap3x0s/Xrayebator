from __future__ import annotations

from xrayebator_gui.core.helper_protocol import HelperRequest
from xrayebator_gui.helper.service import HelperApplication


class FakeRuntime:
    def __init__(self):
        self.calls = []

    def status(self):
        self.calls.append(("status",))
        return {"state": "disconnected", "external_ip": None, "error": None}

    def connect(self, route):
        self.calls.append(("connect", route))
        return {"state": "connected", "external_ip": None, "error": None}

    def switch(self, route):
        self.calls.append(("switch", route))
        return {"state": "connected", "external_ip": None, "error": None}

    def verify(self):
        self.calls.append(("verify",))
        return {
            "state": "connected",
            "external_ip": "203.0.113.1",
            "error": None,
        }

    def disconnect(self):
        self.calls.append(("disconnect",))
        return {"state": "disconnected", "external_ip": None, "error": None}


def test_application_dispatches_only_typed_actions():
    runtime = FakeRuntime()
    app = HelperApplication(runtime)

    result = app.handle(HelperRequest("abc", "status"))

    assert result["state"] == "disconnected"
    assert runtime.calls == [("status",)]
