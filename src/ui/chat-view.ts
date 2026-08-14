import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import type HarnessPlugin from '../main';
import { ChatSession, LLMMessage, ToolCall } from '../types';
import { AgentHarness } from '../engine/agent';
import { ToolRegistry } from '../tools/registry';
import { MarkdownExporter } from '../utils/markdown-exporter';
import { SessionManager } from '../utils/session-manager';
import { MentionHelper } from '../utils/mention-helper';
import { ConfirmationModal } from './components/confirmation-modal';
import { SessionsModal } from './components/sessions-modal';

export const HARNESS_VIEW_TYPE = 'harness-chat-view';

interface SlashCommandItem {
  cmd: string;
  desc: string;
  action: () => void;
}

export class HarnessChatView extends ItemView {
  private plugin: HarnessPlugin;
  private toolRegistry: ToolRegistry;
  private agentHarness: AgentHarness;
  private exporter: MarkdownExporter;

  private currentSession!: ChatSession;
  private messagesContainerEl!: HTMLElement;
  private inputAreaEl!: HTMLElement;
  private inputTextAreaEl!: HTMLTextAreaElement;
  private expandBtnEl!: HTMLButtonElement;
  private sendButtonEl!: HTMLButtonElement;
  private modelSelectEl!: HTMLSelectElement;
  private suggestPopupEl!: HTMLElement;

  private isInputExpanded = false;
  private activeSuggestType: 'none' | 'slash' | 'mention' = 'none';
  private selectedSuggestIndex = 0;
  private currentSuggestItems: Array<{ label: string; onSelect: () => void }> = [];
  private currentAbortController: AbortController | null = null;

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

    // Input Area
    this.inputAreaEl = container.createEl('div', { cls: 'harness-chat-input-area' });

    // Suggestion Popup for / and @
    this.suggestPopupEl = this.inputAreaEl.createEl('div', { cls: 'harness-suggest-popup' });
    this.suggestPopupEl.style.display = 'none';

    const textareaWrapperEl = this.inputAreaEl.createEl('div', { cls: 'harness-textarea-wrapper' });

    this.inputTextAreaEl = textareaWrapperEl.createEl('textarea', {
      cls: 'harness-chat-textarea',
      placeholder: "Ask Harness Bot... ('/' for commands, '@' for notes)",
    });

    // Expand / Fullview button in top-right corner of textarea
    this.expandBtnEl = textareaWrapperEl.createEl('button', { cls: 'harness-expand-btn clickable-icon' });
    this.expandBtnEl.setAttribute('aria-label', 'Expand to full view');
    this.expandBtnEl.style.display = 'none';
    setIcon(this.expandBtnEl, 'maximize-2');

    this.expandBtnEl.addEventListener('click', () => {
      this.toggleInputExpand();
    });

    const bottomRowEl = this.inputAreaEl.createEl('div', { cls: 'harness-chat-bottom-row' });

    // Model Selector on the left of bottom row
    this.modelSelectEl = bottomRowEl.createEl('select', { cls: 'harness-model-select' });
    this.refreshModelDropdown();

    this.modelSelectEl.addEventListener('change', async () => {
      this.currentSession.model = this.modelSelectEl.value;
      this.plugin.settings.activeModel = this.modelSelectEl.value;
      await this.saveSessionState();
    });

    // Send / Stop button as an icon
    this.sendButtonEl = bottomRowEl.createEl('button', { cls: 'harness-send-btn mod-cta clickable-icon' });
    this.setSendButtonState(false);

