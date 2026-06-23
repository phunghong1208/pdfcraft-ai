from __future__ import annotations

import logging
import re
from io import BytesIO
from pathlib import Path
from typing import Any

import pikepdf
from reportlab.pdfgen import canvas

from pdf_geom import PdfRect
from pdf_overlay import (
    draw_debug_rect_tl,
    draw_rotated_bl,
    draw_string_bl,
    make_overlay,
    register_font,
    string_width,
    wipe_rect_bl,
)

# Re-use layout noise helpers
from pdf_layout import _adjust_block_for_render, _is_sidebar_noise, _strip_margin_prefix, _trim_wipe_rect

_BIDI_MARK_RE = re.compile(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]")
_EXOTIC_SPACE_RE = re.compile(r"[\u00a0\u202f\u2007\u2060\u2009\u200a\u3000]+")

logger = logging.getLogger("pdfcraft.pdf.render")

FONTS_DIR = Path("/app/fonts")

FONT_MAP: dict[str, str] = {
    "vi": "NotoSans-Regular.ttf",
    "en": "NotoSans-Regular.ttf",
    "es": "NotoSans-Regular.ttf",
    "fr": "NotoSans-Regular.ttf",
    "de": "NotoSans-Regular.ttf",
    "it": "NotoSans-Regular.ttf",
    "pt": "NotoSans-Regular.ttf",
    "pl": "NotoSans-Regular.ttf",
    "sv": "NotoSans-Regular.ttf",
    "tr": "NotoSans-Regular.ttf",
    "nl": "NotoSans-Regular.ttf",
    "ca": "NotoSans-Regular.ttf",
    "id": "NotoSans-Regular.ttf",
    "ms": "NotoSans-Regular.ttf",
    "sw": "NotoSans-Regular.ttf",
    "bg": "NotoSans-Regular.ttf",
    "ru": "NotoSans-Regular.ttf",
    "uk": "NotoSans-Regular.ttf",
    "el": "NotoSans-Regular.ttf",
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
}

DEFAULT_FONT = "NotoSans-Regular.ttf"
RTL_LANGS = frozenset({"ar", "he"})
DUAL_FONT_LANGS = frozenset({"ar", "he"})

_LATIN_VARIANTS: dict[tuple[bool, bool], str] = {
    (False, False): "NotoSans-Regular.ttf",
    (True, False): "NotoSans-Bold.ttf",
    (False, True): "NotoSans-Italic.ttf",
    (True, True): "NotoSans-BoldItalic.ttf",
}


def _font_path(target_lang: str) -> str:
    name = FONT_MAP.get(target_lang, DEFAULT_FONT)
    path = FONTS_DIR / name
    if path.exists():
        return str(path)
    fallback = FONTS_DIR / DEFAULT_FONT
    return str(fallback) if fallback.exists() else ""


def _styled_font_path(target_lang: str, bold: bool, italic: bool) -> str:
    if not (bold or italic):
        return _font_path(target_lang)
    base = FONT_MAP.get(target_lang, DEFAULT_FONT)
    if base == DEFAULT_FONT:
        cand = FONTS_DIR / _LATIN_VARIANTS[(bool(bold), bool(italic))]
        if cand.exists():
            return str(cand)
    else:
        stem = base.rsplit("-", 1)[0]
        ext = base.rsplit(".", 1)[-1]
        suffixes: list[str] = []
        if bold and italic:
            suffixes = ["BoldItalic", "Bold", "Italic"]
        elif bold:
            suffixes = ["Bold"]
        else:
            suffixes = ["Italic"]
        for suffix in suffixes:
            cand = FONTS_DIR / f"{stem}-{suffix}.{ext}"
            if cand.exists():
                return str(cand)
    return _font_path(target_lang)


def _latin_font_path(bold: bool = False, italic: bool = False) -> str:
    if bold or italic:
        cand = FONTS_DIR / _LATIN_VARIANTS[(bool(bold), bool(italic))]
        if cand.exists():
            return str(cand)
    path = FONTS_DIR / DEFAULT_FONT
    return str(path) if path.exists() else ""


