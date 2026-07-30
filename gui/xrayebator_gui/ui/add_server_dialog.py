"""Диалог добавления сервера: IP, SSH, пользователь, auth, email."""

from __future__ import annotations

import re

from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QFormLayout,
    QHBoxLayout,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
)

_HOST_RE = re.compile(
    r"^(?=.{1,253}$)("
    r"(\d{1,3}\.){3}\d{1,3}"  # IPv4
    r"|([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}"  # hostname
    r")$"
)
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def valid_host(host: str) -> bool:
    """Проверка IPv4 или hostname перед отправкой на сервер."""
    if not _HOST_RE.match(host):
        return False
    if re.match(r"^(\d{1,3}\.){3}\d{1,3}$", host):
        return all(0 <= int(octet) <= 255 for octet in host.split("."))
    return True


def valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(email))


class AddServerDialog(QDialog):
    """Форма параметров VPS; «Развернуть и добавить» → accepted с данными."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Добавить сервер")
        self.setMinimumWidth(420)

        self.host_edit = QLineEdit()
        self.host_edit.setPlaceholderText("203.0.113.10 или vpn.example.com")
        self.port_spin = QSpinBox()
        self.port_spin.setRange(1, 65535)
        self.port_spin.setValue(22)
        self.user_edit = QLineEdit("root")
        self.auth_combo = QComboBox()
        self.auth_combo.addItems(["Пароль", "SSH-ключ"])
        self.password_edit = QLineEdit()
        self.password_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.sudo_password_edit = QLineEdit()
        self.sudo_password_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.sudo_password_edit.setPlaceholderText(
            "необязательно: пусто = SSH-пароль или passwordless sudo"
        )
        self.key_edit = QLineEdit()
        self.key_edit.setPlaceholderText("~/.ssh/id_ed25519")
        key_browse = QPushButton("Обзор…")
        key_browse.clicked.connect(self._browse_key)
        key_row = QHBoxLayout()
        key_row.addWidget(self.key_edit, 1)
        key_row.addWidget(key_browse)
        self.email_edit = QLineEdit()
        self.email_edit.setPlaceholderText("you@example.com (для Let's Encrypt)")

        form = QFormLayout()
        form.addRow("Адрес сервера:", self.host_edit)
        form.addRow("SSH порт:", self.port_spin)
        form.addRow("Пользователь:", self.user_edit)
        form.addRow("Аутентификация:", self.auth_combo)
        form.addRow("Пароль:", self.password_edit)
        form.addRow("Файл ключа:", key_row)
        form.addRow("Пароль sudo:", self.sudo_password_edit)
        form.addRow("Email:", self.email_edit)

        self.buttons = QDialogButtonBox()
        deploy_btn = self.buttons.addButton(
            "Развернуть и добавить", QDialogButtonBox.ButtonRole.AcceptRole
        )
        self.buttons.addButton(QDialogButtonBox.StandardButton.Cancel)
        deploy_btn.clicked.connect(self._on_accept)
        self.buttons.rejected.connect(self.reject)

        self.auth_combo.currentIndexChanged.connect(self._update_auth_fields)
        self._update_auth_fields()

        layout = QVBoxLayout(self)
        layout.addLayout(form)
        layout.addWidget(self.buttons)

    def _update_auth_fields(self) -> None:
        use_password = self.auth_combo.currentIndex() == 0
        self.password_edit.setEnabled(use_password)
        self.key_edit.setEnabled(not use_password)

    def _browse_key(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self, "Выберите приватный SSH-ключ", "", "Все файлы (*)"
        )
        if path:
            self.key_edit.setText(path)

    def _on_accept(self) -> None:
        errors = []
        if not valid_host(self.host_edit.text().strip()):
            errors.append("Некорректный адрес сервера (IPv4 или hostname).")
        if not self.user_edit.text().strip():
            errors.append("Укажите пользователя SSH.")
        if self.auth_combo.currentIndex() == 0:
            if not self.password_edit.text():
                errors.append("Укажите пароль.")
        else:
            if not self.key_edit.text().strip():
                errors.append("Укажите путь к файлу SSH-ключа.")
        if not valid_email(self.email_edit.text().strip()):
            errors.append("Некорректный email (нужен для Let's Encrypt).")
        if errors:
            QMessageBox.warning(self, "Проверьте поля", "\n".join(errors))
            return
        self.accept()

    def values(self) -> dict:
        """Собранные и проверенные параметры формы."""
        use_password = self.auth_combo.currentIndex() == 0
        return {
            "host": self.host_edit.text().strip(),
            "port": self.port_spin.value(),
            "user": self.user_edit.text().strip(),
            "auth_type": "password" if use_password else "key",
            "password": self.password_edit.text() if use_password else None,
            "key_path": self.key_edit.text().strip() if not use_password else None,
            "sudo_password": self.sudo_password_edit.text() or None,
            "email": self.email_edit.text().strip(),
        }
