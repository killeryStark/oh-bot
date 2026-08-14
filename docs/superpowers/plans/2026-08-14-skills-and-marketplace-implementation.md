# Implementation Plan: Skills System and Marketplace for Obsidian Harness Bot

**Spec Reference:** [`docs/superpowers/specs/2026-08-14-skills-and-marketplace-design.md`](file:///Users/killery/code/oh-bot/docs/superpowers/specs/2026-08-14-skills-and-marketplace-design.md)  
**Target Platform:** Obsidian Desktop (macOS/Windows/Linux) & Obsidian Mobile (iOS/Android)

---

## Proposed Tasks

### Task 1: Marketplace Directory & Schema Scaffold
- [ ] Create `marketplace/skills.json` containing curated starter skills:
  - `brainstorming` (author: superpowers-org)
  - `pkm-researcher` (author: Obsidian Harness Contributors)
  - `code-architect` (author: Obsidian Harness Contributors)
  - `daily-journal-coach` (author: Obsidian Harness Contributors)
- [ ] Ensure the catalog schema is modular and ready for future `marketplace/mcp.json`.

### Task 2: Skills Types & Robust Frontmatter Parser
- [ ] Implement `src/skills/types.ts` with `SkillMetadata`, `MarketplaceManifest`, `MarketplaceSkillItem`, `SkillSourceType`.
- [ ] Implement `src/skills/frontmatter.ts` for fast, dependency-free YAML frontmatter extraction (`name`, `description`, `author`, `tags`, `version`, `homepage`) with fallback safety and SemVer version comparisons.

### Task 3: Smart Git URL Resolver & Fetcher
- [ ] Implement `src/skills/git-resolver.ts` supporting:
  - Full repo URLs: `https://github.com/owner/repo`
  - Tree/folder URLs: `https://github.com/owner/repo/tree/branch/subpath`
  - Blob & Raw URLs: `https://raw.githubusercontent.com/...` / `github.com/.../blob/...`
  - Short names: `owner/repo`
- [ ] Use Obsidian's `requestUrl` / standard `fetch` with error handling.

### Task 4: Vault Skills Scanner with Symlink & Deduplication Protection
- [ ] Implement `src/skills/vault-scanner.ts` scanning `.agents/skills/`, `.skills/`, `.claude/skills/`, `.gemini/skills/`, `skills/`.
- [ ] Implement canonical path resolution, content hashing, and SemVer/folder priority conflict resolution.

### Task 5: Marketplace Registry & Central SkillManager
- [ ] Implement `src/skills/marketplace.ts` loading bundled catalog and fetching remote manifest updates.
- [ ] Implement `src/skills/skill-manager.ts` unifying installed skills, local Vault skills, enable/disable toggles, deletion, and prompt directive generation.

### Task 6: Engine Integration & Slash Command Autocomplete
- [ ] Update `src/types.ts` (`HarnessSettings`, `DEFAULT_SETTINGS`) with `installedSkills`, `customMarketplaceUrl`, `scanVaultSkills`.
- [ ] Update `src/ui/chat-view.ts`:
  - Dynamically populate `/` popup with system commands + active skills.
  - Handle `/[skill-id]` message execution.
  - Add `/skills` command and chat header button.
- [ ] Update `src/engine/agent.ts` to inject active skill instructions with highest priority in the system context.

### Task 7: SkillsModal GUI & Settings Tab Integration
- [ ] Implement `src/ui/skills-modal.ts`:
  - Header with search, tabs, refresh button.
  - "Installed & Local" tab: cards, source badges, author links, toggle switches, view markdown modal, delete buttons.
  - "Marketplace & Import" tab: Git URL input + import button, catalog cards with 1-click install/uninstall.
- [ ] Update `src/ui/settings-tab.ts` to include a dedicated Skills section.

### Task 8: CSS Styling & UI Polish
- [ ] Update `styles.css` with responsive, theme-consistent styles for `SkillsModal`, skill cards, tags, badges, toggle switches, and slash suggest items.

### Task 9: Verification & Git Commit
- [ ] Run `npm run build` to verify clean TypeScript compilation and bundle packaging.
- [ ] Commit all changes to the Git repository.
