import { App } from 'obsidian';
import { AgentTool } from '../base';
import { ToolResult, ToolSchema } from '../../types';
import { SkillManager } from '../../skills/skill-manager';

export class ListSkillsTool extends AgentTool {
  name = 'list_skills';
  description =
    'Lists all registered agent skills currently available in Obsidian Harness Bot (both installed and local vault skills).';

  isMutation = false;

  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {},
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
    if (!this.skillManager) {
      return {
        success: false,
        output: '',
        error: 'SkillManager is not attached to ListSkillsTool.',
      };
    }

    const skills = this.skillManager.getAllSkills().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      author: s.author,
      version: s.version,
      sourceType: s.sourceType,
      enabled: s.enabled,
      tags: s.tags,
    }));

    return {
      success: true,
      output: JSON.stringify(skills, null, 2),
    };
  }
}
