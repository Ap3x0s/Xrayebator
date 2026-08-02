"""Точка входа: QApplication, тема HeroUI v3, главное окно, tray."""

from __future__ import annotations

import sys

from PySide6.QtGui import QColor, QIcon, QPixmap, QPainter, QBrush
from PySide6.QtWidgets import QApplication

from .ui.main_window import MainWindow
from .ui.theme import apply_theme

APP_NAME = "Xrayebator GUI"


def make_app_icon(size: int = 64) -> QIcon:
    """Нарисовать простую иконку-круг (для tray и окна)."""
    pm = QPixmap(size, size)
    pm.fill(QColor(0, 0, 0, 0))
    painter = QPainter(pm)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.setBrush(QBrush(QColor(42, 130, 218)))
    painter.setPen(QColor(0, 0, 0, 0))
    painter.drawEllipse(4, 4, size - 8, size - 8)
    painter.setPen(QColor(255, 255, 255))
    font = painter.font()
    font.setBold(True)
    font.setPixelSize(size // 2)
    painter.setFont(font)
    painter.drawText(pm.rect(), 0x0084, "X")  # Qt.AlignmentFlag.AlignCenter
    painter.end()
    return QIcon(pm)


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setOrganizationName("xrayebator")
    # Не выходить из приложения при закрытии окна — живём в tray.
    app.setQuitOnLastWindowClosed(False)
    apply_theme(app, mode="dark")
    icon = make_app_icon()
    app.setWindowIcon(icon)

    window = MainWindow(icon=icon)
    if "--self-test" in sys.argv[1:]:
        window.close()
        return 0
    window.show()
    return app.exec()
