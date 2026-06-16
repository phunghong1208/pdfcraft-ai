export type LayoutTextBlock = {
  id: string;
  pageNumber: number;
  text: string;
  /** PDF bottom-left origin — bottom edge of block */
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  fontSize: number;
  fontFamily: string;
  bold?: boolean;
  italic?: boolean;
  label?: string;
};
