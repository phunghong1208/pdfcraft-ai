"""Layout extraction microservice — Docling tables + PyMuPDF text lines for PDF translation."""

from __future__ import annotations

import logging
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import CoordOrigin
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from fitz_layout import extract_fitz_line_blocks

app = FastAPI(title="PDFCraft Layout Service")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pdfcraft.layout")

MAX_BLOCKS = 500


def _page_height(doc: Any, page_no: int) -> float:
    pages = getattr(doc, "pages", None) or {}
    page = pages.get(page_no) or pages.get(str(page_no))
    if page is not None:
        size = getattr(page, "size", None)
        if size is not None:
            return float(getattr(size, "height", 0) or 0)
    return 842.0


def _bbox_to_pdf_rect(bbox: Any, page_height: float) -> tuple[float, float, float, float]:
    """Return pdfX, pdfY (bottom), pdfWidth, pdfHeight in PDF bottom-left coords."""
    origin = getattr(bbox, "coord_origin", CoordOrigin.BOTTOMLEFT)
    l = float(bbox.l)
    t = float(bbox.t)
    r = float(bbox.r)
    b = float(bbox.b)

    if origin == CoordOrigin.TOPLEFT:
        pdf_x = l
        pdf_y = page_height - b
        pdf_w = max(4.0, r - l)
        pdf_h = max(4.0, b - t)
        return pdf_x, pdf_y, pdf_w, pdf_h

    pdf_x = l
    pdf_y = min(t, b)
    pdf_w = max(4.0, r - l)
    pdf_h = max(4.0, abs(t - b))
    return pdf_x, pdf_y, pdf_w, pdf_h


def _estimate_font_size(text: str, pdf_w: float, pdf_h: float) -> float:
    lines = [ln.strip() for ln in re.split(r"[\n\r]+", text) if ln.strip()]
    line_count = max(1, len(lines))
    longest = max((len(ln) for ln in lines), default=len(text))

    size_from_height = pdf_h / (line_count * 1.28)
    size_from_width = (pdf_w / max(1, longest)) / 0.52 if longest else size_from_height
    base = min(size_from_height, size_from_width) if line_count == 1 else size_from_height
    return max(6.0, min(72.0, base * 0.95))


def _rect_overlap_ratio(
    ax: float, ay: float, aw: float, ah: float,
    bx: float, by: float, bw: float, bh: float,
) -> float:
    ix0 = max(ax, bx)
    iy0 = max(ay, by)
    ix1 = min(ax + aw, bx + bw)
    iy1 = min(ay + ah, by + bh)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    smaller = min(aw * ah, bw * bh)
    return inter / smaller if smaller > 0 else 0.0


