"""Vẽ overlay PDF bằng reportlab — thay PyMuPDF redact/insert_text."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Callable

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

_FONT_NAMES: dict[str, str] = {}


def register_font(fontfile: str) -> str:
    if not fontfile:
        return "Helvetica"
    cached = _FONT_NAMES.get(fontfile)
    if cached:
        return cached
    name = "f-" + Path(fontfile).stem[:14]
    pdfmetrics.registerFont(TTFont(name, fontfile))
    _FONT_NAMES[fontfile] = name
    return name


def string_width(fontfile: str, text: str, size: float) -> float:
    if not text:
        return 0.0
    try:
        return float(pdfmetrics.stringWidth(text, register_font(fontfile), size))
    except Exception:
        return len(text) * size * 0.48


def make_overlay(
    width: float,
    height: float,
    draw: Callable[[canvas.Canvas, float, float], None],
) -> BytesIO:
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    draw(c, width, height)
    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def wipe_rect_bl(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    pad_x: float = 0.0,
    pad_y: float = 0.0,
) -> None:
    """x,y = góc dưới-trái (PDF bottom-left)."""
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeColorRGB(1, 1, 1)
    c.rect(x, y - pad_y, w + pad_x, h + pad_y * 2, fill=1, stroke=0)


def draw_string_bl(
    c: canvas.Canvas,
    x: float,
    y: float,
    text: str,
    fontfile: str,
    size: float,
) -> None:
    c.setFillColorRGB(0, 0, 0)
    c.setFont(register_font(fontfile), size)
    c.drawString(x, y, text)


def draw_invisible_string_bl(
    c: canvas.Canvas,
    x: float,
    y: float,
    text: str,
    fontfile: str,
    size: float,
) -> None:
    """Text layer vô hình (render mode 3) cho OCR PDF."""
    name = register_font(fontfile) if fontfile else "Helvetica"
    t = c.beginText()
    t.setTextRenderMode(3)
    t.setFont(name, size)
    t.setTextOrigin(x, y)
    t.textLine(text)
    c.drawText(t)


def draw_rotated_bl(
    c: canvas.Canvas,
    x: float,
    y: float,
    text: str,
    fontfile: str,
    size: float,
    rotation: float,
) -> None:
    c.saveState()
    c.translate(x, y)
    c.rotate(rotation)
    c.setFillColorRGB(0, 0, 0)
    c.setFont(register_font(fontfile), size)
    c.drawString(0, 0, text)
    c.restoreState()


def draw_debug_rect_tl(
    c: canvas.Canvas,
    x: float,
    y_top: float,
    w: float,
    h: float,
    page_h: float,
    label: str,
) -> None:
    y_bl = page_h - y_top - h
    c.setStrokeColorRGB(1, 0.35, 0)
    c.setLineWidth(1.8)
    c.rect(x, y_bl, w, h, fill=0, stroke=1)
    c.setFillColorRGB(1, 0.35, 0)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(x + 2, page_h - y_top + 3, label)
