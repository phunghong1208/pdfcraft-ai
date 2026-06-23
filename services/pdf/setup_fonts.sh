#!/bin/sh
# Sao chép font Noto hệ thống → /app/fonts cho reportlab (render dịch đầu ra).
set -e
mkdir -p /app/fonts

copy_first() {
  name="$1"
  dest="/app/fonts/$name"
  if [ -f "$dest" ]; then
    return 0
  fi
  src=$(find /usr/share/fonts -name "$name" 2>/dev/null | head -1)
  if [ -n "$src" ]; then
    cp "$src" "$dest"
  fi
}

# Latin / Cyrillic / Greek (fonts-noto-core)
copy_first NotoSans-Regular.ttf
copy_first NotoSans-Bold.ttf
copy_first NotoSans-Italic.ttf
copy_first NotoSans-BoldItalic.ttf

# Script-specific (fonts-noto-extra / ui)
copy_first NotoSansArabic-Regular.ttf
copy_first NotoSansArabic-Bold.ttf
copy_first NotoSansHebrew-Regular.ttf
copy_first NotoSansHebrew-Bold.ttf
copy_first NotoSansThai-Regular.ttf
copy_first NotoSansDevanagari-Regular.ttf
copy_first NotoSansBengali-Regular.ttf
copy_first NotoSansTamil-Regular.ttf
copy_first NotoSansTelugu-Regular.ttf
copy_first NotoSansMalayalam-Regular.ttf
copy_first NotoSansKannada-Regular.ttf
copy_first NotoSansGujarati-Regular.ttf
copy_first NotoSansGurmukhi-Regular.ttf

# CJK: fonts-noto-cjk (.ttc) cho DOCX / fc-cache — render PDF dùng CID ReportLab
copy_first NotoSansCJK-Regular.ttc

fc-cache -f -v >/dev/null 2>&1 || true
