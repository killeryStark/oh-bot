# Implementation Plan: Web & Mobile MCP Servers for Obsidian Harness Bot

**Spec Reference:** [`docs/superpowers/specs/2026-08-14-web-mcp-servers-design.md`](file:///Users/killery/code/oh-bot/docs/superpowers/specs/2026-08-14-web-mcp-servers-design.md)  
**Target Platform:** Obsidian Desktop (macOS/Windows/Linux) & Obsidian Mobile (iOS/iPadOS/Android)

---

## Proposed Tasks

### Task 1: MCP Catalog Manifest Scaffold
- [x] Create `marketplace/mcp.json` containing curated starter remote MCP servers:
  - `todoist`: Official hosted Todoist MCP server (`https://ai.todoist.net/mcp`) supporting OAuth 2.1 & Personal Developer API Token.
- [x] Ensure JSON schema is extensible for future additions (Web Search, GitHub, etc.).

### Task 2: MCP Types & Settings Extension
- [x] Create `src/mcp/types.ts`:
  - `McpAuthType` ('none' | 'bearer' | 'custom_headers' | 'oauth2')
  - `McpServerConfig` (id, name, url, enabled, authType, secret keys, oauthConfig, cachedTools, status)
  - `McpCatalogItem` (catalog schema)
  - `McpJsonRpcRequest`, `McpJsonRpcResponse`, `McpToolDefinition`
- [x] Update `src/types.ts`:
  - Add `mcpServers: McpServerConfig[]` to `HarnessSettings` and `DEFAULT_SETTINGS`.

### Task 3: Mobile-Friendly Web MCP Client
- [x] Implement `src/mcp/client.ts`:
  - SSE handshake and session discovery using Obsidian's `requestUrl` and Web `EventSource` / Fetch.
  - JSON-RPC protocol methods: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`.
  - Configurable timeout (30s default) and automatic single-retry on session drops.
  - Full mobile compatibility (zero Node.js dependencies, no `child_process`).

### Task 4: OAuth 2.1 PKCE Flow & Obsidian Deep Link Handler
- [x] Implement `src/mcp/oauth.ts`:
  - Crypto PKCE generator (`code_verifier`, `code_challenge` S256 using standard `crypto.subtle`).
  - Authorization URL builder with `redirect_uri=obsidian://oh-bot-mcp-auth`.
  - Token exchange handler (POST to `tokenUrl`) saving tokens into `SecretManager`.
- [x] Register Obsidian protocol handler in `src/main.ts`:
  - `this.registerObsidianProtocolHandler('oh-bot-mcp-auth', ...)` to receive redirect tokens seamlessly on mobile & desktop.

### Task 5: McpManager Lifecycle & Tool Cache
- [x] Implement `src/mcp/mcp-manager.ts`:
  - Load and save MCP servers in settings.
  - `testAndSyncServer(serverId)`: ping server, fetch `tools/list`, and update `cachedTools`.
  - `executeTool(serverId, toolName, args)`: invoke remote tool on-demand.
  - `startOAuthFlow(serverId)` & `handleOAuthCallback(params)`: browser auth flow.
  - Curated catalog loading from bundled `marketplace/mcp.json`.

### Task 6: Dynamic McpBridgeTool & ToolRegistry Integration
- [x] Implement `src/tools/mcp/bridge-tool.ts`:
  - Dynamic `AgentTool` adapter for remote MCP tools with namespacing `mcp__<serverId>__<toolName>`.
  - Mutation detection heuristic (`create`, `delete`, `update`, `patch`, `post`, `write`, `remove`, `add`) for `isMutation`.
- [x] Update `src/tools/registry.ts`:
  - Dynamically register/unregister bridge tools from active `McpManager` cached tools.
- [x] Update `src/engine/agent.ts`:
  - Ensure safety prompt and tool execution properly handle MCP tools in `strict` and `auto` modes.

### Task 7: McpModal UI & Tools Inspection
- [x] Implement `src/ui/mcp-modal.ts`:
  - **Header**: Title, search bar, and "Sync All" button.
  - **Tab 1: Configured Servers**: Server cards with status badges (Connected / Error / Disabled), enable toggle, `Sync / Test`, `View Tools`, `Edit`, and `Delete` actions.
  - **Tab 2: Catalog & Add**: Curated Todoist card with 1-click OAuth or Token connect + Custom Server form.
- [x] Implement `src/ui/components/mcp-tools-view-modal.ts`:
  - Modal inspecting tool schemas, argument properties, and types.
- [x] Implement `src/ui/components/mcp-server-edit-modal.ts`:
  - Modal for adding or editing custom MCP server parameters and secrets.

### Task 8: Slash Command `/mcp`, Command Palette & Settings
- [x] Update `src/ui/chat-view.ts`:
  - Add `/mcp` slash command to chat input autocomplete.
- [x] Update `src/main.ts`:
  - Register command palette action: `Obsidian Harness Bot: Open MCP Servers (/mcp)`.
- [x] Update `src/ui/settings-tab.ts`:
  - Add MCP Servers section with link/button to open `McpModal` and status summary.

### Task 9: CSS Styling & Mobile Responsiveness
- [x] Update `styles.css`:
  - MCP modal layout, card styling, status indicator lights, tool parameter pills.
  - Responsive layout rules (`@media (max-width: 600px)`) with touch-friendly button targets (>= 44px).

### Task 10: Build Verification & Git Commit
- [x] Run `npm run build` to verify clean TypeScript compilation and bundle generation.
- [x] Commit all changes to the Git repository.
