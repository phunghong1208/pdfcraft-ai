"""Trích text theo dòng từ lớp PDF (PyMuPDF) — đủ số thứ tự, URL, văn bản Docling hay bỏ sót."""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from typing import Any

import fitz

LIST_MARKER_RE = re.compile(r"^\d{1,3}\.?$")
# Đầu mục "1." / "1. text" / "1.Text" — nhưng KHÔNG bắt số thập phân ("3.5", "1.1")
LIST_START_RE = re.compile(r"^\d{1,3}\.(?!\d)")
# Tiêu đề mục La Mã: II. ĐÁP ÁN — không gộp vào đoạn trước
ROMAN_HEADING_RE = re.compile(r"^\s*[IVXLCDM]{1,8}[.)]\s+\S")
# Dòng bắt đầu bằng bullet/đầu mục → cần ngắt dòng thật (không phải soft-wrap)
BULLET_LINE_RE = re.compile(r"^\s*([-+*•▪◦‣·–—]\s|\d{1,3}[.)](?!\d)\s?)")
BULLET_MARKER_RE = re.compile(r"^[\u2022\u2023\u25E6\u2043\-–—]\.?$")
NOISE_LINE_RE = re.compile(
    r"^(page\s+\d+(\s+of\s+\d+)?|trang\s+\d+(\s+trang\s+\d+)?|document\s+created)",
    re.I,
)
# Font barcode (Code128/39, EAN/UPC, IDAutomation, Libre Barcode...) — KHÔNG dịch,
# KHÔNG xoá: dịch/redraw bằng font thường sẽ làm hỏng mã vạch.
_BARCODE_FONT_RE = re.compile(
    r"barcode|code\s?128|code\s?39|idautomation|libre\s*barcode|"
    r"3\s?of\s?9|3of9|\bc39\b|\bcode128\b|\bcode39\b",
    re.I,
)


def _is_barcode_span(span: dict) -> bool:
    return bool(_BARCODE_FONT_RE.search(span.get("font") or ""))

# Map special Unicode bullets/symbols -> ASCII so NotoSans renders them
_GLYPH_FIXES: dict[str, str] = {
    chr(0x2022): '-', chr(0x2023): '-', chr(0x25E6): '-', chr(0x2043): '-',
    chr(0x25CF): '*', chr(0x25CB): 'o', chr(0x25A0): '[x]', chr(0x25A1): '[ ]',
    chr(0x25B6): '>', chr(0x25B8): '>', chr(0x2713): 'v', chr(0x2714): 'v',
    chr(0x2717): 'x', chr(0x2718): 'x', chr(0x00B7): '-', chr(0x2027): '-',
}
_GLYPH_TABLE = str.maketrans(_GLYPH_FIXES)


def _fix_glyphs(text: str) -> str:
    return text.translate(_GLYPH_TABLE)


def _is_glyph_noise(tok: str) -> bool:
    """1 ký tự lẻ trông như glyph decode sai (icon/symbol/ToUnicode hỏng)."""
    if len(tok) != 1 or tok.isascii():
        return False
    cat = unicodedata.category(tok)
    # Symbol / private-use / unassigned → gần như chắc là rác
    if cat in ("Co", "Cn", "So", "Sk", "Sm", "Sc"):
        return True
    # Chữ Latin-extended lẻ (vd 'Ế' = U+1EBE) đứng một mình → rác.
    # Giữ nguyên chữ lẻ của CJK/Arabic/Thai... vì có thể có nghĩa.
    if cat.startswith("L"):
        return unicodedata.name(tok, "").startswith("LATIN")
    return False


def _strip_stray_edges(text: str) -> str:
    """Bỏ ký tự rác lẻ ở đầu/cuối dòng (vd 'Ế Tổng điểm' → 'Tổng điểm')."""
    toks = text.split(" ")
    if len(toks) < 2:
        return text
    while len(toks) >= 2 and _is_glyph_noise(toks[0]):
        toks.pop(0)
    while len(toks) >= 2 and _is_glyph_noise(toks[-1]):
        toks.pop()
    return " ".join(toks)



