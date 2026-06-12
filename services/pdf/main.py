"""PDF microservice — OCR (RapidOCR), layout (fitz), render (PyMuPDF), pdf-to-docx."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import fitz
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from fitz_layout import extract_fitz_line_blocks, extract_fitz_wipe_lines
from render_translated import render_translated_pdf

app = FastAPI(title="PDFCraft PDF Service")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pdfcraft.pdf")

# All Tesseract language codes supported by tesseract-ocr-all
LANG_ALLOWLIST = frozenset([
    "afr","amh","ara","asm","aze","aze_cyrl","bel","ben","bod","bos","bre",
    "bul","cat","ceb","ces","chi_sim","chi_sim_vert","chi_tra","chi_tra_vert",
    "chr","cos","cym","dan","deu","div","dzo","ell","eng","enm","epo","est",
    "eus","fao","fas","fil","fin","fra","frk","frm","fry","gla","gle","glg",
    "grc","guj","hat","heb","hin","hrv","hun","hye","iku","ind","isl","ita",
    "ita_old","jav","jpn","jpn_vert","kan","kat","kat_old","kaz","khm","kir",
    "kmr","kor","kor_vert","lao","lat","lav","lit","ltz","mal","mar","mkd",
    "mlt","mon","mri","msa","mya","nep","nld","nor","oci","ori","osd","pan",
    "pol","por","pus","que","ron","rus","san","sin","slk","slv","snd","spa",
    "spa_old","sqi","srp","srp_latn","sun","swa","swe","syr","tam","tat","tel",
    "tgk","tha","tir","ton","tur","uig","ukr","urd","uzb","uzb_cyrl","vie",
    "yid","yor",
])

_rapid_ocr = None


def _get_rapid_ocr():
    global _rapid_ocr
    if _rapid_ocr is None:
        from rapidocr_onnxruntime import RapidOCR
        _rapid_ocr = RapidOCR()
    return _rapid_ocr


# ── helpers ───────────────────────────────────────────────────

def _is_tagged_pdf(pdf_path: Path) -> bool:
    import pikepdf
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
    doc = fitz.open(pdf_path)
    try:
        return len(doc)
    finally:
        doc.close()


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

    doc = fitz.open(pdf_path)
    try:
        parts = []
        for i, page in enumerate(doc, 1):
            parts.append(f"--- Page {i} ---\n{page.get_text()}")
        return "\n\n".join(parts)
    finally:
        doc.close()


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


# ── RapidOCR ──────────────────────────────────────────────────

def _ocr_page_rapid(page: fitz.Page) -> list[tuple[list, str, float]]:
    """OCR one page → list of (box, text, confidence)."""
    pix = page.get_pixmap(dpi=300)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
    if pix.n == 4:
        img = img[:, :, :3]

    ocr = _get_rapid_ocr()
    result, _ = ocr(img)

    if not result:
        return []
    return [(r[0], r[1], r[2]) for r in result if r[1] and r[1].strip()]


def _run_rapid_ocr(
    pdf_path: Path,
    output_path: Path,
    output_format: str,
) -> tuple[str, str]:
    """Run RapidOCR. Returns (text, method)."""
    doc = fitz.open(pdf_path)
    all_text: list[str] = []

    try:
        for page_idx, page in enumerate(doc):
            page_h = page.rect.height
            page_w = page.rect.width
            pix = page.get_pixmap(dpi=300)
            scale_x = page_w / pix.w
            scale_y = page_h / pix.h

            results = _ocr_page_rapid(page)
            page_lines: list[str] = []

            for box, txt, _conf in results:
                page_lines.append(txt)

                if output_format == "pdf":
                    x0 = min(p[0] for p in box) * scale_x
                    y0 = min(p[1] for p in box) * scale_y
                    x1 = max(p[0] for p in box) * scale_x
                    y1 = max(p[1] for p in box) * scale_y
                    rect = fitz.Rect(x0, y0, x1, y1)
                    fs = max(6, min(72, (y1 - y0) * 0.7))
                    page.insert_textbox(
                        rect, txt, fontsize=fs,
                        fontname="helv",
                        color=(1, 1, 1), render_mode=3,
                    )

            all_text.append(f"--- Page {page_idx + 1} ---\n" + "\n".join(page_lines))

        if output_format == "pdf":
            doc.save(str(output_path), garbage=4, deflate=True)
    finally:
        doc.close()

    return "\n\n".join(all_text), "ocr"


# RapidOCR handles Chinese + English well and is much faster than Tesseract
_RAPID_OCR_LANGS = frozenset(["chi_sim", "chi_sim_vert", "chi_tra", "chi_tra_vert", "eng"])


def _run_tesseract_ocr(
    pdf_path: Path,
    output_path: Path,
    langs: list[str],
    output_format: str,
) -> tuple[str, str]:
    """Run ocrmypdf (Tesseract) for multilingual support. Returns (text, method)."""
    import ocrmypdf
    import os

    tess_lang = "+".join(langs) if langs else "eng"
    jobs = min(4, os.cpu_count() or 2)

    ocrmypdf.ocr(
        str(pdf_path),
        str(output_path),
        language=tess_lang,
        deskew=False,       # skip deskew — slow, rarely needed
        skip_text=True,     # skip pages already having text layer
        output_type="pdf",
        progress_bar=False,
        jobs=jobs,          # parallel pages
        optimize=0,         # skip PDF optimization — saves time
    )

    if output_format == "text":
        # Extract text from ocr'd pdf
        doc = fitz.open(str(output_path) if output_path.exists() else str(pdf_path))
        pages = []
        try:
            for i, page in enumerate(doc):
                pages.append(f"--- Page {i + 1} ---\n{page.get_text()}")
        finally:
            doc.close()
        return "\n\n".join(pages), "tesseract"

    return "", "tesseract"


def _run_ocr(
    pdf_path: Path,
    output_path: Path,
    langs: list[str],
    output_format: str,
) -> tuple[str, str]:
    """Route to RapidOCR (Chinese/EN) or Tesseract (everything else)."""
    if set(langs) <= _RAPID_OCR_LANGS:
        return _run_rapid_ocr(pdf_path, output_path, output_format)
    return _run_tesseract_ocr(pdf_path, output_path, langs, output_format)


# ── endpoints ─────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "ocr": "rapidocr", "layout": "fitz", "render": "pymupdf"}


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

        logger.info("Layout extract (fitz): %s (lang=%s)", file.filename, lang)

        blocks = extract_fitz_line_blocks(input_path)
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

        wipe_lines = extract_fitz_wipe_lines(input_path)

        return JSONResponse({
            "blocks": blocks,
            "engine": "fitz",
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
    oversample: int = Form(300),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted.")

    langs = [l.strip() for l in languages.split("+") if l.strip()]
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

        text, method = _run_ocr(input_path, output_path, langs, output_format)

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
async def convert_pdf_to_docx(file: UploadFile = File(...)):
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

        logger.info("pdf-to-docx: %s (%s bytes)", file.filename, input_size)
        engine = convert_pdf_to_docx(input_path, output_path)

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
                "X-Input-Size": str(input_size),
                "X-Output-Size": str(out_size),
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("PDF to DOCX failed")
        raise HTTPException(status_code=500, detail=f"PDF to DOCX failed: {exc}") from exc
