"""Layout extraction microservice — Docling text blocks + bbox for PDF translation."""

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

app = FastAPI(title="PDFCraft Layout Service")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pdfcraft.layout")

MAX_BLOCKS = 500
MIN_LINE_HEIGHT_PT = 7.0


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
    """Ước lượng cỡ chữ theo số dòng — tránh pdf_h*0.82 phóng to block nhiều dòng."""
    lines = [ln.strip() for ln in re.split(r"[\n\r]+", text) if ln.strip()]
    line_count = max(1, len(lines))
    longest = max((len(ln) for ln in lines), default=len(text))

    size_from_height = pdf_h / (line_count * 1.28)
    size_from_width = (pdf_w / max(1, longest)) / 0.52 if longest else size_from_height
    if line_count == 1:
        base = min(size_from_height, size_from_width)
    else:
        base = size_from_height

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
    label: str | None = None,
) -> dict[str, Any]:
    return {
        "id": f"p{page_no}-b{block_index}",
        "pageNumber": page_no,
        "text": text,
        "pdfX": round(pdf_x, 2),
        "pdfY": round(pdf_y, 2),
        "pdfWidth": round(pdf_w, 2),
        "pdfHeight": round(pdf_h, 2),
        "fontSize": round(_estimate_font_size(text, pdf_w, pdf_h), 1),
        "fontFamily": "Helvetica",
        "label": label,
    }


def _split_multiline_block(block: dict[str, Any]) -> list[dict[str, Any]]:
    """Tách block nhiều dòng thành từng dòng — mỗi dòng một bbox/font riêng."""
    text = block["text"]
    if "\n" not in text and "\r" not in text:
        return [block]

    lines = [ln.strip() for ln in re.split(r"[\n\r]+", text) if ln.strip()]
    if len(lines) <= 1:
        return [block]

    line_h = max(MIN_LINE_HEIGHT_PT, block["pdfHeight"] / len(lines))
    base_y = block["pdfY"]
    out: list[dict[str, Any]] = []

    for i, line in enumerate(lines):
        line_y = base_y + block["pdfHeight"] - line_h * (i + 1)
        out.append(
            _make_block(
                block_index=0,
                page_no=block["pageNumber"],
                text=line,
                pdf_x=block["pdfX"],
                pdf_y=line_y,
                pdf_w=block["pdfWidth"],
                pdf_h=line_h,
                label=block.get("label"),
            )
        )
    return out


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
                if len(text) < 1:
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


def _text_covered_by_table(text: str, table_blocks: list[dict[str, Any]]) -> bool:
    norm = re.sub(r"\s+", "", text.lower())
    if not norm:
        return False
    for cell in table_blocks:
        cell_norm = re.sub(r"\s+", "", cell["text"].lower())
        if not cell_norm:
            continue
        if norm == cell_norm or (len(norm) >= 6 and norm in cell_norm):
            return True
        if len(cell_norm) >= 6 and cell_norm in norm:
            return True
    return False


def _overlaps_table_region(
    pdf_x: float, pdf_y: float, pdf_w: float, pdf_h: float,
    table_blocks: list[dict[str, Any]],
    page_no: int,
) -> bool:
    for cell in table_blocks:
        if cell["pageNumber"] != page_no:
            continue
        if _rect_overlap_ratio(
            pdf_x, pdf_y, pdf_w, pdf_h,
            cell["pdfX"], cell["pdfY"], cell["pdfWidth"], cell["pdfHeight"],
        ) >= 0.45:
            return True
    return False


def extract_layout_blocks(pdf_path: Path) -> list[dict[str, Any]]:
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = False
    pipeline_options.do_table_structure = True

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
        }
    )
    result = converter.convert(str(pdf_path))
    doc = result.document

    table_blocks = _extract_table_cell_blocks(doc)
    blocks: list[dict[str, Any]] = []
    block_index = 0

    def push(raw: dict[str, Any]) -> None:
        nonlocal block_index
        for piece in _split_multiline_block(raw):
            piece["id"] = f"p{piece['pageNumber']}-b{block_index}"
            blocks.append(piece)
            block_index += 1

    for cell in table_blocks:
        if block_index >= MAX_BLOCKS:
            break
        push(cell)

    for text_item in doc.texts:
        if block_index >= MAX_BLOCKS:
            break

        text = (getattr(text_item, "text", None) or "").strip()
        if len(text) < 2:
            continue

        prov_list = getattr(text_item, "prov", None) or []
        if not prov_list:
            continue

        prov = prov_list[0]
        bbox = getattr(prov, "bbox", None)
        if bbox is None:
            continue

        page_no = int(getattr(prov, "page_no", 1) or 1)
        page_height = _page_height(doc, page_no)
        pdf_x, pdf_y, pdf_w, pdf_h = _bbox_to_pdf_rect(bbox, page_height)
        label = str(getattr(text_item, "label", "") or "") or None

        if table_blocks and (
            _text_covered_by_table(text, table_blocks)
            or _overlaps_table_region(pdf_x, pdf_y, pdf_w, pdf_h, table_blocks, page_no)
        ):
            continue

        push(
            _make_block(
                block_index=block_index,
                page_no=page_no,
                text=text,
                pdf_x=pdf_x,
                pdf_y=pdf_y,
                pdf_w=pdf_w,
                pdf_h=pdf_h,
                label=label,
            )
        )

    return blocks


@app.get("/health")
def health():
    return {"status": "ok", "engine": "docling"}


@app.post("/extract")
async def extract_blocks(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted.")

    tmpdir = Path(tempfile.mkdtemp())
    input_path = tmpdir / "input.pdf"

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        logger.info("Docling extract: %s", file.filename)
        blocks = extract_layout_blocks(input_path)

        if not blocks:
            raise HTTPException(status_code=422, detail="No text blocks extracted from PDF.")

        return JSONResponse({"blocks": blocks, "engine": "docling", "count": len(blocks)})
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Layout extract failed")
        raise HTTPException(status_code=500, detail=f"Layout extract failed: {exc}") from exc
