import { AgentTool } from '../base';
import { ToolResult, ToolSchema } from '../../types';
import { App, TFile } from 'obsidian';

export class VaultSearchNotesTool extends AgentTool {
  name = 'vault_search_notes';
  description = 'Searches for notes in the Vault matching a search query string or keyword.';

  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keyword or tag to search for in note paths or titles',
      },
    },
    required: ['query'],
  };

  isMutation = false;

  async execute(args: { query: string }, app: App): Promise<ToolResult> {
    try {
      const queryLower = (args.query || '').toLowerCase();
      const files = app.vault.getMarkdownFiles();

      const matched = files
        .filter((file) => file.path.toLowerCase().includes(queryLower) || file.basename.toLowerCase().includes(queryLower))
        .map((file) => ({
          name: file.name,
          path: file.path,
          size: file.stat.size,
          mtime: file.stat.mtime,
        }))
        .slice(0, 20); // Cap at top 20 results for token economy

      return {
        success: true,
        output: JSON.stringify(matched, null, 2),
      };
    } catch (e: any) {
      return {
        success: false,
        output: '',
        error: `Error searching notes for "${args.query}": ${e.message}`,
      };
    }
  }
}
