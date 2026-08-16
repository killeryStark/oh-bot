# Design Document: Accessibility, Searchable Model Selection & Chat Usability

**Date:** 2026-08-16  
**Status:** Approved  
**Topic:** Accessibility (a11y), Searchable Model Selector Popover, Chat Copying Suite, and Responsive Mobile UI

---

## 1. Overview & Goals

This project resolves accessibility, responsiveness, and usability issues in the **Obsidian Harness Bot** plugin:
1. **Searchable Model Selection (`SearchableModelSelect`)**: Replace plain `<select>` dropdowns with an inline popover combobox supporting instant substring filtering, keyboard navigation (Arrow Up/Down, Enter, Esc), and clear state indicators across the Chat view and Settings tab.
2. **Universal Chat Copying & Selection**: Fix text selection across all message bodies, reasoning cards, code blocks, and tool outputs. Add one-click copy buttons for full messages (Markdown), code blocks, and tool arguments/results with visual and notice feedback.
3. **Accessibility (a11y) & Mobile Responsiveness**: Audit interactive elements for explicit ARIA labels and roles, focus rings (`:focus-visible`), touch targets (36–44px), and adaptive layout wrapping for narrow sidebars and mobile screens.

---

## 2. Component Architecture & Detailed Design

### 2.1. Searchable Model Selector Component (`src/ui/components/searchable-model-select.ts`)

A standalone, modular component for selecting models with live search:
* **Trigger Button (`.harness-model-select-trigger`)**:
  * Displays current model name with ellipsis overflow.
  * Right-aligned search/chevron icons (`search`, `chevron-down`).
  * ARIA attributes: `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded="false"`, `aria-label="Select active model"`.
  * Keyboard activation via Click, `Enter`, or `Space`.
* **Popover Container (`.harness-model-select-popover`)**:
  * Positioned floating popover relative to the trigger.
  * Search input: `<input type="text" class="harness-model-search-input" placeholder="Search model...">` with autofocus and a clear `✕` button.
  * Real-time case-insensitive substring filter matching model names.
  * Scrollable list container with `max-height: 240px` and `-webkit-overflow-scrolling: touch`.
  * Option items: Displays model name, active checkmark icon (`check`) for the current selection, and highlighted search match.
  * Empty state: "No models found matching..." message.
* **Keyboard & Lifecycle Management**:
  * `ArrowDown` / `ArrowUp`: Navigates through filtered items, updating active index and auto-scrolling with `scrollIntoView({ block: 'nearest' })`.
  * `Enter`: Commits selection, calls `onChange(modelName)`, closes popover, and returns focus to trigger button.
  * `Escape`: Closes popover and returns focus to trigger button.
  * Global click outside listener closes popover automatically.
* **Public Methods**:
  * `setModels(models: string[], selectedModel?: string)`: Updates available options dynamically.
  * `setValue(model: string)`: Updates currently selected model programmatically.
  * `getValue(): string`: Returns active model name.
  * `destroy()`: Removes global listeners and cleans up DOM.

### 2.2. Integration in Chat View & Settings Tab

* **Chat View (`src/ui/chat-view.ts`)**:
  * Replace the native `<select>` bottom row element with `SearchableModelSelect`.
  * `refreshModelDropdown()` delegates directly to `this.modelSelect.setModels(models, selectedModel)`.
  * On model change, updates `currentSession.model` and `plugin.settings.activeModel`, saving session state.
* **Settings Tab (`src/ui/settings-tab.ts`)**:
  * **Default Active Model**: Replace standard `addDropdown` with `SearchableModelSelect`.
  * **Provider Available Models**: In provider card, replace `addDropdown` with `SearchableModelSelect` to preview and test long model lists easily.

---

### 2.3. Universal Chat Copying & Selection System

* **CSS Selection Rules (`styles.css`)**:
  * Apply `user-select: text; -webkit-user-select: text;` to:
    * `.harness-chat-container`, `.harness-chat-messages`
    * `.harness-message`, `.harness-message-body`, `.harness-message-user`, `.harness-message-assistant`
    * `.harness-thinking-text`, `.harness-collapsible-body`, `.harness-answer-text`
    * `pre`, `code`
  * Preserve `user-select: none;` on action buttons and collapsible headers (`summary`).
