# Design Specification: Custom Agents, Subagent Delegation & Scoped Workspace Sandbox

- **Status:** Approved
- **Date:** 2026-08-16
- **Target Plugin:** `obsidian-harness-bot` (v0.0.34-alpha)
- **Target Platforms:** Obsidian Desktop (macOS, Windows, Linux) and Obsidian Mobile (iOS, Android)

---

## 1. Overview & Motivation

Obsidian Harness Bot enables autonomous AI agents to work within Obsidian vaults with built-in tools (vault operations, web search, PDF generation, skills, and MCP servers).

To support complex, multi-domain knowledge work and specialized workflows, the system requires a first-class **Multi-Agent Architecture**:
1. **Custom Agent Profiles**: Users and the Main agent can create specialized agents with custom, independent System Prompts, dedicated workspace folders (`workspacePath`), optional LLM model/provider overrides, and scoped tool permissions.
2. **Dynamic Context & `AGENT.md`**: Agents automatically load local guidelines, rules, and context from `AGENT.md` residing in their assigned workspace directory.
3. **Strict Workspace Isolation (Vault Sandboxing)**: Subagents and custom agents are strictly sandboxed inside their designated vault folder, preventing unauthorized reading, listing, or patching outside their boundary.
4. **Subagent Delegation (`invoke_subagent`)**: The Main Agent can dynamically orchestrate and delegate sub-tasks to specialized subagents, streaming their execution steps in real-time within nested collapsible chat cards, and receiving structured reports.
5. **Direct Agent Chat Mode**: Users can select any custom agent directly in the Chat View toolbar to interact with it one-on-one inside its sandboxed context.
6. **Agent Creation & Management**: Main Agent harness has programmatic tools (`manage_agents`) and a built-in skill (`subagent-management`) to scaffold and configure subagents autonomously.

---

## 2. Goals & Non-Goals

### Goals
- **Full Cross-Platform Support**: Work identically across Obsidian Desktop and Mobile without platform-dependent constraints.
- **Configurable Agent Profiles**: Store agent definitions in `HarnessSettings` (`data.json`) with ID, Name, Description, System Prompt, Workspace Path, Model/Provider override, and Allowed Tools.
- **Always Available Main Agent**: Default `main` agent profile representing the unrestricted global harness.
- **Strict Path Sandboxing**: Prohibit file tools (`read_file`, `create_file`, `patch_file`, `list_dir`, `search_notes`) from escaping `agent.workspacePath` via relative paths or traversal.
- **Automatic `AGENT.md` Context Resolution**: If `workspacePath/AGENT.md` exists, append its content as localized working instructions to the agent's system prompt.
- **Real-Time Nested Streaming UI**: In-chat collapsible subagent cards rendering subagent thoughts, tool calls, and outputs in real-time.
- **Direct Agent Chat Selection**: Header dropdown in the chat view allowing the user to select the active agent per session.
- **Autonomous Agent Creation**: Main Agent can create folders, write initial `AGENT.md`, and register new subagents via `manage_agents`.

### Non-Goals
- Background daemon processes running when Obsidian is closed or in the background.
- Direct inter-subagent peer-to-peer mesh networks without going through the calling agent.

---

## 3. Architecture & Data Model

```
+-----------------------------------------------------------------------------------+
|                                  Obsidian Vault                                   |
|                                                                                   |
|  +---------------------------+       +-----------------------------------------+  |
|  |     Root / Global Vault   |       |  Scoped Folder: Projects/Research/      |  |
|  |   (Main Agent Access)     |       |  - AGENT.md (Local instructions)        |  |
|  +-------------+-------------+       |  - notes, data, reports                 |  |
|                ^                     +--------------------+--------------------+  |
|                |                                          ^                       |
+----------------|------------------------------------------|-----------------------+
                 |                                          |
                 |                                          |
+----------------+----------------+        +----------------+----------------+
|          AgentHarness           |        |      ScopedToolRegistry         |
|      (Main / Root Runner)       |        |   (Path & Tool Enforcement)     |
+----------------+----------------+        +----------------+----------------+
                 |                                          ^
                 | calls invoke_subagent                    |
                 v                                          |
+-----------------------------------------------------------+----------------+
|                         Child AgentHarness RunTurn                         |
|   - System Prompt: agent.systemPrompt + AGENT.md                           |
|   - Model: agent.model || parent.model                                     |
|   - Provider: agent.providerId || parent.providerId                        |
|   - Events: streamed back with subagentContext metadata                     |
+----------------------------------------------------------------------------+
```

### 3.1. TypeScript Data Types (`src/types.ts`)

