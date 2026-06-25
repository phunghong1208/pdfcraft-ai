# ── builder ────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt


# ── CJK fonts (optional — DOCX; render dùng ReportLab CID) ─────
# Bỏ curl OTF: ReportLab không hỗ trợ PostScript outlines.
FROM python:3.12-slim-bookworm AS fonts-cjk
RUN mkdir -p /fonts


# ── runtime ────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OCR_RASTER_DPI=200 \
    TMPDIR=/work/tmp \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    qpdf \
    libgomp1 \
    fontconfig \
    fonts-noto-core \
    fonts-noto-cjk \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-spa \
    tesseract-ocr-fra \
    tesseract-ocr-deu \
    tesseract-ocr-ita \
    tesseract-ocr-por \
    tesseract-ocr-jpn \
    tesseract-ocr-rus \
    tesseract-ocr-kor \
    tesseract-ocr-chi-sim \
    tesseract-ocr-chi-tra \
    tesseract-ocr-ara \
    tesseract-ocr-bul \
    tesseract-ocr-cat \
    tesseract-ocr-nld \
    tesseract-ocr-ell \
    tesseract-ocr-hin \
    tesseract-ocr-ind \
    tesseract-ocr-msa \
    tesseract-ocr-pol \
    tesseract-ocr-swe \
    tesseract-ocr-tha \
    tesseract-ocr-tur \
    tesseract-ocr-ukr \
    tesseract-ocr-vie \
    tesseract-ocr-swa \
    && rm -rf /var/lib/apt/lists/* /tmp/*

COPY --from=builder /install /usr/local
COPY --from=fonts-cjk /fonts /app/fonts

COPY setup_fonts.sh /tmp/setup_fonts.sh
RUN chmod +x /tmp/setup_fonts.sh \
    && /tmp/setup_fonts.sh \
    && rm -f /tmp/setup_fonts.sh \
    && fc-cache -f

RUN groupadd --system app \
    && useradd --system --gid app --create-home app \
    && mkdir -p /work/tmp \
    && chown -R app:app /app /work

WORKDIR /app

COPY --chown=app:app \
    main.py \
    product_languages.py \
    pdf_layout.py \
    pdf_geom.py \
    pdf_page_adapter.py \
    pdf_overlay.py \
    pdf_to_docx.py \
    render_translated.py \
    ./

USER app

EXPOSE 8100

CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8100", \
     "--workers", "1"]