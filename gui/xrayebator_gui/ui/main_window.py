"""Main desktop window, tray integration, deployment and connection controls."""

from __future__ import annotations

from typing import Callable, Optional

from PySide6.QtCore import QObject, QThread, Signal, Slot
from PySide6.QtGui import QAction, QCloseEvent, QIcon
from PySide6.QtWidgets import (
    QComboBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSystemTrayIcon,
    QTextEdit,
    QVBoxLayout,
    QWidget,
    QMenu,
)

from ..core.connection import (
    ConnectionController,
    ConnectionMode,
    ConnectionSnapshot,
    ConnectionState,
)
from ..core.deploy import STEPS, make_deploy_thread
from ..core.desktop_backend import DesktopBackend
from ..core.servers import ServerStore
from ..core.ssh import SSHClient
from ..core import subscription
from ..core.subscription import VlessLink
from .add_server_dialog import AddServerDialog


class OperationThread(QThread):
    """Run one blocking Python callable without freezing Qt."""

    succeeded = Signal(object)
    failed = Signal(str)

    def __init__(
        self, operation: Callable[[], object], parent: Optional[QObject] = None
    ):
        super().__init__(parent)
        self._operation = operation

    def run(self) -> None:
        try:
            result = self._operation()
        except Exception as exc:  # noqa: BLE001 - surface operation error to UI
            self.failed.emit(str(exc))
            return
        self.succeeded.emit(result)


class _ConnectionBridge(QObject):
    snapshot_changed = Signal(object)


_STATE_LABELS = {
    ConnectionState.DISCONNECTED: "Отключено",
    ConnectionState.PREPARING: "Подготовка…",
    ConnectionState.CONNECTING: "Подключение…",
    ConnectionState.VERIFYING: "Проверка туннеля…",
    ConnectionState.CONNECTED: "Подключено",
    ConnectionState.SWITCHING: "Переключение маршрута…",
    ConnectionState.DISCONNECTING: "Отключение…",
    ConnectionState.RECOVERING: "Восстановление предыдущего маршрута…",
    ConnectionState.ERROR: "Ошибка",
}

_BUSY_STATES = {
    ConnectionState.PREPARING,
    ConnectionState.CONNECTING,
    ConnectionState.VERIFYING,
    ConnectionState.SWITCHING,
    ConnectionState.DISCONNECTING,
    ConnectionState.RECOVERING,
}


