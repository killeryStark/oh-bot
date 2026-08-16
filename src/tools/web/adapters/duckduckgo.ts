import { requestUrl } from 'obsidian';
import { SearchProvider, SearchResultItem } from '../types';

/**
 * Decodes DuckDuckGo redirect URLs (e.g. //duckduckgo.com/l/?uddg=https%3A%2F%2Ftarget.com)
 * into clean target destination URLs.
 */
export function decodeDuckDuckGoUrl(rawUrl: string): string {
  if (!rawUrl) return '';

  try {
    let normalized = rawUrl;
    if (normalized.startsWith('//')) {
      normalized = 'https:' + normalized;
    } else if (normalized.startsWith('/')) {
      normalized = 'https://duckduckgo.com' + normalized;
    }

    if (normalized.includes('uddg=')) {
      const urlObj = new URL(normalized);
      const uddg = urlObj.searchParams.get('uddg');
      if (uddg) {
        return decodeURIComponent(uddg);
      }
    }
  } catch {
    // Fallback regex if URL parsing fails
    const match = rawUrl.match(/uddg=([^&]+)/);
    if (match && match[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }

  return rawUrl;
}

export class DuckDuckGoAdapter implements SearchProvider {
  /**
   * Searches DuckDuckGo using the free HTML endpoint and DOMParser.
   */
  async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    if (!query || !query.trim()) {
      return [];
    }

    const trimmedQuery = query.trim();
    let html = '';

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    try {
      // Primary: POST to html.duckduckgo.com/html/
      const res = await requestUrl({
        url: 'https://html.duckduckgo.com/html/',
        method: 'POST',
        headers,
        body: `q=${encodeURIComponent(trimmedQuery)}`,
      });
      html = res.text;
    } catch (postError) {
      // Fallback: GET request
      try {
        const getRes = await requestUrl({
          url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmedQuery)}`,
          method: 'GET',
          headers: {
            'User-Agent': headers['User-Agent'],
            'Accept': headers['Accept'],
          },
        });
        html = getRes.text;
      } catch (getError) {
        throw new Error(`DuckDuckGo search network request failed: ${getError instanceof Error ? getError.message : String(getError)}`);
      }
    }

    if (!html || !html.trim()) {
      return [];
    }

    return this.parseHtmlResults(html, limit);
  }

  /**
   * Parses DuckDuckGo HTML search results into structured SearchResultItem objects.
   */
  private parseHtmlResults(html: string, limit: number): SearchResultItem[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Check for explicit no-results indicator
    const noResults = doc.querySelector('.no-results, .result--no-result');
    if (noResults && !doc.querySelector('.result__title, .result__a')) {
      return [];
    }

    // Match candidate result containers
    const rawElements = doc.querySelectorAll('.result, .results_links_deep, .results_links, .web-result');
    const resultElements = Array.from(rawElements);

    const items: SearchResultItem[] = [];
    const seenUrls = new Set<string>();

    for (const el of resultElements) {
      // Skip ads or no-result messages
      if (el.classList.contains('result--ad') || el.classList.contains('result--no-result')) {
        continue;
      }

      // Find title and link anchor
      const linkEl = el.querySelector<HTMLAnchorElement>('.result__title a, .result__a, h2 a, a.result__url');
      if (!linkEl) {
        continue;
      }

      const rawHref = linkEl.getAttribute('href') || '';
      const cleanUrl = decodeDuckDuckGoUrl(rawHref).trim();
      const title = (linkEl.textContent || '').replace(/\s+/g, ' ').trim();

      // Skip invalid, empty or internal DDG non-search links
      if (!cleanUrl || !title || cleanUrl.startsWith('javascript:') || cleanUrl === '#' || seenUrls.has(cleanUrl)) {
        continue;
      }

      // Check if URL is an internal DuckDuckGo settings/feedback link
      if (cleanUrl.startsWith('https://duckduckgo.com/feedback') || cleanUrl.startsWith('https://duckduckgo.com/settings')) {
        continue;
      }

      // Find snippet text
      const snippetEl = el.querySelector('.result__snippet, .result__snippet.js-result-snippet, .snippet');
      const snippet = snippetEl ? (snippetEl.textContent || '').replace(/\s+/g, ' ').trim() : '';

      seenUrls.add(cleanUrl);
      items.push({
        title,
        url: cleanUrl,
        snippet,
      });

      if (items.length >= limit) {
        break;
      }
    }

    return items;
  }
}
