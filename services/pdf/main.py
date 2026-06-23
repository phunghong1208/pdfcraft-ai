"""PDF microservice — OCR (RapidOCR), layout (pdfplumber), render (reportlab), pdf-to-docx."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import pdfplumber
import pikepdf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pdf2image import convert_from_path
from pypdf import PdfReader

from pdf_layout import extract_pdf_line_blocks, extract_pdf_wipe_lines
from pdf_overlay import draw_invisible_string_bl, make_overlay
from product_languages import (
    MAX_OCR_LANGS_PER_REQUEST,
    PRODUCT_TESSERACT_LANGS,
    RAPID_OCR_LANGS,
)
from render_translated import render_translated_pdf

app = FastAPI(title="PDFCraft PDF Service")
logging.basicConfig(level=logging.INFO)
logging.getLogger("pdfminer").setLevel(logging.ERROR)
logger = logging.getLogger("pdfcraft.pdf")

# Chỉ validate ngôn ngữ đã cài Tesseract pack trong Docker (26 product langs)
LANG_ALLOWLIST = PRODUCT_TESSERACT_LANGS | RAPID_OCR_LANGS

_rapid_ocr = None


def _normalize_ocr_langs(langs: list[str]) -> list[str]:
    """Tối đa 1–2 model OCR — không load eng+spa+fra+... cùng lúc."""
    valid = [lang for lang in langs if lang in LANG_ALLOWLIST]
    if not valid:
        valid = ["eng"]
    return valid[:MAX_OCR_LANGS_PER_REQUEST]


def _get_rapid_ocr():
    global _rapid_ocr
    if _rapid_ocr is None:
        from rapidocr_onnxruntime import RapidOCR
        _rapid_ocr = RapidOCR()
    return _rapid_ocr


# ── helpers ───────────────────────────────────────────────────

def _is_tagged_pdf(pdf_path: Path) -> bool:
    with pikepdf.open(pdf_path) as pdf:
        root = pdf.Root
        mark_info = root.get("/MarkInfo")
        if mark_info is not None:
            try:
                if mark_info.get("/Marked"):
                    return True
            except Exception:
                pass
        if root.get("/StructTreeRoot") is not None:
            return True
    return False


def _page_count(pdf_path: Path) -> int:
    return len(PdfReader(str(pdf_path)).pages)


def _extract_text_from_pdf(pdf_path: Path) -> str:
    best = ""
    for args in (
        ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf_path), "-"],
        ["pdftotext", "-enc", "UTF-8", str(pdf_path), "-"],
    ):
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=120)
            if result.returncode == 0 and len(result.stdout.strip()) > len(best.strip()):
                best = result.stdout
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

    if best.strip():
        return best

    parts: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            parts.append(f"--- Page {i} ---\n{(page.extract_text() or '')}")
    return "\n\n".join(parts)


def _pdf_has_extractable_text(pdf_path: Path) -> tuple[bool, str]:
    text = _extract_text_from_pdf(pdf_path)
    chars = len("".join(text.split()))
    pages = max(1, _page_count(pdf_path))
    return chars >= max(40, pages * 15), text


def _should_fast_extract(pdf_path: Path, force_ocr: bool) -> tuple[bool, str]:
    if force_ocr:
        return False, ""
    if _is_tagged_pdf(pdf_path):
        return True, _extract_text_from_pdf(pdf_path)
    return _pdf_has_extractable_text(pdf_path)


OCR_RASTER_DPI_DEFAULT = int(os.environ.get("OCR_RASTER_DPI", "200"))
OCR_RASTER_DPI_MAX = 300


def _clamp_raster_dpi(dpi: int) -> int:
    return max(120, min(OCR_RASTER_DPI_MAX, dpi))


def _page_sizes(pdf_path: Path) -> list[tuple[float, float]]:
    with pikepdf.open(pdf_path) as pdf:
        sizes: list[tuple[float, float]] = []
        for page in pdf.pages:
            mb = page.mediabox
            sizes.append((float(mb[2] - mb[0]), float(mb[3] - mb[1])))
        return sizes


def _rasterize_page(pdf_path: Path, page_idx: int, dpi: int, scratch_dir: Path) -> np.ndarray:
    """Rasterize một trang — ghi JPEG ra disk, không giữ toàn bộ PDF trong RAM."""
    from PIL import Image

    dpi = _clamp_raster_dpi(dpi)
    page_no = page_idx + 1
    paths = convert_from_path(
        str(pdf_path),
        dpi=dpi,
        first_page=page_no,
        last_page=page_no,
        fmt="jpeg",
        jpegopt={"quality": 90},
        output_folder=str(scratch_dir),
        paths_only=True,
        thread_count=1,
    )
    if not paths:
        raise RuntimeError(f"pdf2image failed for page {page_no}")
    try:
        with Image.open(paths[0]) as im:
            return np.asarray(im.convert("RGB"), dtype=np.uint8)
    finally:
        try:
            Path(paths[0]).unlink(missing_ok=True)
        except OSError:
            pass


# ── RapidOCR ──────────────────────────────────────────────────

def _ocr_page_rapid(
    pdf_path: Path, page_idx: int, dpi: int, scratch_dir: Path,
) -> tuple[list[tuple[list, str, float]], np.ndarray]:
    """OCR one page → (boxes, raster RGB)."""
    img = _rasterize_page(pdf_path, page_idx, dpi, scratch_dir)
    ocr = _get_rapid_ocr()
    result, _ = ocr(img)
    if not result:
        return [], img
    return [(r[0], r[1], r[2]) for r in result if r[1] and r[1].strip()], img


def _run_rapid_ocr(
    pdf_path: Path,
    output_path: Path,
    output_format: str,
    dpi: int,
) -> tuple[str, str]:
    """Run RapidOCR — từng trang, không load cả PDF ảnh vào RAM."""
    page_sizes = _page_sizes(pdf_path)
    page_count = len(page_sizes)
    all_text: list[str] = []
    raster_dpi = _clamp_raster_dpi(dpi)

    scratch = Path(tempfile.mkdtemp(prefix="pdfcraft-raster-"))
    try:
        if output_format == "pdf":
            with pikepdf.open(pdf_path) as pdf:
                for page_idx in range(page_count):
                    page_w, page_h = page_sizes[page_idx]
                    results, img = _ocr_page_rapid(pdf_path, page_idx, raster_dpi, scratch)
                    page_lines = [txt for _box, txt, _conf in results]
                    scale_x = page_w / img.shape[1]
                    scale_y = page_h / img.shape[0]
                    del img

                    def _draw_ocr(
                        c, w, h,
                        _results=results,
                        _scale_x=scale_x,
                        _scale_y=scale_y,
                        _page_h=page_h,
                    ):
                        for box, txt, _conf in _results:
                            x0 = min(p[0] for p in box) * _scale_x
                            y1 = max(p[1] for p in box) * _scale_y
                            fs = max(
                                6,
                                min(
                                    72,
                                    (max(p[1] for p in box) - min(p[1] for p in box)) * _scale_y * 0.7,
                                ),
                            )
                            y_bl = _page_h - y1
                            draw_invisible_string_bl(c, x0, y_bl, txt, "", fs)

                    overlay_buf = make_overlay(page_w, page_h, _draw_ocr)
                    with pikepdf.open(overlay_buf) as overlay_pdf:
                        pdf.pages[page_idx].add_overlay(overlay_pdf.pages[0])
                    all_text.append(f"--- Page {page_idx + 1} ---\n" + "\n".join(page_lines))
                pdf.save(str(output_path))
        else:
            for page_idx in range(page_count):
                results, img = _ocr_page_rapid(pdf_path, page_idx, raster_dpi, scratch)
                del img
                page_lines = [txt for _box, txt, _conf in results]
                all_text.append(f"--- Page {page_idx + 1} ---\n" + "\n".join(page_lines))
    finally:
        shutil.rmtree(scratch, ignore_errors=True)

    return "\n\n".join(all_text), "ocr"


# RapidOCR handles Chinese + English well and is much faster than Tesseract
_RAPID_OCR_LANGS = RAPID_OCR_LANGS


def _run_tesseract_ocr(
    pdf_path: Path,
    output_path: Path,
    langs: list[str],
    output_format: str,
) -> tuple[str, str]:
    """Run ocrmypdf (Tesseract) for multilingual support. Returns (text, method)."""
    import ocrmypdf

    tess_lang = "+".join(langs) if langs else "eng"
    jobs = min(4, os.cpu_count() or 2)

    ocrmypdf.ocr(
        str(pdf_path),
        str(output_path),
        language=tess_lang,
        deskew=False,
        skip_text=True,
        output_type="pdf",
        progress_bar=False,
        jobs=jobs,
        optimize=0,
    )

    if output_format == "text":
        return _extract_text_from_pdf(output_path if output_path.exists() else pdf_path), "tesseract"

    return "", "tesseract"


def _run_ocr(
    pdf_path: Path,
    output_path: Path,
    langs: list[str],
    output_format: str,
    dpi: int,
) -> tuple[str, str]:
    """Route to RapidOCR (Chinese/EN) or Tesseract (everything else)."""
    if set(langs) <= _RAPID_OCR_LANGS:
        return _run_rapid_ocr(pdf_path, output_path, output_format, dpi)
    return _run_tesseract_ocr(pdf_path, output_path, langs, output_format)


# ── endpoints ─────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "ocr": "rapidocr", "layout": "pdfplumber", "render": "reportlab"}


@app.post("/extract")
async def extract_layout(
    file: UploadFile = File(...),
    lang: str = Form(default="en"),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted.")

    tmpdir = Path(tempfile.mkdtemp())
    input_path = tmpdir / "input.pdf"

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        logger.info("Layout extract (pdfplumber): %s (lang=%s)", file.filename, lang)

        blocks = extract_pdf_line_blocks(input_path)
        by_page: dict[int, int] = {}
        for b in blocks:
            by_page[b["pageNumber"]] = by_page.get(b["pageNumber"], 0) + 1
        logger.info("Blocks per page: %s", by_page)
        if not blocks:
            raise HTTPException(
                status_code=422,
                detail="No text blocks extracted. PDF scan may need OCR first.",
            )

        for i, blk in enumerate(blocks):
            blk["id"] = f"p{blk['pageNumber']}-b{i}"

        wipe_lines = extract_pdf_wipe_lines(input_path)

        return JSONResponse({
            "blocks": blocks,
            "engine": "pdfplumber",
            "count": len(blocks),
            "wipeLines": wipe_lines,
        })
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Layout extract failed")
        raise HTTPException(status_code=500, detail=f"Extract failed: {exc}") from exc
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@app.post("/ocr")
async def ocr_pdf(
    file: UploadFile = File(...),
    languages: str = Form("vie+eng"),
    deskew: bool = Form(True),
    rotate_pages: bool = Form(True),
    remove_background: bool = Form(False),
    clean: bool = Form(False),
    force_ocr: bool = Form(False),
    redo_ocr: bool = Form(False),
    optimize: int = Form(0),
    output_format: str = Form("pdf"),
    oversample: int = Form(200),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted.")

    langs = _normalize_ocr_langs([l.strip() for l in languages.split("+") if l.strip()])
    for lang in langs:
        if lang not in LANG_ALLOWLIST:
            raise HTTPException(status_code=400, detail=f"Unsupported language: {lang}")

    tmpdir = Path(tempfile.mkdtemp())
    input_path = tmpdir / "input.pdf"
    output_path = tmpdir / "output.pdf"
    safe_name = file.filename.rsplit(".", 1)[0] + "_ocr.pdf"

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        fast_extract, cached_text = _should_fast_extract(input_path, force_ocr)

        if fast_extract:
            logger.info("Fast text extract: %s (tagged=%s)", file.filename, _is_tagged_pdf(input_path))
            if output_format == "text":
                return JSONResponse({
                    "text": cached_text,
                    "fileName": safe_name,
                    "pdfSize": input_path.stat().st_size,
                    "method": "extract",
                })
            shutil.copy2(input_path, output_path)
            return FileResponse(
                output_path,
                media_type="application/pdf",
                filename=safe_name,
                headers={
                    "X-OCR-Languages": "+".join(langs),
                    "X-OCR-Method": "extract",
                },
            )

        text, method = _run_ocr(
            input_path, output_path, langs, output_format, _clamp_raster_dpi(oversample),
        )

        if output_format == "text":
            return JSONResponse({
                "text": text,
                "fileName": safe_name,
                "pdfSize": output_path.stat().st_size if output_path.exists() else 0,
                "method": method,
            })

        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename=safe_name,
            headers={
                "X-OCR-Languages": "+".join(langs),
                "X-OCR-Method": method,
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("OCR failed")
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}") from exc


@app.post("/render")
async def render_pdf(
    file: UploadFile = File(...),
    blocks_json: str = Form(...),
    translations_json: str = Form(...),
    target_lang: str = Form("vi"),
    wipe_lines_json: str = Form(default="[]"),
    debug_ocr: str = Form(default="0"),
):
    """Whiteout original + draw translated text → return PDF."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted.")

    try:
        blocks = json.loads(blocks_json)
        translations = json.loads(translations_json)
        wipe_lines = json.loads(wipe_lines_json) if wipe_lines_json else []
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}")

    if len(blocks) != len(translations):
        raise HTTPException(
            status_code=400,
            detail=f"blocks ({len(blocks)}) and translations ({len(translations)}) length mismatch.",
        )

    tmpdir = Path(tempfile.mkdtemp())
    input_path = tmpdir / "input.pdf"
    output_path = tmpdir / "translated.pdf"
    safe_name = (file.filename or "document.pdf").rsplit(".", 1)[0] + f"_translated_{target_lang}.pdf"

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        logger.info("Render translated: %s (%d blocks, lang=%s)", file.filename, len(blocks), target_lang)

        render_translated_pdf(
            pdf_path=input_path,
            blocks=blocks,
            translations=translations,
            target_lang=target_lang,
            wipe_lines=wipe_lines or None,
            output_path=output_path,
            debug_ocr=debug_ocr in ("1", "true"),
        )

        if not output_path.exists() or output_path.stat().st_size < 32:
            raise HTTPException(status_code=500, detail="Render produced empty output.")

        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename=safe_name,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Render failed")
        raise HTTPException(status_code=500, detail=f"Render failed: {exc}") from exc


