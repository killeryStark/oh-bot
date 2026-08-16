import { App } from 'obsidian';
import { AgentTool } from '../base';
import { ToolResult, ToolSchema } from '../../types';
import { WebContentReader } from './reader';

export class FetchWebPageTool extends AgentTool {
  name = 'fetch_web_page';
  description =
    'Fetch and extract clean text/markdown content from a specific web URL, stripping headers, footers, navigation, scripts, and ads.';

  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full HTTP/HTTPS URL of the web page.',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum character length of returned content (default: 8000).',
      },
    },
    required: ['url'],
  };

  isMutation = false;

  async execute(args: { url: string; maxLength?: number }, app: App): Promise<ToolResult> {
    try {
      const url = (args?.url || '').trim();
      if (!url) {
        return {
          success: false,
          output: '',
          error: 'URL cannot be empty.',
        };
      }

      const maxLength =
        typeof args.maxLength === 'number' && !isNaN(args.maxLength)
          ? Math.max(Math.floor(args.maxLength), 100)
          : 8000;

      const result = await WebContentReader.read(url, maxLength);

      const titleHeader = result.title ? `# ${result.title}\n` : '';
      const output = `${titleHeader}**Source**: ${result.url}\n\n${result.content}`;

      return {
        success: true,
        output,
      };
    } catch (e: any) {
      return {
        success: false,
        output: '',
        error: `Failed to fetch web page: ${e?.message || String(e)}`,
      };
    }
  }
}
