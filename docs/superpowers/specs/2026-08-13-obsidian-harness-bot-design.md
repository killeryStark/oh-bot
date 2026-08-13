# Design Specification: obsidian-harness-bot

**Date:** 2026-08-13  
**Status:** Approved  
**Repository Name:** `obsidian-harness-bot`  
**License:** MIT  

---

## 1. Overview & Goals

`obsidian-harness-bot` is an open-source Obsidian plugin providing a multi-step Agent Harness UI and execution loop directly inside Obsidian. It enables users to interact with AI models (via OpenRouter, OpenAI, Anthropic, or Ollama/custom OpenAI-compatible endpoints) that can autonomously plan, inspect, read, create, and patch notes inside the user's Obsidian Vault.

### Key Requirements
- **Cross-Platform Compatibility**: Must run seamlessly on all Obsidian platforms, including **Mobile (iOS/Android)** and **Desktop (macOS/Windows/Linux)**. Absolutely **no dependencies** on Node.js-specific modules (`fs`, `child_process`, `net`, `http`, `crypto`). Network requests use `obsidian.requestUrl` or standard `fetch`.
- **Secure Secret Storage**: API keys are securely managed using Obsidian's official `SecretStorage` and `SecretComponent` APIs (`app.secretStorage`), preventing plaintext leaks into synced `data.json` files.
- **Multi-Step Agent Harness**: Executes multi-turn tool loops with model reasoning, tool invocations (`vault_read_file`, `vault_create_file`, `vault_patch_file`, `vault_list_dir`, `vault_search_notes`), and safety confirmation dialogues.
- **Prompt Caching (>98% Cache-Hit Target)**: Frozen system prompts, deterministically sorted JSON schemas for tools, append-only conversation log, and explicit `cache_control` markers for Anthropic/OpenRouter.
- **Hidden Context Injection**: Automatically appends current date and time to user message payloads when sending to LLM servers, while keeping UI rendering, local chat history, and Markdown exports completely clean of this metadata.
- **Open Source Foundation**: Full project initialization with `README.md`, `CONTRIBUTING.md`, `LICENSE` (MIT), TypeScript config, ESLint, and GitHub Actions (CI + Release workflows).

---

## 2. Architecture & File Structure

```
obsidian-harness-bot/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                 # Type check, lint & build verification
│   │   └── release.yml            # Automated Obsidian release build on git tag
├── src/
│   ├── main.ts                    # Plugin entry point (HarnessPlugin)
│   ├── types.ts                   # Core interfaces, provider types, tool schemas
│   ├── engine/
│   │   ├── agent.ts               # Multi-step Agent Harness execution loop
│   │   ├── stream-parser.ts       # Cross-platform SSE stream parser
│   │   └── providers/             # LLM API Adapters
│   │       ├── base.ts            # Abstract LLMProvider interface
│   │       ├── openrouter.ts      # OpenRouter provider adapter
│   │       ├── openai.ts          # OpenAI & Custom OpenAI-compatible adapter
│   │       ├── anthropic.ts       # Anthropic direct API adapter
│   │       └── ollama.ts          # Ollama local endpoint adapter
│   ├── tools/
│   │   ├── base.ts                # Abstract AgentTool class
│   │   ├── registry.ts            # Tool Registry with deterministic JSON sorting
│   │   └── vault/                 # V1 Vault Tools
│   │       ├── read-file.ts       # vault_read_file
│   │       ├── create-file.ts     # vault_create_file
│   │       ├── patch-file.ts      # vault_patch_file
│   │       ├── list-dir.ts        # vault_list_dir
│   │       └── search-notes.ts    # vault_search_notes
│   ├── ui/
│   │   ├── settings-tab.ts        # PluginSettingsTab with SecretComponent
│   │   ├── chat-view.ts           # ItemView sidebar chat panel
│   │   └── components/            # UI components (MessageList, ToolCallCard, ConfirmationModal)
│   └── utils/
│       ├── secrets.ts             # SecretStorage API wrappers
│       ├── cache-helpers.ts       # Prompt caching & payload formatting helpers
│       └── markdown-exporter.ts   # Chat history to Markdown exporter
├── CONTRIBUTING.md                # Open Source contribution guidelines
├── LICENSE                        # MIT License
├── README.md                      # Project overview & installation guide
├── manifest.json                  # Obsidian plugin manifest
├── styles.css                     # Custom styles for chat view & modal
├── tsconfig.json                  # TypeScript compiler settings
└── package.json                   # Build scripts & dev dependencies
```

---

## 3. Secret Storage & Settings Management

### SecretStorage API Integration
API keys are stored securely using Obsidian's native `SecretStorage` API (`app.secretStorage`).

- **Settings Interface**:
  - `openRouterSecretName`: Name of secret stored for OpenRouter API key.
  - `openAiSecretName`: Name of secret stored for OpenAI API key.
  - `anthropicSecretName`: Name of secret stored for Anthropic API key.
  - `defaultProvider`: `'openrouter' | 'openai' | 'anthropic' | 'ollama'`.
  - `defaultModel`: Selected model string (e.g. `anthropic/claude-3.7-sonnet`, `gpt-4o`).
  - `customBaseUrl`: Optional custom Base URL (e.g. `http://localhost:11434/v1`).
  - `systemPrompt`: Customizable default system prompt.
  - `safetyMode`: `'strict'` (ask before file modification) or `'auto'` (auto-approve file edits).
  - `maxAgentSteps`: Maximum iterations per turn (default: `10`).

