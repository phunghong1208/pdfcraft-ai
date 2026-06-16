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
RTL_LANGS = frozenset({"ar", "he"})
DUAL_FONT_LANGS = frozenset({"ar", "he"})


def _font_path(target_lang: str) -> str:
    name = FONT_MAP.get(target_lang, DEFAULT_FONT)
    path = FONTS_DIR / name
    if path.exists():
        return str(path)
    fallback = FONTS_DIR / DEFAULT_FONT
    if fallback.exists():
        return str(fallback)
    return ""


def _latin_font_path() -> str:
    path = FONTS_DIR / DEFAULT_FONT
    return str(path) if path.exists() else ""


def _text_align(target_lang: str) -> int:
    return fitz.TEXT_ALIGN_RIGHT if target_lang in RTL_LANGS else fitz.TEXT_ALIGN_LEFT


def _prepare_script_line(line: str, target_lang: str, script_font: str = "") -> str:
    """Reshape Arabic / bidi RTL trước khi vẽ."""
    if target_lang == "ar":
        try:
            import arabic_reshaper
            from bidi.algorithm import get_display

            shaped = arabic_reshaper.reshape(line)
            return get_display(shaped)
        except Exception as exc:
            logger.warning("arabic reshape failed: %s", exc)
    if target_lang == "he":
        try:
            from bidi.algorithm import get_display

            return get_display(line)
        except Exception as exc:
            logger.warning("hebrew bidi failed: %s", exc)
    return line


def _is_latin_word(word: str) -> bool:
    """Từ thuộc Latin/số (URL, năm, ngoặc) hay script RTL?"""
    letters = [c for c in word if c.isalnum()]
    if not letters:
        return any(c.isascii() for c in word)
    lat = sum(1 for c in letters if c.isascii() and ord(c) < 0x0250)
    return lat * 2 >= len(letters)


def _reshape_word(word: str, target_lang: str) -> str:
    if target_lang == "ar":
        try:
            import arabic_reshaper

            return arabic_reshaper.reshape(word)
        except Exception:
            return word
    return word


def _safe_len(font: fitz.Font, seg: str, size: float) -> float:
    try:
        return float(font.text_length(seg, fontsize=size))
    except Exception:
        return len(seg) * size * 0.5


def _word_width(
    word: str, ar_font: fitz.Font, lat_font: fitz.Font, size: float, target_lang: str
) -> float:
    if _is_latin_word(word):
        return _safe_len(lat_font, word, size)
    return _safe_len(ar_font, _reshape_word(word, target_lang), size)


def _wrap_logical_lines(
    text_line: str,
    max_w: float,
    ar_font: fitz.Font,
    lat_font: fitz.Font,
    size: float,
    target_lang: str,
) -> list[str]:
    """Wrap theo LOGICAL order (trước bidi) — tránh đảo thứ tự dòng RTL."""
    words = [w for w in text_line.split(" ") if w]
    if not words:
        return []

    space_w = _safe_len(lat_font, " ", size)
    lines: list[str] = []
    cur: list[str] = []
    cur_w = 0.0

    for w in words:
        ww = _word_width(w, ar_font, lat_font, size, target_lang)
        add = ww + (space_w if cur else 0.0)
        if cur and cur_w + add > max_w:
            lines.append(" ".join(cur))
            cur, cur_w = [w], ww
        else:
            cur.append(w)
            cur_w += add

    if cur:
        lines.append(" ".join(cur))
    return lines


def _split_latin_runs(text: str) -> list[tuple[str, bool]]:
    """Tách đoạn Latin (URL, số) vs script — bool True = dùng NotoSans."""
    runs: list[tuple[str, bool]] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch.isspace():
            j = i + 1
            while j < n and text[j].isspace():
                j += 1
            runs.append((text[i:j], False))
            i = j
            continue
        is_latin = ch.isascii() and ord(ch) < 0x0250
        j = i + 1
        while j < n:
            cj = text[j]
            if cj.isspace():
                break
            lj = cj.isascii() and ord(cj) < 0x0250
            if lj != is_latin:
                break
            j += 1
        runs.append((text[i:j], is_latin))
        i = j
    return runs


def _run_width(seg: str, is_latin: bool, ar_font: fitz.Font, lat_font: fitz.Font, size: float) -> float:
    font = lat_font if is_latin else ar_font
    try:
        return float(font.text_length(seg, fontsize=size))
    except Exception:
        return len(seg) * size * 0.48


def _runs_width(runs: list[tuple[str, bool]], ar_font: fitz.Font, lat_font: fitz.Font, size: float) -> float:
    return sum(_run_width(s, lat, ar_font, lat_font, size) for s, lat in runs)