def _make_block(
    block_index: int,
    page_no: int,
    text: str,
    pdf_x: float,
    pdf_y: float,
    pdf_w: float,
    pdf_h: float,
    font_size: float | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    fs = font_size if font_size is not None else _estimate_font_size(text, pdf_w, pdf_h)
    return {
        "id": f"p{page_no}-b{block_index}",
        "pageNumber": page_no,
        "text": text,
        "pdfX": round(pdf_x, 2),
        "pdfY": round(pdf_y, 2),
        "pdfWidth": round(pdf_w, 2),
        "pdfHeight": round(pdf_h, 2),
        "fontSize": round(fs, 1),
        "fontFamily": "Helvetica",
        "label": label,
    }


def _extract_table_cell_blocks(doc: Any) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []

    for table in getattr(doc, "tables", None) or []:
        prov_list = getattr(table, "prov", None) or []
        default_page = int(getattr(prov_list[0], "page_no", 1) or 1) if prov_list else 1

        data = getattr(table, "data", None)
        grid = getattr(data, "grid", None) if data is not None else None
        if not grid:
            continue

        for row in grid:
            for cell in row:
                text = (getattr(cell, "text", None) or "").strip()
                if not text:
                    continue

                bbox = getattr(cell, "bbox", None)
                if bbox is None:
                    continue

                cell_prov = getattr(cell, "prov", None) or prov_list
                page_no = default_page
                if cell_prov:
                    page_no = int(getattr(cell_prov[0], "page_no", default_page) or default_page)

                page_height = _page_height(doc, page_no)
                pdf_x, pdf_y, pdf_w, pdf_h = _bbox_to_pdf_rect(bbox, page_height)
                blocks.append(
                    _make_block(
                        block_index=0,
                        page_no=page_no,
                        text=text,
                        pdf_x=pdf_x,
                        pdf_y=pdf_y,
                        pdf_w=pdf_w,
                        pdf_h=pdf_h,
                        label="table_cell",
                    )
                )

    return blocks


def _norm_text(text: str) -> str:
    return re.sub(r"\s+", "", (text or "").strip().lower())


def _duplicate_of_table(text: str, table_blocks: list[dict[str, Any]]) -> bool:
    norm = _norm_text(text)
    if not norm:
        return False
    for cell in table_blocks:
        cell_norm = _norm_text(cell["text"])
        if not cell_norm:
            continue
        if norm == cell_norm:
            return True
        if len(norm) >= 8 and norm in cell_norm:
            return True
        if len(cell_norm) >= 8 and cell_norm in norm:
            return True
    return False


def _inside_table_cell(
    pdf_x: float, pdf_y: float, pdf_w: float, pdf_h: float,
    table_blocks: list[dict[str, Any]],
    page_no: int,
) -> bool:
    """Chỉ bỏ dòng fitz khi nằm gần như hoàn toàn trong một ô bảng."""
    for cell in table_blocks:
        if cell["pageNumber"] != page_no:
            continue
        if _rect_overlap_ratio(
            pdf_x, pdf_y, pdf_w, pdf_h,
            cell["pdfX"], cell["pdfY"], cell["pdfWidth"], cell["pdfHeight"],
        ) >= 0.72:
            return True
    return False


def _extract_docling_tables(pdf_path: Path) -> list[dict[str, Any]]:
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = False
    pipeline_options.do_table_structure = True

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
        }
    )
    result = converter.convert(str(pdf_path))
    return _extract_table_cell_blocks(result.document)


def extract_layout_blocks(pdf_path: Path) -> list[dict[str, Any]]:
    table_blocks: list[dict[str, Any]] = []
    try:
        table_blocks = _extract_docling_tables(pdf_path)
    except Exception as exc:
        logger.warning("Docling table extract failed, fitz-only: %s", exc)

    line_blocks = extract_fitz_line_blocks(pdf_path)
    blocks: list[dict[str, Any]] = []
    block_index = 0

    for cell in table_blocks:
        if block_index >= MAX_BLOCKS:
            break
        blocks.append(
            _make_block(
                block_index=block_index,
                page_no=cell["pageNumber"],
                text=cell["text"],
                pdf_x=cell["pdfX"],
                pdf_y=cell["pdfY"],
                pdf_w=cell["pdfWidth"],
                pdf_h=cell["pdfHeight"],
                font_size=cell["fontSize"],
                label="table_cell",
            )
        )
        block_index += 1

    for line in line_blocks:
        if block_index >= MAX_BLOCKS:
            break

        text = (line.get("text") or "").strip()
        if len(text) < 1:
            continue

        page_no = int(line["pageNumber"])
        if table_blocks and (
            _duplicate_of_table(text, table_blocks)
            or _inside_table_cell(
                line["pdfX"], line["pdfY"], line["pdfWidth"], line["pdfHeight"],
                table_blocks, page_no,
            )
        ):
            continue

        blocks.append(
            _make_block(
                block_index=block_index,
                page_no=page_no,
                text=text,
                pdf_x=line["pdfX"],
                pdf_y=line["pdfY"],
                pdf_w=line["pdfWidth"],
                pdf_h=line["pdfHeight"],
                font_size=line.get("fontSize"),
                label=line.get("label"),
            )
        )
        block_index += 1

    return blocks


@app.get("/health")
def health():
    return {"status": "ok", "engine": "docling+fitz"}


@app.post("/extract")
async def extract_blocks(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted.")

    tmpdir = Path(tempfile.mkdtemp())
    input_path = tmpdir / "input.pdf"

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        logger.info("Layout extract: %s", file.filename)
        blocks = extract_layout_blocks(input_path)

        if not blocks:
            raise HTTPException(status_code=422, detail="No text blocks extracted from PDF.")

        return JSONResponse({"blocks": blocks, "engine": "docling+fitz", "count": len(blocks)})
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Layout extract failed")
        raise HTTPException(status_code=500, detail=f"Layout extract failed: {exc}") from exc
