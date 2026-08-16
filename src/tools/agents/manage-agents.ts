import { App } from 'obsidian';
import { AgentTool } from '../base';
import { AgentConfig, ToolResult, ToolSchema } from '../../types';
import { AgentManager } from '../../engine/agent-manager';

export class ManageAgentsTool extends AgentTool {
  name = 'manage_agents';
  description = 'Create, update, delete, or list custom agent profiles in Obsidian Harness Bot.';

  isMutation = true;

  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'update', 'delete', 'list'],
        description: 'The management action to perform.',
      },
      id: {
        type: 'string',
        description: "Unique agent identifier (e.g. 'code-architect'). Required for create/update/delete.",
      },
      name: {
        type: 'string',
        description: 'Human-readable name of the agent.',
      },
      description: {
        type: 'string',
        description: 'Description of what this agent specializes in.',
      },
      systemPrompt: {
        type: 'string',
        description: 'Custom system prompt for the agent.',
      },
      workspacePath: {
        type: 'string',
        description: "Vault folder path to restrict the agent to (e.g. 'Projects/Codebase').",
      },
      agentMdContent: {
        type: 'string',
        description: 'Initial content for AGENT.md to create inside workspacePath.',
      },
      providerId: {
        type: 'string',
        description: 'Optional LLM provider ID override.',
      },
      model: {
        type: 'string',
        description: 'Optional model name override.',
      },
      allowedTools: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of allowed tool names or categories.',
      },
    },
    required: ['action'],
  };

  private agentManager?: AgentManager;

  constructor(agentManager?: AgentManager) {
    super();
    this.agentManager = agentManager;
  }

  setAgentManager(agentManager: AgentManager): void {
    this.agentManager = agentManager;
  }

  async execute(args: Record<string, any>, app: App): Promise<ToolResult> {
    if (!this.agentManager) {
      return {
        success: false,
        output: '',
        error: 'AgentManager is not attached to ManageAgentsTool.',
      };
    }

    const action = (args?.action || '').trim().toLowerCase();

    if (!action) {
      return {
        success: false,
        output: '',
        error: 'Missing required parameter: "action" (must be "create", "update", "delete", or "list").',
      };
    }

    switch (action) {
      case 'list': {
        const agents = this.agentManager.getAllAgents();
        const formatted = agents.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          workspacePath: a.workspacePath || '(entire vault)',
          isDefaultMain: a.isDefaultMain || false,
          providerId: a.providerId || '(inherited)',
          model: a.model || '(inherited)',
          allowedTools: a.allowedTools && a.allowedTools.length > 0 ? a.allowedTools : ['*'],
        }));
        return {
          success: true,
          output: JSON.stringify(formatted, null, 2),
        };
      }

      case 'delete': {
        const id = (args?.id || '').trim();
        if (!id) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: "id" is required for deleting an agent.',
          };
        }

        const agent = this.agentManager.getAgent(id);
        if (!agent) {
          return {
            success: false,
            output: '',
            error: `Agent with id "${id}" not found.`,
          };
        }

        if (agent.isDefaultMain || agent.id === 'main') {
          return {
            success: false,
            output: '',
            error: 'Cannot delete the default Main agent.',
          };
        }

        const deleted = await this.agentManager.deleteAgent(agent.id);
        if (!deleted) {
          return {
            success: false,
            output: '',
            error: `Failed to delete agent "${id}".`,
          };
        }

        return {
          success: true,
          output: `Successfully deleted agent "${agent.name}" (ID: ${agent.id}).`,
        };
      }

      case 'create':
      case 'update': {
        const id = (args?.id || '').trim();
        if (!id) {
          return {
            success: false,
            output: '',
            error: `Missing required parameter: "id" is required to ${action} an agent.`,
          };
        }

        const existing = this.agentManager.getAgent(id);
        const name = (args?.name || '').trim() || (existing ? existing.name : id);

        let scaffoldResult: { folderCreated: boolean; fileCreated: boolean; agentMdPath: string } | undefined;
        const workspacePath =
          args?.workspacePath !== undefined
            ? (args.workspacePath || '').trim()
            : existing?.workspacePath;

        if (workspacePath && workspacePath.length > 0) {
          try {
            scaffoldResult = await this.agentManager.scaffoldWorkspace(
              workspacePath,
              args?.agentMdContent,
              name
            );
          } catch (err: any) {
            return {
              success: false,
              output: '',
              error: `Failed to scaffold workspace at "${workspacePath}": ${err?.message || String(err)}`,
            };
          }
        }

        const agentData: Partial<AgentConfig> & { id: string; name: string } = {
          id,
          name,
        };

        if (args?.description !== undefined) {
          agentData.description = String(args.description);
        }
        if (args?.systemPrompt !== undefined) {
          agentData.systemPrompt = String(args.systemPrompt);
        }
        if (args?.workspacePath !== undefined) {
          agentData.workspacePath = String(args.workspacePath).trim();
        }
        if (args?.providerId !== undefined) {
          agentData.providerId = String(args.providerId).trim();
        }
        if (args?.model !== undefined) {
          agentData.model = String(args.model).trim();
        }
        if (args?.allowedTools !== undefined) {
          agentData.allowedTools = Array.isArray(args.allowedTools)
            ? args.allowedTools
            : [String(args.allowedTools)];
        }

        try {
          const saved = await this.agentManager.createOrUpdateAgent(agentData);
          let outputMsg = `Successfully ${existing ? 'updated' : 'created'} agent "${saved.name}" (ID: ${saved.id}).`;
          if (saved.workspacePath) {
            outputMsg += ` Workspace: "${saved.workspacePath}".`;
          }
          if (scaffoldResult?.fileCreated) {
            outputMsg += ` Created instruction template at "${scaffoldResult.agentMdPath}".`;
          }
          return {
            success: true,
            output: outputMsg,
          };
        } catch (err: any) {
          return {
            success: false,
            output: '',
            error: `Failed to save agent "${id}": ${err?.message || String(err)}`,
          };
        }
      }

      default:
        return {
          success: false,
          output: '',
          error: `Invalid action "${action}". Allowed actions are: create, update, delete, list.`,
        };
    }
  }
}
