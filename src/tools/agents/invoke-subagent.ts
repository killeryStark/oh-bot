import { App } from 'obsidian';
import { AgentTool } from '../base';
import { ToolResult, ToolSchema } from '../../types';
import { AgentManager } from '../../engine/agent-manager';
import { SubagentRunner } from './types';

export class InvokeSubagentTool extends AgentTool {
  name = 'invoke_subagent';
  description =
    'Delegate a focused task or sub-project to a specialized agent profile. The subagent runs in its isolated workspace sandbox with its own instructions and returns a comprehensive report.';

  isMutation = false;

  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: "The unique ID or name of the agent to invoke (e.g., 'researcher', 'finance-analyst').",
      },
      task: {
        type: 'string',
        description: 'The specific task instructions and goals for the subagent to complete.',
      },
      context: {
        type: 'string',
        description: 'Optional additional background data or notes for the subagent.',
      },
    },
    required: ['agent_id', 'task'],
  };

  private agentManager?: AgentManager;
  private subagentRunner?: SubagentRunner;

  constructor(agentManager?: AgentManager, subagentRunner?: SubagentRunner) {
    super();
    this.agentManager = agentManager;
    this.subagentRunner = subagentRunner;
  }

  setAgentManager(agentManager: AgentManager): void {
    this.agentManager = agentManager;
  }

  setSubagentRunner(runner: SubagentRunner): void {
    this.subagentRunner = runner;
  }

  async execute(args: Record<string, any>, app: App): Promise<ToolResult> {
    const agentId = (args?.agent_id || '').trim();
    const task = (args?.task || '').trim();
    const context = (args?.context || '').trim();

    if (!agentId) {
      return {
        success: false,
        output: '',
        error: 'Missing required parameter: "agent_id" is required.',
      };
    }

    if (!task) {
      return {
        success: false,
        output: '',
        error: 'Missing required parameter: "task" is required.',
      };
    }

    if (!this.agentManager) {
      return {
        success: false,
        output: '',
        error: 'AgentManager is not attached to InvokeSubagentTool.',
      };
    }

    if (!this.subagentRunner) {
      return {
        success: false,
        output: '',
        error: 'SubagentRunner is not attached to InvokeSubagentTool.',
      };
    }

    const agent = this.agentManager.getAgent(agentId);
    if (!agent) {
      const allAgents = this.agentManager.getAllAgents();
      const availableList =
        allAgents.length > 0
          ? allAgents.map((a) => `"${a.id}" (${a.name})`).join(', ')
          : 'None';
      return {
        success: false,
        output: '',
        error: `Agent "${agentId}" not found. Available agents: ${availableList}`,
      };
    }

    let fullPrompt = task;
    if (context) {
      fullPrompt = `${task}\n\n## Context\n${context}`;
    }

    try {
      const result = await this.subagentRunner(agent, fullPrompt);
      if (!result.success) {
        return {
          success: false,
          output: result.output || '',
          error: result.error || `Subagent "${agent.name}" failed to complete task.`,
        };
      }

      return {
        success: true,
        output: result.output,
      };
    } catch (err: any) {
      return {
        success: false,
        output: '',
        error: `Error executing subagent "${agent.name}": ${err?.message || String(err)}`,
      };
    }
  }
}
