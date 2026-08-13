import { ItemView, WorkspaceLeaf, Notice, MarkdownView } from 'obsidian';
import type HarnessPlugin from '../main';
import { LLMMessage, ProviderType, ToolCall } from '../types';
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

  constructor(leaf: WorkspaceLeaf, plugin: HarnessPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.toolRegistry = new ToolRegistry();
    this.agentHarness = new AgentHarness(this.app, this.plugin.settings, this.toolRegistry);
    this.exporter = new MarkdownExporter(this.app);
  }

  getViewType(): string {
    return HARNESS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Agent Harness';
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
    headerEl.createEl('span', { text: '🤖 Agent Harness', cls: 'harness-title' });

    const actionsEl = headerEl.createEl('div', { cls: 'harness-chat-header-actions' });

    // Provider Selector
    this.providerSelectEl = actionsEl.createEl('select');
    const providers: { id: ProviderType; label: string }[] = [
      { id: 'openrouter', label: 'OpenRouter' },
      { id: 'openai', label: 'OpenAI' },
      { id: 'anthropic', label: 'Anthropic' },
      { id: 'ollama', label: 'Ollama' },
    ];
    for (const p of providers) {
      const opt = this.providerSelectEl.createEl('option', { value: p.id, text: p.label });
      if (p.id === this.plugin.settings.defaultProvider) opt.selected = true;
    }
    this.providerSelectEl.addEventListener('change', async () => {
      this.plugin.settings.defaultProvider = this.providerSelectEl.value as ProviderType;
      await this.plugin.saveSettings();
    });

    // Export Button
    const exportBtn = actionsEl.createEl('button', { text: '📤 Export' });
    exportBtn.addEventListener('click', async () => {
      if (this.conversationHistory.length === 0) {
        new Notice('No chat history to export.');
        return;
      }
      try {
        const exportedPath = await this.exporter.exportChatToMarkdown(
          this.conversationHistory,
          this.plugin.settings.defaultModel
        );
        new Notice(`Chat exported to ${exportedPath}`);
      } catch (e: any) {
        new Notice(`Export failed: ${e.message}`);
      }
    });

    // Clear Button
    const clearBtn = actionsEl.createEl('button', { text: '🗑️ Clear' });
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
      placeholder: 'Ask the Agent to inspect, search, or write notes...',
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
      streamingMsgEl.createEl('div', { text: '🤖 Agent thinking...', cls: 'harness-message-header' });
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
          }
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

  private renderMessages() {
    if (!this.messagesContainerEl) return;
    this.messagesContainerEl.empty();

    if (this.conversationHistory.length === 0) {
      const emptyEl = this.messagesContainerEl.createEl('div', {
        cls: 'harness-empty-state',
        text: 'No active conversation. Type a message below to start the Agent Harness.',
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
        msgEl.createEl('div', { text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''), cls: 'harness-message-body' });
      } else if (msg.role === 'assistant') {
        if (msg.content) {
          const msgEl = this.messagesContainerEl.createEl('div', { cls: 'harness-message harness-message-assistant' });
          msgEl.createEl('div', { text: '🤖 Agent', cls: 'harness-message-header' });
          msgEl.createEl('div', { text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''), cls: 'harness-message-body' });
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
        outPre.createEl('code', { text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '') });
      }
    }

    this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
  }

  async onClose(): Promise<void> {
    // Clean up
  }
}
