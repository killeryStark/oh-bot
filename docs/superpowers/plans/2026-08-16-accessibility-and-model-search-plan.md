# Implementation Plan: Accessibility, Searchable Model Selection & Chat Usability

- **Spec:** [`docs/superpowers/specs/2026-08-16-accessibility-and-model-search-design.md`](file:///home/dietpi/code/oh-bot/docs/superpowers/specs/2026-08-16-accessibility-and-model-search-design.md)
- **Status:** Ready for implementation

---

## Proposed Changes

### 1. New Component: `SearchableModelSelect`
#### [NEW] `src/ui/components/searchable-model-select.ts`
- Implement custom searchable popover combobox.
- Features:
  - Trigger button displaying active model name and search/dropdown icons.
  - Attached floating popover with autofocus search input and clear button.
  - Case-insensitive substring filtering.
  - Keyboard navigation: `ArrowUp` / `ArrowDown` to highlight, `Enter` to select, `Escape` to close.
  - Click-outside handling and auto-positioning.
  - ARIA attributes: `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded"`, `aria-label`.
  - Public API: `setModels(models: string[], selectedModel?: string)`, `setValue(model: string)`, `getValue(): string`, `destroy()`.

---

### 2. Styles & A11y Suite
#### `styles.css`
- **Text Selection Fixes**:
  - Add `user-select: text; -webkit-user-select: text;` to `.harness-chat-container`, `.harness-chat-messages`, `.harness-message`, `.harness-message-body`, `.harness-thinking-text`, `.harness-collapsible-body`, `.harness-answer-text`, `pre`, and `code`.
  - Keep `user-select: none;` strictly on summary headers and icon buttons.
- **Searchable Model Select Styles**:
  - Styles for `.harness-model-select-trigger`, `.harness-model-select-popover`, `.harness-model-search-input`, `.harness-model-option`, and `.is-highlighted`.
- **Copy Buttons Styles**:
  - Message copy button (`.harness-msg-copy-btn`), Code block floating copy button (`.harness-code-copy-btn`), and Tool card copy button (`.harness-tool-copy-btn`).
- **A11y, Touch Targets & Mobile Breakpoints**:
  - Clear `:focus-visible` outline rings with `var(--interactive-accent)`.
  - Minimum 36–44px touch targets on mobile viewports.
  - Responsive flexbox wrapping for narrow sidebars and small screens.

---

### 3. Chat View Updates
#### `src/ui/chat-view.ts`
- Integrate `SearchableModelSelect` into the bottom row.
- Add message-level copy button to user and assistant message headers with clipboard copy + Notice.
- Inject copy buttons into all rendered `<pre><code>` code blocks.
- Add copy buttons to tool call arguments and tool output cards.
- Add explicit ARIA labels and titles to all action buttons (send/stop, expand, clear, sessions, skills, mcp, export).

---

### 4. Settings Tab Updates
#### `src/ui/settings-tab.ts`
- Replace `Default Active Model` dropdown with `SearchableModelSelect`.
- Replace `Available Models` dropdown in provider cards with `SearchableModelSelect`.
- Audit settings items for responsive wrapping and touch targets on mobile.

---

### 5. Modals Accessibility & Mobile Audit
#### `src/ui/components/sessions-modal.ts` & `src/ui/components/edit-models-modal.ts`
- Add ARIA attributes, keyboard support, and responsive touch targets.

---

## Verification Plan

### Automated Build Verification
- Execute `npm run build` using esbuild to verify TypeScript compilation and zero bundle errors.

### Manual / Visual Verification Checkpoints
1. **Model Selection**:
   - Test typing model queries (e.g. `claude`, `gpt-4o`, `deepseek`) in Chat bottom bar and Settings tab.
   - Verify keyboard navigation (`ArrowDown`/`ArrowUp`, `Enter`, `Escape`) and click outside.
2. **Text Copying**:
   - Verify manual text selection across chat messages, thinking cards, and tool cards.
   - Click message copy button and verify clipboard content.
   - Click code block copy button and verify code content.
3. **Accessibility & Responsiveness**:
   - Check Tab key navigation and focus outlines.
   - Inspect narrow screen layout (< 360px) for input area, tool cards, and settings.
