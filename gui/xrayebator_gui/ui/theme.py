"""HeroUI v3 design tokens ported to PySide6/QSS.

Source of truth: heroUI-inc/heroui v3, packages/styles/themes/default/variables.css.
OKLCH values converted to sRGB/hex through the OKLab→XYZ→sRGB pipeline.

Public API:
    ThemeTokens.dark() / .light() — concrete token dict
    build_qss(theme: ThemeTokens) -> str — full QSS stylesheet
    apply_theme(app, mode: Literal["dark", "light"]) -> None
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from .fonts import FONT_STACK, MONO_STACK


def _icon_url(name: str) -> str:
    """Absolute file:// URL for a bundled icon asset (works on Windows paths with spaces)."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        path = Path(sys._MEIPASS) / "xrayebator_gui" / "assets" / "icons" / name
    else:
        path = Path(__file__).parent.parent / "assets" / "icons" / name
    return "file:///" + path.as_posix()


@dataclass(frozen=True)
class ThemeTokens:
    """Minimal HeroUI v3 token set, sufficient for our desktop app."""

    # Base
    background: str
    foreground: str
    surface: str           # cards, panels
    surface_secondary: str # inputs, depressed areas
    surface_tertiary: str  # hover on surface
    default: str           # primary button bg
    default_hover: str
    muted: str             # secondary text
    accent: str            # primary action (blue in HeroUI)
    accent_hover: str
    accent_foreground: str
    success: str
    warning: str
    danger: str
    border: str
    separator: str
    focus_ring: str        # outline on focused controls

    # Non-token but theme-aware
    mode: Literal["dark", "light"] = "dark"

    # HeroUI measurements (from v3 tokens)
    RADIUS_SM = 6    # px (--radius: 0.5rem ≈ 8px; small = 6px)
    RADIUS_MD = 8
    RADIUS_LG = 12
    RADIUS_XL = 14   # field-radius ~12-14px
    SPACING_UNIT = 4 # px (--spacing: 0.25rem = 4px)
    BORDER_WIDTH = 1
    FOCUS_RING_WIDTH = 2

    @classmethod
    def dark(cls) -> "ThemeTokens":
        """HeroUI v3 dark theme (the default user-facing theme)."""
        return cls(
            background="#060607",
            foreground="#fcfcfc",
            surface="#18181b",
            surface_secondary="#232325",
            surface_tertiary="#262728",
            default="#27272a",
            default_hover="#3f3f46",  # brighter than default for contrast on dark
            muted="#9f9fa9",
            accent="#0485f7",         # oklch(0.6204 0.195 253.83)
            accent_hover="#1a96ff",   # brighter for dark
            accent_foreground="#fcfcfc",
            success="#17c964",
            warning="#f7b750",
            danger="#db3b3e",
            border="#28282c",
            separator="#212124",
            focus_ring="#0485f7",
            mode="dark",
        )

    @classmethod
    def light(cls) -> "ThemeTokens":
        """HeroUI v3 light theme."""
        return cls(
            background="#f5f5f5",
            foreground="#18181b",
            surface="#ffffff",
            surface_secondary="#f0f0f2",
            surface_tertiary="#e8e8eb",
            default="#ebebec",
            default_hover="#dddde0",
            muted="#71717a",
            accent="#0485f7",
            accent_hover="#0374d4",
            accent_foreground="#ffffff",
            success="#17c964",
            warning="#c77e1f",          # darker for light-mode contrast on white
            danger="#db3b3e",
            border="#dedee0",
            separator="#e4e4e7",
            focus_ring="#0485f7",
            mode="light",
        )


def _qss_button(t: ThemeTokens) -> str:
    """HeroUI Button: rounded-md, medium font, focus ring, soft hover."""
    return f"""
QPushButton {{
    background-color: {t.default};
    color: {t.foreground};
    border: {t.BORDER_WIDTH}px solid {t.border};
    border-radius: {ThemeTokens.RADIUS_MD}px;
    padding: 8px 16px;
    font-family: {FONT_STACK};
    font-weight: 500;
    min-height: 24px;
}}
QPushButton:hover {{
    background-color: {t.default_hover};
}}
QPushButton:pressed {{
    background-color: {t.surface_tertiary};
}}
QPushButton:focus {{
    border: {t.FOCUS_RING_WIDTH}px solid {t.focus_ring};
    padding: 7px 15px;  /* compensate for extra 1px border */
}}
QPushButton:disabled {{
    background-color: {t.surface};
    color: {t.muted};
    border-color: {t.separator};
}}

/* Variants by objectName (HeroUI-style) */
QPushButton[variant="primary"] {{
    background-color: {t.accent};
    color: {t.accent_foreground};
    border-color: transparent;
}}
QPushButton[variant="primary"]:hover {{
    background-color: {t.accent_hover};
}}
QPushButton[variant="primary"]:pressed {{
    background-color: {t.accent};
}}
QPushButton[variant="primary"]:disabled {{
    background-color: {t.surface_secondary};
    color: {t.muted};
}}

QPushButton[variant="danger"] {{
    background-color: {t.danger};
    color: {t.accent_foreground};
    border-color: transparent;
}}
QPushButton[variant="danger"]:hover {{
    background-color: {'#ef5350' if t.mode == 'dark' else '#c62828'};
}}

QPushButton[variant="ghost"] {{
    background-color: transparent;
    border-color: {t.border};
}}
QPushButton[variant="ghost"]:hover {{
    background-color: {t.surface_secondary};
}}
"""


