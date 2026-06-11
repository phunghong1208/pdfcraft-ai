"""Trích text theo dòng từ lớp PDF (PyMuPDF) — đủ số thứ tự, URL, văn bản Docling hay bỏ sót."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import fitz

LIST_MARKER_RE = re.compile(r"^\d{1,3}\.?$")
BULLET_MARKER_RE = re.compile(r"^[\u2022\u2023\u25E6\u2043\-–—]\.?$")


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
    return "".join(parts).strip()


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
    y0 = min(float(s["bbox"][1]) for s in spans)
    x1 = max(float(s["bbox"][2]) for s in spans)
    y1 = max(float(s["bbox"][3]) for s in spans)
    font_size = max(float(s.get("size", 11) or 11) for s in spans)

    return {
        "pageNumber": page_no,
        "text": text,
        "pdfX": round(x0, 2),
        "pdfY": round(page_h - y1, 2),
        "pdfWidth": round(max(4.0, x1 - x0), 2),
        "pdfHeight": round(max(4.0, y1 - y0), 2),
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


def extract_fitz_line_blocks(pdf_path: Path) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    doc = fitz.open(pdf_path)
    try:
        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            page_h = float(page.rect.height)
            page_lines: list[dict[str, Any]] = []

            for block in page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE).get("blocks", []):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    spans = [s for s in line.get("spans", []) if (s.get("text") or "").strip()]
                    row = _line_block(page_no, page_h, spans, label="line")
                    if row:
                        page_lines.append(row)

            page_lines.sort(key=lambda b: (-(b["pdfY"] + b["pdfHeight"]), b["pdfX"]))
            blocks.extend(_merge_marker_with_next(page_lines))
    finally:
        doc.close()

    return blocks