- **UI Implementation**:
  In `HarnessSettingTab`, API keys are presented using `SecretComponent`:
  ```ts
  new Setting(containerEl)
    .setName("OpenRouter API Key Secret")
    .setDesc("Select or create secret for OpenRouter API key")
    .addComponent(el => new SecretComponent(this.app, el)
      .setValue(this.plugin.settings.openRouterSecretName)
      .onChange(async (val) => {
        this.plugin.settings.openRouterSecretName = val;
        await this.plugin.saveSettings();
      }));
  ```

- **Retrieval at Runtime**:
  ```ts
  const apiKey = this.app.secretStorage.getSecret(secretName);
  ```

---

## 4. Multi-Step Agent Harness & Vault Tools

### Agent Harness Loop (`src/engine/agent.ts`)
1. **Initialize Harness Session**: Accepts user prompt, system prompt, active provider, selected model, registered tools, and settings.
2. **Turn Execution**:
   - Prepares request payload with frozen system prompt, sorted tool schemas, and history.
   - Inject hidden timestamp at the tail of the latest user prompt payload: `\n\n[Current Date & Time: ISO_TIMESTAMP]`.
   - Sends HTTP request via `obsidian.requestUrl` / `fetch`.
   - Parses streaming response (chunks/thoughts/tool_calls).
3. **Tool Invocation**:
   - If model requests a `tool_call`:
     - If tool modifies Vault files (`create_file`, `patch_file`) and `safetyMode === 'strict'`, trigger `ConfirmationModal` in UI.
     - Execute tool via Obsidian Vault API (`app.vault.adapter` / `app.vault`).
     - Append `tool_result` to history.
     - Re-run loop (increment `stepCount`).
4. **Completion**: Stop when model produces final answer (no tool call) or `stepCount >= maxAgentSteps`.

### Built-in V1 Vault Tools
1. `vault_read_file`: Reads text content of a note at given path.
2. `vault_create_file`: Creates a new Markdown file or attachment at given path.
3. `vault_patch_file`: Overwrites or appends text to an existing note.
4. `vault_list_dir`: Lists files and subfolders in a folder.
5. `vault_search_notes`: Performs keyword/tag search across Vault notes.

### Future Expansion Architecture (Roadmap)
- **Phase 2 (Skills)**: Dynamic instruction loading from Vault folder (`.obsidian/plugins/obsidian-harness-bot/skills/`).
- **Phase 3 (MCP)**: Model Context Protocol SSE/HTTP transport client integration.
- **Phase 4 (Math & Calc Tools)**: In-app JavaScript expression evaluator tool.

---

## 5. Prompt Caching & Hidden Payload Formatting

### High Cache-Hit Optimization (>98%)
1. **Deterministic Serialization**: Tool JSON schemas in request payloads are sorted alphabetically by tool name and parameter keys.
2. **Immutable System & Tool Prefix**: System prompt and tool declarations remain byte-identical across calls.
3. **Anthropic/OpenRouter Ephemeral Cache Control**:
   ```json
   {
     "system": [
       {
         "type": "text",
         "text": "SYSTEM_PROMPT_HERE",
         "cache_control": { "type": "ephemeral" }
       }
     ]
   }
   ```
4. **Append-Only History**: Historical messages (`user`, `assistant`, `tool_use`, `tool_result`) are appended without modifying previous turns.

### Hidden Date/Time Injection
- **UI & Export Representation**: `MessageItem.content` remains raw user text: `"Create a note for project planning"`.
- **Payload Preparation (Network Layer Only)**:
  ```ts
  function preparePayloadMessage(userText: string): string {
    const nowISO = new Date().toISOString();
    return `${userText}\n\n[Current Date & Time: ${nowISO}]`;
  }
  ```
- Result: Timestamp is transmitted to LLM API for situational awareness, but omitted from Chat UI, plugin state, and exported Markdown notes.

---

## 6. GUI & History Management

1. **Sidebar Chat Panel (`ItemView`)**:
   - Registered view type: `harness-chat-view`.
   - Header controls: Provider & Model Selector, Clear Chat, Settings shortcut, Export to Markdown button.
   - Message List: User messages, assistant responses with real-time SSE streaming, expandable tool call cards with execution status.
2. **Hybrid History Storage**:
   - Active chat session state saved in plugin memory / local session state (`data.json`).
   - "Export to Markdown" button exports chat log into a structured Markdown note in `Agent Chats/` folder in Vault.

---

## 7. Open Source Repository & Contributing Guidelines

1. **Repository**: `obsidian-harness-bot`
2. **License**: MIT
3. **`CONTRIBUTING.md`**:
   - Coding Standards: Strict TypeScript, mobile-first design (no Node.js native imports).
   - Tool Development Guide: How to add a new `AgentTool` class extending `base.ts`.
   - Testing & Linting: Run `npm run lint` and `npm run build` before opening PRs.
   - PR Workflow: Fork, branch, create clean commits, reference issue numbers.
4. **GitHub Workflows**:
   - `ci.yml`: Automated build check on pull requests.
   - `release.yml`: Automatic build of `main.js`, `manifest.json`, `styles.css` attached to GitHub Release when a version tag (`v*`) is pushed.

---

## 8. Verification & Acceptance Criteria
- [x] Builds cleanly with `npm run build` producing bundle `main.js`.
- [x] Zero Node.js polyfill requirements; runs on Obsidian iOS/Android mobile apps.
- [x] API keys stored exclusively via `SecretStorage`.
- [x] Multi-step agent loop correctly calls Vault tools up to `maxAgentSteps`.
- [x] Date/Time injected invisibly into network payloads.
- [x] Prompt caching headers (`cache_control`) included for supported providers.
- [x] Open source files (`README.md`, `CONTRIBUTING.md`, `LICENSE`, `.github/workflows/`) fully initialized.
