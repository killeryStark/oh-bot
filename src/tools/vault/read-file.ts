import { AgentTool } from '../base';
import { ToolResult, ToolSchema } from '../../types';
import { App, TFile } from 'obsidian';

export class VaultReadFileTool extends AgentTool {
  name = 'vault_read_file';
  description = 'Reads the content of a Markdown file or text document in the Obsidian Vault by path.';
  
  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path of the file in the Vault (e.g. "Projects/Ideas.md")',
      },
    },
    required: ['path'],
  };

  isMutation = false;

  async execute(args: { path: string }, app: App): Promise<ToolResult> {
    try {
      const file = app.vault.getAbstractFileByPath(args.path);
      if (!file || !(file instanceof TFile)) {
        return {
          success: false,
          output: '',
          error: `File not found at path: ${args.path}`,
        };
      }

      const content = await app.vault.read(file);
      return {
        success: true,
        output: content,
      };
    } catch (e: any) {
      return {
        success: false,
        output: '',
        error: `Error reading file ${args.path}: ${e.message}`,
      };
    }
  }
}