def _normalize_mixed_spaces(text: str) -> str:
    return _EXOTIC_SPACE_RE.sub(" ", text)


def _strip_bidi_marks(text: str) -> str:
    return _BIDI_MARK_RE.sub("", text)


def _sanitize_mixed_script_text(text: str) -> str:
    return _strip_bidi_marks(_normalize_mixed_spaces(text))


def _uses_latin_font(ch: str) -> bool:
    if ch.isspace():
        return True
    return ch.isascii() and ord(ch) < 0x0250


def _prepare_script_line(line: str, target_lang: str, script_font: str = "") -> str:
    if target_lang == "ar":
        try:
            import arabic_reshaper
            from bidi.algorithm import get_display

            shaped = arabic_reshaper.reshape(line)
            return _sanitize_mixed_script_text(get_display(shaped, base_dir="R"))
        except Exception as exc:
            logger.warning("arabic reshape failed: %s", exc)
    if target_lang == "he":
        try:
            from bidi.algorithm import get_display

            return _sanitize_mixed_script_text(get_display(line, base_dir="R"))
        except Exception as exc:
            logger.warning("hebrew bidi failed: %s", exc)
    return _sanitize_mixed_script_text(line)


def _is_latin_word(word: str) -> bool:
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


def _word_width(
    word: str, script_font: str, latin_font: str, size: float, target_lang: str
) -> float:
    if _is_latin_word(word):
        return string_width(latin_font, word, size)
    return string_width(script_font, _reshape_word(word, target_lang), size)


def _wrap_logical_lines(
    text_line: str,
    max_w: float,
    script_font: str,
    latin_font: str,
    size: float,
    target_lang: str,
) -> list[str]:
    words = [w for w in text_line.split(" ") if w]
    if not words:
        return []
    space_w = string_width(latin_font, " ", size)
    lines: list[str] = []
    cur: list[str] = []
    cur_w = 0.0
    for w in words:
        ww = _word_width(w, script_font, latin_font, size, target_lang)
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
    runs: list[tuple[str, bool]] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch.isspace():
            j = i + 1
            while j < n and text[j].isspace():
                j += 1
            runs.append((text[i:j], True))
            i = j
            continue
        is_latin = _uses_latin_font(ch)
        j = i + 1
        while j < n:
            cj = text[j]
            if cj.isspace():
                break
            if _uses_latin_font(cj) != is_latin:
                break
            j += 1
        runs.append((text[i:j], is_latin))
        i = j
    return runs


def _run_width(seg: str, is_latin: bool, script_font: str, latin_font: str, size: float) -> float:
    return string_width(latin_font if is_latin else script_font, seg, size)


def _runs_width(
    runs: list[tuple[str, bool]], script_font: str, latin_font: str, size: float
) -> float:
    return sum(_run_width(s, lat, script_font, latin_font, size) for s, lat in runs)


def _block_rect(block: dict[str, Any], page_h: float) -> PdfRect:
    pdf_x = float(block["pdfX"])
    pdf_y = float(block["pdfY"])
    pdf_w = float(block["pdfWidth"])
    pdf_h = float(block["pdfHeight"])
    y0 = page_h - (pdf_y + pdf_h)
    y1 = page_h - pdf_y
    return PdfRect(pdf_x, y0, pdf_x + pdf_w, y1)


def _wrap_line_count(text: str, width: float, fontfile: str, size: float) -> int:
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
            fits = string_width(fontfile, candidate, size) <= width - 4
            if fits:
                current = candidate
            else:
                if current:
                    lines += 1
                current = word
        if current:
            lines += 1
    return max(1, lines)


