import { App } from 'obsidian';
import { AgentTool } from '../base';
import { DEFAULT_SETTINGS, HarnessSettings, ToolResult, ToolSchema } from '../../types';
import { SearchEngineRouter } from './router';

export class WebSearchTool extends AgentTool {
  name = 'web_search';
  description =
    'Search the web for relevant pages, news, and documentation using the configured search provider (DuckDuckGo by default).';

  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query string.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of search results to return (default: 5, max: 10).',
      },
    },
    required: ['query'],
  };

  isMutation = false;

  private settings?: HarnessSettings;
  private router?: SearchEngineRouter;

  setSettings(settings: HarnessSettings): void {
    this.settings = settings;
    if (this.router) {
      this.router.updateSettings(settings);
    }
  }

  setRouter(router: SearchEngineRouter): void {
    this.router = router;
  }

  async execute(args: { query: string; limit?: number }, app: App): Promise<ToolResult> {
    try {
      const query = (args?.query || '').trim();
      if (!query) {
        return {
          success: false,
          output: '',
          error: 'Search query cannot be empty.',
        };
      }

      const limit = typeof args.limit === 'number' && !isNaN(args.limit)
        ? Math.min(Math.max(Math.floor(args.limit), 1), 10)
        : 5;

      if (!this.router) {
        this.router = new SearchEngineRouter(this.settings || DEFAULT_SETTINGS, app);
      } else if (this.settings) {
        this.router.updateSettings(this.settings);
      }

      const results = await this.router.search(query, limit);

      if (!results || results.length === 0) {
        return {
          success: true,
          output: `No search results found for "${query}".`,
        };
      }

      const formattedResults = results
        .map((item, index) => {
          const title = (item.title || 'Untitled').trim().replace(/[\r\n]+/g, ' ');
          const url = (item.url || '').trim();
          const snippet = (item.snippet || '').trim().replace(/\r?\n+/g, ' ');
          return `${index + 1}. **[${title}](${url})**\n   > ${snippet}`;
        })
        .join('\n\n');

      return {
        success: true,
        output: `### Search Results for "${query}":\n\n${formattedResults}`,
      };
    } catch (e: any) {
      return {
        success: false,
        output: '',
        error: `Search error: ${e?.message || String(e)}`,
      };
    }
  }
}
