import { App } from 'obsidian';
import { AgentTool } from '../base';
import { ToolResult, ToolSchema } from '../../types';
import { McpManager } from '../../mcp/mcp-manager';

export class McpBridgeTool implements AgentTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  isMutation: boolean;

  private serverId: string;
  private rawToolName: string;
  private mcpManager: McpManager;

  constructor(
    serverId: string,
    serverName: string,
    toolSchema: ToolSchema,
    mcpManager: McpManager
  ) {
    this.serverId = serverId;
    this.rawToolName = toolSchema.name;
    this.mcpManager = mcpManager;

    // Namespaced unique identifier for LLM function calling
    this.name = `mcp__${serverId}__${toolSchema.name}`;
    this.description = `[${serverName} MCP] ${toolSchema.description || toolSchema.name}`;
    this.parameters = toolSchema.parameters || { type: 'object', properties: {} };

    // Mutation detection heuristic for SafetyMode prompt confirmation
    const nameLower = toolSchema.name.toLowerCase();
    const descLower = (toolSchema.description || '').toLowerCase();
    const mutationKeywords = [
      'create',
      'add',
      'delete',
      'remove',
      'update',
      'patch',
      'post',
      'write',
      'insert',
      'set',
      'send',
      'modify',
      'close',
      'complete',
      'reopen',
    ];

    this.isMutation = mutationKeywords.some(
      (kw) => nameLower.includes(kw) || descLower.includes(kw)
    );
  }

  toSchema(): ToolSchema {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    };
  }

  async execute(args: Record<string, any>, app: App): Promise<ToolResult> {
    return await this.mcpManager.executeTool(this.serverId, this.rawToolName, args);
  }
}
