"""Bounded parallel TCP latency probes for subscription routes."""

from __future__ import annotations

import socket
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable, Optional

from .subscription import VlessLink


def probe_endpoint(
    host: str,
    port: int,
    *,
    timeout: float = 2.0,
) -> Optional[int]:
    started = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            elapsed = time.perf_counter() - started
    except OSError:
        return None
    return max(1, round(elapsed * 1000))


def probe_routes(
    routes: Iterable[VlessLink],
    *,
    timeout: float = 2.0,
    max_workers: int = 8,
) -> dict[str, Optional[int]]:
    route_list = list(routes)
    endpoints = {(route.address, route.port) for route in route_list}
    endpoint_latency: dict[tuple[str, int], Optional[int]] = {}
    with ThreadPoolExecutor(
        max_workers=min(max_workers, max(1, len(endpoints)))
    ) as executor:
        futures = {
            executor.submit(
                probe_endpoint,
                host,
                port,
                timeout=timeout,
            ): (host, port)
            for host, port in endpoints
        }
        for future in as_completed(futures):
            endpoint_latency[futures[future]] = future.result()
    return {
        route.raw: endpoint_latency[(route.address, route.port)] for route in route_list
    }
