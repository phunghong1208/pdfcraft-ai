"""Adapter pdfplumber + pypdf — API tương thích pipeline layout cũ (fitz.Page)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Iterator

import pdfplumber
from pypdf import PdfReader

from pdf_geom import PdfRect

_BARCODE_FONT_RE = re.compile(
    r"barcode|code\s?128|code\s?39|idautomation|libre\s*barcode|"
    r"3\s?of\s?9|3of9|\bc39\b|\bcode128\b|\bcode39\b",
    re.I,
)


def _is_barcode_font(name: str) -> bool:
    return bool(_BARCODE_FONT_RE.search(name or ""))


def _chars_to_spans(chars: list[dict[str, Any]]) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    for ch in chars:
        text = ch.get("text") or ""
        if not text.strip():
            continue
        font = str(ch.get("fontname") or "")
        if _is_barcode_font(font):
            continue
        size = float(ch.get("size") or 11)
        x0, top, x1, bottom = float(ch["x0"]), float(ch["top"]), float(ch["x1"]), float(ch["bottom"])
        spans.append({
            "text": text,
            "bbox": [x0, top, x1, bottom],
            "font": font,
            "size": size,
            "flags": 0,
            "origin": (x0, bottom),
        })
    return spans


def _group_chars_to_lines(chars: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    spans = _chars_to_spans(chars)
    if not spans:
        return []
    spans.sort(key=lambda s: (s["bbox"][1], s["bbox"][0]))
    lines: list[list[dict[str, Any]]] = []
    for span in spans:
        size = float(span.get("size") or 11)
        cy = (span["bbox"][1] + span["bbox"][3]) / 2
        tol = max(4.0, size * 0.55)
        placed = False
        for line in lines:
            ref = line[0]
            ref_cy = (ref["bbox"][1] + ref["bbox"][3]) / 2
            if abs(cy - ref_cy) <= tol:
                line.append(span)
                placed = True
                break
        if not placed:
            lines.append([span])
    for line in lines:
        line.sort(key=lambda s: s["bbox"][0])
    return lines


def _dict_from_page(page: pdfplumber.page.Page, clip: PdfRect | None = None) -> dict[str, Any]:
    if clip is not None and not clip.is_empty:
        cropped = page.within_bbox((clip.x0, clip.y0, clip.x1, clip.y1))
        chars = cropped.chars or []
    else:
        chars = page.chars or []

    line_spans = _group_chars_to_lines(chars)
    blocks: list[dict[str, Any]] = []
    if line_spans:
        blocks.append({
            "type": 0,
            "lines": [{"spans": spans, "dir": (1.0, 0.0)} for spans in line_spans],
        })
    return {"blocks": blocks}


@dataclass
class PdfWidget:
    field_value: str
    rect: PdfRect
    text_fontsize: float = 10.0


class PdfPlumberPage:
    """Thay fitz.Page trong layout extract."""

    def __init__(
        self,
        page: pdfplumber.page.Page,
        page_index: int,
        widgets: list[PdfWidget],
    ) -> None:
        self._page = page
        self.page_index = page_index
        self._widgets = widgets
        self.rect = SimpleNamespace(
            width=float(page.width or 612),
            height=float(page.height or 792),
        )

    @property
    def page_number(self) -> int:
        return self.page_index + 1

    def get_text(self, mode: str, clip: PdfRect | None = None, flags: int = 0) -> Any:
        if mode == "dict":
            return _dict_from_page(self._page, clip)
        if mode == "text":
            if clip is not None and not clip.is_empty:
                return (self._page.within_bbox((clip.x0, clip.y0, clip.x1, clip.y1)).extract_text() or "").strip()
            return (self._page.extract_text() or "").strip()
        raise ValueError(f"unsupported get_text mode: {mode}")

    def find_tables(self, strategy: str = "lines") -> SimpleNamespace:
        settings: dict[str, Any] = {
            "vertical_strategy": "lines",
            "horizontal_strategy": "lines",
            "intersection_tolerance": 5,
        }
        if strategy == "lines_strict":
            settings["snap_tolerance"] = 3
            settings["join_tolerance"] = 3
        tables = self._page.find_tables(table_settings=settings)
        if tables is None:
            found: list[Any] = []
        elif isinstance(tables, list):
            found = tables
        else:
            found = list(getattr(tables, "tables", []) or [])
        return SimpleNamespace(tables=found)

    def widgets(self) -> list[PdfWidget]:
        return self._widgets


def _load_widgets(pdf_path: Path) -> dict[int, list[PdfWidget]]:
    out: dict[int, list[PdfWidget]] = {}
    try:
        reader = PdfReader(str(pdf_path))
    except Exception:
        return out
    for page_index, page in enumerate(reader.pages):
        widgets: list[PdfWidget] = []
        annots = page.get("/Annots")
        if not annots:
            out[page_index] = widgets
            continue
        for annot_ref in annots:
            try:
                annot = annot_ref.get_object()
            except Exception:
                continue
            if str(annot.get("/Subtype", "")) != "/Widget":
                continue
            rect = annot.get("/Rect")
            if not rect or len(rect) < 4:
                continue
            x0, y0, x1, y1 = (float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3]))
            # pypdf Rect: bottom-left origin — convert top for internal PdfRect
            page_h = float(page.mediabox.top) - float(page.mediabox.bottom)
            top = page_h - y1
            bottom = page_h - y0
            val = annot.get("/V")
            text = "" if val is None else str(val).strip()
            if not text:
                continue
            widgets.append(PdfWidget(
                field_value=text,
                rect=PdfRect(x0, top, x1, bottom),
                text_fontsize=10.0,
            ))
        out[page_index] = widgets
    return out


class PdfPlumberDocument:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._pdf = pdfplumber.open(path)
        self._widgets = _load_widgets(path)

    def __iter__(self) -> Iterator[PdfPlumberPage]:
        for i, page in enumerate(self._pdf.pages):
            yield PdfPlumberPage(page, i, self._widgets.get(i, []))

    def __len__(self) -> int:
        return len(self._pdf.pages)

    def __getitem__(self, index: int) -> PdfPlumberPage:
        page = self._pdf.pages[index]
        return PdfPlumberPage(page, index, self._widgets.get(index, []))

    def close(self) -> None:
        self._pdf.close()


def open_pdf(path: Path) -> PdfPlumberDocument:
    return PdfPlumberDocument(path)
