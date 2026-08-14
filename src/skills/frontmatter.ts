import { ParsedSkillFrontmatter } from './types';

/**
 * Parses YAML Frontmatter from markdown content in a lightweight, cross-platform manner.
 */
export function parseSkillContent(rawContent: string, fallbackId: string): ParsedSkillFrontmatter {
  const trimmed = rawContent.trim();
  const frontmatterRegex = /^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*([\s\S]*)$/;
  const match = trimmed.match(frontmatterRegex);

  if (!match) {
    return {
      name: formatFallbackName(fallbackId),
      description: 'Custom skill',
      body: trimmed,
    };
  }

  const yamlBlock = match[1];
  const body = match[2].trim();
  const parsed = parseSimpleYaml(yamlBlock);

  return {
    name: typeof parsed.name === 'string' ? parsed.name : formatFallbackName(fallbackId),
    description: typeof parsed.description === 'string' ? parsed.description : '',
    author: typeof parsed.author === 'string' ? parsed.author : undefined,
    tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
    version: typeof parsed.version === 'string' ? parsed.version : undefined,
    homepage: typeof parsed.homepage === 'string' ? parsed.homepage : undefined,
    body,
  };
}

/**
 * Parses simple YAML key-value pairs and array formats.
 */
function parseSimpleYaml(yamlStr: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlStr.split(/\r?\n/);

  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Check for array item in multi-line array
    if (line.startsWith('- ') && currentKey) {
      const item = line.substring(2).trim().replace(/^['"](.*)['"]$/, '$1');
      if (!currentArray) {
        currentArray = [];
        result[currentKey] = currentArray;
      }
      currentArray.push(item);
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();

    currentKey = key;
    currentArray = null;

    if (!value) {
      // Might be a multi-line array coming next
      continue;
    }

    // Check for inline array: [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      if (!inner) {
        result[key] = [];
      } else {
        result[key] = inner
          .split(',')
          .map((s) => s.trim().replace(/^['"](.*)['"]$/, '$1'))
          .filter(Boolean);
      }
    } else {
      // Strip outer quotes if any
      result[key] = value.replace(/^['"](.*)['"]$/, '$1');
    }
  }

  return result;
}

function formatFallbackName(id: string): string {
  return id
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Compares two SemVer version strings (e.g., '1.2.0' vs '1.1.5').
 * Returns > 0 if v1 > v2, < 0 if v1 < v2, 0 if equal.
 */
export function compareSemver(v1?: string, v2?: string): number {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;

  const clean1 = v1.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const clean2 = v2.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);

  const len = Math.max(clean1.length, clean2.length);
  for (let i = 0; i < len; i++) {
    const num1 = clean1[i] || 0;
    const num2 = clean2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}
