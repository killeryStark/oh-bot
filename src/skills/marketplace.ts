import { requestUrl } from 'obsidian';
import { MarketplaceManifest, MarketplaceSkillItem } from './types';

export const OFFICIAL_MARKETPLACE_URL =
  'https://raw.githubusercontent.com/killeryStark/oh-bot/main/marketplace/skills.json';

export const BUILTIN_MARKETPLACE_SKILLS: MarketplaceSkillItem[] = [
  {
    id: 'skill-creator',
    name: 'Skill Creator',
    description: 'Создание, проектирование и доработка новых скиллов и слэш-команд для Obsidian Harness Bot',
    author: 'Anthropic / Adapted',
    homepage: 'https://github.com/anthropics/skills/tree/main/skills/skill-creator',
    downloadUrl: 'https://raw.githubusercontent.com/killeryStark/oh-bot/main/marketplace/skills/skill-creator/SKILL.md',
    version: '1.0.0',
    tags: ['skills', 'meta', 'workflow', 'creation'],
  },
  {
    id: 'brainstorming',
    name: 'Brainstorming & Design',
    description: 'Пошаговая разработка идей, архитектуры и спецификаций через структурированный диалог',
    author: 'superpowers-org',
    homepage: 'https://github.com/superpowers-org/skills',
    downloadUrl: 'https://raw.githubusercontent.com/superpowers-org/skills/main/skills/brainstorming/SKILL.md',
    version: '1.1.0',
    tags: ['planning', 'design', 'workflow'],
  },
  {
    id: 'pkm-researcher',
    name: 'Vault PKM Researcher',
    description: 'Глубокое исследование заметок в хранилище, синтез связей и подготовка аналитических отчетов',
    author: 'Obsidian Harness Contributors',
    homepage: 'https://github.com/killeryStark/oh-bot',
    downloadUrl: 'https://raw.githubusercontent.com/killeryStark/oh-bot/main/marketplace/skills/pkm-researcher/SKILL.md',
    version: '1.0.0',
    tags: ['research', 'obsidian', 'notes'],
  },
  {
    id: 'code-architect',
    name: 'Code & Script Architect',
    description: 'Проектирование, аудит, рефакторинг кода и написание автоматизаций для Obsidian',
    author: 'Obsidian Harness Contributors',
    homepage: 'https://github.com/killeryStark/oh-bot',
    downloadUrl: 'https://raw.githubusercontent.com/killeryStark/oh-bot/main/marketplace/skills/code-architect/SKILL.md',
    version: '1.0.0',
    tags: ['coding', 'refactoring', 'scripts'],
  },
  {
    id: 'daily-journal-coach',
    name: 'Daily Journal Coach',
    description: 'Анализ ежедневных заметок, выявление паттернов продуктивности и формулирование саммари дня',
    author: 'Obsidian Harness Contributors',
    homepage: 'https://github.com/killeryStark/oh-bot',
    downloadUrl: 'https://raw.githubusercontent.com/killeryStark/oh-bot/main/marketplace/skills/daily-journal-coach/SKILL.md',
    version: '1.0.0',
    tags: ['productivity', 'journal', 'pkm'],
  },
  {
    id: 'markdown-stylist',
    name: 'Markdown Formatter & Stylist',
    description: 'Приведение заметок к идеальной типографике, структурирование заголовков, таблиц и списков',
    author: 'Obsidian Harness Contributors',
    homepage: 'https://github.com/killeryStark/oh-bot',
    downloadUrl: 'https://raw.githubusercontent.com/killeryStark/oh-bot/main/marketplace/skills/markdown-stylist/SKILL.md',
    version: '1.0.0',
    tags: ['formatting', 'markdown', 'typography'],
  },
  {
    id: 'subagent-management',
    name: 'Subagent & Multi-Agent Management',
    description: 'Создание, настройка и координация специализированных субагентов с изолированными рабочими папками (AGENT.md) и делегирование задач через invoke_subagent. Используйте всякий раз, когда пользователю нужно организовать многоагентную систему, создать нового агента-помощника, настроить рабочую область или делегировать сложную задачу.',
    author: 'Obsidian Harness Contributors',
    homepage: 'https://github.com/killeryStark/oh-bot',
    downloadUrl: 'https://raw.githubusercontent.com/killeryStark/oh-bot/main/marketplace/skills/subagent-management/SKILL.md',
    version: '1.0.0',
    tags: ['agents', 'subagents', 'orchestration', 'multi-agent', 'workflow'],
  },
];

export class MarketplaceRegistry {
  /**
   * Fetches latest skills catalog from remote URL or falls back to built-in list.
   */
  static async fetchCatalog(customUrl?: string): Promise<MarketplaceSkillItem[]> {
    const targetUrl = customUrl?.trim() || OFFICIAL_MARKETPLACE_URL;

    try {
      const res = await requestUrl({ url: targetUrl, method: 'GET' });
      if (res.status === 200 && res.text) {
        const manifest: MarketplaceManifest = JSON.parse(res.text);
        if (manifest && Array.isArray(manifest.skills)) {
          return manifest.skills;
        }
      }
    } catch (err) {
      console.warn('[oh-bot] Could not fetch remote marketplace catalog, using built-ins:', err);
    }

    return BUILTIN_MARKETPLACE_SKILLS;
  }
}