def _qss_input(t: ThemeTokens) -> str:
    """HeroUI Input: rounded-xl (field-radius), no border by default, focus ring via border."""
    return f"""
QComboBox {{
    /* WA_StyledBackground поставится отдельно через _fix_combo_popup —
       здесь мы описываем визуал, который нативный frame увидит после bypass. */
    background-color: {t.surface_secondary};
    color: {t.foreground};
    border: {t.BORDER_WIDTH}px solid transparent;
    border-radius: {ThemeTokens.RADIUS_XL}px;
    padding: 8px 12px;
    padding-right: 32px;  /* место под стрелку */
    font-family: {FONT_STACK};
    selection-background-color: {t.accent};
    selection-color: {t.accent_foreground};
}}
QLineEdit:hover, QSpinBox:hover {{
    background-color: {t.surface_tertiary};
}}
QLineEdit:focus, QSpinBox:focus {{
    background-color: {t.surface_secondary};
    border: {t.FOCUS_RING_WIDTH}px solid {t.focus_ring};
    padding: 7px 11px;
}}
QComboBox:hover {{
    background-color: {t.surface_tertiary};
}}
QComboBox:focus {{
    background-color: {t.surface_secondary};
    border: {t.FOCUS_RING_WIDTH}px solid {t.focus_ring};
    padding: 7px 11px;
    padding-right: 31px;
}}
QLineEdit[error="true"], QLineEdit[error="1"] {{
    border: {t.BORDER_WIDTH}px solid {t.danger};
}}
QLineEdit[error="true"]:focus, QLineEdit[error="1"]:focus {{
    border: {t.FOCUS_RING_WIDTH}px solid {t.danger};
    padding: 7px 11px;
}}
QLabel#fieldError {{
    color: {t.danger};
    font-size: 11px;
    padding: 0 4px;
}}
QLineEdit:disabled, QComboBox:disabled, QSpinBox:disabled {{
    background-color: {t.surface};
    color: {t.muted};
}}
QComboBox::drop-down:disabled {{
    background-color: transparent;
}}
QLineEdit::placeholder {{
    color: {t.muted};
}}

/* QComboBox dropdown: data-URI PNG, plugin-free safe. */
QComboBox::drop-down {{
    border: none;
    width: 28px;
    subcontrol-origin: padding;
    subcontrol-position: center right;
}}
QComboBox::down-arrow {{
    image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAYCAYAAACIhL/AAAAACXBIWXMAAA9hAAAPYQGoP6dpAAAAl0lEQVRIie3Ouw3CMABAwWNK6kyCmcR1tqShQATH3yQS8itfdcxm13b7HjGuAY/zKeC5LPfwOTZALkNucCSAnI78iWMHyGnIJI4MkMORuzgKgByGzOIoBDIcWYSjAsgwZDGOSiDdyCocDUCakdU4GoFUI5twdAApRjbj6ASSRXbhGAAkiezGMQjIBjkEN7wY1/CGzmZ/0wviOU/eRnQqcAAAAABJRU5ErkJggg==");
    width: 12px;
    height: 8px;
}}
/* On Windows Qt uses a QComboBoxPrivateContainer frame around QListView
   of the popup, which inherits native Vista style and ignores our radii.
   We patch it via setWindowFlags in code (see below); the QSS just needs
   QListView rules below which the QListView_qss hack injects. */
QListView {{
    background-color: {t.surface};
    color: {t.foreground};
    border: {t.BORDER_WIDTH}px solid {t.border};
    border-radius: {ThemeTokens.RADIUS_MD}px;
    outline: none;
    padding: 4px;
}}
"""