def _span_style(span: dict) -> tuple[bool, bool]:
    """(bold, italic) cho 1 span — dựa vào flags PyMuPDF + tên font."""
    flags = int(span.get("flags", 0) or 0)
    italic = bool(flags & 2)        # bit 1
    bold = bool(flags & 16)         # bit 4
    name = (span.get("font") or "").lower()
    if not bold and any(k in name for k in ("bold", "black", "semibold", "heavy")):
        bold = True
    if not italic and ("italic" in name or "oblique" in name):
        italic = True
    return bold, italic


def _spans_style(spans: list[dict]) -> tuple[bool, bool]:
    """Style trội của cả block: >=60% ký tự đậm/nghiêng thì coi là đậm/nghiêng."""
    b = i = total = 0
    for s in spans:
        txt = (s.get("text") or "").strip()
        if not txt:
            continue
        n = len(txt)
        total += n
        bo, it = _span_style(s)
        if bo:
            b += n
        if it:
            i += n
    return (total > 0 and b >= total * 0.6, total > 0 and i >= total * 0.6)


def _append_line(cur_text: str, new_text: str) -> str:
    """Nối dòng mới: soft-wrap → ' ' (cho câu liền mạch để dịch tốt),
    chỉ xuống dòng thật trước bullet/đầu mục."""
    nt = (new_text or "").strip()
    if not nt:
        return cur_text
    if not cur_text:
        return nt
    sep = "\n" if BULLET_LINE_RE.match(nt) else " "
    return f"{cur_text.rstrip()}{sep}{nt}".strip()


def _join_spans(spans: list[dict]) -> str:
    parts: list[str] = []
    for i, span in enumerate(spans):
        text = span.get("text", "") or ""
        if not text:
            continue
        if i > 0 and parts:
            prev = spans[i - 1].get("bbox") or [0, 0, 0, 0]
            cur = span.get("bbox") or [0, 0, 0, 0]
            size = float(span.get("size", 11) or 11)
            gap = float(cur[0]) - float(prev[2])
            if gap > max(size * 0.18, 1.0):
                parts.append(" ")
        parts.append(text)
    return _strip_stray_edges(_fix_glyphs("".join(parts).strip()))


def _line_block(
    page_no: int,
    page_h: float,
    spans: list[dict],
    label: str | None = None,
) -> dict[str, Any] | None:
    if not spans:
        return None

    text = _join_spans(spans)
    if not text or _is_glyph_noise(text):
        return None

    x0 = min(float(s["bbox"][0]) for s in spans)
    x1 = max(float(s["bbox"][2]) for s in spans)
    font_size = max(float(s.get("size", 11) or 11) for s in spans)
    bold, italic = _spans_style(spans)

    # Use baseline (span origin) to compute glyph region — bbox includes line spacing
    # fitz origin = (x, baseline_y) in top-left coords
    baselines = [float(s["origin"][1]) for s in spans if s.get("origin")]
    if baselines:
        baseline = sum(baselines) / len(baselines)
        # Glyph ascent ~80% above baseline, descent ~25% below
        glyph_top = baseline - font_size * 0.80
        glyph_bot = baseline + font_size * 0.25
    else:
        # Fallback to bbox if no origin available
        glyph_top = min(float(s["bbox"][1]) for s in spans)
        glyph_bot = max(float(s["bbox"][3]) for s in spans)

    return {
        "pageNumber": page_no,
        "text": text,
        "pdfX": round(x0, 2),
        "pdfY": round(page_h - glyph_bot, 2),
        "pdfWidth": round(max(4.0, x1 - x0), 2),
        "pdfHeight": round(max(4.0, glyph_bot - glyph_top), 2),
        "fontSize": round(max(6.0, min(72.0, font_size)), 1),
        "fontFamily": "Helvetica",
        "bold": bold,
        "italic": italic,
        "label": label,
    }


