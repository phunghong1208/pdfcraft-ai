/**
 * PDF to DOCX Worker (via Pyodide + pdf2docx)
 */

import { loadPyodide } from '/pymupdf-wasm/pyodide.js';

let pyodide = null;
let initPromise = null;

async function init() {
  if (pyodide) return pyodide;

  self.postMessage({ type: 'status', message: 'Loading Python environment...' });

  // Initialize Pyodide
  pyodide = await loadPyodide({
    indexURL: '/pymupdf-wasm/',
    fullStdLib: false
  });

  self.postMessage({ type: 'status', message: 'Installing dependencies...' });

  const basePath = '/pymupdf-wasm/';

  // Mock missing non-critical dependencies
  pyodide.runPython(`
    import sys
    from types import ModuleType
    
    # Mock tqdm (used for progress bars)
    tqdm_mod = ModuleType("tqdm")
    def tqdm(iterable=None, *args, **kwargs):
        return iterable if iterable else []
    tqdm_mod.tqdm = tqdm
    sys.modules["tqdm"] = tqdm_mod
    
    # Mock fire (CLI tool, not needed for library usage)
    fire_mod = ModuleType("fire")
    sys.modules["fire"] = fire_mod
  `);

  // Group 1: Load independent packages in parallel (no inter-dependencies)
  self.postMessage({ type: 'status', message: 'Loading core packages...' });
  await Promise.all([
    pyodide.loadPackage(basePath + 'numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl'),
    pyodide.loadPackage(basePath + 'typing_extensions-4.12.2-py3-none-any.whl'),
    pyodide.loadPackage(basePath + 'packaging-24.1-py3-none-any.whl').catch(e =>
      console.warn("Failed to load packaging, fonttools might fail:", e)
    ),
    pyodide.loadPackage(basePath + 'lxml-5.4.0-cp313-cp313-pyodide_2025_0_wasm32.whl'),
    pyodide.loadPackage(basePath + 'pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl'),
  ]);

  // Group 2: Load packages that depend on Group 1, in parallel
  self.postMessage({ type: 'status', message: 'Loading converters...' });
  await Promise.all([
    pyodide.loadPackage(basePath + 'fonttools-4.56.0-py3-none-any.whl'),
    pyodide.loadPackage(basePath + 'python_docx-1.2.0-py3-none-any.whl'),
    pyodide.loadPackage(basePath + 'opencv_python-4.11.0.86-cp313-cp313-pyodide_2025_0_wasm32.whl'),
  ]);

  // Group 3: pdf2docx depends on all above
  self.postMessage({ type: 'status', message: 'Installing pdf2docx...' });
  await pyodide.loadPackage(basePath + 'pdf2docx-0.5.8-py3-none-any.whl');

  self.postMessage({ type: 'status', message: 'Initializing converter...' });

  // Define Python helper functions
  pyodide.runPython(`
import os
import fitz  # PyMuPDF

# Monkey-patch Pixmap.tobytes to handle unsupported colorspaces (e.g. CMYK)
_original_tobytes = fitz.Pixmap.tobytes

def _patched_tobytes(self, output="png", *args, **kwargs):
    try:
        return _original_tobytes(self, output, *args, **kwargs)
    except ValueError as e:
        if "unsupported colorspace" in str(e):
            rgb_pix = fitz.Pixmap(fitz.csRGB, self)
            result = _original_tobytes(rgb_pix, output, *args, **kwargs)
            rgb_pix = None
            return result
        raise

fitz.Pixmap.tobytes = _patched_tobytes

from pdf2docx import Converter
from docx import Document
from docx.shared import Pt
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

def pdf_write_input(input_obj):
    """Write PDF bytes to virtual filesystem."""
    if hasattr(input_obj, "to_py"):
        input_bytes = input_obj.to_py()
    else:
        input_bytes = input_obj
    with open("input.pdf", "wb") as f:
        f.write(input_bytes)

def _set_cell_border(cell):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    for existing in tcPr.findall(qn('w:tcBorders')):
        tcPr.remove(existing)
    tcBorders = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'single')
        el.set(qn('w:sz'), '4')
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), '000000')
        tcBorders.append(el)
    tcPr.append(tcBorders)

def _rect_overlap(r1, r2):
    ox = max(0, min(r1[2], r2[2]) - max(r1[0], r2[0]))
    oy = max(0, min(r1[3], r2[3]) - max(r1[1], r2[1]))
    area1 = max(1, (r1[2]-r1[0]) * (r1[3]-r1[1]))
    return (ox * oy) / area1 > 0.5

def _has_lattice_tables(pdf_path):
    """Check if PDF has tables with visible borders."""
    doc = fitz.open(pdf_path)
    for page in doc:
        if len(page.find_tables(strategy="lines_strict").tables) > 0:
            doc.close()
            return True
    doc.close()
    return False

def _convert_pymupdf(pdf_path, docx_path):
    """Pure PyMuPDF converter — accurate for lattice-table PDFs."""
    doc_pdf = fitz.open(pdf_path)
    doc_word = Document()
    for p in doc_word.paragraphs:
        p._element.getparent().remove(p._element)

    for page_num in range(len(doc_pdf)):
        page = doc_pdf[page_num]
        if page_num > 0:
            doc_word.add_page_break()

        finder = page.find_tables(strategy="lines_strict")
        tables = finder.tables
        table_bboxes = [t.bbox for t in tables]

        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
        text_elements = []
        for blk in blocks:
            if blk["type"] != 0:
                continue
            in_table = any(_rect_overlap(blk["bbox"], tb) for tb in table_bboxes)
            if not in_table:
                lines_text = []
                for line in blk["lines"]:
                    spans = line.get("spans", [])
                    line_text = "".join(s["text"] for s in spans).strip()
                    if line_text:
                        lines_text.append((line_text, spans))
                if lines_text:
                    text_elements.append({"type": "text", "y": blk["bbox"][1], "lines": lines_text})

        table_elements = [{"type": "table", "y": t.bbox[1], "table": t} for t in tables]
        all_elements = sorted(text_elements + table_elements, key=lambda e: e["y"])

        for elem in all_elements:
            if elem["type"] == "text":
                for line_text, spans in elem["lines"]:
                    p = doc_word.add_paragraph()
                    run = p.add_run(line_text)
                    if spans:
                        run.bold = bool(spans[0].get("flags", 0) & 2**4)
                        run.font.size = Pt(round(spans[0].get("size", 11)))
            elif elem["type"] == "table":
                t = elem["table"]
                extracted = t.extract()
                if not extracted:
                    continue
                rows = len(extracted)
                cols = max(len(r) for r in extracted)
                if not rows or not cols:
                    continue
                tbl = doc_word.add_table(rows=rows, cols=cols)
                tbl.style = "Table Grid"
                for r_idx, row_data in enumerate(extracted):
                    for c_idx in range(cols):
                        cell_text = (row_data[c_idx] if c_idx < len(row_data) else "") or ""
                        cell = tbl.cell(r_idx, c_idx)
                        cell.text = cell_text.strip()
                        _set_cell_border(cell)

    doc_word.save(docx_path)
    page_count = len(doc_pdf)
    doc_pdf.close()
    return page_count

def pdf_convert():
    """
    Smart convert:
    - PDF with lattice tables (visible borders) → PyMuPDF (accurate table extraction)
    - PDF without tables / complex layout → pdf2docx (preserves fonts, images, spacing)
    """
    if _has_lattice_tables("input.pdf"):
        try:
            return _convert_pymupdf("input.pdf", "output.docx")
        except Exception:
            pass  # fall through to pdf2docx

    # pdf2docx fallback for layout-heavy PDFs
    cv = Converter("input.pdf")
    page_count = len(cv.fitz_doc)
    cv.convert("output.docx", start=0, end=None,
        clip_image_res_ratio=1.0,
        min_svg_gap_dx=5.0,
        min_svg_gap_dy=5.0,
        min_svg_w=2.0,
        min_svg_h=2.0,
        parse_stream_table=False,
    )
    cv.close()
    return page_count

def pdf_read_result():
    """Read the DOCX result and clean up."""
    with open("output.docx", "rb") as f:
        docx_bytes = f.read()
    if os.path.exists("input.pdf"):
        os.remove("input.pdf")
    if os.path.exists("output.docx"):
        os.remove("output.docx")
    return docx_bytes
  `);

  return pyodide;
}

