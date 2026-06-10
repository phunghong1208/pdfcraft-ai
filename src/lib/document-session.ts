'use client';

type WritableHandle = {
  name: string;
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
  getFile?: () => Promise<File>;
};

let uploadedPdf: File | null = null;
let uploadedPdfHandle: WritableHandle | null = null;

export function setUploadedPdf(file: File, handle?: WritableHandle | null) {
  uploadedPdf = file;
  uploadedPdfHandle = handle ?? null;
}

export function consumeUploadedPdf(): File | null {
  const file = uploadedPdf;
  uploadedPdf = null;
  uploadedPdfHandle = null;
  return file;
}

export function peekUploadedPdf(): File | null {
  return uploadedPdf;
}

export function peekUploadedPdfHandle(): WritableHandle | null {
  return uploadedPdfHandle;
}

export function clearUploadedPdf() {
  uploadedPdf = null;
  uploadedPdfHandle = null;
}