def _count_rtl_lines(
    text: str,
    max_w: float,
    ar_font: fitz.Font,
    lat_font: fitz.Font,
    size: float,
    target_lang: str,
) -> int:
    total = 0
    for raw in text.split("\n"):
        raw = raw.strip()
        if not raw:
            continue
        total += len(_wrap_logical_lines(raw, max_w, ar_font, lat_font, size, target_lang))
    return max(1, total)


def _insert_rtl_mixed(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    target_lang: str,
    script_font: str,
    size: float,
    allow_overflow: bool = False,
) -> bool:
    """Ả Rập/Hebrew: wrap theo logical order → bidi từng dòng → neo mép phải.

    Mixed font: NotoSansArabic cho script, NotoSans cho Latin/số/URL.
    """
    latin_font = _latin_font_path()
    if not script_font or not latin_font:
        return False
    try:
        ar_font = fitz.Font(fontfile=script_font)
        lat_font = fitz.Font(fontfile=latin_font)
    except Exception as exc:
        logger.warning("rtl font load failed: %s", exc)
        return False

    max_w = max(rect.width - 4, 20.0)
    line_h = size * 1.35
    n_lines = _count_rtl_lines(text, max_w, ar_font, lat_font, size, target_lang)
    if not allow_overflow and n_lines * line_h > rect.height + 2:
        return False

    tw = fitz.TextWriter(page.rect, color=(0, 0, 0))
    y = rect.y0 + size * 0.92
    bottom = rect.y1 - 1

    for raw in text.split("\n"):
        raw = raw.strip()
        if not raw:
            continue
        # 1) wrap khi text còn ở logical order
        for logical_line in _wrap_logical_lines(raw, max_w, ar_font, lat_font, size, target_lang):
            if y > bottom and not allow_overflow:
                return False
            # 2) reshape + bidi cho riêng dòng visual này
            prepared = _prepare_script_line(logical_line, target_lang, script_font)
            runs = _split_latin_runs(prepared)
            # 3) neo vào mép phải của block
            total_w = _runs_width(runs, ar_font, lat_font, size)
            x = rect.x1 - 2 - total_w
            for seg, is_lat in runs:
                if not seg:
                    continue
                font = lat_font if is_lat else ar_font
                tw.append((x, y), seg, font=font, fontsize=size)
                x += _run_width(seg, is_lat, ar_font, lat_font, size)
            y += line_h

    tw.write_text(page)
    return True


def _draw_textbox(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    target_lang: str,
    fontfile: str,
    fontname: str,
    size: float,
    min_size: float,
) -> bool:
    """Vẽ textbox — RTL mixed dùng TextWriter, còn lại insert_textbox."""
    # Guard: rect phải hữu hạn và không rỗng (PyMuPDF raise nếu x1<=x0 / y1<=y0).
    if (
        not rect.is_valid
        or rect.is_empty
        or rect.is_infinite
        or rect.width < 1
        or rect.height < 1
    ):
        logger.warning("skip degenerate rect=%s lang=%s", rect, target_lang)
        return False

    if target_lang in DUAL_FONT_LANGS and _latin_font_path():
        s = size
        while s >= min_size:
            if _insert_rtl_mixed(page, rect, text, target_lang, fontfile, s):
                return True
            s -= 0.4
        # Vẫn không vừa: render ở min_size, neo phải, cho tràn xuống —
        # tránh insert_textbox (re-wrap chuỗi đã bidi → đảo thứ tự RTL).
        if _insert_rtl_mixed(
            page, rect, text, target_lang, fontfile, min_size, allow_overflow=True
        ):
            return True

    shaped = text
    if target_lang in RTL_LANGS:
        shaped = "\n".join(
            _prepare_script_line(ln, target_lang, fontfile)
            for ln in text.split("\n")
            if ln.strip()
        )
    fname = fontname if fontfile else "helv"
    ffile = fontfile if fontfile else None
    align = _text_align(target_lang)
    s = size
    while s >= min_size:
        rc = page.insert_textbox(
            rect, shaped, fontsize=s,
            fontname=fname, fontfile=ffile,
            color=(0, 0, 0), align=align,
        )
        if rc >= 0:
            return True
        s -= 0.4
    return False


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
    if rect.is_empty or not rect.is_valid or rect.is_infinite:
        return
    page.add_redact_annot(rect, fill=(1, 1, 1))


