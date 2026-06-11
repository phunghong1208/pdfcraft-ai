"""OCR microservice — wraps OCRmyPDF behind a FastAPI endpoint."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import ocrmypdf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI(title="PDFCraft OCR Service")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pdfcraft.ocr")

LANG_ALLOWLIST = frozenset(
    [
        "eng",
        "chi_sim",
        "chi_tra",
        "jpn",
        "kor",
        "spa",
        "fra",
        "deu",
        "por",
        "ara",
        "vie",
        "ita",
        "ind",
        "ron",
    ]
)


def is_tagged_pdf(pdf_path: Path) -> bool:
    """PDF xuất từ Word/Office — thường đã có text layer đầy đủ."""
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


def page_count(pdf_path: Path) -> int:
    import pikepdf

    with pikepdf.open(pdf_path) as pdf:
        return len(pdf.pages)


def pdf_has_extractable_text(pdf_path: Path) -> tuple[bool, str]:
    """Dùng pdftotext — đáng tin hơn pikepdf với Tagged PDF."""
    text = extract_text_from_pdf(pdf_path)
    chars = len("".join(text.split()))
    pages = max(1, page_count(pdf_path))
    return chars >= max(40, pages * 15), text


def should_fast_extract(pdf_path: Path, force_ocr: bool) -> tuple[bool, str]:
    if force_ocr:
        return False, ""
    if is_tagged_pdf(pdf_path):
        return True, extract_text_from_pdf(pdf_path)
    return pdf_has_extractable_text(pdf_path)


def best_text_from_sources(
    input_path: Path,
    output_path: Path,
    sidecar_path: Path,
) -> str:
    """Chọn bản text dài nhất — tránh mất chữ khi Tesseract skip/timeout."""
    candidates: list[str] = []
    if sidecar_path.exists() and sidecar_path.stat().st_size > 0:
        candidates.append(
            sidecar_path.read_text(encoding="utf-8", errors="replace")
        )
    candidates.append(extract_text_from_pdf(output_path))
    candidates.append(extract_text_from_pdf(input_path))
    return max(candidates, key=lambda t: len("".join(t.split())))


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract text from a searchable PDF — try layout then raw for best coverage."""
    best = ""

    for args in (
        ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf_path), "-"],
        ["pdftotext", "-enc", "UTF-8", str(pdf_path), "-"],
    ):
        try:
            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode == 0 and len(result.stdout.strip()) > len(best.strip()):
                best = result.stdout
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

    if best.strip():
        return best

    import pikepdf

    text_parts = []
    with pikepdf.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            try:
                page_text = page.extract_text() or ""
                text_parts.append(f"--- Page {i} ---\n{page_text}")
            except Exception:
                text_parts.append(f"--- Page {i} ---\n[Could not extract text]")
    return "\n\n".join(text_parts)


def _ocr_jobs() -> int:
    """OCR song song theo trang — tận dụng CPU container (tối đa 8 worker)."""
    return max(1, min(os.cpu_count() or 2, 8))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/pdf-to-docx")
async def convert_pdf_to_docx(file: UploadFile = File(...)):
    """pdf2docx native Python — giữ layout tốt hơn WASM trên browser."""
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

        logger.info("pdf-to-docx server: %s (%s bytes)", file.filename, input_size)
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
    tesseract_oem: int = Form(1),
    # 3 = khối văn bản thường (Word, scan A4); 11 chỉ cho poster/ảnh rải rác
    tesseract_pagesegmode: int = Form(3),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted.")

    langs = [l.strip() for l in languages.split("+") if l.strip()]
    for lang in langs:
        if lang not in LANG_ALLOWLIST:
            raise HTTPException(status_code=400, detail=f"Unsupported language: {lang}")

    oversample = max(200, min(oversample, 600))
    tesseract_oem = max(0, min(tesseract_oem, 3))
    tesseract_pagesegmode = max(0, min(tesseract_pagesegmode, 13))

    tmpdir = Path(tempfile.mkdtemp())
    input_path = tmpdir / "input.pdf"
    output_path = tmpdir / "output.pdf"
    sidecar_path = tmpdir / "output.txt"
    safe_name = file.filename.rsplit(".", 1)[0] + "_ocr.pdf"

    def run_ocr(*, force: bool, redo: bool) -> None:
        jobs = _ocr_jobs()
        # jobs>1 = đa process; use_threads=True gây oversubscribe CPU → treo/chậm trên Docker
        ocrmypdf.ocr(
            input_path,
            output_path,
            language="+".join(langs),
            deskew=deskew,
            rotate_pages=rotate_pages,
            remove_background=remove_background,
            clean=clean,
            force_ocr=force,
            redo_ocr=redo,
            optimize=optimize,
            oversample=oversample,
            tesseract_oem=tesseract_oem,
            tesseract_pagesegmode=tesseract_pagesegmode,
            tesseract_timeout=0,
            skip_big=0,
            sidecar=sidecar_path if output_format == "text" else None,
            jobs=jobs,
            use_threads=jobs <= 1,
            progress_bar=False,
        )

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        fast_extract, cached_text = should_fast_extract(input_path, force_ocr)

        # PDF Word/Tagged hoặc đã có text layer → pdftotext ngay, không Tesseract
        if fast_extract:
            logger.info(
                "Fast text extract: %s (tagged=%s)",
                file.filename,
                is_tagged_pdf(input_path),
            )
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

        try:
            run_ocr(force=force_ocr, redo=redo_ocr)
        except ocrmypdf.exceptions.PriorOcrFoundError:
            if force_ocr:
                run_ocr(force=True, redo=False)
            else:
                run_ocr(force=False, redo=False)

        if output_format == "text":
            text = best_text_from_sources(input_path, output_path, sidecar_path)
            pdf_size = output_path.stat().st_size
            return JSONResponse({
                "text": text,
                "fileName": safe_name,
                "pdfSize": pdf_size,
                "method": "ocr",
            })

        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename=safe_name,
            headers={
                "X-OCR-Languages": "+".join(langs),
                "X-OCR-Method": "ocr",
            },
        )
    except ocrmypdf.exceptions.InputFileError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}")
