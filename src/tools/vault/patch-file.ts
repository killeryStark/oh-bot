import { AgentTool } from '../base';
import { ToolResult, ToolSchema } from '../../types';
import { App, TFile } from 'obsidian';

export class VaultPatchFileTool extends AgentTool {
  name = 'vault_patch_file';
  description = 'Updates or appends content to an existing file in the Vault.';

  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path of the existing file to update',
      },
      content: {
        type: 'string',
        description: 'New content to write or append',
      },
      mode: {
        type: 'string',
        enum: ['overwrite', 'append'],
        description: 'Mode of update: "overwrite" replaces entire content, "append" adds to the end of the file',
      },
    },
    required: ['path', 'content', 'mode'],
  };

  isMutation = true;

  async execute(args: { path: string; content: string; mode: 'overwrite' | 'append' }, app: App): Promise<ToolResult> {
    try {
      const file = app.vault.getAbstractFileByPath(args.path);
      if (!file || !(file instanceof TFile)) {
        return {
          success: false,
          output: '',
          error: `File not found at path: ${args.path}`,
        };
      }

      if (args.mode === 'append') {
        await app.vault.append(file, '\n' + args.content);
        return {
          success: true,
          output: `Successfully appended content to ${file.path}.`,
        };
      } else {
        await app.vault.modify(file, args.content);
        return {
          success: true,
          output: `Successfully overwritten content of ${file.path}.`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        output: '',
        error: `Error patching file ${args.path}: ${e.message}`,
      };
    }
  }
}
