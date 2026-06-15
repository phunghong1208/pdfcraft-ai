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


def _has_rtl_chars(text: str) -> bool:
    """Text có ký tự RTL thật (Arabic/Hebrew) không — không tin target_lang vì
    fallback dịch-lỗi giữ chữ nguồn LTR."""
    return any(("؀" <= c <= "ۿ") or ("֐" <= c <= "׿") or ("ﭐ" <= c <= "﻿") for c in text)


def _prepare_text(text: str, target_lang: str) -> tuple[str, int]:
    """Return (display_text, fitz_align). Chỉ reshape+bidi khi text THỰC có chữ
    RTL — tránh áp bidi lên fallback LTR (tiếng Việt/English) gây sai/tofu."""
    if target_lang in RTL_LANGS and _BIDI_AVAILABLE and _has_rtl_chars(text):
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


def _script_font_name(text: str, target_lang: str) -> str:
    """Chọn font theo SCRIPT của text thật (không theo target_lang).

    Khi dịch fail, fallback giữ text nguồn (vd tiếng Việt). Render bằng font
    target (Arabic) → chữ Việt thành tofu. Phải chọn font theo ký tự thực có.
    """
    for ch in text:
        if "؀" <= ch <= "ۿ" or "ݐ" <= ch <= "ݿ" or "ﭐ" <= ch <= "﻿":
            return FONT_MAP["ar"]
        if "֐" <= ch <= "׿":
            return FONT_MAP["he"]
        if "฀" <= ch <= "๿":
            return FONT_MAP["th"]
        if "ऀ" <= ch <= "ॿ":
            return FONT_MAP["hi"]
        if "가" <= ch <= "힯":
            return FONT_MAP["ko"]
        if "぀" <= ch <= "ヿ":
            return FONT_MAP["ja"]
        if "一" <= ch <= "鿿":
            # Han: dùng font CJK của target nếu target là CJK, mặc định SC
            return FONT_MAP.get(target_lang, FONT_MAP["zh"]) if target_lang in ("ja", "ko", "zh", "zh-TW") else FONT_MAP["zh"]
    # Latin / Vietnamese / Cyrillic / Greek → NotoSans bao hết
    return DEFAULT_FONT


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


def _widen_rect(
    rect: fitz.Rect,
    font: fitz.Font,
    display_text: str,
    size: float,
    page_rect: fitz.Rect,
    rtl: bool,
) -> fitz.Rect:
    """Nới ngang cho field 1 dòng (ô bảng/label) khi text dịch dài hơn ô gốc."""
    try:
        needed = font.text_length(display_text, fontsize=size)
    except Exception:
        needed = len(display_text) * size * 0.55
    if needed <= rect.width * 1.05:
        return rect
    extra = min(needed - rect.width + 8, page_rect.width * 0.55)
    if rtl:
        return fitz.Rect(max(page_rect.x0 + 2, rect.x0 - extra), rect.y0, rect.x1, rect.y1)
    return fitz.Rect(rect.x0, rect.y0, min(page_rect.x1 - 2, rect.x1 + extra), rect.y1)


def _max_bottom(rect: fitz.Rect, others: list[fitz.Rect]) -> float | None:
    """Đỉnh (y nhỏ nhất) của block kế dưới có CHỒNG NGANG — giới hạn giãn box
    để không đè block sau. None = không có block nào chặn."""
    limit: float | None = None
    for o in others:
        if o is rect:
            continue
        # o nằm dưới rect (top của o >= bottom của rect, fitz: y tăng xuống dưới)
        if o.y0 < rect.y1 - 1:
            continue
        ox = min(rect.x1, o.x1) - max(rect.x0, o.x0)
        if ox <= min(rect.width, o.width) * 0.3:
            continue
        if limit is None or o.y0 < limit:
            limit = o.y0
    return None if limit is None else limit - 1


