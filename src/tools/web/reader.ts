import { requestUrl } from 'obsidian';
import { WebPageContentResult } from './types';

export type { WebPageContentResult };

/**
 * Common selectors for noisy or non-content elements to strip from the DOM.
 */
const NOISY_SELECTORS = [
  'script',
  'style',
  'noscript',
  'nav',
  'footer:not(article footer)',
  'header:not(article header):not(main header)',
  'aside',
  'svg',
  'canvas',
  'form',
  'button',
  'iframe',
  'select',
  'option',
  'dialog',
  'template',
  'object',
  'embed',
  'audio',
  'video',
  'source',
  'track',
  'map',
  'area',
  'input',
  'textarea',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="contentinfo"]',
  '[aria-modal="true"]',
  '[aria-hidden="true"]',
  '[hidden]',
  '.cookie-banner',
  '.cookie-notice',
  '.cookie-consent',
  '#cookie-consent',
  '.consent-banner',
  '.ad-container',
  '.advertisement',
  '.ad-banner',
  '.adsbygoogle',
  '.banner-ad',
  '.sidebar',
  '.popup',
  '.modal',
];

/**
 * Signatures that indicate anti-bot or captcha blockades.
 */
const CLOUDFLARE_CAPTCHA_SIGNATURES = [
  'cf-browser-verification',
  'cf-challenge',
  'challenge-platform',
  'challenges.cloudflare.com',
  'just a moment...',
  'attention required! | cloudflare',
  'please turn javascript on',
  'enable javascript and cookies to continue',
  'checking your browser before accessing',
  'verify you are human',
  'access denied |',
  'security check to access',
  'ray id:',
];

interface ConversionContext {
  insidePre?: boolean;
  insideTable?: boolean;
  listDepth?: number;
}

/**
 * Resolves a potentially relative URL against the page's base URL.
 */
export function resolveUrl(rawUrl: string, baseUrl: string): string {
  if (!rawUrl || !rawUrl.trim()) return '';
  const trimmed = rawUrl.trim();

  // Keep mailto and tel schemes as is
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
    return trimmed;
  }

  // Omit javascript and dummy anchors
  if (trimmed.startsWith('javascript:') || trimmed === '#') {
    return '';
  }

  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return trimmed;
  }
}

/**
 * Helper to wrap text with markdown inline markers while preserving surrounding whitespace.
 */
function wrapInline(content: string, prefix: string, suffix: string = prefix): string {
  if (!content || !content.trim()) return content;
  const leadingSpace = content.match(/^\s*/)?.[0] || '';
  const trailingSpace = content.match(/\s*$/)?.[0] || '';
  const trimmed = content.trim();
  return `${leadingSpace}${prefix}${trimmed}${suffix}${trailingSpace}`;
}

export class WebContentReader {
  /**
   * Fetches the web page at the specified URL and returns its cleaned Markdown content.
   */
  static async read(url: string, maxLength = 8000): Promise<WebPageContentResult> {
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('Invalid URL: URL cannot be empty.');
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      throw new Error(`Invalid URL "${url}". URL must start with http:// or https://`);
    }

    try {
      new URL(trimmedUrl);
    } catch {
      throw new Error(`Invalid URL format: "${url}"`);
    }

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    let html = '';
    try {
      const res = await requestUrl({
        url: trimmedUrl,
        method: 'GET',
        headers,
      });

      // Check status code for anti-bot blocks
      if (res.status === 403 || res.status === 503) {
        throw new Error(`HTTP ${res.status}`);
      }

      html = res.text || '';
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      const status = err?.status;

      if (
        status === 403 ||
        status === 503 ||
        errorMessage.includes('403') ||
        errorMessage.includes('503') ||
        errorMessage.toLowerCase().includes('cloudflare') ||
        errorMessage.toLowerCase().includes('captcha')
      ) {
        throw new Error(
          `Access to "${trimmedUrl}" was blocked by anti-bot protection (Cloudflare/Captcha, HTTP ${status || 403}). Please visit the page directly in a browser.`
        );
      }

      if (status === 404 || errorMessage.includes('404')) {
        throw new Error(`Failed to fetch "${trimmedUrl}": Page not found (HTTP 404).`);
      }

      throw new Error(`Failed to fetch "${trimmedUrl}": ${errorMessage}`);
    }