class MainWindow(QMainWindow):
    def __init__(
        self,
        *,
        icon: QIcon,
        store: Optional[ServerStore] = None,
        controller: Optional[ConnectionController] = None,
    ):
        super().__init__()
        self.setWindowTitle("Xrayebator")
        self.setWindowIcon(icon)
        self.resize(760, 540)

        self._store = store or ServerStore()
        if controller is None:
            desktop_backend = DesktopBackend()
            self._controller = ConnectionController(desktop_backend)
            self._tun_available = desktop_backend.tun_available
        else:
            self._controller = controller
            self._tun_available = False
        self._bridge = _ConnectionBridge(self)
        self._controller.subscribe(self._bridge.snapshot_changed.emit)
        self._bridge.snapshot_changed.connect(self._on_snapshot)

        self._routes: list[VlessLink] = []
        self._operation: Optional[OperationThread] = None
        self._deploy_thread: Optional[QThread] = None
        self._quitting = False

        self._build_ui()
        self._build_tray(icon)
        self._reload_servers()
        self._on_snapshot(self._controller.snapshot)

    def _build_ui(self) -> None:
        root = QWidget()
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(14)

        title = QLabel("Xrayebator")
        title_font = title.font()
        title_font.setPointSize(20)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)

        subtitle = QLabel(
            "Разверните собственный сервер, выберите маршрут и подключитесь."
        )
        subtitle.setStyleSheet("color: #a0a0a0")
        layout.addWidget(subtitle)

        server_row = QHBoxLayout()
        self.server_combo = QComboBox()
        self.server_combo.currentIndexChanged.connect(self._server_changed)
        server_row.addWidget(self.server_combo, 1)
        self.add_server_button = QPushButton("Добавить VPS…")
        self.add_server_button.clicked.connect(self._add_server)
        server_row.addWidget(self.add_server_button)
        self.remove_server_button = QPushButton("Удалить")
        self.remove_server_button.clicked.connect(self._remove_server)
        server_row.addWidget(self.remove_server_button)
        layout.addLayout(server_row)

        form = QFormLayout()
        self.mode_combo = QComboBox()
        tun_label = (
            "TUN (native Xray)"
            if self._tun_available
            else "TUN — privileged helper не установлен"
        )
        self.mode_combo.addItem(tun_label, ConnectionMode.TUN)
        tun_item = self.mode_combo.model().item(0)
        if tun_item is not None and not self._tun_available:
            tun_item.setEnabled(False)
        self.mode_combo.addItem(
            "Системный proxy (текущий MVP)", ConnectionMode.SYSTEM_PROXY
        )
        self.mode_combo.setCurrentIndex(0 if self._tun_available else 1)
        form.addRow("Режим:", self.mode_combo)

        route_row = QHBoxLayout()
        self.route_combo = QComboBox()
        route_row.addWidget(self.route_combo, 1)
        self.refresh_button = QPushButton("Обновить")
        self.refresh_button.clicked.connect(self._refresh_routes)
        route_row.addWidget(self.refresh_button)
        self.switch_button = QPushButton("Переключить")
        self.switch_button.clicked.connect(self._switch_route)
        route_row.addWidget(self.switch_button)
        form.addRow("Маршрут:", route_row)
        layout.addLayout(form)

        status_row = QHBoxLayout()
        self.status_label = QLabel("Отключено")
        status_font = self.status_label.font()
        status_font.setBold(True)
        self.status_label.setFont(status_font)
        status_row.addWidget(self.status_label)
        status_row.addStretch()
        self.ip_label = QLabel("")
        self.ip_label.setStyleSheet("color: #a0a0a0")
        status_row.addWidget(self.ip_label)
        layout.addLayout(status_row)

        self.connect_button = QPushButton("Подключить")
        self.connect_button.setMinimumHeight(52)
        self.connect_button.clicked.connect(self._toggle_connection)
        layout.addWidget(self.connect_button)

        self.log = QTextEdit()
        self.log.setReadOnly(True)
        self.log.setPlaceholderText("Здесь появятся этапы развёртывания и подключения.")
        layout.addWidget(self.log, 1)

    def _build_tray(self, icon: QIcon) -> None:
        self.tray = QSystemTrayIcon(icon, self)
        self.tray.setToolTip("Xrayebator — отключено")
        self.tray.activated.connect(self._tray_activated)

        menu = QMenu(self)
        show_action = QAction("Открыть Xrayebator", self)
        show_action.triggered.connect(self._show_window)
        menu.addAction(show_action)
        self.tray_toggle_action = QAction("Подключить", self)
        self.tray_toggle_action.triggered.connect(self._toggle_connection)
        menu.addAction(self.tray_toggle_action)
        menu.addSeparator()
        quit_action = QAction("Выйти", self)
        quit_action.triggered.connect(self._quit)
        menu.addAction(quit_action)
        self.tray.setContextMenu(menu)
        self.tray.show()

    def _append_log(self, text: str) -> None:
        self.log.append(text)

    def _reload_servers(self, select_id: Optional[str] = None) -> None:
        self.server_combo.blockSignals(True)
        self.server_combo.clear()
        servers = self._store.list()
        for server in servers:
            self.server_combo.addItem(
                server.get("name") or server.get("host") or "Сервер",
                server,
            )
        self.server_combo.blockSignals(False)

        if select_id:
            for index in range(self.server_combo.count()):
                data = self.server_combo.itemData(index)
                if data and data.get("id") == select_id:
                    self.server_combo.setCurrentIndex(index)
                    break
        self._server_changed()

    def _selected_server(self) -> Optional[dict]:
        data = self.server_combo.currentData()
        return data if isinstance(data, dict) else None

    def _selected_route(self) -> Optional[VlessLink]:
        index = self.route_combo.currentIndex()
        if 0 <= index < len(self._routes):
            return self._routes[index]
        return None

    @Slot()
    def _server_changed(self) -> None:
        self._routes = []
        self.route_combo.clear()
        server = self._selected_server()
        enabled = server is not None
        self.remove_server_button.setEnabled(enabled)
        self.refresh_button.setEnabled(enabled)
        if enabled:
            self._refresh_routes()
        else:
            self.route_combo.addItem("Сначала добавьте VPS")
        self._on_snapshot(self._controller.snapshot)

    @Slot()
    def _refresh_routes(self) -> None:
        server = self._selected_server()
        if not server or self._operation is not None:
            return
        url = server.get("subscription_url", "")
        if not url:
            QMessageBox.warning(self, "Нет подписки", "У сервера нет subscription URL.")
            return

        self.route_combo.clear()
        self.route_combo.addItem("Загрузка подписки…")
        self._set_operation_busy(True)

        def load() -> list[VlessLink]:
            routes = subscription.parse(subscription.fetch(url))
            if not routes:
                raise RuntimeError(
                    "Подписка не содержит поддерживаемых VLESS-маршрутов"
                )
            return routes

        self._start_operation(load, self._routes_loaded, self._routes_failed)

    def _routes_loaded(self, result: object) -> None:
        routes = list(result) if isinstance(result, list) else []
        self._routes = routes
        self.route_combo.clear()
        for route in routes:
            label = route.remark or route.label
            self.route_combo.addItem(f"{label} — {route.label}")
        default = subscription.pick_default(routes)
        if default is not None:
            self.route_combo.setCurrentIndex(routes.index(default))
        self._append_log(f"Подписка обновлена: {len(routes)} маршрутов")
        self._set_operation_busy(False)
        self._on_snapshot(self._controller.snapshot)

    def _routes_failed(self, message: str) -> None:
        self._routes = []
        self.route_combo.clear()
        self.route_combo.addItem("Не удалось загрузить маршруты")
        self._append_log(f"Ошибка подписки: {message}")
        self._set_operation_busy(False)
        QMessageBox.warning(self, "Ошибка подписки", message)
        self._on_snapshot(self._controller.snapshot)

    @Slot()
    def _add_server(self) -> None:
        dialog = AddServerDialog(self)
        if dialog.exec() != AddServerDialog.DialogCode.Accepted:
            return
        values = dialog.values()
        self._append_log(f"Начинаю развёртывание на {values['host']}…")
        self._set_operation_busy(True)

        thread = make_deploy_thread(
            ssh_client=SSHClient(),
            host=values["host"],
            port=values["port"],
            user=values["user"],
            password=values["password"],
            key_path=values["key_path"],
            sudo_password=values["sudo_password"],
            email=values["email"],
        )
        self._deploy_thread = thread
        thread.step_changed.connect(
            lambda index, name: self._append_log(f"[{index + 1}/{len(STEPS)}] {name}")
        )
        thread.log_line.connect(self._append_log)
        thread.finished_ok.connect(
            lambda result: self._deployment_finished(values, result)
        )
        thread.failed.connect(self._deployment_failed)
        thread.finished.connect(self._deployment_thread_finished)
        thread.start()

    def _deployment_finished(self, values: dict, result: dict) -> None:
        server = self._store.add(
            name=values["host"],
            host=values["host"],
            port=values["port"],
            user=values["user"],
            auth_type=values["auth_type"],
            password=values["password"],
            key_path=values["key_path"],
            subscription_url=result["subscription_url"],
            profile=result.get("profile", "happ"),
        )
        self._append_log(f"Сервер добавлен. Подписка: {result['subscription_url']}")
        self._reload_servers(select_id=server["id"])

    def _deployment_failed(self, message: str) -> None:
        self._append_log(f"Развёртывание не удалось: {message}")
        QMessageBox.critical(self, "Ошибка развёртывания", message)

    def _deployment_thread_finished(self) -> None:
        self._deploy_thread = None
        self._set_operation_busy(False)
        self._on_snapshot(self._controller.snapshot)

    @Slot()
    def _remove_server(self) -> None:
        server = self._selected_server()
        if not server:
            return
        answer = QMessageBox.question(
            self,
            "Удалить сервер?",
            f"Удалить {server.get('name') or server.get('host')} из приложения?\n"
            "Конфигурация VPS изменена не будет.",
        )
        if answer != QMessageBox.StandardButton.Yes:
            return
        self._store.remove(server["id"])
        self._reload_servers()

    @Slot()
    def _toggle_connection(self) -> None:
        state = self._controller.snapshot.state
        if state in _BUSY_STATES or self._operation is not None:
            return
        if state == ConnectionState.CONNECTED:
            self._start_connection_operation(self._controller.disconnect)
            return

        route = self._selected_route()
        if route is None:
            QMessageBox.warning(self, "Нет маршрута", "Сначала загрузите подписку.")
            return
        mode = self.mode_combo.currentData()
        if not isinstance(mode, ConnectionMode):
            mode = ConnectionMode(mode)
        self._start_connection_operation(lambda: self._controller.connect(route, mode))

    @Slot()
    def _switch_route(self) -> None:
        route = self._selected_route()
        if route is None:
            return
        if self._controller.snapshot.state != ConnectionState.CONNECTED:
            QMessageBox.information(
                self,
                "Маршрут выбран",
                "Маршрут будет использован при следующем подключении.",
            )
            return
        self._start_connection_operation(
            lambda: self._controller.switch_route(route),
            switch=True,
        )

    def _start_connection_operation(
        self, operation: Callable[[], object], *, switch: bool = False
    ) -> None:
        self._set_operation_busy(True)

        def failed(message: str) -> None:
            self._set_operation_busy(False)
            self._append_log(message)
            title = "Маршрут восстановлен" if switch else "Ошибка подключения"
            icon = QMessageBox.Icon.Warning if switch else QMessageBox.Icon.Critical
            box = QMessageBox(icon, title, message, parent=self)
            box.exec()
            self._on_snapshot(self._controller.snapshot)

        def succeeded(result: object) -> None:
            self._set_operation_busy(False)
            if isinstance(result, ConnectionSnapshot):
                if result.state == ConnectionState.CONNECTED:
                    self._append_log(
                        f"Подключено через {result.route.label if result.route else '?'}; "
                        f"внешний IP: {result.external_ip or '?'}"
                    )
                elif result.state == ConnectionState.DISCONNECTED:
                    self._append_log("Соединение отключено")
            self._on_snapshot(self._controller.snapshot)

        self._start_operation(operation, succeeded, failed)

    def _start_operation(
        self,
        operation: Callable[[], object],
        on_success: Callable[[object], None],
        on_failure: Callable[[str], None],
    ) -> None:
        if self._operation is not None:
            return
        worker = OperationThread(operation, self)
        self._operation = worker
        worker.succeeded.connect(on_success)
        worker.failed.connect(on_failure)
        worker.finished.connect(self._operation_finished)
        worker.start()

    def _operation_finished(self) -> None:
        self._operation = None

    def _set_operation_busy(self, busy: bool) -> None:
        self.add_server_button.setEnabled(not busy)
        self.server_combo.setEnabled(not busy)
        self.mode_combo.setEnabled(not busy)
        self.refresh_button.setEnabled(not busy and self._selected_server() is not None)

    @Slot(object)
    def _on_snapshot(self, snapshot: ConnectionSnapshot) -> None:
        label = _STATE_LABELS[snapshot.state]
        self.status_label.setText(label)
        self.ip_label.setText(
            f"Внешний IP: {snapshot.external_ip}" if snapshot.external_ip else ""
        )
        connected = snapshot.state == ConnectionState.CONNECTED
        busy = snapshot.state in _BUSY_STATES
        self.connect_button.setText("Отключить" if connected else "Подключить")
        self.connect_button.setEnabled(
            not busy and (connected or self._selected_route() is not None)
        )
        self.switch_button.setEnabled(
            connected and self._selected_route() is not None and not busy
        )
        self.tray_toggle_action.setText("Отключить" if connected else "Подключить")
        self.tray_toggle_action.setEnabled(not busy)
        self.tray.setToolTip(f"Xrayebator — {label.lower()}")
        if snapshot.error and snapshot.state == ConnectionState.ERROR:
            self.status_label.setToolTip(snapshot.error)
        else:
            self.status_label.setToolTip("")

    @Slot(QSystemTrayIcon.ActivationReason)
    def _tray_activated(self, reason: QSystemTrayIcon.ActivationReason) -> None:
        if reason in {
            QSystemTrayIcon.ActivationReason.Trigger,
            QSystemTrayIcon.ActivationReason.DoubleClick,
        }:
            self._show_window()

    def _show_window(self) -> None:
        self.show()
        self.raise_()
        self.activateWindow()

    def closeEvent(self, event: QCloseEvent) -> None:
        if self._quitting:
            event.accept()
            return
        event.ignore()
        self.hide()
        self.tray.showMessage(
            "Xrayebator",
            "Приложение продолжает работать в системном трее.",
            QSystemTrayIcon.MessageIcon.Information,
            2500,
        )

    def _quit(self) -> None:
        self._quitting = True
        if self._controller.snapshot.state != ConnectionState.DISCONNECTED:
            try:
                self._controller.disconnect()
            except Exception as exc:  # cleanup error is shown but quit remains possible
                QMessageBox.warning(self, "Ошибка отключения", str(exc))
        self.tray.hide()
        from PySide6.QtWidgets import QApplication

        application = QApplication.instance()
        if application is not None:
            application.quit()
