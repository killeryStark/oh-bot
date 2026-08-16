import { App, Component, MarkdownRenderer, TFile, TFolder } from 'obsidian';
import { jsPDF } from 'jspdf';
import { PdfGenerateOptions, PdfGenerateResult, PdfOrientation, PdfPageSize, PdfTheme } from './types';
import { getThemeCss } from './themes';

const PAGE_SIZES: Record<PdfPageSize, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612.0, height: 792.0 },
};

/**
 * Normalizes a vault file path by stripping leading slashes and ensuring a .pdf extension.
 */
export function normalizePdfPath(filePath: string): string {
  let normalized = filePath.trim().replace(/^[\/\\]+/, '');
  if (normalized.toLowerCase().endsWith('.pdf')) {
    return normalized;
  }
  if (/\.(md|markdown|html|htm|txt)$/i.test(normalized)) {
    return normalized.replace(/\.(md|markdown|html|htm|txt)$/i, '.pdf');
  }
  return `${normalized}.pdf`;
}

/**
 * Recursively creates parent folders in the Obsidian vault if they do not exist.
 */
export async function ensureParentFoldersExist(app: App, filePath: string): Promise<void> {
  const lastSlashIndex = filePath.lastIndexOf('/');
  if (lastSlashIndex === -1) {
    return;
  }

  const folderPath = filePath.substring(0, lastSlashIndex);
  const parts = folderPath.split('/').filter(Boolean);
  let currentPath = '';

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(currentPath);
    if (!existing) {
      try {
        await app.vault.createFolder(currentPath);
      } catch (err) {
        // If folder creation raced or exists, verify again
        const checkAgain = app.vault.getAbstractFileByPath(currentPath);
        if (!checkAgain) {
          throw err;
        }
      }
    }
  }
}

/**
 * Renders Markdown or HTML content into an HTML container element.
 */
async function renderContentToElement(
  app: App,
  content: string,
  targetEl: HTMLElement
): Promise<void> {
  const trimmed = content.trim();
  const isPureHtml =
    /^\s*<(!DOCTYPE|html|head|body|div|p|h[1-6]|article|section|table|main)[\s>]/i.test(trimmed) &&
    !content.includes('\n# ') &&
    !content.includes('\n## ') &&
    !content.includes('\n```');

  if (isPureHtml) {
    targetEl.innerHTML = content;
    return;
  }

  if (app && MarkdownRenderer && typeof MarkdownRenderer.render === 'function') {
    const comp = new Component();
    comp.load();
    try {
      await MarkdownRenderer.render(app, content, targetEl, '', comp);
    } catch (err) {
      console.warn('MarkdownRenderer failed, falling back to innerHTML:', err);
      targetEl.innerHTML = content;
    } finally {
      comp.unload();
    }
  } else {
    targetEl.innerHTML = content;
  }
}

/**
 * Generates a PDF from Markdown or HTML content, applying the selected theme,
 * and writes the binary output to the Obsidian Vault.
 */
export async function generatePdf(
  options: PdfGenerateOptions,
  app: App
): Promise<PdfGenerateResult> {
  const theme: PdfTheme = options.theme || 'anthropic-report';
  const pageSize: PdfPageSize = options.pageSize || 'a4';
  const orientation: PdfOrientation = options.orientation || 'portrait';
  const title = options.title;

  const dims = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;
  const pageWidth = orientation === 'landscape' ? dims.height : dims.width;
  const margin: [number, number, number, number] = [30, 30, 30, 30]; // top, right, bottom, left
  const contentWidth = pageWidth - (margin[1] + margin[3]);

  // Create offscreen container for DOM rendering
  const container = document.createElement('div');
  container.id = `pdf-render-container-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#000000';
  container.style.zIndex = '-9999';
  container.style.visibility = 'visible';

  try {
    // Inject Theme CSS
    const styleEl = document.createElement('style');
    styleEl.textContent = getThemeCss(theme);
    container.appendChild(styleEl);

    // Document wrapper
    const wrapperEl = document.createElement('div');
    wrapperEl.className = `pdf-document-wrapper pdf-theme-${theme}`;

    // Optional Header
    if (title && title.trim()) {
      const headerEl = document.createElement('div');
      headerEl.className = 'pdf-document-header';

      const titleEl = document.createElement('h1');
      titleEl.className = 'pdf-document-title';
      titleEl.textContent = title.trim();
      headerEl.appendChild(titleEl);

      const metaEl = document.createElement('div');
      metaEl.className = 'pdf-document-meta';
      const formattedDate = new Date().toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      metaEl.textContent = `Generated on ${formattedDate}`;
      headerEl.appendChild(metaEl);

      wrapperEl.appendChild(headerEl);
    }

    // Body content element
    const bodyEl = document.createElement('div');
    bodyEl.className = 'pdf-document-body';
    await renderContentToElement(app, options.content || '', bodyEl);
    wrapperEl.appendChild(bodyEl);

    container.appendChild(wrapperEl);
    document.body.appendChild(container);

    // Initialize jsPDF
    const doc = new jsPDF({
      orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
      unit: 'pt',
      format: pageSize === 'letter' ? 'letter' : 'a4',
    });

    // Render HTML container to PDF pages
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const fail = (err: any) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };

      try {
        const worker = doc.html(wrapperEl, {
          callback: () => finish(),
          x: margin[3],
          y: margin[0],
          width: contentWidth,
          windowWidth: 800,
          margin: margin,
          autoPaging: 'text',
          html2canvas: {
            useCORS: true,
            logging: false,
          },
        });

        if (worker && typeof (worker as any).then === 'function') {
          (worker as any).then(() => finish()).catch(fail);
        }
      } catch (err) {
        fail(err);
      }
    });

    const pagesCount = doc.getNumberOfPages();
    const arrayBuffer = doc.output('arraybuffer');
    const sizeBytes = arrayBuffer.byteLength;

    // Obsidian Vault Integration
    const normalizedPath = normalizePdfPath(options.filePath);
    await ensureParentFoldersExist(app, normalizedPath);

    const existing = app.vault.getAbstractFileByPath(normalizedPath);
    if (existing) {
      if (existing instanceof TFile || ('stat' in existing && !(existing as any).children)) {
        await app.vault.modifyBinary(existing as TFile, arrayBuffer);
      } else if (existing instanceof TFolder) {
        throw new Error(`A folder already exists at path: ${normalizedPath}`);
      } else {
        await app.vault.modifyBinary(existing as any, arrayBuffer);
      }
    } else {
      await app.vault.createBinary(normalizedPath, arrayBuffer);
    }

    return {
      filePath: normalizedPath,
      sizeBytes,
      pagesCount,
    };
  } finally {
    // Strict memory safety: ensure temporary DOM elements are cleaned up
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

/**
 * Class wrapper for PDF generation engine
 */
export class PdfGenerator {
  constructor(private app: App) {}

  async generate(options: PdfGenerateOptions): Promise<PdfGenerateResult> {
    return generatePdf(options, this.app);
  }
}
