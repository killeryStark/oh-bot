import { App, Notice } from 'obsidian';
import { HarnessSettings } from '../types';
import { SkillGitResolver } from './git-resolver';
import { MarketplaceSkillItem, SkillMetadata } from './types';
import { VaultSkillsScanner } from './vault-scanner';

export const DEFAULT_SKILL_CREATOR_CONTENT = `# Skill Creator for Obsidian Harness Bot

You are an expert agent architect specializing in designing, writing, and registering high-quality skills for the Obsidian Harness Bot ecosystem according to the SKILL.md standard.

Follow this structured workflow to guide the user from an initial idea to an installed, working skill:

---

## Step 1: Capture Intent & Requirements
1. Understand Goal: What specific task, reasoning methodology, or workflow should this skill enable?
2. Determine Triggers & Pushy Description:
   - What user phrases, keywords, or contexts should activate this skill?
   - Formulate a clear, pushy description so the model knows exactly when to apply this skill (e.g. "Use whenever the user mentions X, Y, or Z...").
3. Establish Structure:
   - What are the inputs, required tools (Vault tools, notes), and output format (e.g. structured markdown, tables, checklists)?
   - What edge cases, style guidelines, or step-by-step methodologies should the agent follow?

---

## Step 2: Draft the Skill
Write clean, modular markdown instructions with YAML frontmatter.

---

## Step 3: Register the Skill via create_skill Tool
Once the skill content is agreed upon (or drafted):
1. Execute the create_skill tool with:
   - id: kebab-case identifier (e.g. 'youtube-summarizer', 'literature-reviewer')
   - name: Display name
   - description: The trigger description
   - content: The complete markdown instructions body
   - tags: Array of category tags
   - author: Author attribution
   - version: Version string (e.g. '1.0.0')

2. Inform the user that the skill is now immediately active in:
   - The chat slash commands list as /[id]
   - The Skills & Marketplace GUI manager (/skills)`;

export const DEFAULT_STARTER_SKILLS: SkillMetadata[] = [
  {
    id: 'skill-creator',
    name: 'Skill Creator',
    description:
      'Create new skills, modify and improve existing skills, and manage agent workflows. Use whenever the user wants to create a new skill, turn a workflow into a skill, optimize an existing skill, or add new slash commands to Obsidian Harness Bot.',
    author: 'Anthropic / Adapted',
    homepage: 'https://github.com/anthropics/skills/tree/main/skills/skill-creator',
    tags: ['skills', 'meta', 'workflow', 'creation'],
    version: '1.0.0',
    sourceType: 'installed',
    enabled: true,
    content: DEFAULT_SKILL_CREATOR_CONTENT,
    updatedAt: Date.now(),
  },
];

export class SkillManager {
  private app: App;
  private settings: HarnessSettings;
  private saveSettingsCallback: () => Promise<void>;
  private vaultScanner: VaultSkillsScanner;
  private localSkills: SkillMetadata[] = [];

  constructor(app: App, settings: HarnessSettings, saveSettingsCallback: () => Promise<void>) {
    this.app = app;
    this.settings = settings;
    this.saveSettingsCallback = saveSettingsCallback;
    this.vaultScanner = new VaultSkillsScanner(app);
  }

  async init(): Promise<void> {
    if (!this.settings.installedSkills) {
      this.settings.installedSkills = [];
    }

    // Ensure skill-creator is installed by default
    const hasSkillCreator = this.settings.installedSkills.some((s) => s.id === 'skill-creator');
    if (!hasSkillCreator) {
      this.settings.installedSkills.unshift(DEFAULT_STARTER_SKILLS[0]);
      await this.saveSettingsCallback();
    }

    if (this.settings.scanVaultSkills !== false) {
      await this.refreshLocalSkills();
    }
  }

  /**
   * Scans Vault folders for local skills.
   */
  async refreshLocalSkills(): Promise<void> {
    if (this.settings.scanVaultSkills === false) {
      this.localSkills = [];
      return;
    }
    try {
      this.localSkills = await this.vaultScanner.scanVaultSkills();
    } catch (err) {
      console.warn('[oh-bot] Error scanning vault skills:', err);
    }
  }

