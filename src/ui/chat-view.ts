import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type HarnessPlugin from '../main';
import { LLMMessage, ToolCall } from '../types';
import { AgentHarness } from '../engine/agent';
import { ToolRegistry } from '../tools/registry';
import { MarkdownExporter } from '../utils/markdown-exporter';
import { ConfirmationModal } from './components/confirmation-modal';

export const HARNESS_VIEW_TYPE = 'harness-chat-view';

export class HarnessChatView extends ItemView {
  private plugin: HarnessPlugin;
  private toolRegistry: ToolRegistry;
  private agentHarness: AgentHarness;
  private exporter: MarkdownExporter;

  private conversationHistory: LLMMessage[] = [];
  private messagesContainerEl!: HTMLElement;
  private inputTextAreaEl!: HTMLTextAreaElement;
  private sendButtonEl!: HTMLButtonElement;
  private providerSelectEl!: HTMLSelectElement;
  private modelSelectEl!: HTMLSelectElement;

  private currentProviderId = 'openrouter';
  private currentModel = 'anthropic/claude-3.7-sonnet';

  constructor(leaf: WorkspaceLeaf, plugin: HarnessPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.toolRegistry = new ToolRegistry();
    this.agentHarness = new AgentHarness(this.app, this.plugin.settings, this.toolRegistry);
    this.exporter = new MarkdownExporter(this.app);
    this.currentProviderId = this.plugin.settings.activeProviderId || 'openrouter';
    this.currentModel = this.plugin.settings.activeModel || 'anthropic/claude-3.7-sonnet';
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
    headerEl.createEl('span', { text: '🤖 Harness Bot', cls: 'harness-title' });

    const selectorsEl = headerEl.createEl('div', { cls: 'harness-chat-header-actions' });

    // Provider Selector
    this.providerSelectEl = selectorsEl.createEl('select');
    this.refreshProviderDropdown();

    this.providerSelectEl.addEventListener('change', () => {
      this.currentProviderId = this.providerSelectEl.value;
      this.refreshModelDropdown();
    });

    // Model Selector
    this.modelSelectEl = selectorsEl.createEl('select');
    this.refreshModelDropdown();

    this.modelSelectEl.addEventListener('change', () => {
      this.currentModel = this.modelSelectEl.value;
    });

    // Export Button
    const exportBtn = selectorsEl.createEl('button', { text: '📤 Export' });
    exportBtn.addEventListener('click', async () => {
      if (this.conversationHistory.length === 0) {
        new Notice('No chat history to export.');
        return;
      }
      try {
        const exportedPath = await this.exporter.exportChatToMarkdown(
          this.conversationHistory,
          this.currentModel
        );
        new Notice(`Chat exported to ${exportedPath}`);
      } catch (e: any) {
        new Notice(`Export failed: ${e.message}`);
      }
    });

    // Clear Button
    const clearBtn = selectorsEl.createEl('button', { text: '🗑️ Clear' });
    clearBtn.addEventListener('click', () => {
      this.conversationHistory = [];
      this.renderMessages();
    });

    // Messages Area
    this.messagesContainerEl = container.createEl('div', { cls: 'harness-chat-messages' });

    // Input Area
    const inputAreaEl = container.createEl('div', { cls: 'harness-chat-input-area' });
    const inputContainerEl = inputAreaEl.createEl('div', { cls: 'harness-chat-input-container' });

    this.inputTextAreaEl = inputContainerEl.createEl('textarea', {
      cls: 'harness-chat-textarea',
      placeholder: 'Ask Harness Bot to read, search, plan, or create notes...',
    });

    this.sendButtonEl = inputContainerEl.createEl('button', { text: 'Send', cls: 'mod-cta' });

    const handleSend = async () => {
      const text = this.inputTextAreaEl.value.trim();
      if (!text) return;

      this.inputTextAreaEl.value = '';
      this.sendButtonEl.disabled = true;

      // Append clean user message to UI state (WITHOUT timestamp)
      const userMsg: LLMMessage = { role: 'user', content: text };
      this.conversationHistory.push(userMsg);
      this.renderMessages();

      // Streaming assistant placeholder container
      const streamingMsgEl = this.messagesContainerEl.createEl('div', {
        cls: 'harness-message harness-message-assistant',
      });
      streamingMsgEl.createEl('div', { text: `🤖 Harness Bot (${this.currentModel})`, cls: 'harness-message-header' });
      const textContentEl = streamingMsgEl.createEl('div', { cls: 'harness-message-body' });

      try {
        const updatedHistory = await this.agentHarness.runTurn(
          this.conversationHistory,
          (event) => {
            if (event.type === 'chunk' && event.content) {
              textContentEl.setText(event.content);
              this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
            } else if (event.type === 'tool_call' && event.toolCall) {
              const card = this.messagesContainerEl.createEl('div', { cls: 'harness-tool-card' });
              card.createEl('div', {
                text: `🛠️ Tool requested: ${event.toolCall.function.name}`,
                cls: 'harness-tool-title',
              });
            }
          },
          (toolCall: ToolCall) => {
            return new Promise<boolean>((resolve) => {
              new ConfirmationModal(this.app, toolCall, resolve).open();
            });
          },
          this.currentProviderId,
          this.currentModel
        );

        this.conversationHistory = updatedHistory;
      } catch (err: any) {
        new Notice(`Agent error: ${err.message}`);
        textContentEl.setText(`⚠️ Error: ${err.message}`);
      } finally {
        this.sendButtonEl.disabled = false;
        this.renderMessages();
      }
    };

    this.sendButtonEl.addEventListener('click', handleSend);
    this.inputTextAreaEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    this.renderMessages();
  }