    const handleSendOrStop = async () => {
      if (this.currentAbortController) {
        this.currentAbortController.abort();
        this.currentAbortController = null;
        this.setSendButtonState(false);
        new Notice('Generation stopped.');
        return;
      }

      const text = this.inputTextAreaEl.value.trim();
      if (!text) return;

      // Handle slash commands
      if (text === '/sessions' || text === '/history') {
        this.inputTextAreaEl.value = '';
        this.hideSuggest();
        this.resetTextareaHeight();
        this.openSessionsModal();
        return;
      } else if (text === '/new') {
        this.inputTextAreaEl.value = '';
        this.hideSuggest();
        this.resetTextareaHeight();
        this.createNewSession();
        return;
      } else if (text === '/clear') {
        this.inputTextAreaEl.value = '';
        this.hideSuggest();
        this.resetTextareaHeight();
        this.currentSession.messages = [];
        await this.saveSessionState();
        this.renderMessages();
        return;
      } else if (text === '/export') {
        this.inputTextAreaEl.value = '';
        this.hideSuggest();
        this.resetTextareaHeight();
        exportBtn.click();
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
      this.resetTextareaHeight();
      if (this.isInputExpanded) {
        this.toggleInputExpand();
      }

      // Set generating state (Stop icon)
      this.currentAbortController = new AbortController();
      this.setSendButtonState(true);

      // Set auto-title on first message
      if (this.currentSession.messages.length === 0) {
        this.currentSession.title = SessionManager.generateTitle(text);
      }

      // Enriched text with resolved @mentions
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
          this.currentSession.model || this.plugin.settings.activeModel,
          this.currentAbortController.signal
        );

        this.currentSession.messages = updatedHistory;
        this.currentSession.updatedAt = Date.now();
        await this.saveSessionState();
      } catch (err: any) {
        if (err.message && err.message.includes('stopped')) {
          textContentEl.setText(textContentEl.innerText + ' [Stopped]');
        } else {
          new Notice(`Agent error: ${err.message}`);
          textContentEl.setText(`Error: ${err.message}`);
        }
      } finally {
        this.currentAbortController = null;
        this.setSendButtonState(false);
        this.renderMessages();
      }
    };

    this.sendButtonEl.addEventListener('click', handleSendOrStop);

    this.inputTextAreaEl.addEventListener('input', () => {
      this.autoResizeTextarea();
      this.handleInputSuggest();
    });

    this.inputTextAreaEl.addEventListener('focus', () => {
      setTimeout(() => {
        if (this.messagesContainerEl) {
          this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
        }
      }, 150);
    });

    this.inputTextAreaEl.addEventListener('keydown', (e) => {
      if (this.activeSuggestType !== 'none') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.selectedSuggestIndex = (this.selectedSuggestIndex + 1) % Math.max(1, this.currentSuggestItems.length);
          this.highlightSuggestItem();
          return;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.selectedSuggestIndex = (this.selectedSuggestIndex - 1 + this.currentSuggestItems.length) % Math.max(1, this.currentSuggestItems.length);
          this.highlightSuggestItem();
          return;
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          if (this.currentSuggestItems[this.selectedSuggestIndex]) {
            e.preventDefault();
            this.currentSuggestItems[this.selectedSuggestIndex].onSelect();
            return;
          }
        } else if (e.key === 'Escape') {
          this.hideSuggest();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendOrStop();
      }
    });

    this.renderMessages();
  }

  private autoResizeTextarea() {
    if (this.isInputExpanded) return;

    this.inputTextAreaEl.style.height = 'auto';
    const nextHeight = Math.min(160, Math.max(48, this.inputTextAreaEl.scrollHeight));
    this.inputTextAreaEl.style.height = `${nextHeight}px`;

    const lineCount = this.inputTextAreaEl.value.split('\n').length;
    const isLong = lineCount >= 4 || this.inputTextAreaEl.scrollHeight > 85;
    this.expandBtnEl.style.display = isLong ? 'flex' : 'none';
  }

  private resetTextareaHeight() {
    if (this.isInputExpanded) return;
    this.inputTextAreaEl.style.height = '48px';
    this.expandBtnEl.style.display = 'none';
  }

  private toggleInputExpand() {
    this.isInputExpanded = !this.isInputExpanded;
    if (this.isInputExpanded) {
      this.inputAreaEl.addClass('is-expanded');
      setIcon(this.expandBtnEl, 'minimize-2');
      this.expandBtnEl.setAttribute('aria-label', 'Collapse view');
      this.expandBtnEl.style.display = 'flex';
      this.inputTextAreaEl.focus();
    } else {
      this.inputAreaEl.removeClass('is-expanded');
      setIcon(this.expandBtnEl, 'maximize-2');
      this.expandBtnEl.setAttribute('aria-label', 'Expand to full view');
      this.autoResizeTextarea();
      this.inputTextAreaEl.focus();
    }
  }

  private setSendButtonState(isGenerating: boolean) {
    if (!this.sendButtonEl) return;
    this.sendButtonEl.empty();
    if (isGenerating) {
      setIcon(this.sendButtonEl, 'square');
      this.sendButtonEl.addClass('mod-warning');
      this.sendButtonEl.removeClass('mod-cta');
      this.sendButtonEl.setAttribute('aria-label', 'Stop generation');
    } else {
      setIcon(this.sendButtonEl, 'send');
      this.sendButtonEl.addClass('mod-cta');
      this.sendButtonEl.removeClass('mod-warning');
      this.sendButtonEl.setAttribute('aria-label', 'Send message');
    }
  }

  private handleInputSuggest() {
    const text = this.inputTextAreaEl.value;
    const cursorPos = this.inputTextAreaEl.selectionStart || text.length;
    const beforeCursor = text.slice(0, cursorPos);

    // Check Slash Command
    const slashMatch = beforeCursor.match(/\/([a-zA-Z0-9_-]*)$/);
    if (slashMatch) {
      this.activeSuggestType = 'slash';
      const query = slashMatch[1].toLowerCase();
      this.renderSlashSuggest(query, slashMatch.index || 0);
      return;
    }

    // Check @ Mention
    const atMatch = beforeCursor.match(/@([a-zA-Z0-9_\-\.\/]*)$/);
    if (atMatch) {
      this.activeSuggestType = 'mention';
      const query = atMatch[1];
      this.renderMentionSuggest(query, atMatch.index || 0);
      return;
    }

    this.hideSuggest();
  }

  private renderSlashSuggest(query: string, matchIndex: number) {
    if (!this.suggestPopupEl) return;
    this.suggestPopupEl.empty();
    this.currentSuggestItems = [];
    this.selectedSuggestIndex = 0;

    const commands: SlashCommandItem[] = [
      {
        cmd: '/sessions',
        desc: 'View & switch saved chat sessions',
        action: () => {
          this.inputTextAreaEl.value = '';
          this.hideSuggest();
          this.resetTextareaHeight();
          this.openSessionsModal();
        },
      },
      {
        cmd: '/new',
        desc: 'Start a new conversation session',
        action: () => {
          this.inputTextAreaEl.value = '';
          this.hideSuggest();
          this.resetTextareaHeight();
          this.createNewSession();
        },
      },
      {
        cmd: '/clear',
        desc: 'Clear messages in current session',
        action: () => {
          this.inputTextAreaEl.value = '';
          this.hideSuggest();
          this.resetTextareaHeight();
          this.currentSession.messages = [];
          this.saveSessionState();
          this.renderMessages();
        },
      },
      {
        cmd: '/export',
        desc: 'Export chat to Markdown note',
        action: () => {
          this.inputTextAreaEl.value = '';
          this.hideSuggest();
          this.resetTextareaHeight();
          this.exporter.exportChatToMarkdown(
            this.currentSession.messages,
            this.currentSession.model || this.plugin.settings.activeModel || 'default'
          );
        },
      },
    ];

    const filtered = commands.filter((c) => c.cmd.toLowerCase().includes(query) || c.desc.toLowerCase().includes(query));

    if (filtered.length === 0) {
      this.hideSuggest();
      return;
    }

    this.suggestPopupEl.style.display = 'flex';

    filtered.forEach((item, index) => {
      const onSelect = () => item.action();
      this.currentSuggestItems.push({ label: item.cmd, onSelect });

      const itemEl = this.suggestPopupEl.createEl('div', { cls: 'harness-suggest-item' });
      if (index === 0) itemEl.addClass('is-selected');

      itemEl.createEl('strong', { text: item.cmd });
      itemEl.createEl('span', { text: ` - ${item.desc}` });

      itemEl.addEventListener('click', onSelect);
    });
  }

  private renderMentionSuggest(query: string, matchIndex: number) {
    if (!this.suggestPopupEl) return;
    this.suggestPopupEl.empty();
    this.currentSuggestItems = [];
    this.selectedSuggestIndex = 0;

    const items = MentionHelper.getVaultItems(this.app, query);

    if (items.length === 0) {
      this.hideSuggest();
      return;
    }

    this.suggestPopupEl.style.display = 'flex';

    items.forEach((item, index) => {
      const onSelect = () => {
        const text = this.inputTextAreaEl.value;
        const before = text.slice(0, matchIndex);
        const after = text.slice(matchIndex + 1 + query.length);
        this.inputTextAreaEl.value = `${before}@${item.path} ${after}`;
        this.hideSuggest();
        this.autoResizeTextarea();
        this.inputTextAreaEl.focus();
      };

      this.currentSuggestItems.push({ label: item.path, onSelect });

      const itemEl = this.suggestPopupEl.createEl('div', { cls: 'harness-suggest-item' });
      if (index === 0) itemEl.addClass('is-selected');

      const iconSpan = itemEl.createEl('span', { cls: 'harness-suggest-icon' });
      setIcon(iconSpan, item.isFolder ? 'folder' : 'file-text');

      itemEl.createEl('span', { text: ` ${item.path}` });

      itemEl.addEventListener('click', onSelect);
    });
  }

  private highlightSuggestItem() {
    if (!this.suggestPopupEl) return;
    const itemEls = this.suggestPopupEl.querySelectorAll('.harness-suggest-item');
    itemEls.forEach((el, idx) => {
      if (idx === this.selectedSuggestIndex) {
        el.addClass('is-selected');
        (el as HTMLElement).scrollIntoView({ block: 'nearest' });
      } else {
        el.removeClass('is-selected');
      }
    });
  }

  private hideSuggest() {
    this.activeSuggestType = 'none';
    this.currentSuggestItems = [];
    if (this.suggestPopupEl) {
      this.suggestPopupEl.style.display = 'none';
      this.suggestPopupEl.empty();
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
    const idx = this.plugin.settings.sessions.findIndex((s) => s.id === this.currentSession.id);
    if (idx !== -1) {
      this.plugin.settings.sessions[idx] = this.currentSession;
    } else {
      this.plugin.settings.sessions.unshift(this.currentSession);
    }
    this.plugin.settings.currentSessionId = this.currentSession.id;
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

    const selectedModel = this.currentSession.model || this.plugin.settings.activeModel || models[0];

    for (const m of models) {
      const opt = this.modelSelectEl.createEl('option', { value: m, text: m });
      if (m === selectedModel) opt.selected = true;
    }

    if (!models.includes(selectedModel)) {
      this.currentSession.model = models[0];
      this.plugin.settings.activeModel = models[0];
    } else {
      this.currentSession.model = selectedModel;
      this.plugin.settings.activeModel = selectedModel;
    }
  }

  private renderMessages() {
    if (!this.messagesContainerEl) return;
    this.messagesContainerEl.empty();

    if (this.currentSession.messages.length === 0) {
      // Previous Sessions quick switcher (if available)
      const previousSessions = this.plugin.settings.sessions.filter(
        (s) => s.id !== this.currentSession.id && s.messages.length > 0
      );

      if (previousSessions.length > 0) {
        const emptyContainerEl = this.messagesContainerEl.createEl('div', {
          cls: 'harness-empty-state-container',
        });

        const prevBoxEl = emptyContainerEl.createEl('div', { cls: 'harness-prev-sessions-box' });
        prevBoxEl.style.width = '100%';
        prevBoxEl.style.maxWidth = '360px';
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
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
  }
}
