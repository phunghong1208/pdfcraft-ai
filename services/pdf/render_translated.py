"""Render translated text onto PDF using PyMuPDF — replaces client-side pdf-lib."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import fitz

try:
    import arabic_reshaper
    from bidi.algorithm import get_display as bidi_display
    _BIDI_AVAILABLE = True
except ImportError:
    _BIDI_AVAILABLE = False

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

# Languages that write right-to-left
RTL_LANGS = frozenset(["ar", "he", "fa", "ur"])


def _prepare_text(text: str, target_lang: str) -> tuple[str, int]:
    """Return (display_text, fitz_align). RTL langs: reshape + bidi + align right."""
    if target_lang in RTL_LANGS and _BIDI_AVAILABLE:
        reshaped = arabic_reshaper.reshape(text)
        display = bidi_display(reshaped)
        return display, fitz.TEXT_ALIGN_RIGHT
    return text, fitz.TEXT_ALIGN_LEFT


def _font_path(target_lang: str) -> str:
    name = FONT_MAP.get(target_lang, DEFAULT_FONT)
    path = FONTS_DIR / name
    if path.exists():
        logger.info("font: lang=%s → %s (exists)", target_lang, path)
        return str(path)
    logger.warning("font: lang=%s → %s (NOT FOUND)", target_lang, path)
    fallback = FONTS_DIR / DEFAULT_FONT
    if fallback.exists():
        logger.info("font: fallback → %s", fallback)
        return str(fallback)
    logger.error("font: no fallback found at %s", fallback)
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


def _block_rect(block: dict[str, Any], page_h: float) -> fitz.Rect:
    pdf_x = float(block["pdfX"])
    pdf_y = float(block["pdfY"])
    pdf_w = float(block["pdfWidth"])
    pdf_h = float(block["pdfHeight"])
    fitz_y0 = page_h - (pdf_y + pdf_h)
    fitz_y1 = page_h - pdf_y
    return fitz.Rect(pdf_x, fitz_y0, pdf_x + pdf_w, fitz_y1)


def _prepare_insert_rect(
    rect: fitz.Rect,
    font: fitz.Font,
    display_text: str,
    size: float,
    page_rect: fitz.Rect,
    rtl: bool,
) -> fitz.Rect:
    """Đảm bảo rect đủ cao/rộng — ô bảng fitz hay chỉ ~8pt, Arabic dài bị cắt hết."""
    min_h = max(size * 1.35, 10.0)
    if rect.height < min_h:
        rect = fitz.Rect(rect.x0, rect.y1 - min_h, rect.x1, rect.y1)

    try:
        needed = font.text_length(display_text, fontsize=size)
    except Exception:
        needed = len(display_text) * size * 0.55

    if needed > rect.width * 1.05:
        extra = min(needed - rect.width + 8, page_rect.width * 0.55)
        if rtl:
            rect = fitz.Rect(max(page_rect.x0 + 2, rect.x0 - extra), rect.y0, rect.x1, rect.y1)
        else:
            rect = fitz.Rect(rect.x0, rect.y0, min(page_rect.x1 - 2, rect.x1 + extra), rect.y1)
    return rect


def _insert_text_point(
    page: fitz.Page,
    display_text: str,
    rect: fitz.Rect,
    fontfile: str,
    fontname: str,
    size: float,
    rtl: bool,
) -> bool:
    """Vẽ tại baseline — không bị clip chiều cao như textbox."""
    try:
        font = fitz.Font(fontfile=fontfile)
        tw = font.text_length(display_text, fontsize=size)
        y = rect.y1 - size * 0.25
        if rtl:
            x = max(rect.x0, rect.x1 - tw - 1)
        else:
            x = rect.x0 + 1
        page.insert_text(
            (x, y), display_text,
            fontfile=fontfile, fontname=fontname, fontsize=size,
            color=(0, 0, 0),
        )
        return True
    except Exception as exc:
        logger.warning("insert_text point failed: %s", exc)
        return False


def _expand_rect_for_text(
    rect: fitz.Rect,
    text: str,
    font: fitz.Font,
    fontsize: float,
    page_rect: fitz.Rect,
    rtl: bool,
) -> fitz.Rect:
    """Mở rộng ô khi bản dịch dài hơn bbox gốc."""
    if "\n" in text:
        return rect

    try:
        needed = font.text_length(text, fontsize=fontsize)
    except Exception:
        needed = len(text) * fontsize * 0.55

    if needed <= rect.width * 1.05:
        return rect

    extra = min(needed - rect.width + 8, page_rect.width * 0.55)
    if rtl:
        new_x0 = max(page_rect.x0 + 2, rect.x0 - extra)
        return fitz.Rect(new_x0, rect.y0, rect.x1, rect.y1)
    new_x1 = min(page_rect.x1 - 2, rect.x1 + extra)
    return fitz.Rect(rect.x0, rect.y0, new_x1, rect.y1)


def _insert_text(
    page: fitz.Page,
    text: str,
    block: dict[str, Any],
    page_h: float,
    font: fitz.Font | None,
    fontfile: str,
    fontname: str,
    target_lang: str,
) -> bool:
    """Insert translated text into block's bounding box. Returns True if visible text placed."""
    base_size = float(block.get("fontSize", 11))
    rect = _block_rect(block, page_h)
    page_rect = page.rect

    display_text, align = _prepare_text(text, target_lang)
    rtl = target_lang in RTL_LANGS

    # Inner padding so text doesn't hug the edge (RTL aligns right, LTR left).
    pad = 3.0
    if rect.width > pad * 2 + 4:
        if rtl:
            rect = fitz.Rect(rect.x0 + 1, rect.y0, rect.x1 - pad, rect.y1)
        else:
            rect = fitz.Rect(rect.x0 + pad, rect.y0, rect.x1 - 1, rect.y1)
    min_size = 4.0
    size = min(base_size, 14.0)

    # Paragraph vs single-line field, decided by BLOCK geometry (not by text content —
    # translations are sent with newlines flattened, so "\n in text" is unreliable).
    # Tall block = wrapped paragraph → wrap inside its column, never widen horizontally
    # (widening makes long text collapse onto fewer/one line → overlap, lost text).
    is_multiline = rect.height > base_size * 1.8

    try:
        if not fontfile or font is None:
            while size >= min_size:
                rc = page.insert_textbox(
                    rect, display_text, fontsize=size,
                    fontname="helv", color=(0, 0, 0), align=align,
                )
                if rc >= 0:
                    return True
                size -= 0.5
            return False

        assert font is not None

        if is_multiline:
            # Wrap within the original column width; just shrink font until it fits.
            while size >= min_size:
                rc = page.insert_textbox(
                    rect, display_text, fontsize=size,
                    fontname=fontname, fontfile=fontfile,
                    color=(0, 0, 0), align=align,
                )
                if rc >= 0:
                    return True
                size -= 0.5
            # Still overflows vertically at min_size — force wrapped insert (clips bottom,
            # never runs off page horizontally). Better than single-line point draw.
            page.insert_textbox(
                rect, display_text, fontsize=min_size,
                fontname=fontname, fontfile=fontfile,
                color=(0, 0, 0), align=align,
            )
            return True

        # Single-line field (table cell / form label): may widen to fit one line.
        draw_rect = _prepare_insert_rect(rect, font, display_text, size, page_rect, rtl)
        while size >= min_size:
            expanded = _expand_rect_for_text(draw_rect, display_text, font, size, page_rect, rtl)
            rc = page.insert_textbox(
                expanded, display_text, fontsize=size,
                fontname=fontname, fontfile=fontfile,
                color=(0, 0, 0), align=align,
            )
            if rc >= 0:
                return True
            size -= 0.5

        # Textbox không vừa (ô bảng thấp) → vẽ baseline, không clip
        return _insert_text_point(
            page, display_text, draw_rect, fontfile, fontname, min_size, rtl,
        )
    except Exception as exc:
        logger.warning("insert_text error: %s", exc)
        if fontfile and font is not None:
            return _insert_text_point(
                page, display_text, rect, fontfile, fontname, min_size, rtl,
            )
        return False


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
    fontname = "f-" + Path(fontfile).stem[:12] if fontfile else "helv"
    font_obj: fitz.Font | None = None
    if fontfile:
        try:
            font_obj = fitz.Font(fontfile=fontfile)
        except Exception as exc:
            logger.error("font load failed: %s", exc)
    doc = fitz.open(pdf_path)

    try:
        empty_count = sum(1 for t in translations if not t.strip())
        inserted_ok = 0
        inserted_fail = 0
        logger.info(
            "render: %d blocks, %d empty translations, lang=%s, font=%s, bidi=%s",
            len(blocks), empty_count, target_lang, fontname, _BIDI_AVAILABLE,
        )
        wipe_by_page: dict[int, list[dict[str, Any]]] = {}
        if wipe_lines:
            for wl in wipe_lines:
                pn = int(wl.get("pageNumber", 0))
                if pn > 0:
                    wipe_by_page.setdefault(pn, []).append(wl)

        # Group blocks by page for two-pass: redact all → apply → insert text
        by_page: dict[int, list[tuple[int, dict[str, Any], str]]] = {}
        skip_indices: set[int] = set()
        for i, block in enumerate(blocks):
            translated = (translations[i] if i < len(translations) else "").strip()
            page_no = int(block["pageNumber"])
            page_idx = page_no - 1
            if page_idx < 0 or page_idx >= len(doc):
                continue
            if not translated:
                skip_indices.add(i)
                continue
            by_page.setdefault(page_no, []).append((i, block, translated))

        for page_no, page_blocks in by_page.items():
            page = doc[page_no - 1]
            page_h = float(page.rect.height)

            # Pass 1: redact vùng block (đủ che chữ gốc) + wipe lines trùng
            page_wipes = wipe_by_page.get(page_no, [])
            for i, block, translated in page_blocks:
                fs = float(block.get("fontSize", 11))
                _wipe_rect(
                    page,
                    float(block["pdfX"]), float(block["pdfY"]),
                    float(block["pdfWidth"]), float(block["pdfHeight"]),
                    page_h, pad_x=max(1, fs * 0.12), pad_y=1.5,
                )
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
                        if overlap_x > 1 and overlap_y > 1:
                            wfs = float(wl.get("fontSize", 11))
                            _wipe_rect(
                                page, wl_x, wl_y, wl_w, wl_h, page_h,
                                pad_x=max(1, wfs * 0.08), pad_y=1.0,
                            )

            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

            for i, block, translated in page_blocks:
                ok = _insert_text(
                    page, translated, block, page_h,
                    font_obj, fontfile, fontname, target_lang,
                )
                if ok:
                    inserted_ok += 1
                else:
                    inserted_fail += 1
                    logger.warning(
                        "insert failed block[%d] page=%d text=%r",
                        i, page_no, translated[:80],
                    )
                if debug_ocr:
                    _debug_block(page, block, page_h, i)

        logger.info("render done: inserted=%d failed=%d", inserted_ok, inserted_fail)
        if inserted_ok == 0 and inserted_fail > 0:
            raise RuntimeError(
                f"Render failed: no text inserted ({inserted_fail} blocks). "
                f"Check font at {fontfile or 'N/A'}"
            )

        doc.save(str(output_path), garbage=4, deflate=True)
    finally:
        doc.close()

    return output_path
