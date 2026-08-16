# Implementation Plan: Web Search, Fetch Page & Mobile PDF Generation Tools

**Spec Reference:** [`docs/superpowers/specs/2026-08-16-web-search-and-pdf-generation-tools-design.md`](file:///home/dietpi/code/oh-bot/docs/superpowers/specs/2026-08-16-web-search-and-pdf-generation-tools-design.md)  
**Target Platform:** Obsidian Desktop (macOS/Windows/Linux) & Obsidian Mobile (iOS/iPadOS/Android)

---

## Proposed Tasks

### Task 1: Package Dependencies & Bundle Setup
- [x] Install `jspdf` and `@types/jspdf` for in-memory pure client-side PDF document compilation.
- [x] Verify `esbuild.config.mjs` bundles `jspdf` seamlessly for Obsidian mobile/desktop.

### Task 2: Data Models & Settings Extension
- [x] Update `src/types.ts`:
  - Export `type SearchProviderType = 'duckduckgo' | 'searxng' | 'tavily';`
  - In `HarnessSettings` interface, add:
    - `searchProvider?: SearchProviderType;` (or required with default in DEFAULT_SETTINGS)
    - `searxngUrl?: string;`
    - `tavilyApiKeySecretName?: string;`
    - `defaultPdfFolder?: string;`
  - In `DEFAULT_SETTINGS`, populate:
    - `searchProvider: 'duckduckgo'`,
    - `searxngUrl: 'http://localhost:8080'`,
    - `tavilyApiKeySecretName: 'oh_bot_secret_tavily'`,
    - `defaultPdfFolder: 'Documents/Generated'`.

### Task 3: Search Engine Adapters & Router
- [ ] Create `src/tools/web/types.ts` for search results and provider interfaces.
- [ ] Implement `src/tools/web/adapters/duckduckgo.ts`:
  - Free, zero-config HTML parsing via `requestUrl` and `DOMParser`.
  - Extract titles, direct URLs, and snippets.
- [ ] Implement `src/tools/web/adapters/searxng.ts`:
  - Self-hosted / custom SearXNG JSON API adapter.
- [ ] Implement `src/tools/web/adapters/tavily.ts`:
  - Optional Tavily Search API adapter with secret key resolution.
- [ ] Implement `src/tools/web/router.ts`:
  - Dynamic routing based on plugin settings.

### Task 4: Web Content Extractor (`fetch_web_page`)
- [ ] Implement `src/tools/web/reader.ts`:
  - Fetch HTML with `requestUrl`.
  - DOM-based sanitization (strip scripts, styles, nav, footer, header, ads).
  - Convert structured content to clean, readable Markdown.
  - Apply `maxLength` limits with overflow notice.

### Task 5: PDF Generation Engine & Themes
- [ ] Create `src/tools/pdf/themes.ts`:
  - Anthropic Report theme (modern typography, callouts, zebra tables, headers, page numbers).
  - Academic & Minimal themes.
- [ ] Implement `src/tools/pdf/generator.ts`:
  - Offscreen DOM container rendering.
  - Vector PDF generation via `jsPDF`.
  - Recursive folder creation and binary write (`app.vault.createBinary` / `modifyBinary`).
  - Strict DOM cleanup in `finally` blocks to prevent mobile memory leaks.

### Task 6: Agent Tools Implementation
- [ ] Implement `src/tools/web/search-tool.ts` (`web_search`).
- [ ] Implement `src/tools/web/fetch-page-tool.ts` (`fetch_web_page`).
- [ ] Implement `src/tools/pdf/generate-pdf-tool.ts` (`generate_pdf`).

### Task 7: Tool Registry Registration
- [ ] Update `src/tools/registry.ts`:
  - Register `web_search`, `fetch_web_page`, and `generate_pdf` into the default toolset.
  - Pass plugin settings / App context where needed.

### Task 8: Settings Tab UI Additions
- [ ] Update `src/ui/settings-tab.ts`:
  - Add **Web Search & Document Tools** section.
  - Search Provider dropdown (`DuckDuckGo`, `SearXNG`, `Tavily`).
  - Conditional input for SearXNG URL and Tavily API key.
  - Default PDF folder path input.

### Task 9: CSS Styling
- [ ] Update `styles.css`:
  - Add styles for new settings controls.
  - Add base styles for PDF generation containers.

### Task 10: Build Verification & Git Commit
- [ ] Run `npm run lint` and `npm run build` to verify clean compilation.
- [ ] Commit all changes to the Git repository.
