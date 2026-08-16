# Design Specification: Web Search, Page Fetcher & Mobile PDF Generation Tools

- **Status:** Approved
- **Date:** 2026-08-16
- **Target Plugin:** `obsidian-harness-bot` (v0.0.33-alpha)
- **Target Platforms:** Obsidian Desktop (macOS, Windows, Linux) and Obsidian Mobile (iOS, Android)

---

## 1. Overview & Motivation

Obsidian Harness Bot is an AI agent harness running inside Obsidian. Currently, the agent can interact with Vault files (read, create, patch, list, search) and communicate with MCP servers.

To make the agent truly autonomous and production-ready for deep research, data gathering, and executive artifact creation, two critical capabilities are required:
1. **Zero-Config, Free & Local Web Search + Web Page Fetching**: Enabling the agent to query the internet and retrieve up-to-date information without mandatory paid API subscriptions (Tavily/Brave), while remaining 100% compatible with Obsidian Mobile.
2. **Client-Side, Mobile-Ready PDF Document Generation**: Enabling the agent to design and produce beautifully styled, publication-grade PDF reports (in the aesthetic style of Anthropic Claude artifacts) directly into the user's Obsidian Vault.

---

## 2. Goals & Non-Goals

### Goals
- **Mobile-First & Cross-Platform**: All tools must work seamlessly on iOS, Android, and Desktop without requiring Node.js native binary addons, external CLI utilities, or browser print dialogs.
- **Zero-Config Web Search**: Out-of-the-box free web search via DuckDuckGo using Obsidian's native `requestUrl` (bypassing CORS on all platforms).
- **Pluggable Search Engines**: Optional user configuration for self-hosted SearXNG instances or Tavily API keys.
- **Web Content Reading**: Clean HTML-to-Markdown extraction for full-page reading with script/style/ad stripping and token budget truncation.
- **Anthropic-Grade PDF Aesthetics**: Professional document templates (`anthropic-report`, `academic`, `minimal`) with headers, footers, callouts, tables, and page numbering.
- **Silent Vault Persistence**: Generated PDFs are compiled to binary buffers in memory and saved directly into the Vault using `app.vault.createBinary()` / `modifyBinary()`.

### Non-Goals
- Headless browser rendering via Puppeteer or Playwright (incompatible with Obsidian Mobile).
- Running local SearXNG server binaries inside Obsidian (user can connect to their own external or localhost instance).
- Interactive GUI PDF editor (the agent compiles the document programmatically).

---

## 3. Architecture & Component Diagram

```
                             +-------------------------------+
                             |    AI Agent Execution Loop    |
                             +---------------+---------------+
                                             |
                                             v
                             +---------------+---------------+
                             |         ToolRegistry          |
                             +-------+---------------+-------+
                                     |               |
               +---------------------+               +---------------------+
               v                                                           v
+-------------------------------+                         +-------------------------------+
|     Web Search & Fetch        |                         |         PDF Generator         |
|  - web_search                 |                         |  - generate_pdf               |
|  - fetch_web_page             |                         +---------------+---------------+
+--------------+----------------+                                         |
               |                                                          v
               v                                          +-------------------------------+
+-------------------------------+                         |       Template Styler         |
|      SearchEngineRouter       |                         | (Anthropic / Academic / Min)  |
|  - DuckDuckGoAdapter (default)|                         +---------------+---------------+
|  - SearXNGAdapter (custom URL)|                                         |
|  - TavilyAdapter (API key)    |                                         v
+--------------+----------------+                         +-------------------------------+
               |                                          |   Offscreen DOM Container     |
               v                                          +---------------+---------------+
+-------------------------------+                                         |
|    WebPageReader / Parser     |                                         v
| (Sanitization -> Markdown)    |                         +-------------------------------+
+--------------+----------------+                         |     jsPDF Vector Pipeline     |
               |                                          +---------------+---------------+
               v                                                          |
+-------------------------------+                                         v
|     Obsidian requestUrl()     |                         +-------------------------------+
|  (CORS-free mobile & desktop) |                         |  Vault Binary Writer          |
+-------------------------------+                         |  app.vault.createBinary()     |
                                                          +-------------------------------+
```

---

## 4. Tool Specifications

### 4.1. `web_search`
- **Name**: `web_search`
- **Description**: Search the web for relevant pages, news, and documentation using the configured search provider (DuckDuckGo by default).
- **Parameters**:
  ```json
  {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query string."
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of search results to return (default: 5, max: 10)."
      }
    },
    "required": ["query"]
  }
  ```
- **Output Format**:
  ```markdown
  ### Search Results for "query":

  1. **[Title](url)**
     > Snippet content...

  2. **[Title](url)**
     > Snippet content...
  ```

### 4.2. `fetch_web_page`
- **Name**: `fetch_web_page`
- **Description**: Fetch and extract clean text/markdown content from a specific web URL, stripping headers, footers, navigation, scripts, and ads.
- **Parameters**:
  ```json
  {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "The full HTTP/HTTPS URL of the web page."
      },
      "maxLength": {
        "type": "number",
        "description": "Maximum character length of returned content (default: 8000)."
      }
    },
    "required": ["url"]
  }
  ```
