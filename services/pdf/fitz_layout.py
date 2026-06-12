"""Trích text theo dòng từ lớp PDF (PyMuPDF) — đủ số thứ tự, URL, văn bản Docling hay bỏ sót."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import fitz

LIST_MARKER_RE = re.compile(r"^\d{1,3}\.?$")
BULLET_MARKER_RE = re.compile(r"^[\u2022\u2023\u25E6\u2043\-–—]\.?$")

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
    return _fix_glyphs("".join(parts).strip())


def _line_block(
    page_no: int,
    page_h: float,
    spans: list[dict],
    label: str | None = None,
) -> dict[str, Any] | None:
    if not spans:
        return None

    text = _join_spans(spans)
    if not text:
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
        "pdfWidth": round(max(4.0, min(x1 - x0, max(len(text) * font_size * 0.72, 20.0))), 2),
        "pdfHeight": round(max(4.0, glyph_bot - glyph_top), 2),
        "fontSize": round(max(6.0, min(72.0, font_size)), 1),
        "fontFamily": "Helvetica",
        "label": label,
    }


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


MAX_MERGE_LINES = 4  # cap lines per block — prevents table rows / tall blocks from merging


def _merge_nearby_blocks(
    blocks: list[dict[str, Any]],
    gap_factor: float = 0.25,
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

        if 0 <= gap < max_gap and aligned and cur_lines < MAX_MERGE_LINES:
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


def _collect_page_lines(page_index: int, page: fitz.Page) -> list[dict[str, Any]]:
    page_no = page_index + 1
    page_h = float(page.rect.height)
    page_lines: list[dict[str, Any]] = []

    # Regular text blocks
    for block in page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE).get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = [s for s in line.get("spans", []) if (s.get("text") or "").strip()]
            row = _line_block(page_no, page_h, spans, label="line")
            if row:
                page_lines.append(row)

    # AcroForm field values (form widgets) — not captured by get_text
    for widget in page.widgets() or []:
        val = (widget.field_value or "").strip()
        if not val:
            continue
        r = widget.rect
        if not r or r.is_empty:
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
    """Mọi dòng text (chưa gộp đoạn) — dùng che/xóa chữ gốc khi dịch."""
    lines: list[dict[str, Any]] = []
    doc = fitz.open(pdf_path)
    try:
        for page_index, page in enumerate(doc):
            lines.extend(_collect_page_lines(page_index, page))
    finally:
        doc.close()
    return lines


def _dedup_blocks(blocks: list[dict[str, Any]], iou_thresh: float = 0.6) -> list[dict[str, Any]]:
    """Remove blocks whose bbox overlaps heavily with a larger/earlier block."""
    kept: list[dict[str, Any]] = []
    for blk in blocks:
        bx, by = blk["pdfX"], blk["pdfY"]
        bw, bh = blk["pdfWidth"], blk["pdfHeight"]
        dominated = False
        for k in kept:
            kx, ky = k["pdfX"], k["pdfY"]
            kw, kh = k["pdfWidth"], k["pdfHeight"]
            if k["pageNumber"] != blk["pageNumber"]:
                continue
            ix = max(0, min(bx + bw, kx + kw) - max(bx, kx))
            iy = max(0, min(by + bh, ky + kh) - max(by, ky))
            inter = ix * iy
            area = bw * bh
            if area > 0 and inter / area >= iou_thresh:
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
            page_lines = _collect_page_lines(page_index, page)
            merged = _merge_nearby_blocks(_merge_marker_with_next(page_lines))
            blocks.extend(_dedup_blocks(merged))
    finally:
        doc.close()

    return blocks