```typescript
export interface AgentConfig {
  id: string;                    // Unique identifier (e.g., 'main', 'finance-analyst', 'researcher')
  name: string;                  // Display name (e.g., 'Research Assistant')
  description: string;           // Capabilities description (used by Main agent for task delegation)
  systemPrompt: string;          // Independent system prompt
  workspacePath?: string;        // Relative folder path in Vault (e.g., 'Projects/Research'). Empty = entire vault
  agentMdFile?: string;          // Instructions filename (defaults to 'AGENT.md' inside workspacePath)
  providerId?: string;           // Provider override (empty = inherit from session/settings)
  model?: string;                // Model override (empty = inherit from session/settings)
  allowedTools?: string[];       // Array of allowed tool names or category tags (empty or '*' = all tools)
  isDefaultMain?: boolean;       // True for the built-in Main agent
  createdAt: number;
  updatedAt: number;
}

export interface HarnessSettings {
  // Existing settings...
  providers: ProviderConfig[];
  activeProviderId: string;
  activeModel: string;
  systemPrompt: string;
  safetyMode: SafetyMode;
  sessions: ChatSession[];
  currentSessionId?: string;
  installedSkills?: SkillMetadata[];
  customMarketplaceUrl?: string;
  scanVaultSkills?: boolean;
  mcpServers?: McpServerConfig[];
  searchProvider?: SearchProviderType;
  searxngUrl?: string;
  tavilyApiKeySecretName?: string;
  defaultPdfFolder?: string;
  // New Agent Settings:
  agents: AgentConfig[];
  activeAgentId?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: LLMMessage[];
  providerId: string;
  model: string;
  activeAgentId?: string; // Tracks the selected agent for this chat session
}

export interface SubagentStepContext {
  agentId: string;
  agentName: string;
  taskId: string;
  workspacePath?: string;
}

export interface AgentStepEvent {
  type: AgentStepEventType;
  step: number;
  content?: string;
  toolCall?: ToolCall;
  toolResult?: { toolCallId: string; result: ToolResult };
  error?: string;
  subagentContext?: SubagentStepContext; // Present when event originates from a subagent
}
```

---

## 4. Subagent Delegation & Sandboxed Tool Execution

### 4.1. `AgentManager` Service (`src/engine/agent-manager.ts`)
A centralized manager responsible for:
- Initializing and synchronizing `settings.agents`.
- Ensuring the default `main` agent is always present.
- Resolving effective system prompts: combining `agent.systemPrompt` with `AGENT.md` content from `agent.workspacePath` (if present).
- Validating and resolving paths relative to `agent.workspacePath`.
- Managing agent CRUD operations and persisting to `HarnessSettings`.

### 4.2. `ScopedToolRegistry` (`src/tools/scoped-registry.ts`)
A proxy wrapper over `ToolRegistry` that restricts execution based on `AgentConfig`:
1. **Path Boundary Validation**:
   - `read_file`: Path must start with `workspacePath`. Attempts to use `..` or access paths outside the sandbox return:
     `"Error: Access denied. Path '[path]' is outside the assigned workspace '[workspacePath]'."`
   - `create_file`: Target path must reside inside `workspacePath`. Parent folders within `workspacePath` are auto-created.
   - `patch_file`: Target path must reside inside `workspacePath`.
   - `list_dir`: If path is omitted, defaults to `workspacePath`. If path is provided, must be within `workspacePath`.
   - `search_notes`: Filters search results to only include files located under `workspacePath`.
2. **Tool Whitelisting (`allowedTools`)**:
   - Only schemas matching `allowedTools` (or all if `allowedTools` is empty or contains `'*'`) are exposed to the model.
   - For subagents, `invoke_subagent` is disabled by default to prevent unbounded recursive subagent loops.

### 4.3. Tool: `invoke_subagent` (`src/tools/agents/invoke-subagent.ts`)
- **Schema**:
  ```json
  {
    "name": "invoke_subagent",
    "description": "Delegate a focused task or sub-project to a specialized agent profile. The subagent runs in its isolated workspace sandbox and returns a comprehensive report.",
    "parameters": {
      "type": "object",
      "properties": {
        "agent_id": {
          "type": "string",
          "description": "The unique ID or name of the agent to invoke (e.g., 'researcher', 'finance-analyst')."
        },
        "task": {
          "type": "string",
          "description": "The specific task instructions and goals for the subagent to complete."
        },
        "context": {
          "type": "string",
          "description": "Optional additional background data or notes for the subagent."
        }
      },
      "required": ["agent_id", "task"]
    }
  }
  ```
- **Execution Flow**:
  1. Look up `AgentConfig` from `AgentManager`.
  2. Read `AGENT.md` from `workspacePath` if present, creating the combined system prompt.
  3. Create an isolated `ScopedToolRegistry` for the subagent.
  4. Instantiate child `runTurn` with `subagentContext: { agentId, agentName, taskId }`.
  5. Stream events to parent's `onEvent` callback for real-time UI display.
  6. Return final text answer as tool result output.

