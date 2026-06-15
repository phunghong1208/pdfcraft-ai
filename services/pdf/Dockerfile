# ── builder stage ──────────────────────────────────────────────
FROM python:3.12-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── font stage ────────────────────────────────────────────────
FROM python:3.12-slim AS fonts
# Bump this value to force re-download all fonts
ARG FONT_VERSION=3
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /fonts && \
    curl -fsSL -o /fonts/NotoSans-Regular.ttf \
      "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf" && \
    curl -fsSL -o /fonts/NotoSansCJKsc-Regular.otf \
      "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf" && \
    curl -fsSL -o /fonts/NotoSansCJKtc-Regular.otf \
      "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf" && \
    curl -fsSL -o /fonts/NotoSansCJKjp-Regular.otf \
      "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf" && \
    curl -fsSL -o /fonts/NotoSansCJKkr-Regular.otf \
      "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf" && \
    curl -fsSL -o /fonts/NotoSansArabic-Regular.ttf \
      "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansArabic/hinted/ttf/NotoSansArabic-Regular.ttf" && \
    curl -fsSL -o /fonts/NotoSansThai-Regular.ttf \
      "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansThai/hinted/ttf/NotoSansThai-Regular.ttf" && \
    curl -fsSL -o /fonts/NotoSansDevanagari-Regular.ttf \
      "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansDevanagari/hinted/ttf/NotoSansDevanagari-Regular.ttf" && \
    curl -fsSL -o /fonts/NotoSansBengali-Regular.ttf \
      "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansBengali/hinted/ttf/NotoSansBengali-Regular.ttf" && \
    curl -fsSL -o /fonts/NotoSansTamil-Regular.ttf \
      "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansTamil/hinted/ttf/NotoSansTamil-Regular.ttf" && \
    curl -fsSL -o /fonts/NotoSansTelugu-Regular.ttf \
      "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansTelugu/hinted/ttf/NotoSansTelugu-Regular.ttf" && \
    curl -fsSL -o /fonts/NotoSansMalayalam-Regular.ttf \
      "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansMalayalam/hinted/ttf/NotoSansMalayalam-Regular.ttf" && \
    curl -fsSL -o /fonts/NotoSansKannada-Regular.ttf \
      "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansKannada/hinted/ttf/NotoSansKannada-Regular.ttf" && \
    curl -fsSL -o /fonts/NotoSansGujarati-Regular.ttf \
      "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansGujarati/hinted/ttf/NotoSansGujarati-Regular.ttf" && \
    curl -fsSL -o /fonts/NotoSansGurmukhi-Regular.ttf \
      "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansGurmukhi/hinted/ttf/NotoSansGurmukhi-Regular.ttf" && \
    curl -fsSL -o /fonts/NotoSansHebrew-Regular.ttf \
      "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansHebrew/hinted/ttf/NotoSansHebrew-Regular.ttf"

# ── runtime stage ─────────────────────────────────────────────
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    ghostscript \
    tesseract-ocr \
    tesseract-ocr-all \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local
COPY --from=fonts /fonts /app/fonts

WORKDIR /app
COPY main.py fitz_layout.py pdf_to_docx.py render_translated.py ./

EXPOSE 8100
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
