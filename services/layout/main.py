"""Layout extraction microservice — Docling text blocks + bbox for PDF translation."""

from __future__ import annotations

import logging
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

    blocks: list[dict[str, Any]] = []
    block_index = 0

    for text_item in doc.texts:
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
        font_size = max(6.0, min(72.0, pdf_h * 0.82))
        label = str(getattr(text_item, "label", "") or "")

        blocks.append(
            {
                "id": f"p{page_no}-b{block_index}",
                "pageNumber": page_no,
                "text": text,
                "pdfX": round(pdf_x, 2),
                "pdfY": round(pdf_y, 2),
                "pdfWidth": round(pdf_w, 2),
                "pdfHeight": round(pdf_h, 2),
                "fontSize": round(font_size, 1),
                "fontFamily": "Helvetica",
                "label": label or None,
            }
        )
        block_index += 1
        if block_index >= MAX_BLOCKS:
            break

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
