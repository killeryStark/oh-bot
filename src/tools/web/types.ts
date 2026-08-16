export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  search(query: string, limit?: number): Promise<SearchResultItem[]>;
}

export interface WebPageContentResult {
  title: string;
  url: string;
  content: string; // clean markdown text
  truncated: boolean;
  totalCharacters: number;
}

