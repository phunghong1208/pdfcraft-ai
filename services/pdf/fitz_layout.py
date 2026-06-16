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
BULLET_MARKER_RE = re.compile(r"^[\u2022\u2023\u25E6\u2043\-–—]\.?$")
NOISE_LINE_RE = re.compile(
    r"^(page\s+\d+(\s+of\s+\d+)?|trang\s+\d+(\s+trang\s+\d+)?|document\s+created)",
    re.I,
)

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
        "label": label,
    }


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
            cur["text"] = f"{cur['text']}\n{text}".strip()
            cur["pdfX"] = round(x0, 2)
            cur["pdfY"] = round(y0, 2)
            cur["pdfWidth"] = round(max(4.0, x1 - x0), 2)
            cur["pdfHeight"] = round(max(4.0, cur_top - y0), 2)
            cur["fontSize"] = max(cur["fontSize"], blk["fontSize"])
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

        if 0 <= gap < max_gap and aligned and cur_lines < MAX_MERGE_LINES and not new_list_item:
            new_x = min(cur["pdfX"], blk["pdfX"])
            new_y = min(cur["pdfY"], blk["pdfY"])
            new_x2 = max(cur["pdfX"] + cur["pdfWidth"], blk["pdfX"] + blk["pdfWidth"])
            new_y2 = max(cur_top, blk_top)
            cur["text"] += "\n" + blk["text"]
            cur["pdfX"] = round(new_x, 2)
            cur["pdfY"] = round(new_y, 2)
            cur["pdfWidth"] = round(max(4.0, new_x2 - new_x), 2)
            cur["pdfHeight"] = round(max(4.0, new_y2 - new_y), 2)
            cur["fontSize"] = max(cur["fontSize"], blk["fontSize"])
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
            lspans = [s for s in line.get("spans", []) if (s.get("text") or "").strip()]
            if not lspans:
                continue
            all_spans.extend(lspans)
            joined = _join_spans(lspans)
            if joined:
                line_texts.append(joined)
    if all_spans:
        return _strip_stray_edges(" ".join(line_texts)), all_spans

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
) -> tuple[list[dict[str, Any]], list[fitz.Rect]]:
    """Detect tables via find_tables(). Returns (cell_blocks, table_rects)."""
    page_no = page_index + 1
    page_h = float(page.rect.height)
    blocks: list[dict[str, Any]] = []
    table_rects: list[fitz.Rect] = []

    def _valid(tab: Any) -> bool:
        valid_cells = [c for c in tab.cells if c is not None]
        return len(valid_cells) >= 4 and tab.row_count >= 2 and tab.col_count >= 2

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
        valid_cells = [c for c in tab.cells if c is not None]
        if len(valid_cells) < 4 or tab.row_count < 2 or tab.col_count < 2:
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
            cell_text, spans = _cell_value_from_page(page, cell_rect)

            if not cell_text:
                continue

            fs = round(max(6.0, min(72.0, max(float(s.get("size", 10)) for s in spans))), 1)
            blocks.append({
                "pageNumber": page_no,
                "text": cell_text,
                "pdfX": round(float(cx0), 2),
                "pdfY": round(page_h - float(cy1), 2),
                "pdfWidth": round(max(4.0, float(cx1 - cx0)), 2),
                "pdfHeight": round(max(4.0, float(cy1 - cy0)), 2),
                "fontSize": fs,
                "fontFamily": "Helvetica",
                "label": "table_cell",
            })

    return blocks, table_rects


def _span_in_table(bbox: list, table_rects: list[fitz.Rect]) -> bool:
    """True if span bbox overlaps >50% with any table region."""
    if not table_rects:
        return False
    sx0, sy0, sx1, sy1 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
    span_area = max((sx1 - sx0) * (sy1 - sy0), 1.0)
    for tr in table_rects:
        ix = max(0.0, min(sx1, tr.x1) - max(sx0, tr.x0))
        iy = max(0.0, min(sy1, tr.y1) - max(sy0, tr.y0))
        if ix * iy / span_area > 0.5:
            return True
    return False


def _collect_page_lines(
    page_index: int, page: fitz.Page, table_rects: list[fitz.Rect] | None = None
) -> list[dict[str, Any]]:
    page_no = page_index + 1
    page_h = float(page.rect.height)
    page_lines: list[dict[str, Any]] = []
    tr = table_rects or []

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
                and not _span_in_table(s.get("bbox", [0, 0, 0, 0]), tr)
            ]
            row = _line_block(page_no, page_h, spans, label="line")
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
                    spans = [s for s in line.get("spans", []) if (s.get("text") or "").strip()]
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
    """Remove overlap duplicates — ưu tiên giữ table_cell."""
    kept: list[dict[str, Any]] = []
    for blk in blocks:
        bx, by = blk["pdfX"], blk["pdfY"]
        bw, bh = blk["pdfWidth"], blk["pdfHeight"]
        b_text = blk.get("text", "")
        is_cell = blk.get("label") == "table_cell"
        dominated = False
        for ki, k in enumerate(kept):
            if k["pageNumber"] != blk["pageNumber"]:
                continue
            kx, ky = k["pdfX"], k["pdfY"]
            kw, kh = k["pdfWidth"], k["pdfHeight"]
            ix = max(0, min(bx + bw, kx + kw) - max(bx, kx))
            iy = max(0, min(by + bh, ky + kh) - max(by, ky))
            inter = ix * iy
            area = bw * bh
            k_cell = k.get("label") == "table_cell"
            if area > 0 and inter / area >= iou_thresh:
                if is_cell and not k_cell:
                    kept[ki] = blk
                dominated = True
                break
            both_cells = is_cell and k_cell
            if not both_cells and len(b_text) > 3 and _text_overlap(b_text, k.get("text", "")) > 0.6:
                if is_cell and not k_cell:
                    kept[ki] = blk
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
            table_blocks, table_rects = _collect_table_blocks(page_index, page)
            page_lines = _merge_same_line(_collect_page_lines(page_index, page, table_rects))
            merged = _merge_list_items(_merge_marker_with_next(page_lines))
            merged = _merge_nearby_blocks(merged, gap_factor=0.55)
            blocks.extend(_dedup_blocks(table_blocks + merged))
    finally:
        doc.close()

    return blocks