def _find_ceiling(base: PdfRect, following: list[PdfRect], page_h: float) -> float:
    default = min(base.y1 + 48, page_h - 12)
    for nxt in following:
        if nxt.y0 <= base.y0 + 1:
            continue
        return max(base.y0 + 4, nxt.y0 - 2)
    return default


def _fit_prose_rect(
    text: str,
    base: PdfRect,
    max_y1: float,
    fontfile: str,
    base_size: float,
) -> tuple[float, PdfRect]:
    width = max(base.width, 40.0)
    min_size = 4.5
    start = min(base_size * 0.88, 10.5)
    avail_h = max(max_y1 - base.y0, base.height)
    size = start
    while size >= min_size:
        lines = _wrap_line_count(text, width, fontfile, size)
        need_h = lines * size * 1.28 + 3
        y1 = min(base.y0 + need_h, max_y1)
        if y1 - base.y0 >= min(size * 0.85, avail_h * 0.5):
            return size, PdfRect(base.x0, base.y0, base.x1, y1)
        size -= 0.4
    y1 = min(base.y0 + min_size * 2.5, max_y1)
    return min_size, PdfRect(base.x0, base.y0, base.x1, max(y1, base.y0 + min_size))


def _draw_wrapped_ltr(
    c: canvas.Canvas,
    rect: PdfRect,
    text: str,
    fontfile: str,
    size: float,
    page_h: float,
    min_size: float,
) -> bool:
    width = max(rect.width - 4, 20.0)
    s = size
    while s >= min_size:
        lines: list[str] = []
        for para in text.split("\n"):
            para = para.strip()
            if not para:
                continue
            lines.extend(_wrap_logical_lines(para, width, fontfile, _latin_font_path(), s, "en"))
        if not lines:
            return False
        line_h = s * 1.35
        need_h = len(lines) * line_h
        if need_h > rect.height + 2 and s > min_size:
            s -= 0.4
            continue
        y_bl = page_h - rect.y0 - s * 0.85
        for line in lines:
            if y_bl < page_h - rect.y1:
                break
            draw_string_bl(c, rect.x0 + 2, y_bl, line, fontfile, s)
            y_bl -= line_h
        return True
    return False


def _draw_rtl_mixed(
    c: canvas.Canvas,
    rect: PdfRect,
    text: str,
    target_lang: str,
    script_font: str,
    latin_font: str,
    size: float,
    page_h: float,
    *,
    allow_overflow: bool = False,
) -> bool:
    max_w = max(rect.width - 4, 20.0)
    line_h = size * 1.35
    n_lines = sum(
        len(_wrap_logical_lines(raw.strip(), max_w, script_font, latin_font, size, target_lang))
        for raw in text.split("\n")
        if raw.strip()
    )
    n_lines = max(1, n_lines)
    if not allow_overflow and n_lines * line_h > rect.height + 2:
        return False

    y_tl = rect.y0 + size * 0.15
    bottom_tl = rect.y1 - 1
    for raw in text.split("\n"):
        raw = raw.strip()
        if not raw:
            continue
        for logical_line in _wrap_logical_lines(raw, max_w, script_font, latin_font, size, target_lang):
            if y_tl > bottom_tl and not allow_overflow:
                return False
            prepared = _prepare_script_line(logical_line, target_lang, script_font)
            runs = _split_latin_runs(prepared)
            total_w = _runs_width(runs, script_font, latin_font, size)
            x = rect.x1 - 2 - total_w
            y_bl = page_h - y_tl - size * 0.85
            for seg, is_lat in runs:
                if not seg:
                    continue
                ffile = latin_font if is_lat else script_font
                draw_string_bl(c, x, y_bl, seg, ffile, size)
                x += _run_width(seg, is_lat, script_font, latin_font, size)
            y_tl += line_h
    return True


