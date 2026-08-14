import { App, Notice } from 'obsidian';
import { AgentTool } from '../base';
import { ToolResult, ToolSchema } from '../../types';
import { SkillManager } from '../../skills/skill-manager';

export class CreateSkillTool extends AgentTool {
  name = 'create_skill';
  description =
    "Creates or updates an internal agent skill in Obsidian Harness Bot. Registers the skill into the plugin's internal workflow so it becomes immediately available in slash commands (/[id]) and the Skills Manager GUI without needing manual vault file operations.";

  isMutation = true;

  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: "Unique kebab-case identifier for the skill (e.g. 'youtube-summarizer', 'paper-analyzer').",
      },
      name: {
        type: 'string',
        description: "Human-readable display name (e.g. 'YouTube Summarizer', 'Paper Analyzer').",
      },
      description: {
        type: 'string',
        description:
          'Clear, pushy description describing what the skill does and specific triggers/contexts for when to use it.',
      },
      content: {
        type: 'string',
        description: 'Complete Markdown body containing step-by-step instructions and methodology for the agent.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional category tags for filtering (e.g. ["video", "summary", "notes"]).',
      },
      author: {
        type: 'string',
        description: 'Optional author name (default: "User / Agent").',
      },
      version: {
        type: 'string',
        description: 'Optional SemVer version string (default: "1.0.0").',
      },
    },
    required: ['id', 'name', 'description', 'content'],
  };

  private skillManager?: SkillManager;

  constructor(skillManager?: SkillManager) {
    super();
    this.skillManager = skillManager;
  }

  setSkillManager(skillManager: SkillManager): void {
    this.skillManager = skillManager;
  }

  async execute(args: Record<string, any>, app: App): Promise<ToolResult> {
    const { id, name, description, content, tags, author, version } = args;

    if (!id || typeof id !== 'string') {
      return { success: false, output: '', error: 'Missing or invalid "id" parameter.' };
    }
    if (!name || typeof name !== 'string') {
      return { success: false, output: '', error: 'Missing or invalid "name" parameter.' };
    }
    if (!description || typeof description !== 'string') {
      return { success: false, output: '', error: 'Missing or invalid "description" parameter.' };
    }
    if (!content || typeof content !== 'string') {
      return { success: false, output: '', error: 'Missing or invalid "content" parameter.' };
    }

    if (!this.skillManager) {
      return {
        success: false,
        output: '',
        error: 'SkillManager is not attached to CreateSkillTool.',
      };
    }

    try {
      const saved = await this.skillManager.saveCustomSkill({
        id,
        name,
        description,
        content,
        tags: Array.isArray(tags) ? tags : undefined,
        author: typeof author === 'string' ? author : undefined,
        version: typeof version === 'string' ? version : undefined,
      });

      new Notice(`Skill "${saved.name}" (/${saved.id}) created!`);

      return {
        success: true,
        output: `Successfully created and registered skill "${saved.name}" (ID: ${saved.id}, version: ${saved.version || '1.0.0'}).\nIt is now active and immediately accessible in slash commands as /${saved.id} and in the Skills Manager GUI.`,
      };
    } catch (err: any) {
      return {
        success: false,
        output: '',
        error: `Failed to save skill: ${err.message}`,
      };
    }
  }
}
