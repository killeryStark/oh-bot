import { App, Notice } from 'obsidian';
import { HarnessSettings } from '../types';
import { SkillGitResolver } from './git-resolver';
import { MarketplaceSkillItem } from './types';
import { VaultSkillsScanner } from './vault-scanner';
import { SkillMetadata } from './types';
import { parseSkillContent } from './frontmatter';

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
