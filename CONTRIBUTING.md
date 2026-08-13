# Contributing to obsidian-harness-bot

Thank you for your interest in contributing to **obsidian-harness-bot**! This is an open-source project dedicated to building a cross-platform, multi-step AI Agent Harness plugin for Obsidian.

---

## 📜 Core Principles & Rules

### 1. Mobile-First & Cross-Platform Compatibility (Strict Rule)
- **NO Node.js Native Imports**: Never import `fs`, `child_process`, `net`, `http`, `crypto`, `os`, or `path` from Node.js.
- **Obsidian & Web APIs Only**: Use `obsidian.requestUrl` or global `fetch` for network calls. Use `this.app.vault` or `this.app.vault.adapter` for file operations.
- The plugin **must run cleanly** on iOS (JavaScriptCore) and Android (QuickJS/Hermes).

### 2. Secret Storage Guidelines
- Never store plaintext API keys in `data.json` or plugin setting objects.
- Always use Obsidian's `SecretStorage` API (`app.secretStorage.getSecret(...)`) and `SecretComponent` in setting tabs.

### 3. Prompt Caching & Determinism
- Tool definitions (`ToolSchema`) must have deterministically sorted JSON keys (alphabetical order).
- System prompts must remain byte-identical across multi-step turns to maximize LLM cache hit rates (>98%).
- Append-only conversation state: Do not reorder or alter historical messages in turn sequences.

### 4. Hidden Time Context
- When appending situational metadata (e.g. `[Current Date & Time: ISO]`), only inject it inside network payload construction helpers (`prepareNetworkPayload`).
- Never leak service/time metadata into UI message objects, plugin state, or Markdown exports.

---

## 🛠️ How to Add a New Agent Tool

All tools inherit from `AgentTool` (`src/tools/base.ts`). To create a new tool:

1. Create a file under `src/tools/` (e.g. `src/tools/custom/my-tool.ts`).
2. Extend `AgentTool`:
   ```ts
   import { AgentTool, ToolSchema, ToolResult } from '../base';
   import { App } from 'obsidian';

   export class MyCustomTool extends AgentTool {
     name = 'my_custom_tool';
     description = 'Clear description of what this tool does.';
     
     // Parameters schema (JSON Schema format)
     parameters: ToolSchema['parameters'] = {
       type: 'object',
       properties: {
         query: { type: 'string', description: 'Search term' }
       },
       required: ['query']
     };

     async execute(args: { query: string }, app: App): Promise<ToolResult> {
       // Perform action using Obsidian Vault API
       return { success: true, output: 'Result' };
     }
   }
   ```
3. Register the tool in `src/tools/registry.ts`.

---

## 🛠️ Development Workflow

1. **Fork and Clone the Repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/obsidian-harness-bot.git
   cd obsidian-harness-bot
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Type-Check & Build**:
   ```bash
   npm run lint
   npm run build
   ```
4. **Local Testing in Obsidian**:
   - Copy `main.js`, `manifest.json`, and `styles.css` into your local test vault's `.obsidian/plugins/obsidian-harness-bot/` folder.
   - Reload Obsidian and open the plugin settings/sidebar.

---

## 📬 Pull Request Checklist

Before submitting a Pull Request:
- [ ] Code compiles without errors (`npm run build`).
- [ ] TypeScript type checker passes (`npm run lint`).
- [ ] No Node.js native modules imported.
- [ ] Added/updated tools include deterministic parameter definitions.
- [ ] Commit messages follow Conventional Commits (e.g., `feat: ...`, `fix: ...`, `docs: ...`).

Thank you for helping build the future of AI Agents in Obsidian! 🚀