  /**
   * Returns all skills (Vault local skills take priority over installed with same ID).
   */
  getAllSkills(): SkillMetadata[] {
    const map = new Map<string, SkillMetadata>();

    // 1. Add installed skills
    for (const skill of this.settings.installedSkills || []) {
      map.set(skill.id, skill);
    }

    // 2. Add / override with local vault skills
    for (const skill of this.localSkills) {
      map.set(skill.id, skill);
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Returns all enabled skills.
   */
  getActiveSkills(): SkillMetadata[] {
    return this.getAllSkills().filter((s) => s.enabled);
  }

  /**
   * Finds a skill by ID.
   */
  getSkill(id: string): SkillMetadata | undefined {
    const normalized = id.toLowerCase().trim();
    return this.getAllSkills().find((s) => s.id === normalized);
  }

  /**
   * Saves a custom skill directly into plugin storage (called by create_skill tool or GUI).
   */
  async saveCustomSkill(skillData: {
    id: string;
    name: string;
    description: string;
    content: string;
    tags?: string[];
    author?: string;
    version?: string;
    homepage?: string;
  }): Promise<SkillMetadata> {
    const normalizedId = skillData.id
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '');

    const newSkill: SkillMetadata = {
      id: normalizedId,
      name: skillData.name.trim(),
      description: skillData.description.trim(),
      author: skillData.author?.trim() || 'Custom / Agent',
      tags: skillData.tags || ['custom'],
      version: skillData.version?.trim() || '1.0.0',
      homepage: skillData.homepage,
      sourceType: 'installed',
      enabled: true,
      content: skillData.content.trim(),
      updatedAt: Date.now(),
    };

    if (!this.settings.installedSkills) {
      this.settings.installedSkills = [];
    }

    this.settings.installedSkills = this.settings.installedSkills.filter((s) => s.id !== normalizedId);
    this.settings.installedSkills.push(newSkill);

    await this.saveSettingsCallback();
    return newSkill;
  }

  /**
   * Installs a skill from any Git or markdown URL.
   */
  async installFromUrl(url: string): Promise<SkillMetadata> {
    const resolved = await SkillGitResolver.resolveFromUrl(url);

    if (!this.settings.installedSkills) {
      this.settings.installedSkills = [];
    }

    // Remove existing if any
    this.settings.installedSkills = this.settings.installedSkills.filter((s) => s.id !== resolved.id);
    this.settings.installedSkills.push(resolved);

    await this.saveSettingsCallback();
    new Notice(`Skill "${resolved.name}" successfully installed!`);
    return resolved;
  }

  /**
   * Installs a skill from marketplace item.
   */
  async installFromMarketplace(item: MarketplaceSkillItem): Promise<SkillMetadata> {
    return this.installFromUrl(item.downloadUrl);
  }

  /**
   * Uninstalls an installed skill.
   */
  async uninstallSkill(id: string): Promise<void> {
    if (!this.settings.installedSkills) return;
    this.settings.installedSkills = this.settings.installedSkills.filter((s) => s.id !== id);
    await this.saveSettingsCallback();
    new Notice(`Skill uninstalled.`);
  }

  /**
   * Toggles skill enabled status.
   */
  async toggleSkill(id: string, enabled: boolean): Promise<void> {
    // Check in installed skills
    const installed = this.settings.installedSkills?.find((s) => s.id === id);
    if (installed) {
      installed.enabled = enabled;
      await this.saveSettingsCallback();
      return;
    }

    // Check in local skills
    const local = this.localSkills.find((s) => s.id === id);
    if (local) {
      local.enabled = enabled;
    }
  }

  /**
   * Updates an installed Git skill to the latest version.
   */
  async updateSkillFromGit(id: string): Promise<SkillMetadata> {
    const existing = this.settings.installedSkills?.find((s) => s.id === id);
    if (!existing || !existing.sourceUrl) {
      throw new Error('Skill does not have a valid Git source URL to update from.');
    }
    return this.installFromUrl(existing.sourceUrl);
  }

  /**
   * Generates a compact index of available skills for the system prompt.
   */
  generateSystemPromptDirectives(): string {
    const active = this.getActiveSkills();
    if (active.length === 0) return '';

    const lines = [
      '\n\n[AVAILABLE SKILLS]',
      'You have access to specialized methodologies and skills. Adhere strictly to their instructions when applicable:',
    ];

    for (const skill of active) {
      lines.push(`- /${skill.id}: ${skill.name} - ${skill.description}`);
    }

    lines.push('[END OF AVAILABLE SKILLS]');
    return lines.join('\n');
  }

  /**
   * Formats active skill instructions for turn execution.
   */
  getActiveSkillDirective(skill: SkillMetadata): string {
    return `\n\n[SYSTEM DIRECTIVE: ACTIVE SKILL "${skill.name}"]\n${skill.content}\n[END OF ACTIVE SKILL INSTRUCTIONS]\n`;
  }
}