self.onmessage = async (event) => {
  const { type, id, data } = event.data;

  try {
    if (type === 'init') {
      if (!initPromise) initPromise = init();
      await initPromise;
      self.postMessage({ id, type: 'init-complete' });
      return;
    }

    if (type === 'convert') {
      if (!pyodide) {
        if (!initPromise) initPromise = init();
        await initPromise;
      }

      const { file } = data;
      const arrayBuffer = await file.arrayBuffer();
      const inputBytes = new Uint8Array(arrayBuffer);

      // Step 1: Write PDF to virtual filesystem
      self.postMessage({ type: 'progress', message: 'Preparing PDF...', percent: 5 });
      const writeInput = pyodide.globals.get('pdf_write_input');
      writeInput(inputBytes);

      self.postMessage({
        type: 'progress',
        message: 'Converting to DOCX...',
        percent: 10
      });

      // Step 2: Convert PDF to DOCX (returns page count)
      // Using runPythonAsync so the progress message above is flushed to main thread
      const totalPages = await pyodide.runPythonAsync('pdf_convert()');

      self.postMessage({
        type: 'progress',
        message: `Converted ${totalPages} pages successfully`,
        percent: 85
      });

      self.postMessage({
        type: 'progress',
        message: 'Reading result...',
        percent: 90
      });

      // Step 3: Read result
      const readResult = pyodide.globals.get('pdf_read_result');
      const resultProxy = readResult();
      const resultBytes = resultProxy.toJs();
      resultProxy.destroy();

      const resultBlob = new Blob([resultBytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      self.postMessage({
        id,
        type: 'convert-complete',
        result: resultBlob
      });
    }

  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({
      id,
      type: 'error',
      error: error.message || String(error)
    });
  }
};
