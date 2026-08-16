export type PdfTheme = 'anthropic-report' | 'academic' | 'minimal' | 'raw';

export type PdfPageSize = 'a4' | 'letter';

export type PdfOrientation = 'portrait' | 'landscape';

export interface PdfGenerateOptions {
  filePath: string;
  content: string; // HTML or Markdown
  title?: string;
  theme?: PdfTheme;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
}

export interface PdfGenerateResult {
  filePath: string;
  sizeBytes: number;
  pagesCount: number;
}