- **Output Format**:
  ```markdown
  # Page Title
  **Source**: https://example.com/article

  Clean markdown content extracted from page...
  ```

### 4.3. `generate_pdf`
- **Name**: `generate_pdf`
- **Description**: Generate a styled PDF document and save it directly into the Obsidian Vault.
- **Parameters**:
  ```json
  {
    "type": "object",
    "properties": {
      "filePath": {
        "type": "string",
        "description": "Target file path in the Vault (e.g., 'Reports/Market_Analysis.pdf')."
      },
      "content": {
        "type": "string",
        "description": "The HTML or Markdown content to render into the PDF document."
      },
      "title": {
        "type": "string",
        "description": "Optional title for document header and cover page."
      },
      "theme": {
        "type": "string",
        "enum": ["anthropic-report", "academic", "minimal", "raw"],
        "description": "Visual typography and layout theme (default: 'anthropic-report')."
      },
      "pageSize": {
        "type": "string",
        "enum": ["a4", "letter"],
        "description": "Page size format (default: 'a4')."
      },
      "orientation": {
        "type": "string",
        "enum": ["portrait", "landscape"],
        "description": "Page orientation (default: 'portrait')."
      }
    },
    "required": ["filePath", "content"]
  }
  ```
- **Output Format**:
  ```json
  {
    "success": true,
    "output": "Successfully generated PDF at \"Reports/Market_Analysis.pdf\" (Size: 42,150 bytes)."
  }
  ```

---

## 5. Technical Implementation Details

### 5.1. Search Engine Router & Adapters (`src/tools/web/`)
- **`DuckDuckGoAdapter`**:
  - Sends a `GET` request via `requestUrl` to `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`.
  - Uses `DOMParser` to parse the response.
  - Extracts results from `.results_links_deep` and `.result__body`.
  - Normalizes DuckDuckGo redirect URLs (`//duckduckgo.com/l/?uddg=${url}`).
- **`SearXNGAdapter`**:
  - Queries `{customUrl}/search?q=${encodeURIComponent(query)}&format=json`.
  - Maps `results` array (`title`, `url`, `content`).
- **`TavilyAdapter`**:
  - Posts to `https://api.tavily.com/search` with JSON payload `{ query, max_results }` and `Authorization: Bearer ${apiKey}`.

### 5.2. Web Content Extractor (`src/tools/web/reader.ts`)
- Fetches HTML using `requestUrl`.
- Sanitizes with DOM parser: removes `<script>`, `<style>`, `<noscript>`, `<nav>`, `<footer>`, `<header>`, `<aside>`, `<svg>`, forms, iframes.
- Converts main content container (`<main>`, `<article>`, or `<body>`) to clean Markdown (headers, paragraphs, bold/italic, bullet lists, tables, links).
- Enforces character limit (`maxLength`) with truncation indicator.

### 5.3. PDF Generation Engine (`src/tools/pdf/`)
- Utilizes `jspdf` (and optional `html2canvas` / DOM rendering pipeline).
- Creates an offscreen DOM element with isolated CSS resets and the selected theme styles:
  - **`anthropic-report`**: Modern clean aesthetic, high legibility, subtle `#f8f9fa` callouts with accent border, modern typography, structured tables, header title, footer page numbering (`Page X of Y`).
  - **`academic`**: Serif typography, formal section numbering, compact spacing.
  - **`minimal`**: Monochrome clean document layout.
- Renders the DOM into vector/canvas PDF pages.
- Produces an `ArrayBuffer` directly in JS memory.
- Ensures directory exists using `app.vault.createFolder` recursively.
- Saves file using `app.vault.createBinary` (or `app.vault.modifyBinary` if already existing).
- Safely cleans up the offscreen DOM element.

### 5.4. Settings Data Model Updates (`src/types.ts`)
```typescript
export type SearchProviderType = 'duckduckgo' | 'searxng' | 'tavily';

export interface HarnessSettings {
  // Existing fields...
  searchProvider: SearchProviderType;
  searxngUrl: string;
  tavilyApiKeySecretName: string;
  defaultPdfFolder: string;
}
```

---

## 6. Error Handling & Edge Cases

1. **Network Timeout / Failure**: Both search and web reader wrap calls in `try/catch` and return clear error messages to the agent rather than crashing.
2. **Rate Limiting / Captcha**: If a web page returns HTTP 403 or Cloudflare challenge, the reader cleanly reports that the target page is restricted.
3. **Invalid File Paths**: PDF generator automatically sanitizes path strings, trims leading slashes, ensures `.pdf` extension, and recursively creates any missing parent directories.
4. **Memory Management**: Offscreen DOM nodes used during PDF rendering are always detached in a `finally` block to avoid leaks on constrained mobile devices.

---

## 7. Verification & Testing

1. **Unit & Integration Testing**:
   - Verify DuckDuckGo HTML scraping and URL sanitization.
   - Verify SearXNG JSON response parsing.
   - Verify HTML-to-Markdown reader formatting and truncation.
   - Verify PDF binary compilation into Vault.
2. **Build Validation**:
   - Validate TypeScript compilation (`npm run lint`).
   - Validate esbuild production bundling (`npm run build`).
3. **Mobile & Desktop End-to-End**:
   - Verify execution on Desktop and Mobile without platform-specific crashes.
