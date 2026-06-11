FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

# Bước 1: torch CPU-only (nhẹ, không CUDA)
RUN pip install --no-cache-dir \
    torch torchvision \
    --index-url https://download.pytorch.org/whl/cpu

# Bước 2: docling + fastapi (dùng torch đã cài, không kéo nvidia)
RUN pip install --no-cache-dir \
    "fastapi>=0.115,<1" \
    "uvicorn[standard]>=0.34,<1" \
    "python-multipart>=0.0.18,<1" \
    "docling>=2.15,<3" \
    "pymupdf>=1.24,<2"

COPY main.py fitz_layout.py .

EXPOSE 8101
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8101"]