@app.post("/pdf-to-docx")
async def convert_pdf_to_docx_endpoint(
    file: UploadFile = File(...),
    mode: str = Form("auto"),
    dpi: int = Form(220),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted.")

    tmpdir = Path(tempfile.mkdtemp())
    input_path = tmpdir / "input.pdf"
    output_path = tmpdir / "output.docx"
    safe_name = (file.filename or "document.pdf").rsplit(".", 1)[0] + ".docx"

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        input_size = input_path.stat().st_size
        if input_size < 32:
            raise HTTPException(status_code=400, detail="PDF file is empty.")

        from pdf_to_docx import convert_pdf_to_docx

        logger.info("pdf-to-docx: %s (%s bytes) mode=%s dpi=%s", file.filename, input_size, mode, dpi)
        engine, mode_used, layout = convert_pdf_to_docx(input_path, output_path, mode=mode, dpi=dpi)

        if not output_path.exists() or output_path.stat().st_size < 4096:
            raise HTTPException(
                status_code=422,
                detail="DOCX output too small — conversion likely lost content.",
            )

        out_size = output_path.stat().st_size
        return FileResponse(
            output_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=safe_name,
            headers={
                "X-Engine": engine,
                "X-Docx-Mode": mode_used,
                "X-Input-Size": str(input_size),
                "X-Output-Size": str(out_size),
                "X-Layout-Images": str(layout.image_count),
                "X-Layout-Vectors": str(layout.vector_line_count),
                "X-Layout-Rotated": "1" if layout.has_rotated_text else "0",
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("PDF to DOCX failed")
        raise HTTPException(status_code=500, detail=f"PDF to DOCX failed: {exc}") from exc


# ---------------------------------------------------------------------------
# DOCX-based translation: extract texts → translate (frontend) → apply
# ---------------------------------------------------------------------------

_DOCX_TEMP_STORE: dict[str, Path] = {}


@app.post("/docx-extract-texts")
async def docx_extract_texts_endpoint(
    file: UploadFile = File(...),
    mode: str = Form("auto"),
):
    """Convert PDF to DOCX, return text entries for translation."""
    import uuid
    from pdf_to_docx import convert_pdf_to_docx, extract_docx_texts

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted.")

    docx_id = str(uuid.uuid4())
    tmpdir = Path(tempfile.mkdtemp(prefix=f"docx-tr-{docx_id[:8]}-"))
    input_path = tmpdir / "input.pdf"
    docx_path = tmpdir / "converted.docx"

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        convert_pdf_to_docx(input_path, docx_path, mode=mode)

        if not docx_path.exists():
            raise HTTPException(status_code=422, detail="DOCX conversion failed.")

        texts = extract_docx_texts(docx_path)
        _DOCX_TEMP_STORE[docx_id] = docx_path

        logger.info("docx-extract-texts: %s → %d text entries, docx_id=%s", file.filename, len(texts), docx_id)
        return JSONResponse({"docx_id": docx_id, "texts": texts})
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("docx-extract-texts failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/docx-apply-translations")
async def docx_apply_translations_endpoint(
    docx_id: str = Form(...),
    translations_json: str = Form(...),
    filename: str = Form("translated.docx"),
):
    """Apply translations to previously extracted DOCX, return translated file."""
    from pdf_to_docx import apply_docx_translations

    docx_path = _DOCX_TEMP_STORE.get(docx_id)
    if not docx_path or not docx_path.exists():
        raise HTTPException(status_code=404, detail="DOCX session expired. Please re-extract.")

    try:
        raw = json.loads(translations_json)
        trans_map: dict[int, str] = {int(t["id"]): t["translated"] for t in raw}
    except (json.JSONDecodeError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid translations JSON: {exc}") from exc

    output_path = docx_path.parent / "translated.docx"
    try:
        apply_docx_translations(docx_path, trans_map, output_path)
        del _DOCX_TEMP_STORE[docx_id]

        logger.info("docx-apply-translations: %s → %d translations applied", docx_id, len(trans_map))
        return FileResponse(
            output_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=filename,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("docx-apply-translations failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