def _qss_log(t: ThemeTokens) -> str:
    """QTextEdit for log area: monospace, rounded, subtle border, thin scrollbar."""
    return f"""
QTextEdit, QPlainTextEdit {{
    background-color: {t.surface};
    color: {t.foreground};
    border: {t.BORDER_WIDTH}px solid {t.border};
    border-radius: {ThemeTokens.RADIUS_MD}px;
    padding: 8px;
    font-family: {MONO_STACK};
    font-size: 12px;
}}

/* HeroUI thin scrollbars (--scrollbar-thumb 15% fg on transparent track) */
QScrollBar:vertical {{
    background: transparent;
    width: 8px;
    margin: 4px 2px 4px 2px;
}}
QScrollBar::handle:vertical {{
    background: {_alpha(t.foreground, 38)};
    border-radius: 4px;
    min-height: 30px;
}}
QScrollBar::handle:vertical:hover {{
    background: {_alpha(t.foreground, 76)};
}}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
    height: 0;
}}
QScrollBar:horizontal {{
    background: transparent;
    height: 8px;
    margin: 2px 4px 2px 4px;
}}
QScrollBar::handle:horizontal {{
    background: {_alpha(t.foreground, 38)};
    border-radius: 4px;
    min-width: 30px;
}}
QScrollBar::handle:horizontal:hover {{
    background: {_alpha(t.foreground, 76)};
}}
QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {{
    width: 0;
}}
"""


def _qss_progress(t: ThemeTokens) -> str:
    """HeroUI-style thin progress bar with rounded ends."""
    return f"""
QProgressBar {{
    background-color: {t.surface_secondary};
    border: none;
    border-radius: 2px;
    height: 4px;
    text-align: center;
}}
QProgressBar::chunk {{
    background-color: {t.accent};
    border-radius: 2px;
}}
"""


def _qss_misc(t: ThemeTokens) -> str:
    """Main window, layouts, menus."""
    return f"""
QMainWindow, QWidget {{
    background-color: {t.background};
    color: {t.foreground};
    font-family: {FONT_STACK};
    font-size: 13px;
}}
QLabel {{
    background: transparent;
    color: {t.foreground};
}}
QLabel[muted="true"] {{
    color: {t.muted};
}}

QMenu {{
    background-color: {t.surface};
    color: {t.foreground};
    border: {t.BORDER_WIDTH}px solid {t.border};
    border-radius: {ThemeTokens.RADIUS_MD}px;
    padding: 6px;
    font-family: {FONT_STACK};
}}
QMenu::item {{
    padding: 6px 24px 6px 12px;
    border-radius: {ThemeTokens.RADIUS_SM}px;
}}
QMenu::item:selected {{
    background-color: {t.accent};
    color: {t.accent_foreground};
}}
QMenu::separator {{
    height: 1px;
    background: {t.separator};
    margin: 4px 8px;
}}

QToolTip {{
    background-color: {t.surface};
    color: {t.foreground};
    border: {t.BORDER_WIDTH}px solid {t.border};
    border-radius: {ThemeTokens.RADIUS_SM}px;
    padding: 6px 10px;
    font-family: {FONT_STACK};
}}

QMessageBox {{
    background-color: {t.background};
}}
QMessageBox QLabel {{
    color: {t.foreground};
}}
"""


def _alpha(hex_color: str, alpha_0_255: int) -> str:
    """Helper: convert #rrggbb + alpha (0-255) → rgba() string for QSS."""
    hex_color = hex_color.lstrip("#")
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return f"rgba({r}, {g}, {b}, {alpha_0_255})"


def build_qss(t: ThemeTokens) -> str:
    """Full application stylesheet."""
    return (
        _qss_misc(t)
        + _qss_button(t)
        + _qss_input(t)
        + _qss_log(t)
        + _qss_progress(t)
    )


