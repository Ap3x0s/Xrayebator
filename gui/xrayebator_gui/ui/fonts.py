"""Inter font loading.

Источник истины для UI-шрифта. Использует системный Inter если он установлен
(бесплатно), иначе подгружает bundled InterVariable.ttf (v4.1, 859 KB, SIL
Open Font License).

Отличие от подхода «зашить ttf в ресурсы и всегда его использовать»:
- Если у пользователя уже есть Inter (например, macOS Sonoma+ или
  установлен через `fonts-inter` на Linux) — Qt его найдёт через fontconfig,
  мы не дублируем загрузку.
- Если нет — Qt загружает наш bundled asset.

Public API:
    ensure_inter_font(app) -> str — возвращает family name, который использовать.
                                    "Inter" или "Inter Variable" или fallback.
    FONT_STACK — QSS-ready font-family string («Inter», «Inter Variable», system-ui, ...)
"""
from __future__ import annotations

import sys
from importlib import resources
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from PySide6.QtWidgets import QApplication


def _bundled_font_path() -> Path:
    """Путь к bundled Inter Variable ttf внутри package.

    Работает и в dev-режиме (через Path), и в PyInstaller bundle
    (через sys._MEIPASS - один файл).
    """
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        # PyInstaller onefile/onedir — assets развёрнуты во временный каталог.
        return Path(sys._MEIPASS) / "xrayebator_gui" / "assets" / "fonts" / "InterVariable.ttf"
    # Dev mode: этот файл в xrayebator_gui/ui/fonts.py, шрифт — в xrayebator_gui/assets/fonts/.
    return Path(__file__).parent.parent / "assets" / "fonts" / "InterVariable.ttf"


def ensure_inter_font(app: "QApplication") -> str:
    """Загружает Inter если он не доступен системно.

    Возвращает family name, который работает. Если Inter не найден ни в
    системе, ни в bundled-файле → возвращает fallbacks, QSS должен быть
    готов.
    """
    from PySide6.QtGui import QFontDatabase

    db = QFontDatabase
    # Системный Inter — имя в базе может быть "Inter" или "Inter Variable".
    families = set(db.families())
    if "Inter" in families:
        return "Inter"
    if "Inter Variable" in families:
        return "Inter Variable"

    # Пробуем загрузить bundled файл
    bundled = _bundled_font_path()
    if bundled.is_file():
        font_id = db.addApplicationFont(str(bundled))
        if font_id != -1:
            loaded = db.applicationFontFamilies(font_id)
            if loaded:
                return loaded[0]
            return "Inter Variable"

    # Fallback — без Inter, возвращаем маркер «шрифт не доступен»
    return ""


# Итоговый CSS font-family stack. Qt принимает список через запятую.
# Порядок: наш загруженный Inter → системный Inter → Inter Variable →
# общие системные → sans-serif. QSS font-family принимает quoted family names.
FONT_STACK = '"Inter", "Inter Variable", "Segoe UI", "SF Pro Text", "Helvetica Neue", sans-serif'

# Моноширинный — для логов. Qt не имеет Inter Mono, поэтому системный mono.
MONO_STACK = '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, Menlo, monospace'