  private refreshProviderDropdown() {
    if (!this.providerSelectEl) return;
    this.providerSelectEl.empty();
    for (const p of this.plugin.settings.providers) {
      const opt = this.providerSelectEl.createEl('option', { value: p.id, text: p.name });
      if (p.id === this.currentProviderId) opt.selected = true;
    }
  }

  private refreshModelDropdown() {
    if (!this.modelSelectEl) return;
    this.modelSelectEl.empty();

    const currentProv = this.plugin.settings.providers.find((p) => p.id === this.currentProviderId);
    const models = currentProv?.models || [];

    for (const m of models) {
      const opt = this.modelSelectEl.createEl('option', { value: m, text: m });
      if (m === this.currentModel) opt.selected = true;
    }

    if (models.length > 0 && !models.includes(this.currentModel)) {
      this.currentModel = models[0];
    }
  }

  private renderMessages() {
    if (!this.messagesContainerEl) return;
    this.messagesContainerEl.empty();

    if (this.conversationHistory.length === 0) {
      const emptyEl = this.messagesContainerEl.createEl('div', {
        cls: 'harness-empty-state',
        text: 'No active conversation. Type a message below to start Obsidian Harness Bot.',
      });
      emptyEl.style.opacity = '0.6';
      emptyEl.style.textAlign = 'center';
      emptyEl.style.padding = '32px 16px';
      return;
    }

    for (const msg of this.conversationHistory) {
      if (msg.role === 'user') {
        const msgEl = this.messagesContainerEl.createEl('div', { cls: 'harness-message harness-message-user' });
        msgEl.createEl('div', { text: '👤 You', cls: 'harness-message-header' });
        msgEl.createEl('div', {
          text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''),
          cls: 'harness-message-body',
        });
      } else if (msg.role === 'assistant') {
        if (msg.content) {
          const msgEl = this.messagesContainerEl.createEl('div', { cls: 'harness-message harness-message-assistant' });
          msgEl.createEl('div', { text: '🤖 Harness Bot', cls: 'harness-message-header' });
          msgEl.createEl('div', {
            text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''),
            cls: 'harness-message-body',
          });
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            const card = this.messagesContainerEl.createEl('div', { cls: 'harness-tool-card' });
            card.createEl('div', { text: `🛠️ Tool: ${tc.function.name}`, cls: 'harness-tool-title' });
            const argsPre = card.createEl('pre');
            argsPre.createEl('code', { text: tc.function.arguments });
          }
        }
      } else if (msg.role === 'tool') {
        const card = this.messagesContainerEl.createEl('div', { cls: 'harness-tool-card' });
        card.createEl('div', { text: `⚙️ Tool Output (${msg.name})`, cls: 'harness-tool-title' });
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
