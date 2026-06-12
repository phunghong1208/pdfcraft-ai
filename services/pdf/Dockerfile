FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    ghostscript \
    unpaper \
    pngquant \
    poppler-utils \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata
ENV TESSDATA_URL=https://github.com/tesseract-ocr/tessdata_best/raw/main

RUN mkdir -p "$TESSDATA_PREFIX" && \
    for lang in eng vie chi_sim chi_tra jpn kor spa fra deu por ara ita ind ron; do \
      curl -fsSL -o "$TESSDATA_PREFIX/${lang}.traineddata" \
        "$TESSDATA_URL/${lang}.traineddata"; \
    done

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py fitz_layout.py pdf_to_docx.py ./

EXPOSE 8100
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
