/**
 * Deskew PDF Processor
 * 
 * Automatically straightens scanned or tilted PDF pages.
 * Detects rotation angles and corrects them to vertical.
 */

import type {
    ProcessInput,
    ProcessOutput,
    ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';

/**
 * Deskew options interface
 */
export interface DeskewPDFOptions {
    /** Threshold for detecting skew (1-30, default 10) - higher values detect more subtle skew angles */
    threshold: number;
    /** DPI for analysis (72-300, default 150) - higher values are more accurate but slower */
    dpi: number;
}

/**
 * Deskew result for a single page
 */
export interface PageDeskewResult {
    pageNumber: number;
    angle: number;
    corrected: boolean;
}

/**
 * Overall deskew result
 */
export interface DeskewResult {
    totalPages: number;
    correctedPages: number;
    angles: number[];
    corrected: boolean[];
    pageResults: PageDeskewResult[];
}

/**
 * Default deskew options
 */
const DEFAULT_DESKEW_OPTIONS: DeskewPDFOptions = {
    threshold: 10,
    dpi: 150,
};

/**
 * Deskew PDF Processor
 * Straightens scanned/tilted PDF pages.
 */
export class DeskewPDFProcessor extends BasePDFProcessor {
    /**
     * Process PDF file and deskew pages
     */
    async process(
        input: ProcessInput,
        onProgress?: ProgressCallback
    ): Promise<ProcessOutput> {
        this.reset();
        this.onProgress = onProgress;

        const { files, options } = input;
        const deskewOptions: DeskewPDFOptions = {
            ...DEFAULT_DESKEW_OPTIONS,
            ...(options as Partial<DeskewPDFOptions>),
        };

        // Validate single file
        if (files.length !== 1) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'Please provide exactly one PDF file to deskew.',
                `Received ${files.length} file(s).`
            );
        }

        const file = files[0];

        return this.createErrorOutput(
            PDFErrorCode.PROCESSING_FAILED,
            'Deskew tool is unavailable.',
            'Pyodide-based deskew engine has been removed from this project.'
        );
    }

    /**
     * Get accepted file types
     */
    protected getAcceptedTypes(): string[] {
        return ['application/pdf'];
    }
}

/**
 * Generate a filename for the deskewed PDF
 */
function generateDeskewedFilename(originalName: string): string {
    const lastDot = originalName.lastIndexOf('.');
    const baseName = lastDot === -1 ? originalName : originalName.slice(0, lastDot);
    return `${baseName}_deskewed.pdf`;
}

/**
 * Create a new instance of the deskew processor
 */
export function createDeskewProcessor(): DeskewPDFProcessor {
    return new DeskewPDFProcessor();
}

/**
 * Deskew a PDF file (convenience function)
 */
export async function deskewPDF(
    file: File,
    options?: Partial<DeskewPDFOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createDeskewProcessor();
    return processor.process(
        {
            files: [file],
            options: options || {},
        },
        onProgress
    );
}
