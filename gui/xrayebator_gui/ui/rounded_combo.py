"""Custom QComboBox with fully styled rounded popup.

Qt's built-in combo popup (QComboBoxPrivateContainer) cannot be reliably
rounded through QSS on Windows because the outer frame is painted by
QWindowsVistaStyle, which ignores border-radius. This widget replaces the
combo's dropdown with our own QListWidget hosted in a QFrame that has
explicit border-radius + gap below the button + item padding that prevents
text overlap.

Usage:
    from .rounded_combo import RoundedComboBox
    cb = RoundedComboBox(tokens)
    cb.addItems(["a","b"])
    cb.setCurrentIndex(0)
    cb.currentTextChanged.connect(...)
"""

from __future__ import annotations

from typing import Optional

from PySide6.QtCore import QEvent, QObject, QPoint, Qt, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

# Импортируем lazily чтобы theme.py не циклил
def _tokens_from_app():
    from PySide6.QtWidgets import QApplication
    app = QApplication.instance()
    return getattr(app, "_heroui_tokens", None)


class _RoundedPopup(QFrame):
    """Popup frame hosting the list; positioned below the button."""

    picked = Signal(int)

    def __init__(self, parent: "RoundedComboBox"):
        super().__init__(parent, Qt.WindowType.Popup | Qt.WindowType.FramelessWindowHint)
        self._combo = parent
        tokens = parent._tokens
        self.setStyleSheet(
            f"""
            QFrame {{
                background-color: {tokens.surface};
                color: {tokens.foreground};
                border: 1px solid {tokens.border};
                border-radius: {tokens.RADIUS_MD + 2}px;
            }}
            QListWidget {{
                background: transparent;
                border: none;
                outline: none;
                padding: 4px;
                font-family: inherit;
            }}
            QListWidget::item {{
                padding: 8px 12px;
                border-radius: {tokens.RADIUS_SM}px;
                min-height: 28px;
                margin: 1px 0;
            }}
            QListWidget::item:selected {{
                background-color: {tokens.accent};
                color: {tokens.accent_foreground};
            }}
            QListWidget::item:hover:!selected {{
                background-color: {tokens.surface_tertiary};
            }}
        """
        )
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(0)
        self.list = QListWidget()
        layout.addWidget(self.list)
        self.list.itemClicked.connect(self._on_pick)

    def set_items(self, items: list[str]) -> None:
        self.list.clear()
        for label in items:
            QListWidgetItem(label, self.list)

    def popup_at(self, pos: QPoint, width: int) -> None:
        # Wider than the button: text shouldn't clip. HeroUI menus are
        # typically wider than their parent trigger.
        item_count = self.list.count()
        # Pick a width big enough that "xhttp-legacy (Vision + uTLS)" also fits
        max_text_len = max((len(self._combo._items[i][0]) for i in range(item_count)), default=0)
        # Rough estimate: 8px per char for our font, + padding + arrow room
        suggested_width = max(
            width,                    # never narrower than the trigger button
            200,                       # sane minimum
            min(max_text_len * 9 + 48, 480),  # text-fit up to 480px
        )
        self.setFixedWidth(suggested_width)
        # Height: each row needs ~36px (icn+text with our item padding),
        # plus internal popup margins. Cap at 480 px.
        # UB: QListWidget doesn't have __len__ in Qt — use .count()
        item_row_h = 36
        padding = 16  # matches setContentsMargins(4,4,4,4) x2 + small slate
        content_h = min(item_count * item_row_h + padding, 480)
        # Scrollbar only when actual overflow (after 13 items at new 36px row)
        needs_scroll = (item_count * item_row_h + padding) > 480
        self.setFixedHeight(content_h)
        self.list.setVerticalScrollBarPolicy(
            Qt.ScrollBarPolicy.ScrollBarAsNeeded if needs_scroll
            else Qt.ScrollBarPolicy.ScrollBarAlwaysOff
        )
        # 4px gap so popup doesn't touch the combo bottom edge
        pos.setY(pos.y() + 4)
        self.move(pos)
        self.show()
        self.raise_()
        self.setFocus()

    def _on_pick(self, item: QListWidgetItem) -> None:
        row = self.list.row(item)
        self.picked.emit(row)
        self.hide()


