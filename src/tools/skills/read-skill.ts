import { App } from 'obsidian';
import { AgentTool } from '../base';
import { ToolResult, ToolSchema } from '../../types';
import { SkillManager } from '../../skills/skill-manager';

export class ReadSkillTool extends AgentTool {
  name = 'read_skill';
  description =
    'Reads and inspects the complete markdown instructions, methodology, and metadata of an existing skill by ID.';

  isMutation = false;

  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: "The identifier of the skill to read (e.g. 'skill-creator', 'brainstorming').",
      },
    },
    required: ['id'],
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
    const { id } = args;

    if (!id || typeof id !== 'string') {
      return { success: false, output: '', error: 'Missing or invalid "id" parameter.' };
    }

    if (!this.skillManager) {
      return {
        success: false,
        output: '',
        error: 'SkillManager is not attached to ReadSkillTool.',
      };
    }

    const skill = this.skillManager.getSkill(id);
    if (!skill) {
      return {
        success: false,
        output: '',
        error: `Skill with ID "${id}" was not found. Use list_skills to see available skills.`,
      };
    }

    const details = {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      author: skill.author,
      version: skill.version,
      sourceType: skill.sourceType,
      tags: skill.tags,
      content: skill.content,
    };

    return {
      success: true,
      output: JSON.stringify(details, null, 2),
    };
  }
}