def _draw_textbox(
    c: canvas.Canvas,
    rect: PdfRect,
    text: str,
    target_lang: str,
    fontfile: str,
    size: float,
    min_size: float,
    page_h: float,
    *,
    bold: bool = False,
    italic: bool = False,
) -> bool:
    if rect.is_empty or rect.width < 1 or rect.height < 1:
        return False

    if target_lang in DUAL_FONT_LANGS and _latin_font_path(bold, italic):
        latin_font = _latin_font_path(bold, italic)
        s = size
        while s >= min_size:
            if _draw_rtl_mixed(c, rect, text, target_lang, fontfile, latin_font, s, page_h):
                return True
            s -= 0.4
        return _draw_rtl_mixed(
            c, rect, text, target_lang, fontfile, latin_font, min_size, page_h, allow_overflow=True,
        )

    shaped = text
    if target_lang in RTL_LANGS:
        shaped = "\n".join(
            _prepare_script_line(ln, target_lang, fontfile)
            for ln in text.split("\n")
            if ln.strip()
        )
    s = size
    while s >= min_size:
        if _draw_wrapped_ltr(c, rect, shaped, fontfile, s, page_h, min_size):
            return True
        s -= 0.4
    return False


def _fit_vertical_size(
    text: str,
    avail: float,
    base_size: float,
    script_font: str,
    latin_font: str,
    target_lang: str,
    min_size: float = 4.0,
) -> float:
    size = min(base_size, 72.0)
    while size >= min_size:
        prepared = _prepare_script_line(text, target_lang)
        runs = _split_latin_runs(prepared)
        total = sum(_run_width(s, lat, script_font, latin_font, size) for s, lat in runs)
        if total <= avail:
            return size
        size -= 0.4
    return min_size


def _insert_vertical_mixed(
    c: canvas.Canvas,
    text: str,
    block: dict[str, Any],
    page_h: float,
    script_font: str,
    target_lang: str,
    *,
    bold: bool = False,
    italic: bool = False,
) -> None:
    latin_path = _latin_font_path(bold, italic)
    if not script_font or not latin_path:
        return
    base = _block_rect(block, page_h)
    if base.is_empty or base.width < 2 or base.height < 2:
        return
    rotation = int(block.get("rotation", 90))
    base_size = float(block.get("fontSize", 11))
    avail = max(base.height - 4, base_size * 0.8)
    size = _fit_vertical_size(text, avail, base_size, script_font, latin_path, target_lang)
    prepared = _prepare_script_line(text, target_lang, script_font)
    runs = _split_latin_runs(prepared)
    if rotation in (-90, 270):
        start_x, start_y_tl = base.x0 + base.width * 0.55, base.y1 - 2
        rot = -90
        step = -1
    elif rotation == 90:
        start_x, start_y_tl = base.x0 + base.width * 0.55, base.y0 + size + 2
        rot = 90
        step = 1
    else:
        start_x, start_y_tl = base.x0 + 2, base.y0 + size + 2
        rot = 0
        step = 1
    offset = 0.0
    for seg, is_lat in runs:
        if not seg:
            continue
        ffile = latin_path if is_lat else script_font
        if rot == 0:
            x = start_x + offset
            y_bl = page_h - start_y_tl - size * 0.85
            draw_string_bl(c, x, y_bl, seg, ffile, size)
        else:
            y_bl = page_h - start_y_tl
            draw_rotated_bl(c, start_x, y_bl, seg, ffile, size, rot)
        offset += _run_width(seg, is_lat, script_font, latin_path, size) * step