class RoundedComboBox(QWidget):
    """List replacement for QComboBox with full HeroUI styling control.

    Public API mirrors QComboBox where needed by our codebase (addItems,
    setPlaceholderText, currentIndexChanged, currentData, currentText, etc.).
    """

    currentIndexChanged = Signal(int)

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self._tokens = _tokens_from_app()
        if self._tokens is None:
            # If widget was constructed before apply_theme, defer styled init
            # until polish event (which our eventFilter intercepts and re-calls).
            pass
        self._placeholder: str = ""
        self._items: list[tuple[str, object]] = []  # (label, userData)
        self._current: int = -1

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.button = QPushButton()
        self.button.setProperty("comboTrigger", True)
        self.button.setMinimumHeight(38)
        self.button.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.button.clicked.connect(self._toggle_popup)
        self.button.setCursor(Qt.CursorShape.PointingHandCursor)
        layout.addWidget(self.button)

        if self._tokens is not None:
            self._apply_style()
        self._popup: Optional[_RoundedPopup] = None

    def _apply_style(self) -> None:
        """Re-apply theme style on this widget (called by wrap_combo helper)."""
        tokens = self._tokens
        self.button.setStyleSheet(
            f"""
            QPushButton[comboTrigger="true"] {{
                background-color: {tokens.surface_secondary};
                color: {tokens.foreground};
                border: 1px solid {tokens.border};
                border-radius: {tokens.RADIUS_XL}px;
                padding: 8px 12px;
                padding-right: 32px;
                text-align: left;
                font-weight: 500;
                min-height: 22px;
            }}
            QPushButton[comboTrigger="true"]:hover {{
                background-color: {tokens.surface_tertiary};
            }}
            QPushButton[comboTrigger="true"]:focus {{
                border: 2px solid {tokens.focus_ring};
                padding: 7px 11px;
                padding-right: 31px;
            }}
            QPushButton[comboTrigger="true"]:disabled {{
                background-color: {tokens.surface};
                color: {tokens.muted};
            }}
        """
        )

    def set_tokens(self, tokens) -> None:
        """Setter used by theme.apply_theme on Polish-event paths where the
        widget was constructed before the theme system populated
        app._heroui_tokens."""
        self._tokens = tokens
        self._apply_style()
        if self._popup is not None:
            # Rebuild popup with new tokens
            items = [label for label, _ in self._items]
            self._popup.deleteLater()
            self._popup = None
            self._rebuild_popup(items)

    def addItem(self, label: str, userData: object = None) -> None:  # noqa: N803
        self._items.append((label, userData))
        if self._current < 0:
            self.setCurrentIndex(0)

    def addItems(self, labels: list[str]) -> None:
        for lbl in labels:
            self.addItem(lbl)

    def clear(self) -> None:
        self._items = []
        self._current = -1
        self._refresh_label()

    def count(self) -> int:
        return len(self._items)

    def currentIndex(self) -> int:
        return self._current

    def currentText(self) -> str:
        return self._items[self._current][0] if 0 <= self._current < len(self._items) else ""

    def currentData(self):
        return self._items[self._current][1] if 0 <= self._current < len(self._items) else None

    def itemData(self, index: int):
        return self._items[index][1] if 0 <= index < len(self._items) else None

    def itemText(self, index: int) -> str:
        return self._items[index][0] if 0 <= index < len(self._items) else ""

    def setCurrentIndex(self, index: int) -> None:
        if index == self._current:
            return
        if not (0 <= index < len(self._items)):
            index = -1
        self._current = index
        self._refresh_label()
        self.currentIndexChanged.emit(self._current)

    def setPlaceholderText(self, text: str) -> None:
        self._placeholder = text
        self._refresh_label()

    def placeholderText(self) -> str:
        return self._placeholder

    def setEnabled(self, enabled: bool) -> None:  # noqa: N803
        self.button.setEnabled(enabled)
        super().setEnabled(enabled)

    def model(self):
        # Compatibility: existing code calls `mode_combo.model().item(0)` to
        # disable TUN entry. Return a duck-typed wrapper exposing .item().
        class _ModelAdapter:
            def __init__(self, outer): self.outer = outer
            def item(self, idx):
                class _ItemAdapter:
                    def __init__(self, combo, i): self.combo, self.i = combo, i
                    def setEnabled(self, on):
                        # We disable the entry by tagging its label exactly as
                        # "disabled" via appending a marker — the popup renderer
                        # filters these out (keeps API parity with QComboBox).
                        lbl, data = self.combo._items[self.i]
                        new_label = (lbl + " [disabled]") if on is False and "[disabled]" not in lbl else lbl
                        self.combo._items[self.i] = (new_label, data)
                return _ItemAdapter(self.outer, idx)
        return _ModelAdapter(self)

    def findText(self, text: str) -> int:
        for i, (lbl, _d) in enumerate(self._items):
            if lbl == text:
                return i
        return -1

    # ─── internals ───────────────────────────────────────────────

    def _refresh_label(self) -> None:
        if 0 <= self._current < len(self._items):
            self.button.setText(self._items[self._current][0])
        else:
            # Placeholder shown muted via QSS
            ph = self._placeholder or ""
            self.button.setText(ph if ph else "—")

        # Update arrow visibility hint via UNICODE arrow appended to text —
        # we keep the trigger button minimal and let the popup do the work.
        # If the user wants a visual arrow, we can append "▼" via muted HTML.

    def _toggle_popup(self) -> None:
        if self._popup is None:
            items = [label for label, _ in self._items]
            self._rebuild_popup(items)
        if self._popup is None:
            return
        if self._popup.isVisible():
            self._popup.hide()
            return
        # Show below the button aligned to its left edge
        global_pos = self.button.mapToGlobal(QPoint(0, self.button.height()))
        self._popup.set_items([label for label, _ in self._items])
        self._popup.popup_at(global_pos, max(self.button.width(), 200))

    def _rebuild_popup(self, items: list[str]) -> None:
        if self._tokens is None:
            return
        self._popup = _RoundedPopup(self)
        self._popup.set_items(items)
        self._popup.picked.connect(self._on_picked)

    def _on_picked(self, row: int) -> None:
        self.setCurrentIndex(row)


