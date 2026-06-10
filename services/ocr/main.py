"""OCR microservice — wraps OCRmyPDF behind a FastAPI endpoint."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import ocrmypdf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI(title="PDFCraft OCR Service")

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


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract text from a searchable PDF using pdftotext (poppler)."""
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode == 0:
            return result.stdout
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Fallback: use pikepdf to extract text
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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_pdf(
    file: UploadFile = File(...),
    languages: str = Form("vie+eng"),
    deskew: bool = Form(True),
    rotate_pages: bool = Form(True),
    remove_background: bool = Form(False),
    clean: bool = Form(True),
    force_ocr: bool = Form(False),
    optimize: int = Form(1),
    output_format: str = Form("pdf"),
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

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        use_redo = not force_ocr
        ocrmypdf.ocr(
            input_path,
            output_path,
            language="+".join(langs),
            deskew=False if use_redo else deskew,
            rotate_pages=rotate_pages,
            remove_background=False if use_redo else remove_background,
            clean=False if use_redo else clean,
            force_ocr=force_ocr,
            redo_ocr=use_redo,
            optimize=optimize,
            progress_bar=False,
        )

        if output_format == "text":
            text = extract_text_from_pdf(output_path)
            pdf_size = output_path.stat().st_size
            safe_name = file.filename.rsplit(".", 1)[0] + "_ocr.pdf"
            return JSONResponse({
                "text": text,
                "fileName": safe_name,
                "pdfSize": pdf_size,
            })

        safe_name = file.filename.rsplit(".", 1)[0] + "_ocr.pdf"
        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename=safe_name,
            headers={"X-OCR-Languages": "+".join(langs)},
        )
    except ocrmypdf.exceptions.PriorOcrFoundError:
        if output_format == "text":
            text = extract_text_from_pdf(input_path)
            return JSONResponse({"text": text, "fileName": file.filename, "pdfSize": 0})
        safe_name = file.filename.rsplit(".", 1)[0] + "_ocr.pdf"
        return FileResponse(
            input_path,
            media_type="application/pdf",
            filename=safe_name,
            headers={"X-OCR-Skipped": "prior-ocr-found"},
        )
    except ocrmypdf.exceptions.InputFileError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}")
