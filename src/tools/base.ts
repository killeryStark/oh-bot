import { App } from 'obsidian';
import { ToolResult, ToolSchema } from '../types';

export abstract class AgentTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: ToolSchema['parameters'];

  /**
   * Indicates whether executing this tool modifies files in the Vault and requires strict confirmation.
   */
  isMutation = false;

  /**
   * Executes the tool action against the Obsidian App and Vault instance.
   */
  abstract execute(args: Record<string, any>, app: App): Promise<ToolResult>;

  /**
   * Returns clean JSON Schema representation of the tool.
   */
  toSchema(): ToolSchema {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    };
  }
}