def _insert_vertical_text(
    c: canvas.Canvas,
    text: str,
    block: dict[str, Any],
    page_h: float,
    fontfile: str,
    target_lang: str = "en",
    *,
    bold: bool = False,
    italic: bool = False,
) -> None:
    text = " ".join(line for line in text.split("\n") if line.strip())
    if not text:
        return
    if target_lang in DUAL_FONT_LANGS and _latin_font_path(bold, italic):
        _insert_vertical_mixed(
            c, text, block, page_h, fontfile, target_lang, bold=bold, italic=italic,
        )
        return
    base = _block_rect(block, page_h)
    if base.is_empty:
        return
    rotation = int(block.get("rotation", 90))
    base_size = float(block.get("fontSize", 11))
    min_size = 4.0
    avail = max(base.height - 4, base_size * 0.8)
    size = min(base_size, 72.0)
    while size >= min_size:
        if string_width(fontfile, text, size) <= avail:
            break
        size -= 0.4
    shaped = _prepare_script_line(text, target_lang)
    if rotation in (-90, 270):
        x, y_tl, rot = base.x0 + base.width * 0.55, base.y1 - 2, -90
    elif rotation == 90:
        x, y_tl, rot = base.x0 + base.width * 0.55, base.y0 + size + 2, 90
    else:
        x, y_tl, rot = base.x0 + 2, base.y0 + size + 2, 0
    y_bl = page_h - y_tl - size * 0.85
    if rot == 0:
        draw_string_bl(c, x, y_bl, shaped, fontfile, size)
    else:
        draw_rotated_bl(c, x, page_h - y_tl, shaped, fontfile, size, rot)


