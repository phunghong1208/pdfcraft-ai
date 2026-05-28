'use client';

let uploadedPdf: File | null = null;

export function setUploadedPdf(file: File) {
  uploadedPdf = file;
}

export function consumeUploadedPdf(): File | null {
  const file = uploadedPdf;
  uploadedPdf = null;
  return file;
}

export function peekUploadedPdf(): File | null {
  return uploadedPdf;
}

export function clearUploadedPdf() {
  uploadedPdf = null;
}
