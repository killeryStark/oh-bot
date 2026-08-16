import { requestUrl } from 'obsidian';
import { SearchProvider, SearchResultItem } from '../types';

export class SearXNGAdapter implements SearchProvider {
  private searxngUrl: string;

  constructor(searxngUrl = 'http://localhost:8080') {
    this.searxngUrl = searxngUrl;
  }

  /**
   * Searches a SearXNG instance using its JSON API format.
   */
  async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    if (!query || !query.trim()) {
      return [];
    }

    const trimmedQuery = query.trim();
    const baseUrl = (this.searxngUrl || 'http://localhost:8080').trim().replace(/\/+$/, '');
    const endpoint = `${baseUrl}/search?q=${encodeURIComponent(trimmedQuery)}&format=json`;

    let data: any;
    try {
      const res = await requestUrl({
        url: endpoint,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      data = res.json ?? (res.text ? JSON.parse(res.text) : null);
    } catch (err) {
      throw new Error(`SearXNG search request failed at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!data || !Array.isArray(data.results)) {
      return [];
    }

    const results: SearchResultItem[] = [];
    for (const item of data.results) {
      if (!item || !item.url) {
        continue;
      }

      results.push({
        title: (item.title || item.url || '').trim(),
        url: item.url.trim(),
        snippet: (item.content || item.snippet || '').trim(),
      });

      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }
}
