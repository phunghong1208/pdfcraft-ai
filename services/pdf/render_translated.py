"""Render translated text onto PDF using PyMuPDF — replaces client-side pdf-lib."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import fitz

logger = logging.getLogger("pdfcraft.pdf.render")

FONTS_DIR = Path("/app/fonts")

FONT_MAP: dict[str, str] = {
    "vi": "NotoSans-Regular.ttf",
    "en": "NotoSans-Regular.ttf",
    "ja": "NotoSansCJKjp-Regular.otf",
    "ko": "NotoSansCJKkr-Regular.otf",
    "zh": "NotoSansCJKsc-Regular.otf",
    "zh-TW": "NotoSansCJKtc-Regular.otf",
    "ar": "NotoSansArabic-Regular.ttf",
    "th": "NotoSansThai-Regular.ttf",
    "hi": "NotoSansDevanagari-Regular.ttf",
    "bn": "NotoSansBengali-Regular.ttf",
    "ta": "NotoSansTamil-Regular.ttf",
    "te": "NotoSansTelugu-Regular.ttf",
    "ml": "NotoSansMalayalam-Regular.ttf",
    "kn": "NotoSansKannada-Regular.ttf",
    "gu": "NotoSansGujarati-Regular.ttf",
    "pa": "NotoSansGurmukhi-Regular.ttf",
    "he": "NotoSansHebrew-Regular.ttf",
    "ru": "NotoSans-Regular.ttf",
    "uk": "NotoSans-Regular.ttf",
    "el": "NotoSans-Regular.ttf",
}

DEFAULT_FONT = "NotoSans-Regular.ttf"


def _font_path(target_lang: str) -> str:
    name = FONT_MAP.get(target_lang, DEFAULT_FONT)
    path = FONTS_DIR / name
    if path.exists():
        return str(path)
    fallback = FONTS_DIR / DEFAULT_FONT
    if fallback.exists():
        return str(fallback)
    return ""


def _wipe_rect(
    page: fitz.Page,
    x: float,
    y: float,
    w: float,
    h: float,
    page_h: float,
    pad_x: float = 1.0,
    pad_y: float = 1.0,
) -> None:
    """Redact (permanently remove) text from PDF layer + fill white. Coords in PDF bottom-left."""
    fitz_y0 = page_h - (y + h) - pad_y
    fitz_y1 = page_h - y + pad_y
    # Never expand left — only right+vertical, to avoid covering adjacent columns
    rect = fitz.Rect(x, fitz_y0, x + w + pad_x, fitz_y1)
    page.add_redact_annot(rect, fill=(1, 1, 1))


def _insert_text(
    page: fitz.Page,
    text: str,
    block: dict[str, Any],
    page_h: float,
    fontfile: str,
    fontname: str = "noto",
) -> None:
    """Insert translated text into block's bounding box."""
    pdf_x = float(block["pdfX"])
    pdf_y = float(block["pdfY"])
    pdf_w = float(block["pdfWidth"])
    pdf_h = float(block["pdfHeight"])
    base_size = float(block.get("fontSize", 11))

    fitz_y0 = page_h - (pdf_y + pdf_h)
    fitz_y1 = page_h - pdf_y
    rect = fitz.Rect(pdf_x, fitz_y0, pdf_x + pdf_w, fitz_y1)

    size = min(base_size, 72.0)
    min_size = 5.0

    # Try with custom font if available
    if fontfile:
        while size >= min_size:
            rc = page.insert_textbox(
                rect, text, fontsize=size,
                fontname=fontname, fontfile=fontfile,
                color=(0, 0, 0), align=fitz.TEXT_ALIGN_LEFT,
            )
            if rc >= 0:
                return
            size -= 0.5

    # Fallback to built-in Helvetica (always available, no fontfile needed)
    size = min(base_size, 72.0)
    while size >= min_size:
        rc = page.insert_textbox(
            rect, text, fontsize=size,
            fontname="helv",
            color=(0, 0, 0), align=fitz.TEXT_ALIGN_LEFT,
        )
        if rc >= 0:
            return
        size -= 0.5

    # Last resort — helv always works
    page.insert_textbox(
        rect, text, fontsize=min_size,
        fontname="helv", color=(0, 0, 0), align=fitz.TEXT_ALIGN_LEFT,
    )


