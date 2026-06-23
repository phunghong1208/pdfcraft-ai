"""Hình học PDF — thay fitz.Rect (top-left origin như pdfplumber)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PdfRect:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def height(self) -> float:
        return self.y1 - self.y0

    @property
    def is_empty(self) -> bool:
        return self.x1 <= self.x0 or self.y1 <= self.y0

    @property
    def is_valid(self) -> bool:
        return not self.is_empty

    @property
    def is_infinite(self) -> bool:
        return False

    def get_area(self) -> float:
        return max(0.0, self.width) * max(0.0, self.height)
