import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import type HarnessPlugin from '../main';
import { ChatSession, LLMMessage, ToolCall } from '../types';
import { AgentHarness } from '../engine/agent';
import { ToolRegistry } from '../tools/registry';
import { MarkdownExporter } from '../utils/markdown-exporter';
import { SessionManager } from '../utils/session-manager';
import { MentionHelper, MentionItem } from '../utils/mention-helper';
import { ConfirmationModal } from './components/confirmation-modal';
import { SessionsModal } from './components/sessions-modal';

export const HARNESS_VIEW_TYPE = 'harness-chat-view';

export class HarnessChatView extends ItemView {
  private plugin: HarnessPlugin;
  private toolRegistry: ToolRegistry;
  private agentHarness: AgentHarness;
  private exporter: MarkdownExporter;

  private currentSession!: ChatSession;
  private messagesContainerEl!: HTMLElement;
  private inputTextAreaEl!: HTMLTextAreaElement;
  private sendButtonEl!: HTMLButtonElement;
  private modelSelectEl!: HTMLSelectElement;
  private suggestPopupEl!: HTMLElement;

  private activeSuggestType: 'none' | 'slash' | 'mention' = 'none';
  private suggestQuery = '';

  constructor(leaf: WorkspaceLeaf, plugin: HarnessPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.toolRegistry = new ToolRegistry();
    this.agentHarness = new AgentHarness(this.app, this.plugin.settings, this.toolRegistry);
    this.exporter = new MarkdownExporter(this.app);
    this.initSession();
  }

  private initSession() {
    if (!this.plugin.settings.sessions) {
      this.plugin.settings.sessions = [];
    }

    const currentId = this.plugin.settings.currentSessionId;
    let existing = this.plugin.settings.sessions.find((s) => s.id === currentId);

    if (!existing) {
      existing = SessionManager.createNewSession(
        this.plugin.settings.activeProviderId || 'openrouter',
        this.plugin.settings.activeModel || ''
      );
      this.plugin.settings.sessions.unshift(existing);
      this.plugin.settings.currentSessionId = existing.id;
    }

    this.currentSession = existing;
  }

  getViewType(): string {
    return HARNESS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Harness Bot';
  }

