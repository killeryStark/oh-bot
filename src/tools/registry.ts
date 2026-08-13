import { AgentTool } from './base';
import { ToolResult, ToolSchema } from '../types';
import { App } from 'obsidian';
import { sortToolSchemasDeterministically } from '../utils/cache-helpers';
import { VaultReadFileTool } from './vault/read-file';
import { VaultCreateFileTool } from './vault/create-file';
import { VaultPatchFileTool } from './vault/patch-file';
import { VaultListDirTool } from './vault/list-dir';
import { VaultSearchNotesTool } from './vault/search-notes';

export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();

  constructor() {
    // Register V1 Vault Tools
    this.registerTool(new VaultReadFileTool());
    this.registerTool(new VaultCreateFileTool());
    this.registerTool(new VaultPatchFileTool());
    this.registerTool(new VaultListDirTool());
    this.registerTool(new VaultSearchNotesTool());
  }

  registerTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Returns all registered tools as deterministically sorted ToolSchemas.
   */
  getSchemas(): ToolSchema[] {
    const rawSchemas = Array.from(this.tools.values()).map((t) => t.toSchema());
    return sortToolSchemasDeterministically(rawSchemas);
  }

  async executeTool(name: string, args: Record<string, any>, app: App): Promise<ToolResult> {
    const tool = this.getTool(name);
    if (!tool) {
      return {
        success: false,
        output: '',
        error: `Unknown tool name: "${name}"`,
      };
    }

    return await tool.execute(args, app);
  }
}
