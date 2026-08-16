# Implementation Plan: Custom Agents, Subagent Delegation & Scoped Workspace Sandbox

**Spec Reference:** [`docs/superpowers/specs/2026-08-16-custom-agents-and-subagent-harness-design.md`](file:///home/dietpi/code/oh-bot/docs/superpowers/specs/2026-08-16-custom-agents-and-subagent-harness-design.md)  
**Target Platform:** Obsidian Desktop (macOS/Windows/Linux) & Obsidian Mobile (iOS/iPadOS/Android)

---

## Proposed Tasks

### Task 1: TypeScript Data Types & Settings Definition
- [ ] Update `src/types.ts`:
  - Add `AgentConfig` interface (`id`, `name`, `description`, `systemPrompt`, `workspacePath`, `agentMdFile`, `providerId`, `model`, `allowedTools`, `isDefaultMain`, `createdAt`, `updatedAt`).
  - Add `SubagentStepContext` interface (`agentId`, `agentName`, `taskId`, `workspacePath`).
  - Extend `AgentStepEvent` with optional `subagentContext?: SubagentStepContext`.
  - Extend `ChatSession` with `activeAgentId?: string`.
  - Extend `HarnessSettings` with `agents: AgentConfig[]` and `activeAgentId?: string`.
  - Update `DEFAULT_SETTINGS` to include default `main` agent configuration.

### Task 2: AgentManager Service
- [ ] Implement `src/engine/agent-manager.ts`:
  - Manage list of agents, ensuring `main` is always present.
  - CRUD operations: `getAgent(id)`, `getAllAgents()`, `createOrUpdateAgent(config)`, `deleteAgent(id)`.
  - Context resolver `resolveEffectiveSystemPrompt(agent)`: reads `AGENT.md` from `workspacePath` if present and appends it to `agent.systemPrompt`.
  - Persistence callback to save settings.

### Task 3: ScopedToolRegistry & Path Sandboxing
- [ ] Implement `src/tools/scoped-registry.ts`:
  - Wrap base `ToolRegistry` with `AgentConfig` sandbox rules.
  - Intercept and validate file tool execution (`read_file`, `create_file`, `patch_file`, `list_dir`, `search_notes`):
    - Strict path normalization and boundary check against `agent.workspacePath`.
    - Block path traversal (`..`, absolute root outside workspace).
  - Filter `getSchemas()` based on `agent.allowedTools`.
  - Disable recursive `invoke_subagent` calls inside subagents unless explicitly allowed.

### Task 4: Subagent Execution & Agent Management Tools
- [ ] Implement `src/tools/agents/invoke-subagent.ts` (`invoke_subagent`):
  - Resolves target agent by ID/name from `AgentManager`.
  - Executes isolated child turn with `ScopedToolRegistry`, subagent system prompt, and model overrides.
  - Bubbles execution events with `subagentContext` for live UI rendering.
  - Returns final summary/report as tool result.
- [ ] Implement `src/tools/agents/manage-agents.ts` (`manage_agents`):
  - Supports `create`, `update`, `delete`, and `list` actions.
  - Automatically scaffolds vault directory and initial `AGENT.md` if `agentMdContent` is provided.
- [ ] Update `src/tools/registry.ts`:
  - Register `invoke_subagent` and `manage_agents`.
  - Inject `AgentManager` and `AgentHarness` reference.

### Task 5: AgentHarness Multi-Agent & Nested Turn Support
- [ ] Update `src/engine/agent.ts`:
  - Support running turns under a specific `AgentConfig` (custom system prompt + `AGENT.md` + `ScopedToolRegistry`).
  - Pass `subagentContext` through event callbacks.
  - Enable parent-child turn delegation with abort signal propagation.

### Task 6: Built-in Skill `subagent-management`
- [ ] Create `marketplace/subagent-management/SKILL.md`:
  - Instructions and best practices for creating specialized subagents.
  - Template structure for `AGENT.md` files.
  - Step-by-step guides for decomposing complex user goals and orchestrating subagents.

### Task 7: Settings Tab: "Agents & Subagents" UI
- [ ] Implement `src/ui/agent-edit-modal.ts`:
  - Modal form for creating/editing agents (ID, Name, Description, System Prompt, Workspace Path, Model/Provider override, Tool permissions).
  - Quick action to create workspace folder and default `AGENT.md`.
- [ ] Update `src/ui/settings-tab.ts`:
  - Add **Agents & Subagents** management section.
  - Display list of agents with badges and Edit/Delete buttons.
  - "+ Add New Agent" button to launch `AgentEditModal`.

### Task 8: Chat View: Agent Selector & Direct Chat Mode
- [ ] Update `src/ui/chat-view.ts`:
  - Add **Active Agent Dropdown** to header toolbar next to Provider/Model selector.
  - Support switching active agent per chat session.
  - Display workspace path indicator badge in chat header when a sandboxed agent is active.
  - Direct execution: user messages invoke the selected agent directly in its sandbox.

### Task 9: Chat Timeline: Nested Subagent Streaming Card Component
- [ ] Implement `src/ui/components/subagent-card.ts`:
  - Interactive collapsible card in chat timeline for `subagentContext` events.
  - Real-time streaming of subagent thoughts, tool calls, and step progression.
  - Success/completion badge with expandable logs.

### Task 10: CSS Styling & Animations
- [ ] Update `styles.css`:
  - Styles for Agent dropdown and header badge.
  - Styles for Agent cards in settings tab and modal.
  - Styles for nested subagent streaming cards, collapsible toggles, and step pills.

### Task 11: Verification, Lint & Commit
- [ ] Run `npm run lint` and `npm run build` to verify clean build.
- [ ] Commit all changes to the repository.