  getIcon(): string {
    return 'bot';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('harness-chat-container');

    // Header
    const headerEl = container.createEl('div', { cls: 'harness-chat-header' });
    const titleEl = headerEl.createEl('div', { cls: 'harness-title-container' });
    titleEl.style.display = 'flex';
    titleEl.style.alignItems = 'center';
    titleEl.style.gap = '6px';
    const botIconEl = titleEl.createEl('span');
    setIcon(botIconEl, 'bot');
    titleEl.createEl('span', { text: 'Harness Bot', cls: 'harness-title' });

    const headerActionsEl = headerEl.createEl('div', { cls: 'harness-chat-header-actions' });

    // New Session Button
    const newSessionBtn = headerActionsEl.createEl('button', { cls: 'clickable-icon' });
    newSessionBtn.setAttribute('aria-label', 'New Session');
    setIcon(newSessionBtn, 'plus');
    newSessionBtn.addEventListener('click', () => {
      this.createNewSession();
    });

    // Sessions List Button
    const sessionsBtn = headerActionsEl.createEl('button', { cls: 'clickable-icon' });
    sessionsBtn.setAttribute('aria-label', 'View Saved Sessions (/sessions)');
    setIcon(sessionsBtn, 'history');
    sessionsBtn.addEventListener('click', () => {
      this.openSessionsModal();
    });

    // Export Button
    const exportBtn = headerActionsEl.createEl('button', { cls: 'clickable-icon' });
    exportBtn.setAttribute('aria-label', 'Export Chat to Markdown');
    setIcon(exportBtn, 'upload');
    exportBtn.addEventListener('click', async () => {
      if (this.currentSession.messages.length === 0) {
        new Notice('No chat history to export.');
        return;
      }
      try {
        const exportedPath = await this.exporter.exportChatToMarkdown(
          this.currentSession.messages,
          this.currentSession.model || this.plugin.settings.activeModel || 'default'
        );
        new Notice(`Chat exported to ${exportedPath}`);
      } catch (e: any) {
        new Notice(`Export failed: ${e.message}`);
      }
    });

    // Clear Button
    const clearBtn = headerActionsEl.createEl('button', { cls: 'clickable-icon' });
    clearBtn.setAttribute('aria-label', 'Clear Messages in Session');
    setIcon(clearBtn, 'trash');
    clearBtn.addEventListener('click', async () => {
      this.currentSession.messages = [];
      await this.saveSessionState();
      this.renderMessages();
    });

    // Messages Area
    this.messagesContainerEl = container.createEl('div', { cls: 'harness-chat-messages' });

    // Suggestion Popup for / and @
    this.suggestPopupEl = container.createEl('div', { cls: 'harness-suggest-popup' });
    this.suggestPopupEl.style.display = 'none';

    // Input Area
    const inputAreaEl = container.createEl('div', { cls: 'harness-chat-input-area' });

    this.inputTextAreaEl = inputAreaEl.createEl('textarea', {
      cls: 'harness-chat-textarea',
      placeholder: "Type a message, '/' for sessions, or '@' to attach a file...",
    });

    const bottomRowEl = inputAreaEl.createEl('div', { cls: 'harness-chat-bottom-row' });
    bottomRowEl.style.display = 'flex';
    bottomRowEl.style.justifyContent = 'space-between';
    bottomRowEl.style.alignItems = 'center';
    bottomRowEl.style.gap = '8px';

    // Model Selector at the bottom of the chat
    const modelContainerEl = bottomRowEl.createEl('div');
    modelContainerEl.style.display = 'flex';
    modelContainerEl.style.alignItems = 'center';
    modelContainerEl.style.gap = '6px';

    this.modelSelectEl = modelContainerEl.createEl('select');
    this.modelSelectEl.style.fontSize = '0.85em';
    this.refreshModelDropdown();

    this.modelSelectEl.addEventListener('change', async () => {
      this.currentSession.model = this.modelSelectEl.value;
      this.plugin.settings.activeModel = this.modelSelectEl.value;
      await this.saveSessionState();
    });

    this.sendButtonEl = bottomRowEl.createEl('button', { text: 'Send', cls: 'mod-cta' });

    const handleSend = async () => {
      const text = this.inputTextAreaEl.value.trim();
      if (!text) return;

      // Check slash commands
      if (text === '/sessions' || text === '/history') {
        this.inputTextAreaEl.value = '';
        this.hideSuggest();
        this.openSessionsModal();
        return;
      }

      const activeProv = this.plugin.settings.providers.find(
        (p) => p.id === this.plugin.settings.activeProviderId
      );

      if (!activeProv) {
        new Notice('Please configure and select an AI provider in Settings first.');
        return;
      }

      this.inputTextAreaEl.value = '';
      this.hideSuggest();
      this.sendButtonEl.disabled = true;

      // If new session, set auto-title
      if (this.currentSession.messages.length === 0) {
        this.currentSession.title = SessionManager.generateTitle(text);
      }

      // Enriched text with resolved @mentions (notes and folders)
      const resolvedContent = await MentionHelper.resolveMentions(this.app, text);

      // Append clean user message to UI state (WITHOUT timestamp)
      const userMsg: LLMMessage = { role: 'user', content: resolvedContent };
      this.currentSession.messages.push(userMsg);
      this.currentSession.updatedAt = Date.now();
      await this.saveSessionState();
      this.renderMessages();

      // Streaming assistant placeholder container
      const streamingMsgEl = this.messagesContainerEl.createEl('div', {
        cls: 'harness-message harness-message-assistant',
      });
      streamingMsgEl.createEl('div', {
        text: `Harness Bot (${this.currentSession.model || this.plugin.settings.activeModel})`,
        cls: 'harness-message-header',
      });
      const textContentEl = streamingMsgEl.createEl('div', { cls: 'harness-message-body' });

      try {
        const updatedHistory = await this.agentHarness.runTurn(
          this.currentSession.messages,
          (event) => {
            if (event.type === 'chunk' && event.content) {
              textContentEl.setText(event.content);
              this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
            } else if (event.type === 'tool_call' && event.toolCall) {
              const card = this.messagesContainerEl.createEl('div', { cls: 'harness-tool-card' });
              card.createEl('div', {
                text: `Tool requested: ${event.toolCall.function.name}`,
                cls: 'harness-tool-title',
              });
            }
          },
          (toolCall: ToolCall) => {
            return new Promise<boolean>((resolve) => {
              new ConfirmationModal(this.app, toolCall, resolve).open();
            });
          },
          this.plugin.settings.activeProviderId,
          this.currentSession.model || this.plugin.settings.activeModel
        );

        this.currentSession.messages = updatedHistory;
        this.currentSession.updatedAt = Date.now();
        await this.saveSessionState();
      } catch (err: any) {
        new Notice(`Agent error: ${err.message}`);
        textContentEl.setText(`Error: ${err.message}`);
      } finally {
        this.sendButtonEl.disabled = false;
        this.renderMessages();
      }
    };

    this.sendButtonEl.addEventListener('click', handleSend);

    this.inputTextAreaEl.addEventListener('input', () => {
      this.handleInputSuggest();
    });

    this.inputTextAreaEl.addEventListener('keydown', (e) => {
      if (this.activeSuggestType !== 'none' && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) {
        // Handled by suggest navigation
        if (e.key === 'Escape') {
          this.hideSuggest();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    this.renderMessages();
  }

  private handleInputSuggest() {
    const text = this.inputTextAreaEl.value;
    const cursorPos = this.inputTextAreaEl.selectionStart || text.length;
    const beforeCursor = text.slice(0, cursorPos);

    if (beforeCursor.startsWith('/') && !beforeCursor.includes(' ')) {
      this.activeSuggestType = 'slash';
      this.suggestQuery = beforeCursor.slice(1);
      this.renderSlashSuggest();
      return;
    }

    const lastAtIndex = beforeCursor.lastIndexOf('@');
    if (lastAtIndex !== -1 && (lastAtIndex === 0 || /\s/.test(beforeCursor[lastAtIndex - 1]))) {
      const mentionText = beforeCursor.slice(lastAtIndex + 1);
      if (!/\s/.test(mentionText)) {
        this.activeSuggestType = 'mention';
        this.suggestQuery = mentionText;
        this.renderMentionSuggest(lastAtIndex);
        return;
      }
    }

    this.hideSuggest();
  }

  private renderSlashSuggest() {
    if (!this.suggestPopupEl) return;
    this.suggestPopupEl.empty();
    this.suggestPopupEl.style.display = 'block';

    const itemEl = this.suggestPopupEl.createEl('div', { cls: 'harness-suggest-item' });
    itemEl.createEl('strong', { text: '/sessions' });
    itemEl.createEl('span', { text: ' - View and switch saved chat sessions' });

    itemEl.addEventListener('click', () => {
      this.inputTextAreaEl.value = '';
      this.hideSuggest();
      this.openSessionsModal();
    });
  }

  private renderMentionSuggest(lastAtIndex: number) {
    if (!this.suggestPopupEl) return;
    this.suggestPopupEl.empty();
    this.suggestPopupEl.style.display = 'block';

    const items = MentionHelper.getVaultItems(this.app, this.suggestQuery);

    if (items.length === 0) {
      const noItemEl = this.suggestPopupEl.createEl('div', { cls: 'harness-suggest-item' });
      noItemEl.setText('No matching files or folders found');
      return;
    }

    for (const item of items) {
      const itemEl = this.suggestPopupEl.createEl('div', { cls: 'harness-suggest-item' });
      const iconSpan = itemEl.createEl('span', { cls: 'harness-suggest-icon' });
      setIcon(iconSpan, item.isFolder ? 'folder' : 'file-text');

      itemEl.createEl('span', { text: ` ${item.path}` });

      itemEl.addEventListener('click', () => {
        const text = this.inputTextAreaEl.value;
        const before = text.slice(0, lastAtIndex);
        const after = text.slice(lastAtIndex + 1 + this.suggestQuery.length);
        this.inputTextAreaEl.value = `${before}@${item.path} ${after}`;
        this.hideSuggest();
        this.inputTextAreaEl.focus();
      });
    }
  }

  private hideSuggest() {
    this.activeSuggestType = 'none';
    if (this.suggestPopupEl) {
      this.suggestPopupEl.style.display = 'none';
    }
  }

  private createNewSession() {
    const newSession = SessionManager.createNewSession(
      this.plugin.settings.activeProviderId || 'openrouter',
      this.plugin.settings.activeModel || ''
    );
    this.plugin.settings.sessions.unshift(newSession);
    this.plugin.settings.currentSessionId = newSession.id;
    this.currentSession = newSession;
    this.saveSessionState();
    this.renderMessages();
    this.refreshModelDropdown();
    new Notice('Started new chat session');
  }

  private openSessionsModal() {
    new SessionsModal(
      this.app,
      this.plugin.settings.sessions,
      this.currentSession.id,
      (selectedId) => {
        const found = this.plugin.settings.sessions.find((s) => s.id === selectedId);
        if (found) {
          this.currentSession = found;
          this.plugin.settings.currentSessionId = found.id;
          this.saveSessionState();
          this.renderMessages();
          this.refreshModelDropdown();
        }
      },
      (deletedId) => {
        this.plugin.settings.sessions = this.plugin.settings.sessions.filter((s) => s.id !== deletedId);
        if (this.currentSession.id === deletedId) {
          this.createNewSession();
        } else {
          this.saveSessionState();
        }
      },
      () => {
        this.createNewSession();
      }
    ).open();
  }

  private async saveSessionState() {
    await this.plugin.saveSettings();
  }

  private refreshModelDropdown() {
    if (!this.modelSelectEl) return;
    this.modelSelectEl.empty();

    const activeProv = this.plugin.settings.providers.find(
      (p) => p.id === this.plugin.settings.activeProviderId
    );
    const models = activeProv?.models || [];

    if (models.length === 0) {
      this.modelSelectEl.createEl('option', { value: '', text: '(No models)' });
      return;
    }

    const currentModel = this.currentSession.model || this.plugin.settings.activeModel || models[0];

    for (const m of models) {
      const opt = this.modelSelectEl.createEl('option', { value: m, text: m });
      if (m === currentModel) opt.selected = true;
    }

    if (!models.includes(currentModel)) {
      this.currentSession.model = models[0];
    }
  }

  private renderMessages() {
    if (!this.messagesContainerEl) return;
    this.messagesContainerEl.empty();

    if (this.currentSession.messages.length === 0) {
      const emptyContainerEl = this.messagesContainerEl.createEl('div', {
        cls: 'harness-empty-state-container',
      });
      emptyContainerEl.style.padding = '20px 12px';
      emptyContainerEl.style.display = 'flex';
      emptyContainerEl.style.flexDirection = 'column';
      emptyContainerEl.style.gap = '16px';

      const introEl = emptyContainerEl.createEl('div');
      introEl.style.textAlign = 'center';
      introEl.style.opacity = '0.75';
      introEl.createEl('h3', { text: 'Obsidian Harness Bot' });
      introEl.createEl('p', {
        text: "Start a conversation, type '/' for sessions, or '@' to attach notes and folders from your Vault.",
      });

      // Previous Sessions quick switcher
      const previousSessions = this.plugin.settings.sessions.filter(
        (s) => s.id !== this.currentSession.id && s.messages.length > 0
      );

      if (previousSessions.length > 0) {
        const prevBoxEl = emptyContainerEl.createEl('div', { cls: 'harness-prev-sessions-box' });
        prevBoxEl.style.border = '1px solid var(--background-modifier-border)';
        prevBoxEl.style.borderRadius = '8px';
        prevBoxEl.style.padding = '12px';
        prevBoxEl.style.backgroundColor = 'var(--background-secondary)';

        prevBoxEl.createEl('h4', { text: 'Previous Sessions' });

        const prevListEl = prevBoxEl.createEl('div');
        prevListEl.style.display = 'flex';
        prevListEl.style.flexDirection = 'column';
        prevListEl.style.gap = '6px';

        for (const prev of previousSessions.slice(0, 5)) {
          const itemBtn = prevListEl.createEl('div', { cls: 'harness-session-card' });
          itemBtn.style.padding = '8px 10px';
          itemBtn.style.borderRadius = '6px';
          itemBtn.style.cursor = 'pointer';
          itemBtn.style.backgroundColor = 'var(--background-primary)';
          itemBtn.style.border = '1px solid var(--background-modifier-border)';

          const titleRow = itemBtn.createEl('div', { text: prev.title });
          titleRow.style.fontWeight = 'bold';
          titleRow.style.fontSize = '0.9em';

          const dateStr = new Date(prev.updatedAt).toLocaleDateString();
          itemBtn.createEl('div', {
            text: `${dateStr} • ${prev.messages.length} messages`,
            cls: 'setting-item-description',
          });

          itemBtn.addEventListener('click', () => {
            this.currentSession = prev;
            this.plugin.settings.currentSessionId = prev.id;
            this.saveSessionState();
            this.renderMessages();
            this.refreshModelDropdown();
          });
        }
      }

      return;
    }

    for (const msg of this.currentSession.messages) {
      if (msg.role === 'user') {
        const msgEl = this.messagesContainerEl.createEl('div', { cls: 'harness-message harness-message-user' });
        msgEl.createEl('div', { text: 'You', cls: 'harness-message-header' });
        msgEl.createEl('div', {
          text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''),
          cls: 'harness-message-body',
        });
      } else if (msg.role === 'assistant') {
        if (msg.content) {
          const msgEl = this.messagesContainerEl.createEl('div', { cls: 'harness-message harness-message-assistant' });
          msgEl.createEl('div', { text: 'Harness Bot', cls: 'harness-message-header' });
          msgEl.createEl('div', {
            text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''),
            cls: 'harness-message-body',
          });
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            const card = this.messagesContainerEl.createEl('div', { cls: 'harness-tool-card' });
            card.createEl('div', { text: `Tool: ${tc.function.name}`, cls: 'harness-tool-title' });
            const argsPre = card.createEl('pre');
            argsPre.createEl('code', { text: tc.function.arguments });
          }
        }
      } else if (msg.role === 'tool') {
        const card = this.messagesContainerEl.createEl('div', { cls: 'harness-tool-card' });
        card.createEl('div', { text: `Tool Output (${msg.name})`, cls: 'harness-tool-title' });
        const outPre = card.createEl('pre');
        outPre.createEl('code', {
          text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''),
        });
      }
    }

    this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
  }

  async onClose(): Promise<void> {
    // Clean up
  }
}
