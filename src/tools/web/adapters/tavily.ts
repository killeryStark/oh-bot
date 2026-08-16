import { requestUrl } from 'obsidian';
import { SearchProvider, SearchResultItem } from '../types';

export class TavilyAdapter implements SearchProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Searches the Tavily API using the configured API key.
   */
  async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    if (!query || !query.trim()) {
      return [];
    }

    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error('Tavily API key is not configured. Please set your Tavily API key in settings or select DuckDuckGo.');
    }

    const trimmedKey = this.apiKey.trim();
    const maxResults = Math.max(1, Math.min(limit || 5, 20));

    let data: any;
    try {
      const res = await requestUrl({
        url: 'https://api.tavily.com/search',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${trimmedKey}`,
          'api-key': trimmedKey,
        },
        body: JSON.stringify({
          query: query.trim(),
          max_results: maxResults,
          search_depth: 'basic',
          include_answer: false,
          include_raw_content: false,
        }),
      });

      data = res.json ?? (res.text ? JSON.parse(res.text) : null);
    } catch (err) {
      throw new Error(`Tavily search request failed: ${err instanceof Error ? err.message : String(err)}`);
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
        snippet: (item.content || '').trim(),
      });

      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }
}