def _block_rect(block: dict[str, Any], page_h: float) -> fitz.Rect:
    pdf_x = float(block["pdfX"])
    pdf_y = float(block["pdfY"])
    pdf_w = float(block["pdfWidth"])
    pdf_h = float(block["pdfHeight"])
    fitz_y0 = page_h - (pdf_y + pdf_h)
    fitz_y1 = page_h - pdf_y
    return fitz.Rect(pdf_x, fitz_y0, pdf_x + pdf_w, fitz_y1)


def _wrap_line_count(text: str, width: float, font: fitz.Font, size: float) -> int:
    """Ước lượng số dòng sau wrap theo chiều rộng."""
    if width < 8:
        return max(1, text.count("\n") + 1)

    lines = 0
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            lines += 1
            continue
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            try:
                fits = font.text_length(candidate, fontsize=size) <= width - 4
            except Exception:
                fits = len(candidate) * size * 0.48 <= width
            if fits:
                current = candidate
            else:
                if current:
                    lines += 1
                current = word
        if current:
            lines += 1
    return max(1, lines)


def _find_ceiling(base: fitz.Rect, following: list[fitz.Rect], page_h: float) -> float:
    """Prose: luôn dừng trước block kế (mỗi mục đã gom ở extract)."""
    default = min(base.y1 + 48, page_h - 12)
    for nxt in following:
        if nxt.y0 <= base.y0 + 1:
            continue
        return max(base.y0 + 4, nxt.y0 - 2)
    return default


def _fit_prose_rect(
    text: str,
    base: fitz.Rect,
    max_y1: float,
    font: fitz.Font,
    base_size: float,
) -> tuple[float, fitz.Rect]:
    """Giữ y0 gốc, auto-shrink font cho vừa tới max_y1."""
    width = max(base.width, 40.0)
    min_size = 4.5
    start = min(base_size * 0.88, 10.5)
    avail_h = max(max_y1 - base.y0, base.height)

    size = start
    while size >= min_size:
        lines = _wrap_line_count(text, width, font, size)
        need_h = lines * size * 1.28 + 3
        y1 = min(base.y0 + need_h, max_y1)
        if y1 - base.y0 >= min(size * 0.85, avail_h * 0.5):
            return size, fitz.Rect(base.x0, base.y0, base.x1, y1)
        size -= 0.4

    y1 = min(base.y0 + min_size * 2.5, max_y1)
    return min_size, fitz.Rect(base.x0, base.y0, base.x1, max(y1, base.y0 + min_size))