### 4.4. Tool: `manage_agents` (`src/tools/agents/manage-agents.ts`)
- **Schema**:
  ```json
  {
    "name": "manage_agents",
    "description": "Create, update, delete, or list custom agent profiles in Obsidian Harness Bot.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": ["create", "update", "delete", "list"],
          "description": "The management action to perform."
        },
        "id": {
          "type": "string",
          "description": "Unique agent identifier (e.g. 'code-architect'). Required for create/update/delete."
        },
        "name": {
          "type": "string",
          "description": "Human-readable name of the agent."
        },
        "description": {
          "type": "string",
          "description": "Description of what this agent specializes in."
        },
        "systemPrompt": {
          "type": "string",
          "description": "Custom system prompt for the agent."
        },
        "workspacePath": {
          "type": "string",
          "description": "Vault folder path to restrict the agent to (e.g. 'Projects/Codebase')."
        },
        "agentMdContent": {
          "type": "string",
          "description": "Initial content for AGENT.md to create inside workspacePath."
        },
        "providerId": {
          "type": "string",
          "description": "Optional LLM provider ID override."
        },
        "model": {
          "type": "string",
          "description": "Optional model name override."
        },
        "allowedTools": {
          "type": "array",
          "items": { "type": "string" },
          "description": "List of allowed tool names or categories."
        }
      },
      "required": ["action"]
    }
  }
  ```

---

## 5. User Interface & Experience

### 5.1. Settings Tab: "Agents & Personas" Section (`src/ui/settings-tab.ts`)
- Accessible in plugin settings:
  - Header: "Agents & Subagents" with an explanation of custom profiles and sandboxing.
  - List of configured agents showing ID, Name, Workspace Path, Model override, and action buttons (`Edit`, `Delete`).
  - Button: **"+ Add New Agent"** opens `AgentEditModal`.
- `AgentEditModal`:
  - Input: Name & ID (with slug auto-generation).
  - Textarea: Description.
  - Textarea: Custom System Prompt.
  - Input: Workspace Path (with button "Create Folder & AGENT.md Template").
  - Dropdowns: Provider & Model override ("Inherit from session" default).
  - Tool Category checkboxes: Vault, Web, PDF, Skills, MCP.
  - Action buttons: Save / Cancel / Delete.

### 5.2. Chat View: Agent Selector & Direct Chat (`src/ui/chat-view.ts`)
- Header Toolbar:
  - Added **Agent Selector Dropdown** displaying `🤖 Main Agent` or `👤 [Agent Name]`.
  - Selecting an agent updates `session.activeAgentId` and the active execution context.
  - If a custom agent with a `workspacePath` is active, a subtle status badge shows `📁 [workspacePath]` in the chat header.
- Direct Chat Behavior:
  - Messages sent while a custom agent is selected execute directly under that agent's system prompt, `AGENT.md`, and `ScopedToolRegistry`.

### 5.3. Nested Subagent Real-Time Streaming Cards (`src/ui/components/subagent-card.ts`)
- When `invoke_subagent` runs:
  - A collapsible component is rendered inside the chat message timeline:
    - **Header**: Icon, Subagent Name, Target Workspace badge, spinning loader.
    - **Body**: Real-time streaming thoughts, tool calls (e.g. `read_file: Projects/Research/data.json`), and step progress.
    - **Footer / Completion**: Replaces loader with `✅ Completed`, automatically collapsing or remaining expandable on user click.

---

## 6. Built-in Skill: `subagent-management`

Packaged in `marketplace/subagent-management/SKILL.md`:
- Guides the Main Agent on when and how to partition complex workflows.
- Contains template structures for effective `AGENT.md` files:
  - Role definition and objectives.
  - Allowed file patterns and folder layout conventions.
  - Output formats and reporting guidelines.
- Instructs the agent how to use `manage_agents` to create the agent and scaffold its directory, followed by `invoke_subagent` to delegate work.

---

## 7. Security, Sandboxing & Path Traversal Prevention

1. **Path Normalization**:
   - All input paths are normalized using standard path utilities (stripping leading/trailing slashes, resolving `.` and `..`).
   - Prefix check ensures `normalizedPath.startsWith(normalizedWorkspacePath + '/')` or `normalizedPath === normalizedWorkspacePath`.
2. **Infinite Recursion Guard**:
   - Subagents created by `invoke_subagent` have `invoke_subagent` disabled in their `allowedTools` unless explicitly configured.
   - Max recursion depth is capped at 1 (Main -> Subagent).
3. **Turn & Step Limits**:
   - Subagent turns respect internal step limits (default: 25 steps per subagent invocation) to prevent runaway execution costs.
   - Abort signal propagation: cancelling generation in the main chat immediately aborts any active subagent execution.

---

## 8. Verification & Testing Strategy

1. **Unit & Integration Tests**:
   - **Path Traversal Tests**: Verify that `ScopedToolRegistry` blocks attempts to read/create/patch files outside `workspacePath` (e.g. `../../secret.md`, `/root.md`).
   - **`AGENT.md` Loader Tests**: Verify prompt concatenation when `AGENT.md` exists vs when absent.
   - **`manage_agents` CRUD Tests**: Verify create, update, delete, and list operations in `AgentManager`.
   - **`invoke_subagent` Execution Tests**: Verify child turn execution, event bubbling, and final result capture.
2. **Manual & E2E Validation**:
   - Create a custom agent in Settings UI with workspace path `Agents/Finance` and custom prompt.
   - Select the agent in Chat View and confirm file operations are confined to `Agents/Finance`.
   - In Main chat, prompt Main Agent to delegate research to the subagent and verify the nested streaming UI card.
   - Prompt Main Agent to create a new subagent autonomously via `manage_agents` and verify its appearance in Settings and Chat dropdown.