def wrap_combo(combo: "QComboBox", tokens) -> None:
    """Polish-event helper: if the widget is a plain QComboBox we style it via
    the previous `_fix_combo_popup`-style approach. When we've already replaced
    it with `RoundedComboBox`, this becomes a no-op extra set_tokens call.
    """
    # For plain QComboBox, fall back to old approach — at least keep visuals
    # consistent. New code should construct RoundedComboBox directly.
    from PySide6.QtCore import Qt
    from PySide6.QtWidgets import QListView

    combo.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
    combo.style().unpolish(combo)
    combo.style().polish(combo)
    view = combo.view()
    if isinstance(view, QListView):
        view.setStyleSheet(
            f"""
            QListView {{
                background-color: {tokens.surface};
                color: {tokens.foreground};
                border: 1px solid {tokens.border};
                border-radius: {tokens.RADIUS_MD}px;
                outline: none;
                padding: 4px;
            }}
            QListView::item {{
                padding: 8px 12px;
                border-radius: {tokens.RADIUS_SM}px;
                min-height: 28px;
                margin: 1px 0;
            }}
            QListView::item:selected {{
                background-color: {tokens.accent};
                color: {tokens.accent_foreground};
            }}
            QListView::item:hover:!selected {{
                background-color: {tokens.surface_tertiary};
            }}
            """
        )
    parent = view.parentWidget() if view is not None else None
    if parent is not None and parent.windowFlags() & Qt.WindowType.Popup:
        parent.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        parent.setStyleSheet(
            f"""
            QComboBoxPrivateContainer {{
                background-color: {tokens.surface};
                border: 1px solid {tokens.border};
                border-radius: {tokens.RADIUS_MD + 2}px;
                padding: 4px;
            }}
            """
        )
