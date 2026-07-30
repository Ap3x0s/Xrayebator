"""Точка входа: QApplication, тёмная тема, главное окно, tray."""

from __future__ import annotations

import sys

from PySide6.QtGui import QColor, QIcon, QPalette, QPixmap, QPainter, QBrush
from PySide6.QtWidgets import QApplication

from .ui.main_window import MainWindow

APP_NAME = "Xrayebator GUI"


def _apply_dark_palette(app: QApplication) -> None:
    """Простая тёмная тема через QPalette."""
    p = QPalette()
    p.setColor(QPalette.ColorRole.Window, QColor(45, 45, 48))
    p.setColor(QPalette.ColorRole.WindowText, QColor(220, 220, 220))
    p.setColor(QPalette.ColorRole.Base, QColor(30, 30, 32))
    p.setColor(QPalette.ColorRole.AlternateBase, QColor(45, 45, 48))
    p.setColor(QPalette.ColorRole.ToolTipBase, QColor(30, 30, 32))
    p.setColor(QPalette.ColorRole.ToolTipText, QColor(220, 220, 220))
    p.setColor(QPalette.ColorRole.Text, QColor(220, 220, 220))
    p.setColor(QPalette.ColorRole.Button, QColor(55, 55, 60))
    p.setColor(QPalette.ColorRole.ButtonText, QColor(220, 220, 220))
    p.setColor(QPalette.ColorRole.Highlight, QColor(42, 130, 218))
    p.setColor(QPalette.ColorRole.HighlightedText, QColor(0, 0, 0))
    p.setColor(QPalette.ColorRole.PlaceholderText, QColor(130, 130, 130))
    p.setColor(QPalette.ColorRole.Link, QColor(42, 130, 218))
    app.setPalette(p)


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
    _apply_dark_palette(app)
    icon = make_app_icon()
    app.setWindowIcon(icon)

    window = MainWindow(icon=icon)
    window.show()
    return app.exec()
