"""pdf2docx + hậu xử lý bold/nghiêng/căn lề + bỏ trang trống."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

import fitz
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from pdf2docx import Converter

logger = logging.getLogger("pdfcraft.ocr.pdf_to_docx")

PDF2DOCX_KWARGS = {
    "clip_image_res_ratio": 1.0,
    "min_svg_gap_dx": 5.0,
    "min_svg_gap_dy": 5.0,
    "min_svg_w": 2.0,
    "min_svg_h": 2.0,
    "parse_stream_table": True,
    "parse_lattice_table": True,
    "line_separate_threshold": 20.0,
    "line_break_width_ratio": 0.85,
    "line_align_threshold": 0.85,
}


@dataclass
class StyledRun:
    text: str
    bold: bool
    italic: bool
    light: bool
    size: float


@dataclass
class StyledLine:
    runs: list[StyledRun]
    align: WD_ALIGN_PARAGRAPH

    @property
    def text(self) -> str:
        return "".join(r.text for r in self.runs)


def _norm_key(text: str) -> str:
    return re.sub(r"\s+", "", (text or "").strip().lower())


def _font_flags(font_name: str) -> tuple[bool, bool, bool]:
    """bold, italic, light"""
    f = (font_name or "").lower().replace("-", "").replace("_", "")
    bold = any(k in f for k in ("bold", "heavy", "black", "demi", "semibold", "extrabold"))
    italic = any(k in f for k in ("italic", "oblique", "ital", "it"))
    light = any(k in f for k in ("light", "thin", "extralight", "ultralight"))
    if not bold and re.search(r"(^|[^a-z])bd([^a-z]|$)", f):
        bold = True
    if not italic and re.search(r"(^|[^a-z])it([^a-z]|$)", f):
        italic = True
    return bold, italic, light


def _span_style(span: dict) -> StyledRun:
    flags = int(span.get("flags", 0) or 0)
    font = str(span.get("font", "") or "")
    fb, fi, light = _font_flags(font)
    bold = bool(flags & 2**4) or fb
    italic = bool(flags & 2**1) or fi
    return StyledRun(
        text=span.get("text", "") or "",
        bold=bold,
        italic=italic,
        light=light and not bold,
        size=float(span.get("size", 11) or 11),
    )


def _join_gap(prev_end: float, next_start: float, size: float) -> str:
    gap = next_start - prev_end
    return " " if gap > max(size * 0.22, 1.5) else ""


def _line_from_spans(spans: list[dict]) -> StyledLine | None:
    if not spans:
        return None
    runs: list[StyledRun] = []
    for i, span in enumerate(spans):
        st = _span_style(span)
        if not st.text:
            continue
        if i > 0 and runs:
            pb = spans[i - 1].get("bbox") or [0, 0, 0, 0]
            cb = span.get("bbox") or [0, 0, 0, 0]
            gap = _join_gap(float(pb[2]), float(cb[0]), max(st.size, runs[-1].size))
            if gap and runs[-1].text and not runs[-1].text.endswith(" "):
                runs.append(StyledRun(gap, False, False, False, st.size))
        runs.append(st)
    if not runs:
        return None

    x0 = min(float(s.get("bbox", [0])[0]) for s in spans if s.get("bbox"))
    x1 = max(float(s.get("bbox", [0, 0, 0, 0])[2]) for s in spans if s.get("bbox"))
    pw = max(x1 * 1.2, 500.0)
    cx = (x0 + x1) / 2
    if cx <= pw * 0.38:
        align = WD_ALIGN_PARAGRAPH.LEFT
    elif cx >= pw * 0.62:
        align = WD_ALIGN_PARAGRAPH.RIGHT
    else:
        align = WD_ALIGN_PARAGRAPH.CENTER
    return StyledLine(runs=runs, align=align)


def _group_spans_by_y(spans: list[dict], y_tol: float = 8.0) -> list[list[dict]]:
    keyed = []
    for s in spans:
        bbox = s.get("bbox")
        if not bbox:
            continue
        cy = (float(bbox[1]) + float(bbox[3])) / 2
        keyed.append((cy, float(bbox[0]), s))
    keyed.sort(key=lambda t: (t[0], t[1]))
    lines: list[list[dict]] = []
    for cy, _x, span in keyed:
        size = float(span.get("size", 11) or 11)
        tol = max(y_tol, size * 0.55)
        placed = False
        for line in lines:
            ref = line[0]
            ref_bbox = ref.get("bbox") or [0, 0, 0, 0]
            ref_cy = (float(ref_bbox[1]) + float(ref_bbox[3])) / 2
            if abs(cy - ref_cy) <= tol:
                line.append(span)
                placed = True
                break
        if not placed:
            lines.append([span])
    for line in lines:
        line.sort(key=lambda s: float((s.get("bbox") or [0])[0]))
    return lines


def _collect_page_spans(page: fitz.Page) -> list[dict]:
    spans: list[dict] = []
    for block in page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE).get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if (span.get("text") or "").strip():
                    spans.append(span)
    return spans


def _extract_styled_lines(pdf_path: Path) -> list[StyledLine]:
    doc = fitz.open(pdf_path)
    lines: list[StyledLine] = []
    try:
        for page in doc:
            pw = page.rect.width
            spans = _collect_page_spans(page)
            for group in _group_spans_by_y(spans):
                styled = _line_from_spans(group)
                if not styled:
                    continue
                # refine align with real page width
                gspans = group
                x0 = min(float(s["bbox"][0]) for s in gspans)
                x1 = max(float(s["bbox"][2]) for s in gspans)
                cx = (x0 + x1) / 2
                if cx <= pw * 0.38:
                    styled.align = WD_ALIGN_PARAGRAPH.LEFT
                elif cx >= pw * 0.62:
                    styled.align = WD_ALIGN_PARAGRAPH.RIGHT
                else:
                    styled.align = WD_ALIGN_PARAGRAPH.CENTER
                lines.append(styled)
    finally:
        doc.close()
    return lines


def _lines_match(a: str, b: str) -> bool:
    na, nb = _norm_key(a), _norm_key(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if len(na) >= 8 and (na in nb or nb in na):
        return True
    return na[:14] == nb[:14]


def _clear_paragraph(para) -> None:
    el = para._element
    for child in list(el):
        if child.tag.endswith("r"):
            el.remove(child)


def _apply_styled_line(para, line: StyledLine) -> None:
    para.alignment = line.align
    if _norm_key(para.text) == _norm_key(line.text):
        _rebuild_runs(para, line.runs)
        return
    bold = any(r.bold for r in line.runs if r.text.strip())
    italic = any(r.italic for r in line.runs if r.text.strip())
    for run in para.runs:
        run.bold = bold
        run.italic = italic


def _rebuild_runs(para, styled_runs: list[StyledRun]) -> None:
    _clear_paragraph(para)
    for sr in styled_runs:
        if not sr.text:
            continue
        run = para.add_run(sr.text)
        run.bold = sr.bold
        run.italic = sr.italic
        if sr.size > 0:
            from docx.shared import Pt

            pt = sr.size - 0.5 if sr.light else sr.size
            run.font.size = Pt(max(6, round(pt)))


def _apply_styles_to_paragraphs(paragraphs, lines: list[StyledLine], start: int) -> int:
    idx = start
    for para in paragraphs:
        text = (para.text or "").strip()
        if not text:
            continue
        while idx < len(lines) and not _lines_match(text, lines[idx].text):
            idx += 1
        if idx >= len(lines):
            break
        _apply_styled_line(para, lines[idx])
        idx += 1
    return idx


def _enhance_formatting(pdf_path: Path, docx_path: Path) -> None:
    lines = _extract_styled_lines(pdf_path)
    if not lines:
        return
    doc = Document(str(docx_path))
    idx = _apply_styles_to_paragraphs(doc.paragraphs, lines, 0)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                idx = _apply_styles_to_paragraphs(cell.paragraphs, lines, idx)
    doc.save(str(docx_path))


def _paragraph_has_content(para) -> bool:
    if (para.text or "").strip():
        return True
    for run in para.runs:
        xml = run._element.xml
        if "w:drawing" in xml or "w:pict" in xml or "w:object" in xml:
            return True
    return False


def _has_page_break(para) -> bool:
    for br in para._element.xpath(".//w:br"):
        if br.get(qn("w:type")) == "page":
            return True
    return False


def _remove_blank_pages(docx_path: Path) -> None:
    """Xóa page break + đoạn trống tạo trang trắng."""
    doc = Document(str(docx_path))
    paras = doc.paragraphs

    # Pass 1: xóa đoạn trống giữa hai page break liên tiếp
    remove_els = []
    i = 0
    while i < len(paras):
        if _has_page_break(paras[i]):
            j = i + 1
            blank_run = True
            while j < len(paras):
                if _paragraph_has_content(paras[j]):
                    blank_run = False
                    break
                if _has_page_break(paras[j]):
                    break
                remove_els.append(paras[j]._element)
                j += 1
            if blank_run and j < len(paras) and _has_page_break(paras[j]):
                remove_els.append(paras[j]._element)
        i += 1

    for el in remove_els:
        parent = el.getparent()
        if parent is not None:
            parent.remove(el)

    # Pass 2: gộp page break liên tiếp
    paras = doc.paragraphs
    prev_had_break = False
    for para in paras:
        br = _has_page_break(para)
        if br and prev_had_break and not _paragraph_has_content(para):
            for br_el in para._element.xpath(".//w:br"):
                if br_el.get(qn("w:type")) == "page":
                    br_el.getparent().remove(br_el)
            br = False
        prev_had_break = br

    # Pass 3: xóa đoạn trống đầu/cuối
    while doc.paragraphs and not _paragraph_has_content(doc.paragraphs[0]):
        p = doc.paragraphs[0]._element
        p.getparent().remove(p)
    while doc.paragraphs and not _paragraph_has_content(doc.paragraphs[-1]):
        p = doc.paragraphs[-1]._element
        p.getparent().remove(p)

    doc.save(str(docx_path))


def _page_has_content(page: fitz.Page) -> bool:
    if page.get_text().strip():
        return True
    if page.get_images():
        return True
    if page.get_drawings():
        return True
    return False


def _filter_empty_pdf_pages(src: Path, dst: Path) -> Path:
    """Bỏ trang PDF gần như trống trước khi convert."""
    doc = fitz.open(src)
    total = len(doc)
    kept = [i for i in range(total) if _page_has_content(doc[i])]
    if not kept or len(kept) == total:
        doc.close()
        return src
    out = fitz.open()
    for i in kept:
        out.insert_pdf(doc, from_page=i, to_page=i)
    out.save(dst, garbage=4, deflate=True)
    out.close()
    doc.close()
    logger.info("Filtered %d empty PDF pages", total - len(kept))
    return dst


def _convert_pdf2docx(pdf_path: Path, docx_path: Path) -> None:
    cv = Converter(str(pdf_path))
    try:
        cv.convert(str(docx_path), start=0, end=None, **PDF2DOCX_KWARGS)
    finally:
        cv.close()


def convert_pdf_to_docx(input_path: Path, output_path: Path) -> str:
    work_pdf = input_path.parent / "filtered.pdf"
    try:
        src = _filter_empty_pdf_pages(input_path, work_pdf)
        _convert_pdf2docx(src, output_path)
        _enhance_formatting(input_path, output_path)
        _remove_blank_pages(output_path)
    except Exception as exc:
        logger.warning("Post-process failed (%s), keep raw pdf2docx", exc)
        if not output_path.exists():
            _convert_pdf2docx(input_path, output_path)
    finally:
        if work_pdf.exists() and work_pdf != input_path:
            work_pdf.unlink(missing_ok=True)
    return "pdf2docx"
