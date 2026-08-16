import { AgentTool } from './base';
import { HarnessSettings, ToolResult, ToolSchema } from '../types';
import { App } from 'obsidian';
import { sortToolSchemasDeterministically } from '../utils/cache-helpers';
import { VaultReadFileTool } from './vault/read-file';
import { VaultCreateFileTool } from './vault/create-file';
import { VaultPatchFileTool } from './vault/patch-file';
import { VaultListDirTool } from './vault/list-dir';
import { VaultSearchNotesTool } from './vault/search-notes';
import { CreateSkillTool } from './skills/create-skill';
import { ReadSkillTool } from './skills/read-skill';
import { ListSkillsTool } from './skills/list-skills';
import { WebSearchTool } from './web/search-tool';
import { FetchWebPageTool } from './web/fetch-page-tool';
import { GeneratePdfTool } from './pdf/generate-pdf-tool';
import { InvokeSubagentTool } from './agents/invoke-subagent';
import { ManageAgentsTool } from './agents/manage-agents';
import { SubagentRunner } from './agents/types';
import { AgentManager } from '../engine/agent-manager';
import { SkillManager } from '../skills/skill-manager';
import { McpManager } from '../mcp/mcp-manager';
import { McpBridgeTool } from './mcp/bridge-tool';

export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();
  private createSkillTool = new CreateSkillTool();
  private readSkillTool = new ReadSkillTool();
  private listSkillsTool = new ListSkillsTool();
  private webSearchTool = new WebSearchTool();
  private fetchWebPageTool = new FetchWebPageTool();
  private generatePdfTool = new GeneratePdfTool();
  private invokeSubagentTool = new InvokeSubagentTool();
  private manageAgentsTool = new ManageAgentsTool();
  private mcpManager?: McpManager;
  private agentManager?: AgentManager;

  constructor(
    skillManager?: SkillManager,
    mcpManager?: McpManager,
    settings?: HarnessSettings,
    agentManager?: AgentManager
  ) {
    // Register V1 Vault Tools
    this.registerTool(new VaultReadFileTool());
    this.registerTool(new VaultCreateFileTool());
    this.registerTool(new VaultPatchFileTool());
    this.registerTool(new VaultListDirTool());
    this.registerTool(new VaultSearchNotesTool());

    // Register Skill Tools
    this.registerTool(this.createSkillTool);
    this.registerTool(this.readSkillTool);
    this.registerTool(this.listSkillsTool);

    // Register Web & PDF Tools
    this.registerTool(this.webSearchTool);
    this.registerTool(this.fetchWebPageTool);
    this.registerTool(this.generatePdfTool);

    // Register Agent Tools
    this.registerTool(this.invokeSubagentTool);
    this.registerTool(this.manageAgentsTool);

    if (skillManager) {
      this.setSkillManager(skillManager);
    }
    if (mcpManager) {
      this.setMcpManager(mcpManager);
    }
    if (settings) {
      this.setSettings(settings);
    }
    if (agentManager) {
      this.setAgentManager(agentManager);
    }
  }

  setSkillManager(skillManager: SkillManager): void {
    this.createSkillTool.setSkillManager(skillManager);
    this.readSkillTool.setSkillManager(skillManager);
    this.listSkillsTool.setSkillManager(skillManager);
  }

  setMcpManager(mcpManager: McpManager): void {
    this.mcpManager = mcpManager;
  }

  setSettings(settings: HarnessSettings): void {
    this.webSearchTool.setSettings(settings);
    this.generatePdfTool.setSettings(settings);
  }

  setAgentManager(agentManager: AgentManager): void {
    this.agentManager = agentManager;
    this.invokeSubagentTool.setAgentManager(agentManager);
    this.manageAgentsTool.setAgentManager(agentManager);
  }

  setSubagentRunner(runner: SubagentRunner): void {
    this.invokeSubagentTool.setSubagentRunner(runner);
  }


  registerTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): AgentTool | undefined {
    const staticTool = this.tools.get(name);
    if (staticTool) return staticTool;

    // Dynamically resolve MCP tools if prefixed with mcp__
    if (name.startsWith('mcp__') && this.mcpManager) {
      const parts = name.split('__');
      if (parts.length >= 3) {
        const serverId = parts[1];
        const rawToolName = parts.slice(2).join('__');
        const server = this.mcpManager.getServer(serverId);
        if (server && server.enabled) {
          const cachedSchema = server.cachedTools?.find((t) => t.name === rawToolName) || {
            name: rawToolName,
            description: `Tool from ${server.name}`,
            parameters: { type: 'object', properties: {} },
          };
          return new McpBridgeTool(server.id, server.name, cachedSchema, this.mcpManager);
        }
      }
    }

    return undefined;
  }

  /**
   * Returns all registered tools (local tools + enabled MCP tools) as deterministically sorted ToolSchemas.
   */
  getSchemas(): ToolSchema[] {
    const rawSchemas = Array.from(this.tools.values()).map((t) => t.toSchema());

    // Append cached tools from all enabled MCP servers
    if (this.mcpManager) {
      const enabledServers = this.mcpManager.getEnabledServers();
      for (const server of enabledServers) {
        if (server.cachedTools && server.cachedTools.length > 0) {
          for (const toolSchema of server.cachedTools) {
            const bridge = new McpBridgeTool(server.id, server.name, toolSchema, this.mcpManager);
            rawSchemas.push(bridge.toSchema());
          }
        }
      }
    }

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
