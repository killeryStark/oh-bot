export type SkillSourceType = 'installed' | 'local_vault' | 'builtin';

export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  author?: string;
  tags?: string[];
  version?: string;
  homepage?: string;
  sourceType: SkillSourceType;
  sourceUrl?: string;
  localPath?: string;
  canonicalPath?: string;
  enabled: boolean;
  content: string;
  updatedAt: number;
}

export interface MarketplaceSkillItem {
  id: string;
  name: string;
  description: string;
  author: string;
  homepage?: string;
  downloadUrl: string;
  version?: string;
  tags?: string[];
}

export interface MarketplaceManifest {
  version: string;
  skills: MarketplaceSkillItem[];
}

export interface ParsedSkillFrontmatter {
  name?: string;
  description?: string;
  author?: string;
  tags?: string[];
  version?: string;
  homepage?: string;
  body: string;
}