def _insert_text(
    page: fitz.Page,
    text: str,
    block: dict[str, Any],
    page_h: float,
    fontfile: str,
    fontname: str = "noto",
    font_obj: fitz.Font | None = None,
    max_y1: float | None = None,
    page_width: float | None = None,
    target_lang: str = "en",
) -> None:
    """Insert translated text — table cell giữ logic cũ, prose fit trong bbox gốc."""
    text = "\n".join(line for line in text.split("\n") if line.strip())
    if not text:
        return

    base_size = float(block.get("fontSize", 11))
    base = _block_rect(block, page_h)
    if base.is_empty or base.width < 2 or base.height < 2:
        return

    is_cell = block.get("label") == "table_cell"
    if is_cell:
        rect = fitz.Rect(base.x0 + 2, base.y0 + 2, base.x1 - 2, base.y1 - 2)
        if rect.is_empty or rect.width < 2 or rect.height < 2:
            return
        size = min(base_size * 0.80, 72.0)
        min_size = 4.0
    else:
        if page_width and base.width < page_width * 0.45:
            if target_lang in RTL_LANGS:
                # RTL mọc về trái: giữ mép phải gốc làm điểm neo, nới sang trái.
                new_x0 = min(base.x0, max(12.0, base.x1 - (page_width - 24)))
                base = fitz.Rect(new_x0, base.y0, base.x1, base.y1)
                if base.width < page_width * 0.45:
                    base = fitz.Rect(12.0, base.y0, base.x1, base.y1)
            else:
                # Giữ mép phải gốc làm sàn để không tạo rect âm khi block sát lề phải.
                new_x1 = max(base.x1, page_width - 12)
                base = fitz.Rect(base.x0, base.y0, new_x1, base.y1)
        font = font_obj or (fitz.Font(fontfile=fontfile) if fontfile else None)
        if font is None:
            rect, size, min_size = base, min(base_size, 11.0), 5.0
        else:
            ceiling = max_y1 if max_y1 is not None else base.y1 + 120
            size, rect = _fit_prose_rect(text, base, ceiling, font, base_size)
            min_size = 4.5

    if not _draw_textbox(
        page, rect, text, target_lang, fontfile, fontname, size, min_size,
    ):
        logger.warning(
            "textbox overflow lang=%s len=%d rect=%s",
            target_lang, len(text), rect,
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


def _point_in_block(px: float, py: float, block: dict[str, Any]) -> bool:
    return (
        block["pdfX"] <= px <= block["pdfX"] + block["pdfWidth"]
        and block["pdfY"] <= py <= block["pdfY"] + block["pdfHeight"]
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
            logger.warning("font load failed: %s", exc)
    doc = fitz.open(pdf_path)

    try:
        wipe_by_page: dict[int, list[dict[str, Any]]] = {}
        if wipe_lines:
            for wl in wipe_lines:
                pn = int(wl.get("pageNumber", 0))
                if pn > 0:
                    wipe_by_page.setdefault(pn, []).append(wl)

        # Group ALL blocks by page (including empty translations for wiping)
        all_by_page: dict[int, list[tuple[int, dict[str, Any], str]]] = {}
        for i, block in enumerate(blocks):
            translated = (translations[i] if i < len(translations) else "").strip()
            page_no = int(block["pageNumber"])
            page_idx = page_no - 1
            if page_idx < 0 or page_idx >= len(doc):
                continue
            all_by_page.setdefault(page_no, []).append((i, block, translated))

        for page_no, page_blocks in all_by_page.items():
            page = doc[page_no - 1]
            page_h = float(page.rect.height)
            page_wipes = wipe_by_page.get(page_no, [])

            # Pass 1: wipe ALL raw lines on page (complete original text removal)
            table_on_page = [b for _, b, _ in page_blocks if b.get("label") == "table_cell"]
            for wl in page_wipes:
                wfs = float(wl.get("fontSize", 11))
                wx = float(wl["pdfX"]) + float(wl["pdfWidth"]) / 2
                wy = float(wl["pdfY"]) + float(wl["pdfHeight"]) / 2
                in_table = any(_point_in_block(wx, wy, tb) for tb in table_on_page)
                pad_x = 0.5 if in_table else max(1, wfs * 0.12)
                pad_y = 0.5 if in_table else 1.0
                _wipe_rect(page, float(wl["pdfX"]), float(wl["pdfY"]),
                           float(wl["pdfWidth"]), float(wl["pdfHeight"]),
                           page_h, pad_x=pad_x, pad_y=pad_y)
            # Also wipe block rects (merged blocks may cover area between lines)
            for i, block, translated in page_blocks:
                is_cell = block.get("label") == "table_cell"
                if is_cell:
                    cw = float(block["pdfWidth"]) - 4
                    ch = float(block["pdfHeight"]) - 4
                    if cw > 1 and ch > 1:
                        _wipe_rect(page,
                                   float(block["pdfX"]) + 2, float(block["pdfY"]) + 2,
                                   cw, ch, page_h, pad_x=0, pad_y=0)
                else:
                    fs = float(block.get("fontSize", 11))
                    # Prose đã gom mục — wipe thêm vùng dưới để tránh sót chữ gốc
                    wipe_h = float(block["pdfHeight"])
                    if block.get("label") != "table_cell":
                        wipe_h = max(wipe_h, fs * 3.5)
                    _wipe_rect(page, float(block["pdfX"]), float(block["pdfY"]),
                               float(block["pdfWidth"]), wipe_h,
                               page_h, pad_x=max(1, fs * 0.08), pad_y=1.5)

            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

            # Trần mở rộng theo đoạn (không đẩy block xuống)
            prose_sorted: list[tuple[int, fitz.Rect]] = []
            for i, block, translated in page_blocks:
                if translated and block.get("label") != "table_cell":
                    prose_sorted.append((i, _block_rect(block, page_h)))
            prose_sorted.sort(key=lambda x: x[1].y0)

            ceilings: dict[int, float] = {}
            for idx, (i, rect) in enumerate(prose_sorted):
                following = [r for _, r in prose_sorted[idx + 1:]]
                ceilings[i] = _find_ceiling(rect, following, float(page.rect.height))

            # Vẽ từ trên xuống — block sau không bị block trước che
            ordered = sorted(
                page_blocks,
                key=lambda x: _block_rect(x[1], page_h).y0,
            )
            for i, block, translated in ordered:
                if not translated:
                    continue
                _insert_text(
                    page, translated, block, page_h, fontfile,
                    fontname=fontname, font_obj=font_obj,
                    max_y1=ceilings.get(i),
                    page_width=float(page.rect.width),
                    target_lang=target_lang,
                )
                if debug_ocr:
                    _debug_block(page, block, page_h, i)

        doc.save(str(output_path), garbage=4, deflate=True)
    finally:
        doc.close()

    return output_path