    // Check if returned HTML body is a Cloudflare / Captcha challenge page
    const lowerHtml = html.toLowerCase();
    const isBotChallenge = CLOUDFLARE_CAPTCHA_SIGNATURES.some((sig) => lowerHtml.includes(sig));
    if (isBotChallenge && lowerHtml.length < 50000) {
      // Confirm presence of challenge indicators in title or body
      const parser = new DOMParser();
      const testDoc = parser.parseFromString(html, 'text/html');
      const testTitle = (testDoc.querySelector('title')?.textContent || '').toLowerCase();

      if (
        testTitle.includes('just a moment') ||
        testTitle.includes('attention required') ||
        testTitle.includes('access denied') ||
        testDoc.querySelector('#cf-wrapper, .cf-browser-verification, #challenge-running, #challenge-form')
      ) {
        throw new Error(
          `Access to "${trimmedUrl}" was blocked by anti-bot protection (Cloudflare/Captcha challenge page). Please visit the page directly in a browser.`
        );
      }
    }

    return this.parseHtmlToMarkdown(html, trimmedUrl, maxLength);
  }

  /**
   * Instance method delegating to static read.
   */
  async read(url: string, maxLength = 8000): Promise<WebPageContentResult> {
    return WebContentReader.read(url, maxLength);
  }

  /**
   * Parses raw HTML string into clean structured Markdown.
   */
  static parseHtmlToMarkdown(html: string, url: string, maxLength = 8000): WebPageContentResult {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract title
    const title = this.extractTitle(doc, url);

    // Resolve base URL
    const baseUrl = this.extractBaseUrl(doc, url);

    // Remove noisy elements
    this.removeNoisyElements(doc);

    // Find main content container
    const mainContainer = this.findMainContainer(doc);

    // Convert container DOM tree to Markdown
    let rawMarkdown = this.convertNode(mainContainer, baseUrl, { insidePre: false, insideTable: false, listDepth: 0 });

    // Normalize whitespace and blank lines
    let cleanMarkdown = this.normalizeMarkdown(rawMarkdown);

    // If main container was empty or too sparse, fallback to title
    if (!cleanMarkdown.trim()) {
      cleanMarkdown = title ? `# ${title}` : '';
    }

    const totalCharacters = cleanMarkdown.length;
    const effectiveLimit = maxLength > 0 ? maxLength : 8000;

    let content = cleanMarkdown;
    let truncated = false;

    if (totalCharacters > effectiveLimit) {
      truncated = true;
      let cutPoint = effectiveLimit;
      const lastNewline = cleanMarkdown.lastIndexOf('\n', effectiveLimit);
      if (lastNewline > effectiveLimit - 300 && lastNewline > 0) {
        cutPoint = lastNewline;
      }
      content =
        cleanMarkdown.slice(0, cutPoint).trim() +
        `\n\n... [Content truncated due to length limit. Total characters: ${totalCharacters}]`;
    }

    return {
      title,
      url,
      content,
      truncated,
      totalCharacters,
    };
  }

  /**
   * Extracts page title from OpenGraph metadata, title tag, or primary heading.
   */
  private static extractTitle(doc: Document, url: string): string {
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle && ogTitle.trim()) {
      return ogTitle.replace(/\s+/g, ' ').trim();
    }

    const titleEl = doc.querySelector('title');
    if (titleEl && titleEl.textContent && titleEl.textContent.trim()) {
      return titleEl.textContent.replace(/\s+/g, ' ').trim();
    }

    const h1El = doc.querySelector('h1');
    if (h1El && h1El.textContent && h1El.textContent.trim()) {
      return h1El.textContent.replace(/\s+/g, ' ').trim();
    }

    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return 'Untitled Web Page';
    }
  }

  /**
   * Resolves the base URL from <base href> tag if present.
   */
  private static extractBaseUrl(doc: Document, fallbackUrl: string): string {
    const baseEl = doc.querySelector('base[href]');
    if (baseEl) {
      const href = baseEl.getAttribute('href');
      if (href) {
        try {
          return new URL(href, fallbackUrl).href;
        } catch {
          // Ignore invalid base href
        }
      }
    }
    return fallbackUrl;
  }

  /**
   * Strips out scripts, styles, dialogs, cookie banners and non-content elements.
   */
  private static removeNoisyElements(doc: Document): void {
    for (const selector of NOISY_SELECTORS) {
      try {
        const elements = doc.querySelectorAll(selector);
        elements.forEach((el) => el.remove());
      } catch {
        // Ignore any selector syntax issues on edge DOMParsers
      }
    }
  }

  /**
   * Locates the primary content element in priority order.
   */
  private static findMainContainer(doc: Document): Element {
    const candidates = [
      'article',
      'main',
      '[role="main"]',
      '#content',
      '#main-content',
      '#main',
      '.main-content',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.page-content',
    ];

    for (const selector of candidates) {
      const el = doc.querySelector(selector);
      if (el && (el.textContent || '').trim().length >= 20) {
        return el;
      }
    }

    // Fallback: check if any candidate has any text at all
    for (const selector of candidates) {
      const el = doc.querySelector(selector);
      if (el && (el.textContent || '').trim().length > 0) {
        return el;
      }
    }

    return doc.body || doc.documentElement;
  }

  /**
   * Recursively converts a DOM node to Markdown string.
   */
  private static convertNode(node: Node, baseUrl: string, context: ConversionContext): string {
    if (!node) return '';

    // TEXT_NODE
    if (node.nodeType === Node.TEXT_NODE) {
      const rawText = node.textContent || '';
      if (context.insidePre) {
        return rawText;
      }
      // Collapse multiple whitespace characters to a single space
      return rawText.replace(/\s+/g, ' ');
    }

    // COMMENT_NODE or non-element
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Ignore elements that should not be converted
    if (tag === 'head' || tag === 'meta' || tag === 'link' || tag === 'style' || tag === 'script') {
      return '';
    }

    switch (tag) {
      // Headings
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const level = parseInt(tag.charAt(1), 10) || 1;
        const inner = this.convertChildren(el, baseUrl, context).replace(/\s+/g, ' ').trim();
        if (!inner) return '';
        const hashes = '#'.repeat(Math.min(Math.max(level, 1), 6));
        return `\n\n${hashes} ${inner}\n\n`;
      }

      // Paragraphs
      case 'p': {
        const inner = this.convertChildren(el, baseUrl, context).trim();
        if (!inner) return '';
        return `\n\n${inner}\n\n`;
      }

      // Inline Formatting
      case 'strong':
      case 'b': {
        const inner = this.convertChildren(el, baseUrl, context);
        return wrapInline(inner, '**');
      }

      case 'em':
      case 'i': {
        const inner = this.convertChildren(el, baseUrl, context);
        return wrapInline(inner, '*');
      }

      case 'del':
      case 's':
      case 'strike': {
        const inner = this.convertChildren(el, baseUrl, context);
        return wrapInline(inner, '~~');
      }

      case 'mark': {
        const inner = this.convertChildren(el, baseUrl, context);
        return wrapInline(inner, '==');
      }

      // Links
      case 'a': {
        const href = el.getAttribute('href') || '';
        const inner = this.convertChildren(el, baseUrl, context);
        const trimmedInner = inner.trim();
        const resolvedHref = resolveUrl(href, baseUrl);

        if (!resolvedHref) {
          return inner;
        }

        const leadingSpace = inner.match(/^\s*/)?.[0] || '';
        const trailingSpace = inner.match(/\s*$/)?.[0] || '';
        const linkText = trimmedInner || resolvedHref;

        return `${leadingSpace}[${linkText}](${resolvedHref})${trailingSpace}`;
      }

      // Images
      case 'img': {
        const src = el.getAttribute('src') || '';
        const alt = el.getAttribute('alt') || el.getAttribute('title') || '';
        const resolvedSrc = resolveUrl(src, baseUrl);
        if (!resolvedSrc) return '';
        return `![${alt.trim()}](${resolvedSrc})`;
      }

      // Code blocks & Inline Code
      case 'pre': {
        return this.convertPre(el);
      }

      case 'code': {
        if (context.insidePre) {
          return el.textContent || '';
        }
        const codeText = el.textContent || '';
        if (!codeText.trim()) return codeText;
        return wrapInline(codeText.replace(/\r?\n/g, ' '), '`');
      }

      // Blockquotes
      case 'blockquote': {
        const inner = this.convertChildren(el, baseUrl, context).trim();
        if (!inner) return '';
        const quoted = inner
          .split('\n')
          .map((line) => (line.length > 0 ? `> ${line}` : '>'))
          .join('\n');
        return `\n\n${quoted}\n\n`;
      }

      // Lists
      case 'ul':
        return this.convertList(el, baseUrl, false, context.listDepth || 0);

      case 'ol':
        return this.convertList(el, baseUrl, true, context.listDepth || 0);

      // Tables
      case 'table':
        return this.convertTable(el, baseUrl);

      // Horizontal Rules & Line Breaks
      case 'hr':
        return '\n\n---\n\n';

      case 'br':
        return '\n';

      // Container & Section Elements
      case 'div':
      case 'section':
      case 'article':
      case 'main':
      case 'figure':
      case 'figcaption':
      case 'center': {
        const inner = this.convertChildren(el, baseUrl, context).trim();
        if (!inner) return '';
        return `\n\n${inner}\n\n`;
      }

      // Default: passthrough children
      default:
        return this.convertChildren(el, baseUrl, context);
    }
  }

  /**
   * Helper to convert all child nodes of an element.
   */
  private static convertChildren(parent: HTMLElement, baseUrl: string, context: ConversionContext): string {
    const pieces: string[] = [];
    const children = Array.from(parent.childNodes);

    for (const child of children) {
      pieces.push(this.convertNode(child, baseUrl, context));
    }

    return pieces.join('');
  }

  /**
   * Converts `<pre>` code block elements, detecting programming language classes if available.
   */
  private static convertPre(preEl: HTMLElement): string {
    const codeEl = preEl.querySelector('code');
    let lang = '';
    if (codeEl) {
      const classList = Array.from(codeEl.classList);
      for (const cls of classList) {
        if (cls.startsWith('language-')) {
          lang = cls.replace('language-', '').trim();
          break;
        } else if (cls.startsWith('lang-')) {
          lang = cls.replace('lang-', '').trim();
          break;
        }
      }
    }

    const rawCode = (codeEl ? codeEl.textContent : preEl.textContent) || '';
    const cleanCode = rawCode.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
    return `\n\n\`\`\`${lang}\n${cleanCode}\n\`\`\`\n\n`;
  }

  /**
   * Converts list elements (`<ul>` / `<ol>`) including nested sublists.
   */
  private static convertList(listEl: HTMLElement, baseUrl: string, isOrdered: boolean, depth: number): string {
    const items: string[] = [];
    const children = Array.from(listEl.children);
    let itemIndex = 1;

    for (const child of children) {
      if (child.tagName.toLowerCase() === 'li') {
        const itemText = this.convertListItem(child as HTMLElement, baseUrl, isOrdered, itemIndex, depth);
        if (itemText.trim()) {
          items.push(itemText);
          itemIndex++;
        }
      }
    }

    if (items.length === 0) return '';
    const formatted = items.join('\n');
    return depth === 0 ? `\n\n${formatted}\n\n` : `\n${formatted}`;
  }

  /**
   * Converts an individual `<li>` element.
   */
  private static convertListItem(
    liEl: HTMLElement,
    baseUrl: string,
    isOrdered: boolean,
    index: number,
    depth: number
  ): string {
    const indent = '  '.repeat(depth);
    const bullet = isOrdered ? `${index}. ` : '- ';

    const textParts: string[] = [];
    let nestedListsText = '';

    for (const child of Array.from(liEl.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement;
        const tag = childEl.tagName.toLowerCase();
        if (tag === 'ul') {
          nestedListsText += this.convertList(childEl, baseUrl, false, depth + 1);
          continue;
        } else if (tag === 'ol') {
          nestedListsText += this.convertList(childEl, baseUrl, true, depth + 1);
          continue;
        }
      }
      textParts.push(this.convertNode(child, baseUrl, { insidePre: false, insideTable: false, listDepth: depth }));
    }

    const rawText = textParts.join('').replace(/\s+/g, ' ').trim();
    if (!rawText && !nestedListsText) return '';

    let line = `${indent}${bullet}${rawText}`;
    if (nestedListsText) {
      line += nestedListsText;
    }
    return line;
  }

  /**
   * Converts an HTML `<table>` element into a valid GitHub Flavored Markdown table.
   */
  private static convertTable(tableEl: HTMLElement, baseUrl: string): string {
    // Only select rows belonging directly to this table (not nested tables)
    const trList = Array.from(tableEl.querySelectorAll('tr')).filter(
      (tr) => tr.closest('table') === tableEl
    );
    if (trList.length === 0) return '';

    const matrix: string[][] = [];
    let maxCols = 0;

    for (const row of trList) {
      // Only select cells belonging directly to this row
      const cells = Array.from(row.querySelectorAll('th, td')).filter(
        (cell) => cell.closest('tr') === row
      );
      const cellTexts = cells.map((cell) => {
        const text = this.convertChildren(cell as HTMLElement, baseUrl, { insidePre: false, insideTable: true });
        return text.replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|').trim();
      });
      if (cellTexts.length > maxCols) {
        maxCols = cellTexts.length;
      }
      matrix.push(cellTexts);
    }

    if (maxCols === 0 || matrix.length === 0) return '';

    // Pad all rows to maxCols
    for (const row of matrix) {
      while (row.length < maxCols) {
        row.push('');
      }
    }

    const resultLines: string[] = [];

    // Header row
    const headerRow = matrix[0];
    resultLines.push(`| ${headerRow.map((c) => c || ' ').join(' | ')} |`);

    // Separator row
    resultLines.push(`| ${Array(maxCols).fill('---').join(' | ')} |`);

    // Data rows
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i];
      resultLines.push(`| ${row.map((c) => c || ' ').join(' | ')} |`);
    }

    return `\n\n${resultLines.join('\n')}\n\n`;
  }

  /**
   * Normalizes spacing, blank lines, and line endings in generated Markdown.
   */
  private static normalizeMarkdown(markdown: string): string {
    return markdown
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

/**
 * Convenience helper function to fetch web page content.
 */
export async function fetchWebPageContent(url: string, maxLength = 8000): Promise<WebPageContentResult> {
  return WebContentReader.read(url, maxLength);
}