def _insert_text(
    c: canvas.Canvas,
    text: str,
    block: dict[str, Any],
    page_h: float,
    fontfile: str,
    *,
    max_y1: float | None = None,
    page_width: float | None = None,
    target_lang: str = "en",
    bold: bool = False,
    italic: bool = False,
    rtl_right: float | None = None,
) -> None:
    text = "\n".join(line for line in text.split("\n") if line.strip())
    if not text:
        return

    if block.get("label") == "vertical":
        _insert_vertical_text(
            c, text, block, page_h, fontfile, target_lang=target_lang, bold=bold, italic=italic,
        )
        return

    base_size = float(block.get("fontSize", 11))
    base = _block_rect(block, page_h)
    if base.is_empty or base.width < 2 or base.height < 2:
        return

    fs = float(block.get("fontSize", 11))
    if base.height < fs * 0.85:
        base = PdfRect(base.x0, base.y0, base.x1, base.y0 + max(base.height, fs * 1.15))

    is_cell = block.get("label") == "table_cell"
    if is_cell:
        rect = PdfRect(base.x0 + 2, base.y0 + 2, base.x1 - 2, base.y1 - 2)
        if rect.is_empty or rect.width < 2 or rect.height < 2:
            return
        size = min(base_size * 0.80, 72.0)
        min_size = 4.0
    else:
        if target_lang in RTL_LANGS and page_width and base.x0 < page_width * 0.5:
            right = rtl_right if rtl_right is not None else (page_width - 12)
            right = max(base.x1, min(right, page_width - 12))
            base = PdfRect(max(12.0, base.x0), base.y0, right, base.y1)
        elif page_width and base.width < page_width * 0.45:
            new_x1 = max(base.x1, page_width - 12)
            base = PdfRect(base.x0, base.y0, new_x1, base.y1)
        if not fontfile:
            rect, size, min_size = base, min(base_size, 11.0), 5.0
        else:
            ceiling = max_y1 if max_y1 is not None else base.y1 + 120
            size, rect = _fit_prose_rect(text, base, ceiling, fontfile, base_size)
            min_size = 4.5

    if not _draw_textbox(
        c, rect, text, target_lang, fontfile, size, min_size, page_h, bold=bold, italic=italic,
    ):
        if len(text.split()) <= 8 and "\n" not in text.strip():
            shaped = _prepare_script_line(text, target_lang, fontfile) if target_lang in RTL_LANGS else text
            y_bl = page_h - rect.y0 - size * 0.85
            draw_string_bl(c, rect.x0 + 2, y_bl, shaped, fontfile, size)
        else:
            logger.warning("textbox overflow lang=%s len=%d", target_lang, len(text))


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
    if fontfile:
        register_font(fontfile)

    all_by_page: dict[int, list[tuple[int, dict[str, Any], str]]] = {}
    for i, block in enumerate(blocks):
        translated = (translations[i] if i < len(translations) else "").strip()
        if not translated:
            translated = (block.get("text") or "").strip()
        page_no = int(block["pageNumber"])
        all_by_page.setdefault(page_no, []).append((i, block, translated))

    with pikepdf.open(pdf_path) as pdf:
        page_count = len(pdf.pages)
        for page_no, page_blocks in all_by_page.items():
            page_idx = page_no - 1
            if page_idx < 0 or page_idx >= page_count:
                continue
            page = pdf.pages[page_idx]
            mb = page.mediabox
            width = float(mb[2] - mb[0])
            height = float(mb[3] - mb[1])
            page_h = height

            def _draw_page(c: canvas.Canvas, w: float, h: float) -> None:
                for _i, block, _translated in page_blocks:
                    if _is_sidebar_noise(block):
                        continue
                    is_cell = block.get("label") == "table_cell"
                    if is_cell:
                        cw = float(block["pdfWidth"]) - 4
                        ch = float(block["pdfHeight"]) - 4
                        if cw > 1 and ch > 1:
                            wipe_rect_bl(
                                c,
                                float(block["pdfX"]) + 2,
                                float(block["pdfY"]) + 2,
                                cw, ch,
                            )
                    else:
                        fs = float(block.get("fontSize", 11))
                        wx, wy, ww, wh = _trim_wipe_rect(block)
                        wipe_rect_bl(c, wx, wy, ww, wh, pad_x=max(1, fs * 0.08), pad_y=1.5)

                prose_sorted: list[tuple[int, PdfRect]] = []
                for i, block, translated in page_blocks:
                    if translated and block.get("label") not in ("table_cell", "vertical"):
                        prose_sorted.append((i, _block_rect(block, page_h)))
                prose_sorted.sort(key=lambda x: x[1].y0)
                ceilings: dict[int, float] = {}
                for idx, (i, rect) in enumerate(prose_sorted):
                    following = [r for _, r in prose_sorted[idx + 1:]]
                    ceilings[i] = _find_ceiling(rect, following, page_h)

                right_limits: dict[int, float] = {}
                if target_lang in RTL_LANGS:
                    rect_by_i = {i: _block_rect(b, page_h) for i, b, t in page_blocks if t}
                    for i, r in rect_by_i.items():
                        limit = w - 12
                        for j, o in rect_by_i.items():
                            if j == i:
                                continue
                            vov = min(r.y1, o.y1) - max(r.y0, o.y0)
                            if vov <= 1:
                                continue
                            if o.x0 >= r.x1 - 1:
                                limit = min(limit, o.x0 - 4)
                        right_limits[i] = max(r.x1, limit)

                ordered = sorted(page_blocks, key=lambda x: _block_rect(x[1], page_h).y0)
                for i, block, translated in ordered:
                    if not translated or _is_sidebar_noise(block):
                        continue
                    translated = _strip_margin_prefix(translated)
                    if not translated.strip():
                        continue
                    draw_block = _adjust_block_for_render({**block, "text": translated})
                    translated = draw_block.get("text", translated)
                    bold = bool(block.get("bold"))
                    italic = bool(block.get("italic"))
                    b_file = _styled_font_path(target_lang, bold, italic) if (bold or italic) else fontfile
                    if b_file:
                        register_font(b_file)
                    _insert_text(
                        c, translated, draw_block, page_h, b_file,
                        max_y1=ceilings.get(i),
                        page_width=w,
                        target_lang=target_lang,
                        bold=bold,
                        italic=italic,
                        rtl_right=right_limits.get(i),
                    )
                    if debug_ocr:
                        r = _block_rect(draw_block, page_h)
                        draw_debug_rect_tl(c, r.x0, r.y0, r.width, r.height, page_h, str(i))

            overlay_buf = make_overlay(width, height, _draw_page)
            with pikepdf.open(overlay_buf) as overlay_pdf:
                page.add_overlay(overlay_pdf.pages[0])

        pdf.save(str(output_path))

    return output_path
