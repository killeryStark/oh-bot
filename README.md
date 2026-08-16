# Obsidian Harness Bot (`obsidian-harness-bot`)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-v1.6.0%2B-purple.svg)](https://obsidian.md)
[![Mobile Compatible](https://img.shields.io/badge/Mobile-iOS%20%7C%20Android-brightgreen.svg)](https://obsidian.md)

**Obsidian Harness Bot** is an open-source Obsidian plugin that brings an autonomous multi-step AI Agent into your vault across **Desktop and Mobile (iOS & Android)**.

Unlike typical single-turn AI chat interfaces, `obsidian-harness-bot` provides a multi-step agent harness loop capable of executing tool calls (reading notes, creating files, searching vault content, patching documents, managing skills) until its task is complete.

---

## Key Features

- 📱 **100% Cross-Platform (Mobile & Desktop)**: Built with web-standard APIs and Obsidian APIs. Zero dependencies on Node.js native modules (`fs`, `child_process`, `net`).
- 🧠 **Extensible Skills System (`SKILL.md` Standard)**: Cross-compatible with Cloud Code, OpenCode, Antigravity, and Claude Code skills.
- ⚡ **Dynamic Slash Commands (`/`)**: Type `/` to access built-in commands (`/sessions`, `/new`, `/clear`, `/export`, `/skills`) and all active skills (`/skill-creator`, `/brainstorming`, etc.).
- 🛒 **Skills Marketplace & Smart Git Importer**: Install curated skills in 1 click or import any skill directly from a GitHub repository URL (`https://github.com/owner/repo`, folder `/tree/...`, or raw URL).
- 📂 **Local Vault Skills Scanner**: Automatically discovers and synchronizes skills from `.agents/skills/`, `.skills/`, `.claude/skills/`, `.gemini/skills/` with symlink protection, deduplication, and SemVer conflict resolution.
- 🛠️ **Autonomous Agent Tools**:
  - `web_search`: Zero-config DuckDuckGo web search, SearXNG, or Tavily.
  - `fetch_web_page`: Extract clean Markdown content from URLs without scripts/ads.
  - `generate_pdf`: Client-side Anthropic-grade styled PDF document generation into the Vault (Mobile & Desktop).
  - `vault_read_file`: Inspect note contents.
  - `vault_create_file`: Create new Markdown files or documents.
  - `vault_patch_file`: Edit or append text to existing notes.
  - `vault_list_dir`: Explore vault folder structure.
  - `vault_search_notes`: Search notes by keywords or tags.
  - `create_skill`: Allows the agent to create and register custom skills directly into internal workflow storage.
  - `read_skill` & `list_skills`: Inspect and discover registered skills.
- 🔌 **Dynamic Provider Management**: Manage built-in presets (OpenRouter, Anthropic, Google Gemini, OpenAI, Ollama) and add unlimited custom OpenAI-compatible endpoints with auto-model discovery!
- 🔐 **Secure SecretStorage**: API keys are saved using Obsidian's official `SecretStorage` API (`app.secretStorage`), keeping secrets safe from plaintext sync leaks.
- ⚡ **Optimized Prompt Caching (>98% Cache Hits)**: Immutable system prompt structures, sorted tool JSON schemas, and Anthropic/OpenRouter `cache_control` headers minimize API token costs.
- 🎨 **Rich Markdown Rendering**: Full markdown formatting for chat messages and thoughts, with clean structured Markdown output on export (`Agent Chats/`).

---

## Skills System & Marketplace

Obsidian Harness Bot includes a first-class skills management engine compatible with the industry `SKILL.md` standard.

### Built-in & Starter Skills:
* **`skill-creator`** *(Adapted from Anthropic)*: Interactive agent workflow to design, refine, and register new custom skills and slash commands directly into your bot.
* **`brainstorming`** *(superpowers-org)*: Collaborative step-by-step idea generation, architecture design, and specification writing.
* **`pkm-researcher`**: Deep multi-note knowledge synthesis, link analysis, and research report drafting across your vault.
* **`code-architect`**: Code analysis, refactoring, DataviewJS / Templater script design, and verification.
* **`daily-journal-coach`**: Daily log analysis, productivity coaching, and reflection summarization.
* **`markdown-stylist`**: Typography cleanup, structured heading hierarchy, tables, and formatting polish.

### Using Skills:
1. **Direct Slash Command**: Type `/[skill-id] <your prompt>` in chat (e.g. `/brainstorming Design a new habit tracker note`). The skill's methodology is injected with highest priority into the agent context.
2. **Autonomous Activation**: The agent is aware of all registered skills and can follow their instructions automatically when relevant.
3. **Skills Manager GUI**: Open via the `/skills` command or through **Settings → Obsidian Harness Bot → Skills & Marketplace** to search, toggle, view markdown instructions, update from Git, or install from the marketplace.

---

## Web Search & Deep Research (`web_search` & `fetch_web_page`)

Obsidian Harness Bot equips the agent with native internet research capabilities that work seamlessly on **Mobile (iOS & Android)** and **Desktop** without CORS issues:

- 🔍 **`web_search`**:
  - **DuckDuckGo (Default, Free & Zero-Config)**: Search the web immediately without signing up for third-party API keys or external services.
  - **SearXNG Support**: Connect to your private self-hosted SearXNG instance by providing your custom instance URL.
  - **Tavily Search API**: Optional cloud search engine support with API key securely stored in Obsidian's `SecretStorage`.
- 📖 **`fetch_web_page`**:
  - Fetches and converts full web pages into clean, readable Markdown.
  - Automatically strips navigation bars, scripts, stylesheets, ads, headers, footers, and cookie banners.
  - Includes smart content truncation and anti-bot / Cloudflare challenge detection.

Configure your active search provider under **Settings → Obsidian Harness Bot → Web Search & Document Tools**.

---

## Client-Side PDF Generation (`generate_pdf`)

Generate beautifully formatted, publication-ready PDF documents and executive reports directly into your Obsidian Vault:

- 📱 **100% Pure Client-Side (Mobile & Desktop)**: Uses an in-memory `html2canvas` + `jsPDF` canvas-slicing pipeline in JavaScript. Zero dependencies on Node.js CLI tools, external servers, or browser print dialogs.
- 🔤 **Full Unicode & Cyrillic Support**: High-DPI (Retina 2x) rendering ensures crisp, native typography for Russian (Cyrillic), English, Asian scripts, emojis, and math symbols.
- 🎨 **Anthropic-Grade Themes**:
  - `anthropic-report` (Default): Modern aesthetic with terracotta accents (`#cc6b49`), clean typography, callout cards, zebra-striped tables, header metadata, and page breaks.
  - `academic`: Formal serif typography (Georgia), compact academic tables, and numbered headings.
  - `minimal`: Clean monochrome styling with high-contrast borders.
  - `raw`: Unstyled HTML/Markdown structure.
- 📂 **Direct Vault Persistence**: Automatically creates missing parent directories recursively and writes binary `.pdf` files into your vault (`app.vault.createBinary`).
- 🛡️ **Strict Safety Mode**: Integrated with the plugin's mutation safety system to request user confirmation before modifying the vault.

---

## Supported Providers & Presets

- **OpenRouter** (Claude 3.7 Sonnet, DeepSeek R1, GPT-4o, Llama 3.3)
- **Anthropic API** (Direct Claude 3.7 Sonnet, Claude 3.5 Haiku)
- **Google Gemini / AI Studio** (Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 2.0 Flash)
- **OpenAI API** (Direct GPT-4o, GPT-4o-mini, o3-mini)
- **Ollama / Local Models** (Llama 3.3, Qwen 2.5, DeepSeek-R1)
- **Custom OpenAI-Compatible Endpoints** (DeepSeek, Groq, Together AI, LM Studio, etc.)

---

## Model Context Protocol (MCP) Servers

Obsidian Harness Bot includes a full **web-based MCP client** that connects to remote MCP servers over HTTP — no `stdio`, no Node.js, fully compatible with iOS, Android, and Desktop.

### Highlights

- 🌐 **Remote Streamable HTTP & SSE**: Connects to any MCP server that exposes an HTTP POST / Server-Sent Events endpoint (e.g. `https://ai.todoist.net/mcp`).
- 📦 **MCP Catalog**: One-click install from a curated catalog of popular MCP services (Todoist, Web Search, etc.) via the `/mcp` command or Settings.
- 🔐 **Obsidian SecretStorage Integration**: API tokens are stored through Obsidian's official `SecretComponent` / `app.secretStorage` API — the same mechanism used for model provider keys. Tokens never leak into `data.json`.
- 🛡️ **CORS-Free on Mobile**: All HTTP calls use Obsidian's native `requestUrl` API, bypassing WebView CORS restrictions on iOS and Android.
- ⚡ **Robust SSE JSON Parser**: Many MCP servers (including Todoist) return responses wrapped in SSE format (`event: message\ndata: {...}`) with unescaped control characters in large instruction payloads. The built-in `parseJsonSafely` parser handles all of this transparently.
- 🔧 **Auth Methods**: Bearer Token, Custom Header (`X-API-Key`), OAuth 2.1 (PKCE), or no auth for public endpoints.

### Usage

1. Open `/mcp` command or go to **Settings → MCP Servers → Open MCP Servers**.
2. Click **"Browse Catalog"** to install a pre-configured server, or **"Add Custom Server"** to enter any remote MCP endpoint URL.
3. Paste your API token — it will be saved securely in Obsidian's Secret Storage.
4. The agent automatically discovers available tools and can invoke them during conversations.

---

## Installation

### Via BRAT (Obsidian 42 BRAT)
1. Install the **Obsidian42 - BRAT** plugin from Obsidian Community Plugins.
2. Add this repository URL: `https://github.com/killeryStark/oh-bot`.
3. Enable **Obsidian Harness Bot** in plugin settings.

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [Release](https://github.com/killeryStark/oh-bot/releases).
2. Create folder `.obsidian/plugins/obsidian-harness-bot/` inside your vault.
3. Copy the downloaded files into that folder.
4. Reload Obsidian and enable the plugin.

---

## Development & Building

```bash
# Install dependencies
npm install

# Type-check / lint
npm run lint

# Build production bundle
npm run build
```

---

## Contributing

We welcome contributions! Please review [`CONTRIBUTING.md`](./CONTRIBUTING.md) for architecture guidelines, mobile-first requirements, and rules for creating new `AgentTool` modules.

---

## License

[MIT License](./LICENSE) © 2026 Obsidian Harness Contributors
