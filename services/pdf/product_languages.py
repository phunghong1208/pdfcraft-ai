"""26 ngôn ngữ product — Tesseract pack (OCR đầu vào) vs font render (đầu ra dịch)."""

from __future__ import annotations

# OCR đầu vào: cài đúng 26 pack Debian (tesseract-ocr-<code với dấu gạch ngang>)
PRODUCT_TESSERACT_LANGS: frozenset[str] = frozenset({
    "eng", "spa", "fra", "deu", "ita", "por",
    "jpn", "rus", "kor", "chi_sim", "chi_tra",
    "ara", "bul", "cat", "nld", "ell", "hin", "ind", "msa",
    "pol", "swe", "tha", "tur", "ukr", "vie", "swa",
})

# RapidOCR — không dùng Tesseract pack
RAPID_OCR_LANGS: frozenset[str] = frozenset({
    "chi_sim", "chi_sim_vert", "chi_tra", "chi_tra_vert", "eng",
})

# Tối đa model OCR mỗi request (tránh eng+spa+fra+... cùng lúc)
MAX_OCR_LANGS_PER_REQUEST = 2

# App locale code → Tesseract code (OCR nguồn)
APP_TO_TESSERACT: dict[str, str] = {
    "en": "eng",
    "es": "spa",
    "fr": "fra",
    "de": "deu",
    "it": "ita",
    "pt": "por",
    "ja": "jpn",
    "ru": "rus",
    "ko": "kor",
    "zh": "chi_sim",
    "zh-TW": "chi_tra",
    "ar": "ara",
    "bg": "bul",
    "ca": "cat",
    "nl": "nld",
    "el": "ell",
    "hi": "hin",
    "id": "ind",
    "ms": "msa",
    "pl": "pol",
    "sv": "swe",
    "th": "tha",
    "tr": "tur",
    "uk": "ukr",
    "vi": "vie",
    "sw": "swa",
}