def apply_theme(app: "QApplication", mode: Literal["dark", "light"] = "dark") -> None:  # noqa: F821
    """Apply HeroUI v3 QSS theme to the application.

    Also installs a global QComboBox popup-style fix: on Windows Qt uses
    QWindowsVistaStyle for the popup frame, which ignores QSS border-radius
    and paints sharp corners. We patch every QComboBox at creation time to
    set view.setStyleSheet() directly + force the container frame transparent.
    """
    tokens = ThemeTokens.dark() if mode == "dark" else ThemeTokens.light()
    app.setStyleSheet(build_qss(tokens))

    # Palette essential for native-rendered widgets (menus, tooltips,
    # QMessageBox body). Without it Qt uses Windows native palette which
    # stays light on Windows — clashing with our dark QSS.
    from PySide6.QtGui import QColor, QPalette
    p = QPalette()
    p.setColor(QPalette.ColorRole.Window, QColor(tokens.background))
    p.setColor(QPalette.ColorRole.WindowText, QColor(tokens.foreground))
    p.setColor(QPalette.ColorRole.Base, QColor(tokens.surface))
    p.setColor(QPalette.ColorRole.AlternateBase, QColor(tokens.surface_secondary))
    p.setColor(QPalette.ColorRole.ToolTipBase, QColor(tokens.surface))
    p.setColor(QPalette.ColorRole.ToolTipText, QColor(tokens.foreground))
    p.setColor(QPalette.ColorRole.Text, QColor(tokens.foreground))
    p.setColor(QPalette.ColorRole.Button, QColor(tokens.default))
    p.setColor(QPalette.ColorRole.ButtonText, QColor(tokens.foreground))
    p.setColor(QPalette.ColorRole.Highlight, QColor(tokens.accent))
    p.setColor(QPalette.ColorRole.HighlightedText, QColor(tokens.accent_foreground))
    p.setColor(QPalette.ColorRole.PlaceholderText, QColor(tokens.muted))
    p.setColor(QPalette.ColorRole.Link, QColor(tokens.accent))
    app.setPalette(p)

    # Workaround for Qt-Windows popup sharp corners.
    # We install an event filter on qApp that intercepts QEvent.Type.Polish
    # for QComboBox and forcefully styles the internal QListView / container
    # with rounded borders matching HeroUI radius_md.
    from PySide6.QtCore import QEvent, QObject
    from PySide6.QtWidgets import QAbstractItemView, QComboBox, QListView

    app._heroui_tokens = tokens  # type: ignore[attr-defined]

    class _ComboPopupFixer(QObject):
        def eventFilter(self, obj: QObject, event: QEvent) -> bool:  # noqa: N802
            if event.type() == QEvent.Type.Polish and isinstance(obj, QComboBox):
                try:
                    _fix_combo_popup(obj, tokens)
                except Exception:
                    pass
            return False

    # Keep reference to prevent GC deleting the filter
    app._heroui_popup_fixer = _ComboPopupFixer(app)  # type: ignore[attr-defined]
    app.installEventFilter(app._heroui_popup_fixer)  # type: ignore[attr-defined]

    # Also-fix any QComboBox that has already been created (e.g. in forms
    # constructed before apply_theme ran).
    for widget in app.allWidgets():
        if isinstance(widget, QComboBox):
            try:
                _fix_combo_popup(widget, tokens)
            except Exception:
                pass


def _fix_combo_popup(combo: "QComboBox", tokens: ThemeTokens) -> None:
    """Force rounded popup corners + rounded outer frame on a single QComboBox.

    Qt on Windows renders QComboBox's outer frame through QWindowsVistaStyle
    (square corners ignoring QSS border-radius). Setting
    WA_StyledBackground + a style sheet on the combo itself tells Qt to use
    our CSS-like path, dropping the native frame paint.

    For its Qt.FramelessWindowHint-modified popup, the interior QListView is
    already styled; we additionally give the owning container a transparent
    background so its edges disappear.
    """
    from PySide6.QtCore import Qt
    from PySide6.QtWidgets import QListView

    # 1) Tell Qt to paint the widget frame from the QSS, not the OS theme.
    combo.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
    # Force repaint — without this the native frame can stay if the widget
    # was already polished before this attribute was set.
    combo.style().unpolish(combo)
    combo.style().polish(combo)
    combo.update()

    # 2) Style the popup view directly (works on all platforms), and give
    #    the wrapping container a fully transparent background paint.
    view = combo.view()
    if isinstance(view, QListView):
        view.setStyleSheet(f"""
            QListView {{
                background-color: {tokens.surface};
                color: {tokens.foreground};
                border: 1px solid {tokens.border};
                border-radius: {ThemeTokens.RADIUS_MD}px;
                outline: none;
                padding: 4px;
            }}
            QListView::item {{
                padding: 8px 12px;
                border-radius: {ThemeTokens.RADIUS_SM}px;
                min-height: 28px;
            }}
            QListView::item:selected {{
                background-color: {tokens.accent};
                color: {tokens.accent_foreground};
            }}
            QListView::item:hover:!selected {{
                background-color: {tokens.surface_tertiary};
            }}
        """)

    parent = view.parentWidget() if view is not None else None
    if parent is not None and parent.windowFlags() & Qt.WindowType.Popup:
        parent.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        # Padding inside the container — makes room so the rounded QListView
        # doesn't hug the right/bottom edges of the popup frame.
        parent.setStyleSheet(f"""
            QComboBoxPrivateContainer {{
                background-color: {tokens.surface};
                border: 1px solid {tokens.border};
                border-radius: {ThemeTokens.RADIUS_MD + 2}px;
                padding: 4px;
            }}
        """)
        # Frameless to remove native border; drop shadow REMOVED — Qt on
        # Windows creates the shadow as part of the native frame, so when
        # FramelessWindowHint is set, Qt auto-disables the shadow too. We
        # then re-enable it explicitly so the popup still reads as floating.
        parent.setWindowFlags(
            parent.windowFlags()
            | Qt.WindowType.FramelessWindowHint
        )
        parent.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
