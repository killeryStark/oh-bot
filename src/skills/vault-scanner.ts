import { App, TFile } from 'obsidian';
import { parseSkillContent, compareSemver } from './frontmatter';
import { SkillMetadata } from './types';

const FOLDER_PRIORITIES: Record<string, number> = {
  '.agents/skills': 100,
  '.skills': 80,
  '.claude/skills': 60,
  '.gemini/skills': 40,
  'skills': 20,
};

export class VaultSkillsScanner {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Scans the active Obsidian Vault for standard skill directories.
   * Handles deduplication, symlinks, folder priority, and SemVer conflict resolution.
   */
  async scanVaultSkills(): Promise<SkillMetadata[]> {
    const allFiles = this.app.vault.getFiles();
    const candidateFiles = allFiles.filter((f) => this.isSkillFile(f.path));

    const skillsMap = new Map<string, { skill: SkillMetadata; priority: number }>();
    const seenContents = new Set<string>();

    for (const file of candidateFiles) {
      try {
        const rawContent = await this.app.vault.read(file);
        const trimmed = rawContent.trim();
        if (!trimmed) continue;

        // Skip exact duplicate files / symlinks
        const contentHash = this.simpleHash(trimmed);
        if (seenContents.has(contentHash)) {
          continue;
        }

        const fallbackId = this.extractIdFromPath(file.path);
        const parsed = parseSkillContent(trimmed, fallbackId);
        const skillId = this.normalizeSkillId(parsed.name || fallbackId);
        const folderPriority = this.getFolderPriority(file.path);

        const candidateSkill: SkillMetadata = {
          id: skillId,
          name: parsed.name || fallbackId,
          description: parsed.description || 'Local Vault Skill',
          author: parsed.author || 'Local Vault',
          tags: parsed.tags,
          version: parsed.version || '1.0.0',
          homepage: parsed.homepage,
          sourceType: 'local_vault',
          localPath: file.path,
          enabled: true,
          content: parsed.body || trimmed,
          updatedAt: file.stat.mtime || Date.now(),
        };

        if (!skillsMap.has(skillId)) {
          skillsMap.set(skillId, { skill: candidateSkill, priority: folderPriority });
          seenContents.add(contentHash);
        } else {
          const existing = skillsMap.get(skillId)!;
          const versionDiff = compareSemver(candidateSkill.version, existing.skill.version);

          if (versionDiff > 0) {
            // Higher SemVer version wins
            skillsMap.set(skillId, { skill: candidateSkill, priority: folderPriority });
            seenContents.add(contentHash);
          } else if (versionDiff === 0 && folderPriority > existing.priority) {
            // Higher folder priority wins on version tie
            skillsMap.set(skillId, { skill: candidateSkill, priority: folderPriority });
            seenContents.add(contentHash);
          }
        }
      } catch (err) {
        console.warn(`[oh-bot] Failed to parse vault skill at ${file.path}:`, err);
      }
    }

    return Array.from(skillsMap.values()).map((v) => v.skill);
  }

  private isSkillFile(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    const isMd = lower.endsWith('.md');
    if (!isMd) return false;

    // Check if filename is SKILL.md, skill.md, or ends in .skill.md
    const isSkillName = lower.endsWith('/skill.md') || lower.endsWith('.skill.md') || lower === 'skill.md';
    if (!isSkillName) return false;

    // Check if located in a standard skill directory
    return (
      lower.startsWith('.agents/skills/') ||
      lower.startsWith('.skills/') ||
      lower.startsWith('.claude/skills/') ||
      lower.startsWith('.gemini/skills/') ||
      lower.startsWith('skills/')
    );
  }

  private extractIdFromPath(filePath: string): string {
    const parts = filePath.split('/');
    if (parts.length >= 2) {
      // Return parent folder name if file is named SKILL.md
      const parent = parts[parts.length - 2];
      if (parent && !parent.startsWith('.')) {
        return parent.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
      }
    }
    const filename = parts[parts.length - 1].replace(/\.(skill\.)?md$/i, '');
    return filename.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  }

  private normalizeSkillId(nameOrId: string): string {
    return nameOrId
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '');
  }

  private getFolderPriority(filePath: string): number {
    const lower = filePath.toLowerCase();
    for (const [folder, priority] of Object.entries(FOLDER_PRIORITIES)) {
      if (lower.startsWith(folder.toLowerCase() + '/')) {
        return priority;
      }
    }
    return 10;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }
}