def _debug_block(page: fitz.Page, block: dict[str, Any], page_h: float, index: int) -> None:
    """Draw colored border + index number around block for OCR quality inspection."""
    pdf_x = float(block["pdfX"])
    pdf_y = float(block["pdfY"])
    pdf_w = float(block["pdfWidth"])
    pdf_h = float(block["pdfHeight"])
    fitz_y0 = page_h - (pdf_y + pdf_h)
    fitz_y1 = page_h - pdf_y
    rect = fitz.Rect(pdf_x, fitz_y0, pdf_x + pdf_w, fitz_y1)
    page.draw_rect(rect, color=(1, 0.4, 0), width=0.8)
    page.insert_text(
        (pdf_x + 1, fitz_y0 + 7),
        str(index),
        fontsize=5,
        color=(1, 0.4, 0),
    )


def render_translated_pdf(
    pdf_path: Path,
    blocks: list[dict[str, Any]],
    translations: list[str],
    target_lang: str,
    wipe_lines: list[dict[str, Any]] | None = None,
    output_path: Path | None = None,
    debug_ocr: bool = False,
) -> Path:
    """Whiteout original text + draw translations. Returns path to output PDF."""
    if output_path is None:
        output_path = pdf_path.parent / "translated.pdf"

    fontfile = _font_path(target_lang)
    # Unique fontname per file so PyMuPDF doesn't reuse cached wrong font
    fontname = "f-" + Path(fontfile).stem[:12] if fontfile else "helv"
    doc = fitz.open(pdf_path)

    try:
        wipe_by_page: dict[int, list[dict[str, Any]]] = {}
        if wipe_lines:
            for wl in wipe_lines:
                pn = int(wl.get("pageNumber", 0))
                if pn > 0:
                    wipe_by_page.setdefault(pn, []).append(wl)

        # Group blocks by page for two-pass: redact all → apply → insert text
        by_page: dict[int, list[tuple[int, dict[str, Any], str]]] = {}
        for i, block in enumerate(blocks):
            translated = (translations[i] if i < len(translations) else "").strip()
            if not translated:
                continue
            page_no = int(block["pageNumber"])
            page_idx = page_no - 1
            if page_idx < 0 or page_idx >= len(doc):
                continue
            by_page.setdefault(page_no, []).append((i, block, translated))

        for page_no, page_blocks in by_page.items():
            page = doc[page_no - 1]
            page_h = float(page.rect.height)
            page_wipes = wipe_by_page.get(page_no, [])

            # Pass 1: add redact annots for all blocks on this page
            for i, block, translated in page_blocks:
                if page_wipes:
                    block_x = float(block["pdfX"])
                    block_y = float(block["pdfY"])
                    block_w = float(block["pdfWidth"])
                    block_h = float(block["pdfHeight"])
                    for wl in page_wipes:
                        wl_x = float(wl["pdfX"])
                        wl_y = float(wl["pdfY"])
                        wl_w = float(wl["pdfWidth"])
                        wl_h = float(wl["pdfHeight"])
                        overlap_x = max(0, min(block_x + block_w, wl_x + wl_w) - max(block_x, wl_x))
                        overlap_y = max(0, min(block_y + block_h, wl_y + wl_h) - max(block_y, wl_y))
                        if overlap_x > 2 and overlap_y > 2:
                            fs = float(wl.get("fontSize", 11))
                            _wipe_rect(page, wl_x, wl_y, wl_w, wl_h, page_h,
                                       pad_x=max(1, fs * 0.08), pad_y=2.0)
                else:
                    fs = float(block.get("fontSize", 11))
                    _wipe_rect(page, float(block["pdfX"]), float(block["pdfY"]),
                               float(block["pdfWidth"]), float(block["pdfHeight"]),
                               page_h, pad_x=max(1, fs * 0.08), pad_y=2.0)

            # Apply redactions — permanently removes text from PDF layer
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

            # Pass 2: insert translated text
            for i, block, translated in page_blocks:
                _insert_text(page, translated, block, page_h, fontfile, fontname=fontname)
                if debug_ocr:
                    _debug_block(page, block, page_h, i)

        doc.save(str(output_path), garbage=4, deflate=True)
    finally:
        doc.close()

    return output_path
