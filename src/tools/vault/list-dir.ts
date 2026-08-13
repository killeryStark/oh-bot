import { AgentTool } from '../base';
import { ToolResult, ToolSchema } from '../../types';
import { App, TFolder } from 'obsidian';

export class VaultListDirTool extends AgentTool {
  name = 'vault_list_dir';
  description = 'Lists all files and subfolders within a given Vault folder path.';

  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path of the directory (use "" or "/" for root directory)',
      },
    },
    required: ['path'],
  };

  isMutation = false;

  async execute(args: { path: string }, app: App): Promise<ToolResult> {
    try {
      const folderPath = (args.path || '').replace(/^\//, '');
      const folder = folderPath === '' ? app.vault.getRoot() : app.vault.getAbstractFileByPath(folderPath);

      if (!folder || !(folder instanceof TFolder)) {
        return {
          success: false,
          output: '',
          error: `Directory not found at path: "${args.path}"`,
        };
      }

      const items = folder.children.map((child) => ({
        name: child.name,
        path: child.path,
        type: child instanceof TFolder ? 'folder' : 'file',
      }));

      return {
        success: true,
        output: JSON.stringify(items, null, 2),
      };
    } catch (e: any) {
      return {
        success: false,
        output: '',
        error: `Error listing directory ${args.path}: ${e.message}`,
      };
    }
  }
}