# Tách cột khi gap ngang > factor * fontSize (header đề thi 2 cột không có merge cell)
COLUMN_SPLIT_GAP_FACTOR = 3.5


def _split_spans_by_column_gap(spans: list[dict]) -> list[list[dict]]:
    """Tách spans cùng dòng tại gutter cột — tránh 'SỞ GD... KỲ THI THỬ...' thành 1 dòng."""
    if len(spans) < 2:
        return [spans] if spans else []
    ordered = sorted(spans, key=lambda s: float(s["bbox"][0]))
    runs: list[list[dict]] = [[ordered[0]]]
    for prev, cur in zip(ordered, ordered[1:]):
        size = max(float(prev.get("size", 11) or 11), float(cur.get("size", 11) or 11))
        gap = float(cur["bbox"][0]) - float(prev["bbox"][2])
        if gap > size * COLUMN_SPLIT_GAP_FACTOR:
            runs.append([cur])
        else:
            runs[-1].append(cur)
    return runs


# Gộp ngang khi gap <= factor * fontSize (đủ để nối stt + text, không nuốt sang cột khác)
SAME_LINE_GAP_FACTOR = 3.0


def _merge_same_line(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Gộp các mảnh CÙNG MỘT DÒNG (cùng baseline) thành 1 block, trái→phải.

    Sửa lỗi: cùng 1 dòng bị tách 2 block/2 id, và stt ('1.') rời khỏi text.
    """
    if not blocks:
        return blocks

    ordered = sorted(
        blocks,
        key=lambda b: (b["pageNumber"], -(b["pdfY"] + b["pdfHeight"]), b["pdfX"]),
    )
    out: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None

    for blk in ordered:
        if cur is not None and blk["pageNumber"] == cur["pageNumber"]:
            cy0 = max(cur["pdfY"], blk["pdfY"])
            cy1 = min(cur["pdfY"] + cur["pdfHeight"], blk["pdfY"] + blk["pdfHeight"])
            overlap = cy1 - cy0
            min_h = min(cur["pdfHeight"], blk["pdfHeight"])
            same_line = min_h > 0 and overlap / min_h >= 0.5
            gap = blk["pdfX"] - (cur["pdfX"] + cur["pdfWidth"])
            max_gap = max(cur["fontSize"], blk["fontSize"]) * SAME_LINE_GAP_FACTOR

            if same_line and -2.0 <= gap <= max_gap:
                x0 = min(cur["pdfX"], blk["pdfX"])
                x1 = max(cur["pdfX"] + cur["pdfWidth"], blk["pdfX"] + blk["pdfWidth"])
                y0 = min(cur["pdfY"], blk["pdfY"])
                y1 = max(cur["pdfY"] + cur["pdfHeight"], blk["pdfY"] + blk["pdfHeight"])
                cur["text"] = f"{cur['text'].rstrip()} {blk['text'].lstrip()}".strip()
                cur["pdfX"] = round(x0, 2)
                cur["pdfY"] = round(y0, 2)
                cur["pdfWidth"] = round(max(4.0, x1 - x0), 2)
                cur["pdfHeight"] = round(max(4.0, y1 - y0), 2)
                cur["fontSize"] = round(max(cur["fontSize"], blk["fontSize"]), 1)
                cur["bold"] = bool(cur.get("bold")) and bool(blk.get("bold"))
                cur["italic"] = bool(cur.get("italic")) and bool(blk.get("italic"))
                continue

        if cur is not None:
            out.append(cur)
        cur = {**blk}

    if cur is not None:
        out.append(cur)
    return out


def _merge_marker_with_next(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Gộp '3.' với dòng nội dung kế tiếp (hanging indent)."""
    if not blocks:
        return blocks

    merged: list[dict[str, Any]] = []
    i = 0
    while i < len(blocks):
        cur = blocks[i]
        text = (cur.get("text") or "").strip()

        if i + 1 < len(blocks):
            nxt = blocks[i + 1]
            same_page = cur["pageNumber"] == nxt["pageNumber"]
            marker = LIST_MARKER_RE.match(text) or BULLET_MARKER_RE.match(text)
            y_close = abs(cur["pdfY"] - nxt["pdfY"]) <= max(cur["pdfHeight"], nxt["pdfHeight"]) * 1.6

            if same_page and marker and y_close:
                x0 = min(cur["pdfX"], nxt["pdfX"])
                y0 = min(cur["pdfY"], nxt["pdfY"])
                x1 = max(cur["pdfX"] + cur["pdfWidth"], nxt["pdfX"] + nxt["pdfWidth"])
                y1 = max(cur["pdfY"] + cur["pdfHeight"], nxt["pdfY"] + nxt["pdfHeight"])
                merged.append({
                    **nxt,
                    "text": f"{text} {nxt['text'].strip()}".strip(),
                    "pdfX": round(x0, 2),
                    "pdfY": round(y0, 2),
                    "pdfWidth": round(max(4.0, x1 - x0), 2),
                    "pdfHeight": round(max(4.0, y1 - y0), 2),
                    "fontSize": round(max(cur["fontSize"], nxt["fontSize"]), 1),
                    "bold": bool(cur.get("bold")) and bool(nxt.get("bold")),
                    "italic": bool(cur.get("italic")) and bool(nxt.get("italic")),
                })
                i += 2
                continue

        merged.append(cur)
        i += 1

    return merged


def _is_noise_line(text: str) -> bool:
    t = (text or "").strip()
    return not t or bool(NOISE_LINE_RE.match(t))


def _merge_list_items(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Gom toàn bộ dòng thuộc cùng mục 1., 2., ... thành một block."""
    if not blocks:
        return blocks

    ordered = sorted(blocks, key=lambda b: (-(b["pdfY"] + b["pdfHeight"]), b["pdfX"]))
    out: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None

    for blk in ordered:
        text = (blk.get("text") or "").strip()
        if _is_noise_line(text):
            continue

        if LIST_START_RE.match(text):
            if cur is not None:
                out.append(cur)
            cur = {**blk, "text": text}
            continue

        if cur is not None and blk["pageNumber"] == cur["pageNumber"]:
            cur_top = max(cur["pdfY"] + cur["pdfHeight"], blk["pdfY"] + blk["pdfHeight"])
            x0 = min(cur["pdfX"], blk["pdfX"])
            x1 = max(cur["pdfX"] + cur["pdfWidth"], blk["pdfX"] + blk["pdfWidth"])
            y0 = min(cur["pdfY"], blk["pdfY"])
            cur["text"] = _append_line(cur["text"], text)
            cur["pdfX"] = round(x0, 2)
            cur["pdfY"] = round(y0, 2)
            cur["pdfWidth"] = round(max(4.0, x1 - x0), 2)
            cur["pdfHeight"] = round(max(4.0, cur_top - y0), 2)
            cur["fontSize"] = max(cur["fontSize"], blk["fontSize"])
            cur["bold"] = bool(cur.get("bold")) and bool(blk.get("bold"))
            cur["italic"] = bool(cur.get("italic")) and bool(blk.get("italic"))
            continue

        if cur is not None:
            out.append(cur)
            cur = None
        out.append(blk)

    if cur is not None:
        out.append(cur)
    return out


MAX_MERGE_LINES = 20


def _merge_nearby_blocks(
    blocks: list[dict[str, Any]],
    gap_factor: float = 0.5,
) -> list[dict[str, Any]]:
    """Gộp các dòng liền kề trong cùng đoạn — gap_factor nhỏ để không nuốt khoảng trắng giữa đoạn."""
    if not blocks:
        return blocks

    blocks.sort(key=lambda b: (b["pageNumber"], -(b["pdfY"] + b["pdfHeight"]), b["pdfX"]))
    merged: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None
    cur_lines: int = 1

    for blk in blocks:
        if cur is None:
            cur = {**blk}
            cur_lines = 1
            continue

        if blk["pageNumber"] != cur["pageNumber"]:
            merged.append(cur)
            cur = {**blk}
            cur_lines = 1
            continue

        cur_top = cur["pdfY"] + cur["pdfHeight"]
        blk_top = blk["pdfY"] + blk["pdfHeight"]
        gap = cur["pdfY"] - blk_top
        max_gap = max(cur["fontSize"], blk["fontSize"]) * gap_factor

        overlap_x0 = max(cur["pdfX"], blk["pdfX"])
        overlap_x1 = min(cur["pdfX"] + cur["pdfWidth"], blk["pdfX"] + blk["pdfWidth"])
        min_w = min(cur["pdfWidth"], blk["pdfWidth"])
        aligned = (overlap_x1 - overlap_x0) > min_w * 0.3
        blk_text = (blk.get("text") or "").strip()
        new_list_item = bool(LIST_START_RE.match(blk_text))

        # II. ĐÁP ÁN — tách khỏi đoạn hướng dẫn phía trên
        if ROMAN_HEADING_RE.match(blk_text):
            merged.append(cur)
            cur = {**blk}
            cur_lines = 1
            continue

        if 0 <= gap < max_gap and aligned and cur_lines < MAX_MERGE_LINES and not new_list_item:
            new_x = min(cur["pdfX"], blk["pdfX"])
            new_y = min(cur["pdfY"], blk["pdfY"])
            new_x2 = max(cur["pdfX"] + cur["pdfWidth"], blk["pdfX"] + blk["pdfWidth"])
            new_y2 = max(cur_top, blk_top)
            cur["text"] = _append_line(cur["text"], blk["text"])
            cur["pdfX"] = round(new_x, 2)
            cur["pdfY"] = round(new_y, 2)
            cur["pdfWidth"] = round(max(4.0, new_x2 - new_x), 2)
            cur["pdfHeight"] = round(max(4.0, new_y2 - new_y), 2)
            cur["fontSize"] = max(cur["fontSize"], blk["fontSize"])
            cur["bold"] = bool(cur.get("bold")) and bool(blk.get("bold"))
            cur["italic"] = bool(cur.get("italic")) and bool(blk.get("italic"))
            cur_lines += 1
        else:
            merged.append(cur)
            cur = {**blk}
            cur_lines = 1

    if cur:
        merged.append(cur)

    return merged


def _rect_overlap_area(a: fitz.Rect, b: fitz.Rect) -> float:
    ix = max(0.0, min(a.x1, b.x1) - max(a.x0, b.x0))
    iy = max(0.0, min(a.y1, b.y1) - max(a.y0, b.y0))
    return ix * iy


def _widget_in_cell(widget: Any, cell_rect: fitz.Rect) -> bool:
    wr = widget.rect
    if wr.is_empty:
        return False
    inter = _rect_overlap_area(wr, cell_rect)
    if inter / max(wr.get_area(), 1.0) > 0.35:
        return True
    wx = (wr.x0 + wr.x1) / 2
    wy = (wr.y0 + wr.y1) / 2
    return cell_rect.x0 <= wx <= cell_rect.x1 and cell_rect.y0 <= wy <= cell_rect.y1


def _cell_value_from_page(page: fitz.Page, cell_rect: fitz.Rect) -> tuple[str, list[dict]]:
    """Trích text trong ô — spans, plain text, rồi form widget."""
    text_dict = page.get_text("dict", clip=cell_rect, flags=fitz.TEXT_PRESERVE_WHITESPACE)
    # Gom theo dòng + dùng _join_spans (gap-aware) để KHÔNG chèn space giữa từng
    # glyph — PDF tiếng Việt hay tách mỗi ký tự có dấu thành 1 span.
    line_texts: list[str] = []
    all_spans: list[dict] = []
    for blk in text_dict.get("blocks", []):
        for line in blk.get("lines", []):
            lspans = [
                s for s in line.get("spans", [])
                if (s.get("text") or "").strip() and not _is_barcode_span(s)
            ]
            if not lspans:
                continue
            all_spans.extend(lspans)
            joined = _join_spans(lspans)
            if joined:
                line_texts.append(joined)
    if all_spans:
        # Ngắt dòng thật trước bullet/đầu mục; còn lại nối bằng space (soft-wrap).
        parts: list[str] = []
        for lt in line_texts:
            if parts and BULLET_LINE_RE.match(lt):
                parts.append('\n' + lt)
            elif parts:
                parts.append(' ' + lt)
            else:
                parts.append(lt)
        return _strip_stray_edges(''.join(parts)), all_spans

    plain = (page.get_text("text", clip=cell_rect) or "").strip()
    if plain:
        return _strip_stray_edges(_fix_glyphs(re.sub(r"\s+", " ", plain))), [{"size": 10}]

    for widget in page.widgets() or []:
        val = (widget.field_value or "").strip()
        if not val or not _widget_in_cell(widget, cell_rect):
            continue
        fs = widget.text_fontsize or 10
        return _fix_glyphs(val), [{"size": fs}]
    return "", []


def _collect_table_blocks(
    page_index: int, page: fitz.Page
) -> tuple[list[dict[str, Any]], list[fitz.Rect], list[fitz.Rect]]:
    """Detect tables via find_tables().

    Returns (cell_blocks, table_rects, cell_filter_rects).
    cell_filter_rects: bbox từng ô — line extractor không đọc lại vùng đã có table_cell.
    """
    page_no = page_index + 1
    page_h = float(page.rect.height)
    blocks: list[dict[str, Any]] = []
    table_rects: list[fitz.Rect] = []
    cell_filter_rects: list[fitz.Rect] = []

    def _valid(tab: Any) -> bool:
        valid_cells = [c for c in tab.cells if c is not None]
        if tab.col_count < 2 or len(valid_cells) < tab.col_count:
            return False
        # Bảng 1 hàng header (Phần|Câu|Nội dung|Điểm) hoặc header đề 2 cột
        return (
            tab.row_count >= 2
            or (tab.row_count >= 1 and tab.col_count >= 3)
            or (tab.row_count >= 1 and tab.col_count >= 2 and len(valid_cells) >= 2)
        )

    # Chỉ dùng strategy theo ĐƯỜNG KẺ (viền thật). KHÔNG dùng "text" vì nó cắt
    # vụn ô nhiều dòng thành hàng/cột giả (gây vỡ layout).
    tables: list[Any] = []
    for strat in ("lines_strict", "lines"):
        try:
            finder = page.find_tables(strategy=strat)
        except Exception:
            continue
        found = [t for t in finder.tables if _valid(t)]
        if found:
            tables = found
            break

    for tab in tables:
        if not _valid(tab):
            continue
        b = tab.bbox
        table_rects.append(fitz.Rect(b[0], b[1], b[2], b[3]))

        for cell_bbox in tab.cells:
            if cell_bbox is None:
                continue
            cx0, cy0, cx1, cy1 = cell_bbox
            if cx0 is None or cx1 <= cx0 or cy1 <= cy0:
                continue

            cell_rect = fitz.Rect(cx0, cy0, cx1, cy1)
            cell_filter_rects.append(cell_rect)
            cell_text, spans = _cell_value_from_page(page, cell_rect)

            if not cell_text:
                continue

            fs = round(max(6.0, min(72.0, max(float(s.get("size", 10)) for s in spans))), 1)
            cell_bold, cell_italic = _spans_style(spans)
            blocks.append({
                "pageNumber": page_no,
                "text": cell_text,
                "pdfX": round(float(cx0), 2),
                "pdfY": round(page_h - float(cy1), 2),
                "pdfWidth": round(max(4.0, float(cx1 - cx0)), 2),
                "pdfHeight": round(max(4.0, float(cy1 - cy0)), 2),
                "fontSize": fs,
                "fontFamily": "Helvetica",
                "bold": cell_bold,
                "italic": cell_italic,
                "label": "table_cell",
            })

    return blocks, table_rects, cell_filter_rects


def _span_in_table(bbox: list, cell_rects: list[fitz.Rect]) -> bool:
    """True nếu span nằm trong ô bảng (tâm hoặc overlap >=25%)."""
    if not cell_rects:
        return False
    sx0, sy0, sx1, sy1 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
    cx, cy = (sx0 + sx1) / 2, (sy0 + sy1) / 2
    for tr in cell_rects:
        if tr.x0 <= cx <= tr.x1 and tr.y0 <= cy <= tr.y1:
            return True
    span_area = max((sx1 - sx0) * (sy1 - sy0), 1.0)
    for tr in cell_rects:
        ix = max(0.0, min(sx1, tr.x1) - max(sx0, tr.x0))
        iy = max(0.0, min(sy1, tr.y1) - max(sy0, tr.y0))
        if ix * iy / span_area >= 0.25:
            return True
    return False


def _collect_page_lines(
    page_index: int, page: fitz.Page, cell_filter_rects: list[fitz.Rect] | None = None
) -> list[dict[str, Any]]:
    page_no = page_index + 1
    page_h = float(page.rect.height)
    page_lines: list[dict[str, Any]] = []
    tr = cell_filter_rects or []

    # Regular text blocks — skip rotated/vertical text and table spans
    for block in page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE).get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            dir_vec = line.get("dir", (1, 0))
            if abs(dir_vec[0]) < 0.9:
                continue
            spans = [
                s for s in line.get("spans", [])
                if (s.get("text") or "").strip()
                and not _is_barcode_span(s)
                and not _span_in_table(s.get("bbox", [0, 0, 0, 0]), tr)
            ]
            for run in _split_spans_by_column_gap(spans):
                row = _line_block(page_no, page_h, run, label="line")
                if row and not _is_noise_line(row.get("text", "")):
                    page_lines.append(row)

    # AcroForm field values (form widgets) — not captured by get_text
    for widget in page.widgets() or []:
        val = (widget.field_value or "").strip()
        if not val:
            continue
        r = widget.rect
        if not r or r.is_empty:
            continue
        wx = (r.x0 + r.x1) / 2
        wy = (r.y0 + r.y1) / 2
        if any(tr.x0 <= wx <= tr.x1 and tr.y0 <= wy <= tr.y1 for tr in tr):
            continue
        fs = max(6.0, min(72.0, widget.text_fontsize or 11.0))
        page_lines.append({
            "pageNumber": page_no,
            "text": _fix_glyphs(val),
            "pdfX": round(float(r.x0), 2),
            "pdfY": round(page_h - float(r.y1), 2),
            "pdfWidth": round(max(4.0, min(float(r.x1 - r.x0), len(val) * fs * 0.72)), 2),
            "pdfHeight": round(max(4.0, min(float(r.y1 - r.y0), fs * 1.4)), 2),
            "fontSize": round(fs, 1),
            "fontFamily": "Helvetica",
            "label": "field",
        })

    page_lines.sort(key=lambda b: (-(b["pdfY"] + b["pdfHeight"]), b["pdfX"]))
    return page_lines


def extract_fitz_wipe_lines(pdf_path: Path) -> list[dict[str, Any]]:
    """Raw text bboxes — NO filtering. Wipe ALL original text before rendering."""
    lines: list[dict[str, Any]] = []
    doc = fitz.open(pdf_path)
    try:
        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            page_h = float(page.rect.height)
            for block in page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE).get("blocks", []):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    spans = [
                        s for s in line.get("spans", [])
                        if (s.get("text") or "").strip() and not _is_barcode_span(s)
                    ]
                    if not spans:
                        continue
                    x0 = min(float(s["bbox"][0]) for s in spans)
                    y0 = min(float(s["bbox"][1]) for s in spans)
                    x1 = max(float(s["bbox"][2]) for s in spans)
                    y1 = max(float(s["bbox"][3]) for s in spans)
                    fs = max(float(s.get("size", 11) or 11) for s in spans)
                    lines.append({
                        "pageNumber": page_no,
                        "pdfX": round(x0, 2),
                        "pdfY": round(page_h - y1, 2),
                        "pdfWidth": round(max(4.0, x1 - x0), 2),
                        "pdfHeight": round(max(4.0, y1 - y0), 2),
                        "fontSize": round(fs, 1),
                    })
    finally:
        doc.close()
    return lines


def _text_overlap(a: str, b: str) -> float:
    """Fraction of words in `a` that also appear in `b`."""
    wa = set(a.lower().split())
    wb = set(b.lower().split())
    if not wa:
        return 0.0
    return len(wa & wb) / len(wa)


def _dedup_blocks(blocks: list[dict[str, Any]], iou_thresh: float = 0.4) -> list[dict[str, Any]]:
    """Remove overlap duplicates — table_cell luôn thắng line trùng vùng/text."""
    cells = [b for b in blocks if b.get("label") == "table_cell"]
    others = [b for b in blocks if b.get("label") != "table_cell"]
    kept: list[dict[str, Any]] = list(cells)

    for blk in others:
        b_text = blk.get("text", "")
        dominated = False
        for k in kept:
            if k["pageNumber"] != blk["pageNumber"]:
                continue
            if k.get("label") != "table_cell":
                continue
            bx, by = blk["pdfX"], blk["pdfY"]
            bw, bh = blk["pdfWidth"], blk["pdfHeight"]
            kx, ky = k["pdfX"], k["pdfY"]
            kw, kh = k["pdfWidth"], k["pdfHeight"]
            ix = max(0.0, min(bx + bw, kx + kw) - max(bx, kx))
            iy = max(0.0, min(by + bh, ky + kh) - max(by, ky))
            inter = ix * iy
            area = bw * bh
            if area > 0 and inter / area >= 0.12:
                dominated = True
                break
            if len(b_text) > 2 and (
                _text_overlap(b_text, k.get("text", "")) > 0.35
                or b_text.strip() in (k.get("text") or "")
            ):
                dominated = True
                break
        if dominated:
            continue
        for k in kept:
            if k["pageNumber"] != blk["pageNumber"] or k.get("label") == "table_cell":
                continue
            bx, by = blk["pdfX"], blk["pdfY"]
            bw, bh = blk["pdfWidth"], blk["pdfHeight"]
            kx, ky = k["pdfX"], k["pdfY"]
            kw, kh = k["pdfWidth"], k["pdfHeight"]
            ix = max(0.0, min(bx + bw, kx + kw) - max(bx, kx))
            iy = max(0.0, min(by + bh, ky + kh) - max(by, ky))
            inter = ix * iy
            area = bw * bh
            if area > 0 and inter / area >= iou_thresh:
                dominated = True
                break
            if len(b_text) > 3 and _text_overlap(b_text, k.get("text", "")) > 0.6:
                dominated = True
                break
        if not dominated:
            kept.append(blk)
    return kept


def extract_fitz_line_blocks(pdf_path: Path) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    doc = fitz.open(pdf_path)
    try:
        for page_index, page in enumerate(doc):
            table_blocks, _, cell_filter_rects = _collect_table_blocks(page_index, page)
            page_lines = _merge_same_line(
                _collect_page_lines(page_index, page, cell_filter_rects)
            )
            merged = _merge_list_items(_merge_marker_with_next(page_lines))
            merged = _merge_nearby_blocks(merged, gap_factor=0.55)
            page_blocks = _dedup_blocks(table_blocks + merged)
            page_blocks.sort(
                key=lambda b: (b["pageNumber"], -(b["pdfY"] + b["pdfHeight"]), b["pdfX"])
            )
            blocks.extend(page_blocks)
    finally:
        doc.close()

    return blocks
