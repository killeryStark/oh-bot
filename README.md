# Obsidian Harness Bot (`obsidian-harness-bot`)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-v1.6.0%2B-purple.svg)](https://obsidian.md)
[![Mobile Compatible](https://img.shields.io/badge/Mobile-iOS%20%7C%20Android-brightgreen.svg)](https://obsidian.md)

**Obsidian Harness Bot** is an open-source Obsidian plugin that brings an autonomous multi-step AI Agent into your vault across **Desktop and Mobile (iOS & Android)**.

Unlike typical single-turn AI chat interfaces, `obsidian-harness-bot` provides a multi-step agent harness loop capable of executing tool calls (reading notes, creating files, searching vault content, patching documents) until its task is complete.

---

## Key Features

- 📱 **100% Cross-Platform (Mobile & Desktop)**: Built with web-standard APIs and Obsidian APIs. Zero dependencies on Node.js native modules (`fs`, `child_process`, `net`).
- 🔌 **Dynamic Provider Management**: Manage built-in presets (OpenRouter, Anthropic, Google Gemini, OpenAI, Ollama) and add unlimited custom OpenAI-compatible endpoints with auto-model discovery!
- 🔐 **Secure SecretStorage**: API keys are saved using Obsidian's official `SecretStorage` API (`app.secretStorage`), keeping secrets safe from plaintext sync leaks.
- ⚡ **Optimized Prompt Caching (>98% Cache Hits)**: Immutable system prompt structures, sorted tool JSON schemas, and Anthropic/OpenRouter `cache_control` headers minimize API token costs.
- 🛠️ **Vault Agent Tools**:
  - `vault_read_file`: Inspect note contents.
  - `vault_create_file`: Create new Markdown files or documents.
  - `vault_patch_file`: Edit or append text to existing notes.
  - `vault_list_dir`: Explore vault folder structure.
  - `vault_search_notes`: Search notes by keywords or tags.
- 🕒 **Hidden Situation Awareness**: Current date and time are injected invisibly into network LLM payloads, while keeping your Chat UI, local history, and Markdown exports completely clean.
- 📤 **Export Chat to Markdown**: Save agent conversations into clean Markdown notes inside your vault (`Agent Chats/`).

---

## Supported Providers & Presets

- **OpenRouter** (Claude, DeepSeek, GPT-4o, Llama 3)
- **Anthropic API** (Direct Claude 3.7 Sonnet, Claude 3.5 Haiku)
- **Google Gemini / AI Studio** (Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 2.0 Flash)
- **OpenAI API** (Direct GPT-4o, GPT-4o-mini, o3-mini)
- **Ollama / Local Models** (Llama 3.3, Qwen 2.5, DeepSeek-R1)
- **Custom OpenAI-Compatible Endpoints** (DeepSeek, Groq, Together AI, LM Studio, etc.)

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
