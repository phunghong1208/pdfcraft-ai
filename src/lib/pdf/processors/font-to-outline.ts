/**
 * Font to Outline Processor
 * 
 * Removes font dependencies from PDF documents by rendering pages as high-quality images.
 * This ensures documents display identically on any system, regardless of font availability.
 * 
 * The process converts each page to a rasterized image at the specified DPI, removing all
 * embedded fonts while preserving the exact visual appearance. Optionally adds an invisible
 * text layer to maintain searchability.
 */

import type {
    ProcessInput,
    ProcessOutput,
    ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';

/**
 * Font to Outline options
 */
export interface FontToOutlineOptions {
    /** DPI for page rendering (default: 300). Higher values produce better quality but larger files.
     * 150 DPI: Good for screen viewing, smaller files
     * 300 DPI: Print quality (recommended)
     * 600 DPI: Highest quality, large files */
    dpi: number;
    /** Whether to add invisible text layer for searchability (default: false).
     * If true, adds an invisible text overlay to maintain search and copy functionality. */
    preserveSelectableText: boolean;
    /** Specific pages to process (e.g., "1-3,5,7-9"). Empty or undefined processes all pages. */
    pageRange?: string;
}

/**
 * Default font to outline options
 */
const DEFAULT_FONT_OUTLINE_OPTIONS: FontToOutlineOptions = {
    dpi: 300,
    preserveSelectableText: false,
    pageRange: '',
};

/**
 * Font to Outline Processor
 * Converts fonts to vector paths for better compatibility.
 */
export class FontToOutlineProcessor extends BasePDFProcessor {
    /**
     * Process PDF file and convert fonts to outlines
     */
    async process(
        input: ProcessInput,
        onProgress?: ProgressCallback
    ): Promise<ProcessOutput> {
        this.reset();
        this.onProgress = onProgress;

        const { files, options } = input;
        const outlineOptions: FontToOutlineOptions = {
            ...DEFAULT_FONT_OUTLINE_OPTIONS,
            ...(options as Partial<FontToOutlineOptions>),
        };

        // Validate single file
        if (files.length !== 1) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'Please provide exactly one PDF file.',
                `Received ${files.length} file(s).`
            );
        }

        const file = files[0];

        return this.createErrorOutput(
            PDFErrorCode.PROCESSING_FAILED,
            'Font to Outline tool is unavailable.',
            'Pyodide-based outline engine has been removed from this project.'
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
 * Generate output filename
 */
function generateOutlineFilename(originalName: string): string {
    const lastDot = originalName.lastIndexOf('.');
    const baseName = lastDot === -1 ? originalName : originalName.slice(0, lastDot);
    return `${baseName}_outlined.pdf`;
}

/**
 * Create a new instance of the font to outline processor
 */
export function createFontToOutlineProcessor(): FontToOutlineProcessor {
    return new FontToOutlineProcessor();
}

/**
 * Convert fonts to outlines (convenience function)
 */
export async function fontToOutline(
    file: File,
    options?: Partial<FontToOutlineOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createFontToOutlineProcessor();
    return processor.process(
        {
            files: [file],
            options: options || {},
        },
        onProgress
    );
}