* **Message-Level Copy Button**:
  * In message headers (`.harness-message-header`), add a right-aligned action icon button (`.harness-msg-copy-btn`).
  * On click, copies raw Markdown content to clipboard via `navigator.clipboard.writeText(...)`.
  * Icon transitions from `copy` to `check` for 2 seconds with Obsidian `new Notice('Message copied to clipboard')`.
* **Code Block Copy Button**:
  * During markdown rendering in `chat-view.ts`, scan rendered `<pre>` blocks or add a post-render decorator.
  * Inject a top-right floating button (`.harness-code-copy-btn`) inside `<pre>`.
  * On click, copies exact code text content to clipboard with `check` feedback.
* **Tool Card Copy Action**:
  * Add copy icon button in `harness-tool-card` summaries/bodies to copy JSON arguments or raw tool output.

---

### 2.4. Accessibility (a11y), Touch Targets & Responsive Layouts

* **ARIA & Keyboard Navigation**:
  * Add descriptive `aria-label` and `title` to all icon-only buttons:
    * Send/Stop button (`aria-label="Send message"` / `aria-label="Stop generation"`)
    * Expand button (`aria-label="Expand message input"`)
    * Modal action buttons (delete session, edit models, refresh models)
  * Ensure keyboard focus ring (`:focus-visible`) uses `var(--interactive-accent)` across all inputs and triggers.
* **Touch Targets (Mobile)**:
  * Minimum 36px–44px clickable target size for all buttons on touch devices.
  * Proper padding and touch manipulation styles (`touch-action: manipulation`).
* **Responsive Layouts**:
  * `.harness-chat-bottom-row`: Flex layout ensuring the model selector shrinks cleanly with ellipsis while the send button retains fixed minimum dimensions.
  * Collapsible tool and thinking cards: Ensure `max-width: 100%`, `overflow-x: auto`, and `-webkit-overflow-scrolling: touch` for long code/JSON blocks without horizontal page blowout.
  * Settings Tab & Modals: Flex wrapping for action buttons and inputs on small screens (`@media (max-width: 600px)`).

---

## 3. Data Flow & State Management

```
+-------------------------------------------------------------------+
|                        Obsidian Harness Bot                       |
+-------------------------------------------------------------------+
                                  |
         +------------------------+------------------------+
         |                                                 |
         v                                                 v
+-------------------------------+             +-------------------------------+
|           Chat View           |             |          Settings Tab         |
|  - SearchableModelSelect      |             |  - SearchableModelSelect      |
|  - Message copy buttons       |             |  - Responsive provider cards  |
|  - Code block copy buttons    |             |  - Touch-friendly actions     |
|  - user-select: text enabled  |             +-------------------------------+
+-------------------------------+
         |
         v
+-------------------------------------------------------------------+
|                  SearchableModelSelect Component                  |
|  - Filter input (Substring match)                                 |
|  - Keyboard traversal (ArrowUp/Down, Enter, Esc)                  |
|  - Click outside detection & floating popover positioning         |
+-------------------------------------------------------------------+
```

---

## 4. Verification & Testing Plan

1. **Model Selection Popover**:
   * Open chat view and settings tab with providers having 0, 1, and 50+ models.
   * Verify typing filters models instantly; verify Arrow Down/Up navigates and Enter selects.
   * Verify Escape and clicking outside close the popover.
   * Verify switching providers updates the model list immediately.
2. **Text Copying & Selection**:
   * Verify mouse/touch text selection works on user messages, assistant answers, thinking cards, and tool outputs.
   * Test message copy button on user and assistant messages (verify raw markdown in clipboard + Notice feedback).
   * Test code block copy button on multi-line code blocks.
   * Test tool arguments/output copy buttons.
3. **Accessibility & Responsiveness**:
   * Verify all icon buttons have `aria-label` attributes.
   * Test Tab navigation and `:focus-visible` styling across all interactive elements.
   * Test chat view and settings tab on narrow window widths (< 360px) and mobile viewport mode.
