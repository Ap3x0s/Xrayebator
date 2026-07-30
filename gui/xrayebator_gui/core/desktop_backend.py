"""Select the concrete backend for system-proxy or privileged TUN mode."""

from __future__ import annotations

from typing import Optional

from .connection import ConnectionMode, TunnelBackend
from .helper_client import HelperClient, HelperTunBackend
from .local_proxy import LocalProxyBackend
from .subscription import VlessLink


class DesktopBackend:
    def __init__(
        self,
        *,
        local: Optional[TunnelBackend] = None,
        tun: Optional[TunnelBackend] = None,
        helper_client: Optional[HelperClient] = None,
    ):
        self._local = local or LocalProxyBackend()
        self._helper_client = helper_client or HelperClient()
        self._tun = tun or HelperTunBackend(self._helper_client)
        self._selected: Optional[TunnelBackend] = None
        self._mode: Optional[ConnectionMode] = None

    @property
    def tun_available(self) -> bool:
        return self._helper_client.available()

    def _backend(self, mode: ConnectionMode) -> TunnelBackend:
        return self._tun if mode == ConnectionMode.TUN else self._local

    def prepare(self, route: VlessLink, mode: ConnectionMode) -> None:
        selected = self._backend(mode)
        self._selected = selected
        self._mode = mode
        selected.prepare(route, mode)

    def start(self, route: VlessLink, mode: ConnectionMode) -> None:
        if self._selected is None or mode != self._mode:
            raise RuntimeError("Backend не подготовлен")
        self._selected.start(route, mode)

    def verify(self) -> Optional[str]:
        if self._selected is None:
            return None
        return self._selected.verify()

    def replace(self, route: VlessLink, mode: ConnectionMode) -> None:
        if self._selected is None or mode != self._mode:
            raise RuntimeError("Активный backend не найден")
        self._selected.replace(route, mode)

    def stop(self) -> None:
        if self._selected is None:
            return
        try:
            self._selected.stop()
        finally:
            self._selected = None
            self._mode = None
