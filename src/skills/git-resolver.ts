import { requestUrl } from 'obsidian';
import { parseSkillContent } from './frontmatter';
import { SkillMetadata } from './types';

export class SkillGitResolver {
  /**
   * Resolves a Git URL or raw markdown URL into a complete SkillMetadata object.
   */
  static async resolveFromUrl(inputUrl: string): Promise<SkillMetadata> {
    let targetUrl = inputUrl.trim();
    if (!targetUrl) {
      throw new Error('Please provide a valid GitHub repository or skill URL.');
    }

    // Short format: owner/repo or owner/repo/path
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      if (targetUrl.includes('/')) {
        targetUrl = `https://github.com/${targetUrl}`;
      } else {
        throw new Error(`Invalid URL format: "${inputUrl}". Expected https://github.com/... or owner/repo`);
      }
    }

    // Normalize GitHub tree / blob URLs
    const rawCandidates = this.generateCandidateUrls(targetUrl);
    let lastError: Error | null = null;
    let fetchedContent = '';
    let successfulUrl = '';

    for (const candUrl of rawCandidates) {
      try {
        const res = await requestUrl({ url: candUrl, method: 'GET' });
        if (res.status === 200 && res.text && res.text.trim().length > 0) {
          fetchedContent = res.text;
          successfulUrl = candUrl;
          break;
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!fetchedContent) {
      throw new Error(
        `Failed to fetch SKILL.md from "${inputUrl}". Please check repository path and branch name. (${lastError?.message || '404 Not Found'})`
      );
    }

    const fallbackId = this.extractIdFromUrl(inputUrl);
    const parsed = parseSkillContent(fetchedContent, fallbackId);

    const homepage = parsed.homepage || (targetUrl.includes('github.com') ? targetUrl.replace(/\/raw\..*$/, '') : undefined);

    const author = parsed.author || this.extractAuthorFromUrl(inputUrl);

    return {
      id: fallbackId,
      name: parsed.name || fallbackId,
      description: parsed.description || 'Imported Skill',
      author,
      tags: parsed.tags,
      version: parsed.version || '1.0.0',
      homepage,
      sourceType: 'installed',
      sourceUrl: targetUrl,
      enabled: true,
      content: parsed.body || fetchedContent,
      updatedAt: Date.now(),
    };
  }

  /**
   * Generates candidate raw URLs to probe for SKILL.md.
   */
  private static generateCandidateUrls(url: string): string[] {
    const candidates: string[] = [];

    // Already raw URL
    if (url.includes('raw.githubusercontent.com') || url.endsWith('.md')) {
      candidates.push(url);
      return candidates;
    }

    // GitHub Blob: https://github.com/owner/repo/blob/main/skills/foo/SKILL.md
    const blobMatch = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (blobMatch) {
      const [, owner, repo, branch, path] = blobMatch;
      candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`);
      return candidates;
    }

    // GitHub Tree: https://github.com/owner/repo/tree/main/skills/foo
    const treeMatch = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/?(.*)$/);
    if (treeMatch) {
      const [, owner, repo, branch, path] = treeMatch;
      const cleanPath = path ? path.replace(/\/$/, '') : '';
      if (cleanPath.endsWith('.md')) {
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath}`);
      } else {
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath}/SKILL.md`);
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath}/skill.md`);
      }
      return candidates;
    }

    // Root Repo: https://github.com/owner/repo
    const repoMatch = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/);
    if (repoMatch) {
      const [, owner, repo] = repoMatch;
      const cleanRepo = repo.replace(/\.git$/, '');
      const branches = ['main', 'master'];
      const standardPaths = [
        'SKILL.md',
        'skill.md',
        'skills/SKILL.md',
        '.agents/skills/SKILL.md',
        '.skills/SKILL.md',
      ];

      for (const branch of branches) {
        for (const p of standardPaths) {
          candidates.push(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/${branch}/${p}`);
        }
      }
      return candidates;
    }

    // Generic fallback: try direct URL and direct /SKILL.md
    candidates.push(url);
    if (!url.endsWith('/SKILL.md')) {
      candidates.push(`${url.replace(/\/$/, '')}/SKILL.md`);
    }

    return candidates;
  }

  private static extractIdFromUrl(url: string): string {
    const cleaned = url.replace(/\/+$/, '').replace(/\/SKILL\.md$/i, '');
    const parts = cleaned.split('/');
    const lastPart = parts[parts.length - 1] || 'custom-skill';
    return lastPart.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  }

  private static extractAuthorFromUrl(url: string): string | undefined {
    const ghMatch = url.match(/github\.com\/([^/]+)/);
    if (ghMatch) return ghMatch[1];
    const rawMatch = url.match(/raw\.githubusercontent\.com\/([^/]+)/);
    if (rawMatch) return rawMatch[1];
    return undefined;
  }
}
