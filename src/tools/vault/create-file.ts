import { AgentTool } from '../base';
import { ToolResult, ToolSchema } from '../../types';
import { App } from 'obsidian';

export class VaultCreateFileTool extends AgentTool {
  name = 'vault_create_file';
  description = 'Creates a new Markdown file or document in the Vault at the specified path with initial content.';

  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path for the new file in the Vault (e.g. "Notes/Daily-2026-08-13.md")',
      },
      content: {
        type: 'string',
        description: 'Text content to write into the new file',
      },
    },
    required: ['path', 'content'],
  };

  isMutation = true;

  async execute(args: { path: string; content: string }, app: App): Promise<ToolResult> {
    try {
      const existing = app.vault.getAbstractFileByPath(args.path);
      if (existing) {
        return {
          success: false,
          output: '',
          error: `A file or folder already exists at path: ${args.path}. Use vault_patch_file to modify existing files.`,
        };
      }

      // Ensure parent folders exist
      const pathParts = args.path.split('/');
      if (pathParts.length > 1) {
        const folderPath = pathParts.slice(0, -1).join('/');
        const folder = app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
          await app.vault.createFolder(folderPath);
        }
      }

      const createdFile = await app.vault.create(args.path, args.content || '');
      return {
        success: true,
        output: `File successfully created at ${createdFile.path} (${createdFile.stat.size} bytes).`,
      };
    } catch (e: any) {
      return {
        success: false,
        output: '',
        error: `Error creating file ${args.path}: ${e.message}`,
      };
    }
  }
}
