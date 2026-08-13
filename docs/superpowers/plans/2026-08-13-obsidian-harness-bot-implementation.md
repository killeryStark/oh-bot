# Implementation Plan: obsidian-harness-bot

**Spec Reference:** [`docs/superpowers/specs/2026-08-13-obsidian-harness-bot-design.md`](file:///Users/killery/code/oh-bot/docs/superpowers/specs/2026-08-13-obsidian-harness-bot-design.md)  
**Target Platform:** Obsidian Desktop (macOS/Windows/Linux) & Obsidian Mobile (iOS/Android)  

---

## Proposed Tasks

### Task 1: Open Source Project Scaffold & Infrastructure
- [ ] Create `package.json` with build scripts (`esbuild`, `typescript`, `@types/node`, `obsidian`).
- [ ] Create `tsconfig.json` targeting ES2021, bundler resolution, strict mode.
- [ ] Create `manifest.json` (`minAppVersion: "1.6.0"`, `isDesktopOnly: false`).
- [ ] Create `styles.css` for Chat panel and modal components.
- [ ] Create `LICENSE` (MIT License).
- [ ] Create `README.md` with overview, installation (BRAT / manual), and features.
- [ ] Create `CONTRIBUTING.md` with guidelines, coding rules (mobile-first, no Node native imports), and tool development guide.
- [ ] Create `.github/workflows/ci.yml` and `.github/workflows/release.yml`.

### Task 2: Core Types & SecretStorage Settings Integration
- [ ] Implement `src/types.ts` defining all types (Settings, Provider, Messages, ToolCall, ToolResult, AgentTool, StepEvent).
- [ ] Implement `src/utils/secrets.ts` wrapping Obsidian `app.secretStorage.getSecret`.
- [ ] Implement `src/ui/settings-tab.ts` (`HarnessSettingTab`) using `SecretComponent` for API keys, provider dropdown, model selector, safety mode, max steps slider.

### Task 3: Provider Adapters, SSE Stream Parser & Prompt Caching
- [ ] Implement `src/utils/cache-helpers.ts` for deterministic JSON schema sorting, Anthropic `cache_control` markers, and hidden date/time injection in network payload (`prepareNetworkPayload`).
- [ ] Implement `src/engine/stream-parser.ts` for cross-platform SSE stream parsing.
- [ ] Implement `src/engine/providers/base.ts`, `openrouter.ts`, `openai.ts`, `anthropic.ts`, `ollama.ts` using `obsidian.requestUrl` / `fetch`.

### Task 4: Vault Tools & Tool Registry
- [ ] Implement `src/tools/base.ts` (`AgentTool` abstract class).
- [ ] Implement `src/tools/registry.ts` (`ToolRegistry` with deterministic tool sorting).
- [ ] Implement Vault tools:
  - `src/tools/vault/read-file.ts` (`vault_read_file`)
  - `src/tools/vault/create-file.ts` (`vault_create_file`)
  - `src/tools/vault/patch-file.ts` (`vault_patch_file`)
  - `src/tools/vault/list-dir.ts` (`vault_list_dir`)
  - `src/tools/vault/search-notes.ts` (`vault_search_notes`)

### Task 5: Agent Harness Execution Loop
- [ ] Implement `src/engine/agent.ts` (`AgentHarness` class) handling multi-step turn iteration, tool execution, safety confirmation triggers, and max step limits.

### Task 6: Chat View GUI & Plugin Entrypoint
- [ ] Implement `src/utils/markdown-exporter.ts` to export chat logs to `Agent Chats/Chat YYYY-MM-DD HH-mm.md`.
- [ ] Implement `src/ui/components/confirmation-modal.ts` (`ConfirmationModal` for strict mode edits).
- [ ] Implement `src/ui/chat-view.ts` (`HarnessChatView` sidebar panel with message history, tool cards, model picker, streaming output, export button).
- [ ] Implement `src/main.ts` (`HarnessPlugin` entrypoint) registering views, commands, ribbon icon, and settings tab.

### Task 7: Build Verification & Git Commit
- [ ] Run `npm run build` to verify clean compilation of `main.js`.
- [ ] Commit implementation files to Git repository.