def _insert_text(
    page: fitz.Page,
    text: str,
    block: dict[str, Any],
    page_h: float,
    font: fitz.Font | None,
    fontfile: str,
    fontname: str,
    target_lang: str,
    max_bottom: float | None = None,
) -> bool:
    """Vẽ bản dịch vào block. MỘT chiến lược cho mọi block:

      1. Pad mép trong (RTL align phải, LTR align trái).
      2. Giãn box xuống TỚI ĐỈNH block kế dưới (max_bottom) — dùng khoảng trống,
         KHÔNG đè block sau.
      3. Shrink font trong box (đã giãn) từ size gốc → min, để vừa.
      4. Field 1 dòng (ô bảng) → cho nới NGANG để vừa 1 dòng.

    Luôn dùng insert_textbox (wrap + tôn trọng align/pad). Không vẽ baseline
    single-line (gây dính mép phải + đè). Arabic/CJK luôn dùng custom font.
    """
    base_size = float(block.get("fontSize", 11))
    rect = _block_rect(block, page_h)
    page_rect = page.rect

    display_text, align = _prepare_text(text, target_lang)
    # rtl theo align THỰC (text có RTL), không theo target_lang — fallback LTR
    # không bị align phải nhầm.
    rtl = align == fitz.TEXT_ALIGN_RIGHT

    # Pad mép trong để chữ không dính lề.
    pad = 3.0
    if rect.width > pad * 2 + 4:
        if rtl:
            rect = fitz.Rect(rect.x0 + 1, rect.y0, rect.x1 - pad, rect.y1)
        else:
            rect = fitz.Rect(rect.x0 + pad, rect.y0, rect.x1 - 1, rect.y1)

    start_size = min(base_size, 14.0)
    use_font = bool(fontfile) and font is not None
    fname = fontname if use_font else "helv"
    ffile = fontfile if use_font else None

    # Block cao > ~1.8 dòng = đoạn nhiều dòng → wrap trong cột, KHÔNG nới ngang.
    is_multiline = rect.height > base_size * 1.8

    # Giãn box xuống tới đỉnh block kế dưới (vào khoảng trống, không đè).
    hard_bottom = page_rect.y1 - 2
    if max_bottom is not None:
        hard_bottom = min(hard_bottom, max_bottom)
    avail = rect
    if hard_bottom > rect.y1:
        avail = fitz.Rect(rect.x0, rect.y0, rect.x1, hard_bottom)

    def _try(r: fitz.Rect, s: float) -> bool:
        rc = page.insert_textbox(
            r, display_text, fontsize=s,
            fontname=fname, fontfile=ffile,
            color=(0, 0, 0), align=align,
        )
        return rc >= 0

    try:
        # Shrink font trong box đã giãn, từ size gốc xuống tới min (4pt).
        size = start_size
        while size >= 4.0:
            if is_multiline or not use_font:
                target = avail
            else:
                target = _widen_rect(avail, font, display_text, size, page_rect, rtl)
            if _try(target, size):
                return True
            size -= 0.5

        # Ép vẽ ở 4pt (clip đáy, không tràn ngang/đè).
        page.insert_textbox(
            avail, display_text, fontsize=4.0,
            fontname=fname, fontfile=ffile,
            color=(0, 0, 0), align=align,
        )
        return True
    except Exception as exc:
        logger.warning("insert_text error: %s", exc)
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

    # Font cache keyed by font filename — chọn font PER-BLOCK theo script của text
    # (fallback dịch-lỗi giữ chữ nguồn, cần font khác target).
    _font_cache: dict[str, tuple[str, str, fitz.Font | None]] = {}

    def _resolve_font(text: str) -> tuple[str, str, fitz.Font | None]:
        name = _script_font_name(text, target_lang)
        cached = _font_cache.get(name)
        if cached is not None:
            return cached
        path = FONTS_DIR / name
        ff = str(path) if path.exists() else _font_path(target_lang)
        fn = "f-" + Path(ff).stem[:12] if ff else "helv"
        obj: fitz.Font | None = None
        if ff:
            try:
                obj = fitz.Font(fontfile=ff)
            except Exception as exc:
                logger.error("font load failed (%s): %s", ff, exc)
        result = (ff, fn, obj)
        _font_cache[name] = result
        return result

    doc = fitz.open(pdf_path)

    try:
        empty_count = sum(1 for t in translations if not t.strip())
        inserted_ok = 0
        inserted_fail = 0
        logger.info(
            "render: %d blocks, %d empty translations, lang=%s, bidi=%s",
            len(blocks), empty_count, target_lang, _BIDI_AVAILABLE,
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

            # Pass 1.5: phủ TRẮNG tường minh đè chữ gốc. Redaction có thể fail âm thầm
            # trên PDF hỏng xref (MuPDF "cannot find object in xref") → chữ gốc còn lại,
            # bản dịch vẽ đè → thấy cả 2. draw_rect không phụ thuộc xref nên che chắc chắn.
            for i, block, translated in page_blocks:
                r = _block_rect(block, page_h)
                page.draw_rect(r, color=None, fill=(1, 1, 1))

            # Rect của MỌI block trên trang (kể cả không dịch) — để giới hạn giãn box.
            all_rects = [
                _block_rect(b, page_h)
                for b in blocks
                if int(b["pageNumber"]) == page_no
            ]

            for i, block, translated in page_blocks:
                b_fontfile, b_fontname, b_font = _resolve_font(translated)
                rect_c = _block_rect(block, page_h)
                max_bottom = _max_bottom(rect_c, all_rects)
                ok = _insert_text(
                    page, translated, block, page_h,
                    b_font, b_fontfile, b_fontname, target_lang, max_bottom,
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
                f"Render failed: no text inserted ({inserted_fail} blocks)."
            )

        doc.save(str(output_path), garbage=4, deflate=True)
    finally:
        doc.close()

    return output_path
