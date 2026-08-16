import { ItemView, WorkspaceLeaf, Notice, setIcon, MarkdownRenderer } from 'obsidian';
import type HarnessPlugin from '../main';
import { AgentConfig, ChatSession, LLMMessage, ToolCall } from '../types';
import { AgentHarness } from '../engine/agent';
import { ToolRegistry } from '../tools/registry';
import { MarkdownExporter } from '../utils/markdown-exporter';
import { SessionManager } from '../utils/session-manager';
import { MentionHelper } from '../utils/mention-helper';
import { parseThoughts } from '../utils/thought-helper';
import { ConfirmationModal } from './components/confirmation-modal';
import { SessionsModal } from './components/sessions-modal';
import { SearchableModelSelect } from './components/searchable-model-select';
import { SubagentCard } from './components/subagent-card';
import { SkillsModal } from './skills-modal';
import { McpModal } from './mcp-modal';

export const HARNESS_VIEW_TYPE = 'harness-chat-view';

export interface PendingAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  vaultPath: string;
  isImage: boolean;
  dataUrl?: string;
  textContent?: string;
}

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
  private attachBtnEl!: HTMLButtonElement;
  private sendButtonEl!: HTMLButtonElement;
  private pendingAttachmentsEl!: HTMLElement;
  private searchableModelSelect!: SearchableModelSelect;
  private suggestPopupEl!: HTMLElement;
  private agentSelectEl?: HTMLSelectElement;
  private agentIconEl?: HTMLElement;
  private effortSelectEl?: HTMLSelectElement;
  private workspaceBadgeEl?: HTMLElement;

  private pendingAttachments: PendingAttachment[] = [];
  private isInputExpanded = false;
  private activeSuggestType: 'none' | 'slash' | 'mention' = 'none';
  private selectedSuggestIndex = 0;
  private currentSuggestItems: Array<{ label: string; onSelect: () => void }> = [];
  private currentAbortController: AbortController | null = null;
  private activeSubagentCards: Map<string, SubagentCard> = new Map();

  constructor(leaf: WorkspaceLeaf, plugin: HarnessPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.toolRegistry = this.plugin.toolRegistry || new ToolRegistry(this.plugin.skillManager, this.plugin.mcpManager, this.plugin.settings);
    this.agentHarness = new AgentHarness(this.app, this.plugin.settings, this.toolRegistry, this.plugin.agentManager);
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
        this.plugin.settings.activeModel || '',
        this.plugin.settings.activeAgentId || 'main'
      );
      this.plugin.settings.sessions.unshift(existing);
      this.plugin.settings.currentSessionId = existing.id;
    }

    this.currentSession = existing;
    if (!this.currentSession.activeAgentId) {
      this.currentSession.activeAgentId = this.plugin.settings.activeAgentId || 'main';
    }
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

  public refreshAgentDropdown(): void {
    if (!this.agentSelectEl) return;
    this.agentSelectEl.empty();

    const agents = this.plugin.agentManager ? this.plugin.agentManager.getAllAgents() : [];

    if (agents.length === 0) {
      this.agentSelectEl.createEl('option', {
        value: 'main',
        text: 'Main Agent',
      });
    } else {
      for (const agent of agents) {
        this.agentSelectEl.createEl('option', {
          value: agent.id,
          text: agent.name,
        });
      }
    }

    const currentActiveId = this.currentSession?.activeAgentId || this.plugin.settings.activeAgentId || 'main';
    const found = agents.find((a) => a.id === currentActiveId);
    if (found) {
      this.agentSelectEl.value = found.id;
    } else if (agents.length > 0) {
      this.agentSelectEl.value = agents[0].id;
    } else {
      this.agentSelectEl.value = 'main';
    }

    const activeAgent = this.plugin.agentManager ? this.plugin.agentManager.getActiveAgent(this.agentSelectEl.value) : undefined;
    if (this.agentIconEl) {
      setIcon(this.agentIconEl, (!activeAgent || activeAgent.isDefaultMain || activeAgent.id === 'main') ? 'bot' : 'user');
    }

    this.updateWorkspaceBadge(activeAgent);
  }

  public refreshEffortDropdown(): void {
    if (!this.effortSelectEl) return;
    const currentEffort = this.currentSession?.reasoningEffort || this.plugin.settings.defaultReasoningEffort || 'default';
    this.effortSelectEl.value = currentEffort;
  }

  private triggerFileInput(): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = 'image/*,.pdf,.txt,.md,.json,.js,.ts,.py,.csv,.html,.css,.doc,.docx,.xml,.yaml,.yml';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', async () => {
      const files = fileInput.files;
      if (files && files.length > 0) {
        await this.handleFilesUpload(Array.from(files));
      }
      fileInput.remove();
    });

    fileInput.click();
  }

  private async handleFilesUpload(files: File[]): Promise<void> {
    for (const file of files) {
      try {
        const pending = await this.saveFileToVaultAndCreateAttachment(file);
        this.pendingAttachments.push(pending);
        new Notice(`Saved "${file.name}" to vault (${pending.vaultPath})`);
      } catch (err: any) {
        new Notice(`Failed to save "${file.name}": ${err.message}`);
      }
    }
    this.renderPendingAttachments();
  }

  private async saveFileToVaultAndCreateAttachment(file: File): Promise<PendingAttachment> {
    let targetFolder = 'Attachments';
    try {
      const exists = await this.app.vault.adapter.exists(targetFolder);
      if (!exists) {
        await this.app.vault.createFolder(targetFolder);
      }
    } catch (e) {
      targetFolder = '';
    }

    const rawName = file.name.replace(/[\\/:*?"<>|]/g, '_');
    const dotIndex = rawName.lastIndexOf('.');
    const baseName = dotIndex !== -1 ? rawName.slice(0, dotIndex) : rawName;
    const ext = dotIndex !== -1 ? rawName.slice(dotIndex) : '';

    let vaultPath = targetFolder ? `${targetFolder}/${rawName}` : rawName;
    let counter = 1;
    while (await this.app.vault.adapter.exists(vaultPath)) {
      vaultPath = targetFolder ? `${targetFolder}/${baseName}_${counter}${ext}` : `${baseName}_${counter}${ext}`;
      counter++;
    }

    const arrayBuffer = await file.arrayBuffer();
    await this.app.vault.createBinary(vaultPath, arrayBuffer);

    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(file.name);
    let dataUrl: string | undefined = undefined;
    let textContent: string | undefined = undefined;

    if (isImage) {
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const mime = file.type || 'image/png';
      dataUrl = `data:${mime};base64,${base64}`;
    } else if (file.type.startsWith('text/') || /\.(md|txt|json|js|ts|py|csv|html|css|yaml|yml|xml|sh|env)$/i.test(file.name)) {
      const decoder = new TextDecoder('utf-8');
      textContent = decoder.decode(arrayBuffer);
    }

    return {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      vaultPath,
      isImage,
      dataUrl,
      textContent,
    };
  }

  private renderPendingAttachments(): void {
    if (!this.pendingAttachmentsEl) return;
    this.pendingAttachmentsEl.empty();

    if (this.pendingAttachments.length === 0) {
      this.pendingAttachmentsEl.style.display = 'none';
      return;
    }

    this.pendingAttachmentsEl.style.display = 'flex';

    for (let i = 0; i < this.pendingAttachments.length; i++) {
      const att = this.pendingAttachments[i];
      const chipEl = this.pendingAttachmentsEl.createEl('div', { cls: 'harness-attachment-chip' });

      if (att.isImage && att.dataUrl) {
        const imgEl = chipEl.createEl('img', { cls: 'harness-attachment-thumb' });
        imgEl.src = att.dataUrl;
        imgEl.alt = att.name;
      } else {
        const iconSpan = chipEl.createEl('span', { cls: 'harness-attachment-icon' });
        setIcon(iconSpan, att.name.endsWith('.pdf') ? 'file-text' : 'file');
      }

      const infoEl = chipEl.createEl('div', { cls: 'harness-attachment-info' });
      const nameEl = infoEl.createEl('span', { cls: 'harness-attachment-name', text: att.name });
      nameEl.setAttribute('title', `${att.name} (${att.vaultPath})`);

      const sizeKb = Math.max(1, Math.round(att.size / 1024));
      infoEl.createEl('span', { cls: 'harness-attachment-size', text: `${sizeKb} KB • vault` });

      const removeBtn = chipEl.createEl('button', { cls: 'harness-attachment-remove' });
      removeBtn.setText('✕');
      removeBtn.setAttribute('aria-label', `Remove ${att.name}`);
      removeBtn.setAttribute('title', `Remove ${att.name}`);
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pendingAttachments.splice(i, 1);
        this.renderPendingAttachments();
      });
    }
  }

  private updateWorkspaceBadge(agent?: AgentConfig): void {
    if (!this.workspaceBadgeEl) return;
    if (agent && agent.workspacePath && agent.workspacePath.trim().length > 0) {
      const cleanPath = agent.workspacePath.trim();
      this.workspaceBadgeEl.setText(`📁 ${cleanPath}`);
      this.workspaceBadgeEl.setAttribute('title', `Workspace Scope: ${cleanPath}`);
      this.workspaceBadgeEl.style.display = 'inline-flex';
    } else {
      this.workspaceBadgeEl.setText('');
      this.workspaceBadgeEl.removeAttribute('title');
      this.workspaceBadgeEl.style.display = 'none';
    }
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
    newSessionBtn.setAttribute('title', 'New Session');
    setIcon(newSessionBtn, 'plus');
    newSessionBtn.addEventListener('click', () => {
      this.createNewSession();
    });

    // Sessions List Button
    const sessionsBtn = headerActionsEl.createEl('button', { cls: 'clickable-icon' });
    sessionsBtn.setAttribute('aria-label', 'View Saved Sessions (/sessions)');
    sessionsBtn.setAttribute('title', 'View Saved Sessions (/sessions)');
    setIcon(sessionsBtn, 'history');
    sessionsBtn.addEventListener('click', () => {
      this.openSessionsModal();
    });

    // Export Button
    const exportBtn = headerActionsEl.createEl('button', { cls: 'clickable-icon' });
    exportBtn.setAttribute('aria-label', 'Export Chat to Markdown (/export)');
    exportBtn.setAttribute('title', 'Export Chat to Markdown (/export)');
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
    clearBtn.setAttribute('aria-label', 'Clear Messages in Session (/clear)');
    clearBtn.setAttribute('title', 'Clear Messages in Session (/clear)');
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

    // Input Card Container (Box containing attachments, textarea, and inner bottom buttons)
    const inputCardEl = this.inputAreaEl.createEl('div', { cls: 'harness-input-card' });

    // Pending Attachments Tray
    this.pendingAttachmentsEl = inputCardEl.createEl('div', { cls: 'harness-attachments-tray' });
    this.pendingAttachmentsEl.style.display = 'none';

    // Textarea Wrapper
    const textareaWrapperEl = inputCardEl.createEl('div', { cls: 'harness-textarea-wrapper' });

    this.inputTextAreaEl = textareaWrapperEl.createEl('textarea', {
      cls: 'harness-chat-textarea',
      placeholder: 'Спросите что угодно... "Создать CLI команду для..."',
    });
    this.inputTextAreaEl.setAttribute('aria-label', 'Chat message input');

    // Expand / Fullview button in top-right corner of textarea
    this.expandBtnEl = textareaWrapperEl.createEl('button', { cls: 'harness-expand-btn clickable-icon' });
    this.expandBtnEl.setAttribute('aria-label', 'Expand to full view');
    this.expandBtnEl.setAttribute('title', 'Expand to full view');
    this.expandBtnEl.style.display = 'none';
    setIcon(this.expandBtnEl, 'maximize-2');

    this.expandBtnEl.addEventListener('click', () => {
      this.toggleInputExpand();
    });

    // Card Bottom Row (inside the card: + button on left, ↑ send button on right)
    const cardBottomRowEl = inputCardEl.createEl('div', { cls: 'harness-input-card-bottom' });

    // + (Add Photo / File) Button
    this.attachBtnEl = cardBottomRowEl.createEl('button', { cls: 'harness-attach-btn clickable-icon' });
    this.attachBtnEl.setAttribute('aria-label', 'Attach photo or file (saved to vault)');
    this.attachBtnEl.setAttribute('title', 'Attach photo or file (saved to vault)');
    setIcon(this.attachBtnEl, 'plus');

    this.attachBtnEl.addEventListener('click', () => {
      this.triggerFileInput();
    });

    // Send / Stop button inside the card on the right
    this.sendButtonEl = cardBottomRowEl.createEl('button', { cls: 'harness-send-btn mod-cta clickable-icon' });
    this.setSendButtonState(false);

    // Bottom Toolbar Row (underneath the card: Agent selector, Model selector, Effort selector)
    const bottomToolbarEl = this.inputAreaEl.createEl('div', { cls: 'harness-bottom-toolbar' });

    // 1. Agent Selector Container
    const agentSelectContainer = bottomToolbarEl.createEl('div', { cls: 'harness-agent-select-container' });
    this.agentIconEl = agentSelectContainer.createEl('span', { cls: 'harness-agent-icon' });
    setIcon(this.agentIconEl, 'bot');

    this.agentSelectEl = agentSelectContainer.createEl('select', { cls: 'dropdown harness-agent-select' });
    this.agentSelectEl.setAttribute('aria-label', 'Select Active Agent');

    this.agentSelectEl.addEventListener('change', async () => {
      const val = this.agentSelectEl?.value || 'main';
      const selectedAgent = this.plugin.agentManager ? this.plugin.agentManager.getAgent(val) : undefined;
      this.currentSession.activeAgentId = selectedAgent ? selectedAgent.id : 'main';
      this.plugin.settings.activeAgentId = this.currentSession.activeAgentId;

      if (this.agentIconEl) {
        setIcon(this.agentIconEl, (!selectedAgent || selectedAgent.isDefaultMain || selectedAgent.id === 'main') ? 'bot' : 'user');
      }

      if (selectedAgent?.model) {
        this.currentSession.model = selectedAgent.model;
        this.refreshModelDropdown();
      }

      this.updateWorkspaceBadge(selectedAgent);
      await this.saveSessionState();
    });

    // Workspace Scope Badge
    this.workspaceBadgeEl = agentSelectContainer.createEl('span', { cls: 'harness-workspace-badge' });
    this.workspaceBadgeEl.style.display = 'none';

    this.refreshAgentDropdown();

    // 2. Searchable Model Selector
    const modelSelectWrapper = bottomToolbarEl.createEl('div', { cls: 'harness-model-select-wrapper' });
    this.searchableModelSelect = new SearchableModelSelect(modelSelectWrapper, {
      models: [],
      selectedModel: '',
      onChange: async (val: string) => {
        this.currentSession.model = val;
        this.plugin.settings.activeModel = val;
        await this.saveSessionState();
      },
    });
    this.refreshModelDropdown();

    // 3. Reasoning Effort Selector (Pill styled dropdown: По Умолчанию ˅)
    const effortContainer = bottomToolbarEl.createEl('div', { cls: 'harness-effort-select-container' });
    this.effortSelectEl = effortContainer.createEl('select', { cls: 'dropdown harness-effort-select' });
    this.effortSelectEl.setAttribute('aria-label', 'Reasoning Effort');

    const effortOptions = [
      { value: 'default', label: 'По Умолчанию' },
      { value: 'low', label: 'Низкий' },
      { value: 'medium', label: 'Средний' },
      { value: 'high', label: 'Высокий' },
    ];

    for (const opt of effortOptions) {
      this.effortSelectEl.createEl('option', { value: opt.value, text: opt.label });
    }

    this.effortSelectEl.addEventListener('change', async () => {
      const val = this.effortSelectEl?.value || 'default';
      this.currentSession.reasoningEffort = val;
      this.plugin.settings.defaultReasoningEffort = val;
      await this.saveSessionState();
    });

    this.refreshEffortDropdown();

    const handleSendOrStop = async () => {
      if (this.currentAbortController) {
        this.currentAbortController.abort();
        this.currentAbortController = null;
        this.setSendButtonState(false);
        new Notice('Generation stopped.');
        return;
      }

      const rawText = this.inputTextAreaEl.value.trim();
      const hasAttachments = this.pendingAttachments.length > 0;

      if (!rawText && !hasAttachments) return;

      const text = rawText || (hasAttachments ? 'Please review the attached file(s).' : '');

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
      } else if (text === '/skills') {
        this.inputTextAreaEl.value = '';
        this.hideSuggest();
        this.resetTextareaHeight();
        new SkillsModal(this.app, this.plugin).open();
        return;
      } else if (text === '/mcp') {
        this.inputTextAreaEl.value = '';
        this.hideSuggest();
        this.resetTextareaHeight();
        new McpModal(this.app, this.plugin).open();
        return;
      } else if (text === '/attach') {
        this.inputTextAreaEl.value = '';
        this.hideSuggest();
        this.resetTextareaHeight();
        this.triggerFileInput();
        return;
      } else if (text === '/agents' || text === '/agent' || text.startsWith('/agents ') || text.startsWith('/agent ')) {
        const agentQuery = text.replace(/^\/agents?\s*/, '').trim();
        this.inputTextAreaEl.value = '';
        this.hideSuggest();
        this.resetTextareaHeight();
        if (agentQuery && this.plugin.agentManager) {
          const targetAgent = this.plugin.agentManager.getAgent(agentQuery);
          if (targetAgent) {
            this.currentSession.activeAgentId = targetAgent.id;
            this.plugin.settings.activeAgentId = targetAgent.id;
            if (targetAgent.model) {
              this.currentSession.model = targetAgent.model;
              this.refreshModelDropdown();
            }
            this.refreshAgentDropdown();
            await this.saveSessionState();
            new Notice(`Switched to agent: ${targetAgent.name}`);
            return;
          }
        }
        this.openAgentsSettings();
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

      // Check if message invokes an active skill
      let activeSkillDirective = '';
      let processedUserText = text;
      const skillMatch = text.match(/^\/([a-zA-Z0-9-_]+)(?:\s+([\s\S]*))?$/);
      if (skillMatch) {
        const candidateId = skillMatch[1].toLowerCase();
        const skill = this.plugin.skillManager?.getSkill(candidateId);
        if (skill) {
          activeSkillDirective = this.plugin.skillManager.getActiveSkillDirective(skill);
          const restText = (skillMatch[2] || '').trim();
          processedUserText = restText ? `[⚡ Skill: ${skill.name}]\n${restText}` : `[⚡ Skill: ${skill.name}] Apply skill methodology.`;
        }
      }

      const availableSkillsDirectives = this.plugin.skillManager?.generateSystemPromptDirectives() || '';
      const extraSystemDirectives = [availableSkillsDirectives, activeSkillDirective].filter(Boolean).join('\n\n');

      // Set generating state (Stop icon)
      this.currentAbortController = new AbortController();
      this.activeSubagentCards.clear();
      this.setSendButtonState(true);

      // Set auto-title on first message
      if (this.currentSession.messages.length === 0) {
        this.currentSession.title = SessionManager.generateTitle(processedUserText);
      }

      // Enriched text with resolved @mentions
      const resolvedContent = await MentionHelper.resolveMentions(this.app, processedUserText);

      // Process attachments if any
      let userMessageContent: string | any[] = resolvedContent;

      if (hasAttachments) {
        const currentAtts = [...this.pendingAttachments];
        this.pendingAttachments = [];
        this.renderPendingAttachments();

        const attachedImages = currentAtts.filter((a) => a.isImage && a.dataUrl);
        const attachedDocs = currentAtts.filter((a) => !a.isImage || !a.dataUrl);

        let extraMarkdown = '';
        for (const doc of attachedDocs) {
          extraMarkdown += `\n\n📎 Attached file: [[${doc.vaultPath}]] (saved to vault)`;
          if (doc.textContent) {
            const snippet = doc.textContent.length > 2500 ? doc.textContent.slice(0, 2500) + '\n...[content truncated]' : doc.textContent;
            extraMarkdown += `\n\`\`\`\n${snippet}\n\`\`\``;
          }
        }

        for (const img of attachedImages) {
          extraMarkdown += `\n\n![[${img.vaultPath}]]`;
        }

        const combinedText = (resolvedContent ? `${resolvedContent}` : '') + extraMarkdown;

        if (attachedImages.length > 0) {
          userMessageContent = [
            { type: 'text', text: combinedText },
            ...attachedImages.map((img) => ({
              type: 'image_url',
              image_url: { url: img.dataUrl },
            })),
          ];
        } else {
          userMessageContent = combinedText;
        }
      }

      // Append clean user message to UI state
      const userMsg: LLMMessage = { role: 'user', content: userMessageContent };
      this.currentSession.messages.push(userMsg);
      this.currentSession.updatedAt = Date.now();
      await this.saveSessionState();
      this.renderMessages();

      const activeAgent = this.plugin.agentManager
        ? this.plugin.agentManager.getActiveAgent(this.currentSession.activeAgentId)
        : {
            id: 'main',
            name: 'Main Agent',
            description: '',
            systemPrompt: '',
            isDefaultMain: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

      // Streaming assistant placeholder container
      const streamingMsgEl = this.messagesContainerEl.createEl('div', {
        cls: 'harness-message harness-message-assistant',
      });
      const streamHeaderEl = streamingMsgEl.createEl('div', {
        cls: 'harness-message-header',
      });
      const currentModel = this.currentSession.model || this.plugin.settings.activeModel;
      streamHeaderEl.createSpan({
        text: `${activeAgent.name} (${currentModel})`,
        cls: 'harness-message-header-title',
      });

      const streamCopyBtn = streamHeaderEl.createEl('button', { cls: 'harness-msg-copy-btn' });
      streamCopyBtn.setAttribute('aria-label', 'Copy response');
      streamCopyBtn.setAttribute('title', 'Copy response');
      setIcon(streamCopyBtn, 'copy');
      streamCopyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentText = textContentEl.innerText || '';
        this.copyToClipboard(currentText, streamCopyBtn, 'Response copied to clipboard');
      });

      const textContentEl = streamingMsgEl.createEl('div', { cls: 'harness-message-body' });

      try {
        const effort = this.currentSession.reasoningEffort || this.plugin.settings.defaultReasoningEffort || 'default';
        const updatedHistory = await this.agentHarness.runTurn(
          this.currentSession.messages,
          (event) => {
            if (event.subagentContext) {
              let card = this.activeSubagentCards.get(event.subagentContext.taskId);
              if (!card) {
                card = new SubagentCard(streamingMsgEl || this.messagesContainerEl, event.subagentContext, this.app, this);
                this.activeSubagentCards.set(event.subagentContext.taskId, card);
              }
              card.handleEvent(event);
              if (event.type === 'finish' || event.type === 'error') {
                card.finalize(event.content);
              }
              this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
            } else if (event.type === 'chunk' && event.content) {
              const parsed = parseThoughts(event.content);
              if (parsed.thoughts.length > 0) {
                textContentEl.empty();
                for (const thought of parsed.thoughts) {
                  this.renderThinkingCard(textContentEl, thought, false);
                }
                if (parsed.finalAnswer) {
                  textContentEl.createEl('div', { text: parsed.finalAnswer, cls: 'harness-answer-text' });
                }
              } else {
                textContentEl.setText(event.content);
              }
              this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
            } else if (event.type === 'tool_call' && event.toolCall) {
              this.renderToolCallCard(this.messagesContainerEl, event.toolCall.function.name, event.toolCall.function.arguments);
            }
          },
          (toolCall: ToolCall) => {
            return new Promise<boolean>((resolve) => {
              new ConfirmationModal(this.app, toolCall, resolve).open();
            });
          },
          this.plugin.settings.activeProviderId,
          this.currentSession.model || this.plugin.settings.activeModel,
          this.currentAbortController.signal,
          extraSystemDirectives,
          activeAgent,
          undefined,
          effort
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

    // Drag and drop files support
    this.inputAreaEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      inputCardEl.addClass('is-drag-over');
    });

    this.inputAreaEl.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      inputCardEl.removeClass('is-drag-over');
    });

    this.inputAreaEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      inputCardEl.removeClass('is-drag-over');
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        await this.handleFilesUpload(Array.from(e.dataTransfer.files));
      }
    });

    // Paste file / image support from clipboard
    this.inputTextAreaEl.addEventListener('paste', async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        await this.handleFilesUpload(files);
      }
    });

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

  private async copyToClipboard(text: string, btnEl: HTMLElement, noticeText: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setIcon(btnEl, 'check');
      btnEl.addClass('is-copied');
      new Notice(noticeText);
      setTimeout(() => {
        setIcon(btnEl, 'copy');
        btnEl.removeClass('is-copied');
      }, 2000);
    } catch (e) {
      new Notice('Failed to copy to clipboard');
    }
  }

  private enhanceCodeBlocksWithCopyButton(containerEl: HTMLElement): void {
    const preElements = Array.from(containerEl.querySelectorAll('pre'));
    for (const pre of preElements) {
      if (pre.parentElement?.classList.contains('harness-code-block-wrapper')) {
        continue;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'harness-code-block-wrapper';

      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const copyBtn = wrapper.createEl('button', {
        cls: 'harness-code-copy-btn',
      });
      copyBtn.setAttribute('aria-label', 'Copy code');
      copyBtn.setAttribute('title', 'Copy code');
      setIcon(copyBtn, 'copy');

      copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const codeEl = pre.querySelector('code');
        const codeText = codeEl ? codeEl.innerText : pre.innerText;
        this.copyToClipboard(codeText, copyBtn, 'Code copied to clipboard');
      });
    }
  }

  private async renderThinkingCard(parentEl: HTMLElement, thoughtText: string, open = false) {
    const detailsEl = parentEl.createEl('details', { cls: 'harness-collapsible-card harness-thinking-card' });
    if (open) detailsEl.open = true;

    const summaryEl = detailsEl.createEl('summary', { cls: 'harness-collapsible-summary' });
    const leftEl = summaryEl.createEl('div', { cls: 'harness-collapsible-summary-left' });
    const iconSpan = leftEl.createEl('span');
    setIcon(iconSpan, 'sparkles');
    leftEl.createEl('span', { text: 'Reasoning / Рассуждения' });

    const rightEl = summaryEl.createEl('div', { cls: 'harness-collapsible-summary-right' });
    const copyBtn = rightEl.createEl('button', { cls: 'harness-tool-copy-btn' });
    copyBtn.setAttribute('aria-label', 'Copy reasoning');
    copyBtn.setAttribute('title', 'Copy reasoning');
    setIcon(copyBtn, 'copy');
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.copyToClipboard(thoughtText, copyBtn, 'Reasoning copied to clipboard');
    });

    rightEl.createEl('span', { text: 'View', cls: 'harness-collapsible-badge' });

    const bodyEl = detailsEl.createEl('div', { cls: 'harness-collapsible-body harness-thinking-text' });
    await MarkdownRenderer.render(this.app, thoughtText, bodyEl, '', this);
    this.enhanceCodeBlocksWithCopyButton(bodyEl);
  }

  private formatContentForCard(rawStr: string): string {
    if (!rawStr || rawStr.trim() === '') return '(empty)';
    try {
      const parsed = JSON.parse(rawStr);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return rawStr;
    }
  }

  private renderToolCallCard(parentEl: HTMLElement, toolName: string, argsStr: string, open = false) {
    const detailsEl = parentEl.createEl('details', { cls: 'harness-collapsible-card harness-tool-card' });
    if (open) detailsEl.open = true;

    const summaryEl = detailsEl.createEl('summary', { cls: 'harness-collapsible-summary' });
    const leftEl = summaryEl.createEl('div', { cls: 'harness-collapsible-summary-left' });
    const iconSpan = leftEl.createEl('span');
    setIcon(iconSpan, 'wrench');
    leftEl.createEl('span', { text: `Tool: ${toolName}` });

    const rightEl = summaryEl.createEl('div', { cls: 'harness-collapsible-summary-right' });
    const copyBtn = rightEl.createEl('button', { cls: 'harness-tool-copy-btn' });
    copyBtn.setAttribute('aria-label', 'Copy tool arguments');
    copyBtn.setAttribute('title', 'Copy tool arguments');
    setIcon(copyBtn, 'copy');
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const formatted = this.formatContentForCard(argsStr);
      this.copyToClipboard(formatted, copyBtn, 'Tool arguments copied to clipboard');
    });

    rightEl.createEl('span', { text: 'Args', cls: 'harness-collapsible-badge' });

    const bodyEl = detailsEl.createEl('div', { cls: 'harness-collapsible-body' });
    const pre = bodyEl.createEl('pre');
    pre.createEl('code', { text: this.formatContentForCard(argsStr) });
    this.enhanceCodeBlocksWithCopyButton(bodyEl);
  }

  private renderToolOutputCard(parentEl: HTMLElement, toolName: string, outputText: string, open = false) {
    const detailsEl = parentEl.createEl('details', { cls: 'harness-collapsible-card harness-tool-card' });
    if (open) detailsEl.open = true;

    const summaryEl = detailsEl.createEl('summary', { cls: 'harness-collapsible-summary' });
    const leftEl = summaryEl.createEl('div', { cls: 'harness-collapsible-summary-left' });
    const iconSpan = leftEl.createEl('span');
    setIcon(iconSpan, 'file-text');
    leftEl.createEl('span', { text: `Output: ${toolName}` });

    const rightEl = summaryEl.createEl('div', { cls: 'harness-collapsible-summary-right' });
    const copyBtn = rightEl.createEl('button', { cls: 'harness-tool-copy-btn' });
    copyBtn.setAttribute('aria-label', 'Copy tool output');
    copyBtn.setAttribute('title', 'Copy tool output');
    setIcon(copyBtn, 'copy');
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const formatted = this.formatContentForCard(outputText);
      this.copyToClipboard(formatted, copyBtn, 'Tool output copied to clipboard');
    });

    rightEl.createEl('span', { text: 'Result', cls: 'harness-collapsible-badge' });

    const bodyEl = detailsEl.createEl('div', { cls: 'harness-collapsible-body' });
    const pre = bodyEl.createEl('pre');
    pre.createEl('code', { text: this.formatContentForCard(outputText) });
    this.enhanceCodeBlocksWithCopyButton(bodyEl);
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
      this.expandBtnEl.setAttribute('aria-label', 'Restore compact view');
      this.expandBtnEl.setAttribute('title', 'Restore compact view');
      this.expandBtnEl.style.display = 'flex';
      this.inputTextAreaEl.focus();
    } else {
      this.inputAreaEl.removeClass('is-expanded');
      setIcon(this.expandBtnEl, 'maximize-2');
      this.expandBtnEl.setAttribute('aria-label', 'Expand to full view');
      this.expandBtnEl.setAttribute('title', 'Expand to full view');
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
      this.sendButtonEl.setAttribute('title', 'Stop generation');
    } else {
      setIcon(this.sendButtonEl, 'send');
      this.sendButtonEl.addClass('mod-cta');
      this.sendButtonEl.removeClass('mod-warning');
      this.sendButtonEl.setAttribute('aria-label', 'Send message');
      this.sendButtonEl.setAttribute('title', 'Send message');
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
        cmd: '/agents',
        desc: 'Manage custom agents & subagents in Settings',
        action: () => {
          this.inputTextAreaEl.value = '';
          this.hideSuggest();
          this.resetTextareaHeight();
          this.openAgentsSettings();
        },
      },
      {
        cmd: '/agent',
        desc: 'Manage custom agents & subagents in Settings',
        action: () => {
          this.inputTextAreaEl.value = '';
          this.hideSuggest();
          this.resetTextareaHeight();
          this.openAgentsSettings();
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
        cmd: '/skills',
        desc: 'Open Skills Manager & Marketplace',
        action: () => {
          this.inputTextAreaEl.value = '';
          this.hideSuggest();
          this.resetTextareaHeight();
          new SkillsModal(this.app, this.plugin).open();
        },
      },
      {
        cmd: '/mcp',
        desc: 'Open MCP Servers & Integrations Manager',
        action: () => {
          this.inputTextAreaEl.value = '';
          this.hideSuggest();
          this.resetTextareaHeight();
          new McpModal(this.app, this.plugin).open();
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

    // Dynamic active skills from SkillManager
    const activeSkills = this.plugin.skillManager?.getActiveSkills() || [];
    for (const skill of activeSkills) {
      commands.push({
        cmd: `/${skill.id}`,
        desc: `[Skill] ${skill.name}${skill.description ? ` - ${skill.description}` : ''}`,
        action: () => {
          this.inputTextAreaEl.value = `/${skill.id} `;
          this.hideSuggest();
          this.autoResizeTextarea();
          this.inputTextAreaEl.focus();
        },
      });
    }

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

  private openAgentsSettings(): void {
    try {
      const setting = (this.app as any).setting;
      if (setting && typeof setting.open === 'function') {
        setting.open();
        if (this.plugin.manifest?.id && typeof setting.openTabById === 'function') {
          setting.openTabById(this.plugin.manifest.id);
        }
      } else {
        new Notice('Please open Settings -> Obsidian Harness Bot to manage agents.');
      }
    } catch (e) {
      new Notice('Please open Settings -> Obsidian Harness Bot to manage agents.');
    }
  }

  public async switchSession(session: ChatSession): Promise<void> {
    this.currentSession = session;
    this.plugin.settings.currentSessionId = session.id;
    if (!this.currentSession.activeAgentId) {
      this.currentSession.activeAgentId = this.plugin.settings.activeAgentId || 'main';
    }
    await this.saveSessionState();
    await this.renderMessages();
    this.refreshModelDropdown();
    this.refreshAgentDropdown();
    this.refreshEffortDropdown();
  }

  private createNewSession() {
    const newSession = SessionManager.createNewSession(
      this.plugin.settings.activeProviderId || 'openrouter',
      this.plugin.settings.activeModel || '',
      this.plugin.settings.activeAgentId || 'main',
      this.plugin.settings.defaultReasoningEffort || 'default'
    );
    this.plugin.settings.sessions.unshift(newSession);
    this.plugin.settings.currentSessionId = newSession.id;
    this.currentSession = newSession;
    this.saveSessionState();
    this.renderMessages();
    this.refreshModelDropdown();
    this.refreshAgentDropdown();
    this.refreshEffortDropdown();
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
          this.switchSession(found);
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
    if (!this.searchableModelSelect) return;

    const activeProv = this.plugin.settings.providers.find(
      (p) => p.id === this.plugin.settings.activeProviderId
    );
    const models = activeProv?.models || [];

    if (models.length === 0) {
      this.searchableModelSelect.setModels([], '');
      return;
    }

    const selectedModel = this.currentSession?.model || this.plugin.settings.activeModel || models[0];

    if (!models.includes(selectedModel)) {
      this.currentSession.model = models[0];
      this.plugin.settings.activeModel = models[0];
    } else {
      this.currentSession.model = selectedModel;
      this.plugin.settings.activeModel = selectedModel;
    }

    this.searchableModelSelect.setModels(models, this.currentSession.model || this.plugin.settings.activeModel);
  }

  private async renderMessages(): Promise<void> {
    if (!this.messagesContainerEl) return;
    this.messagesContainerEl.empty();

    if (this.currentSession.messages.length === 0) {
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

          itemBtn.addEventListener('click', async () => {
            await this.switchSession(prev);
          });
        }
      }

      return;
    }

    for (const msg of this.currentSession.messages) {
      if (msg.role === 'user') {
        const msgEl = this.messagesContainerEl.createEl('div', { cls: 'harness-message harness-message-user' });
        const headerEl = msgEl.createEl('div', { cls: 'harness-message-header' });
        headerEl.createSpan({ text: 'You', cls: 'harness-message-header-title' });

        const rawContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');

        const copyBtn = headerEl.createEl('button', { cls: 'harness-msg-copy-btn' });
        copyBtn.setAttribute('aria-label', 'Copy message');
        copyBtn.setAttribute('title', 'Copy message');
        setIcon(copyBtn, 'copy');
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.copyToClipboard(rawContent, copyBtn, 'Message copied to clipboard');
        });

        const bodyEl = msgEl.createEl('div', { cls: 'harness-message-body' });
        await MarkdownRenderer.render(this.app, rawContent, bodyEl, '', this);
        this.enhanceCodeBlocksWithCopyButton(bodyEl);
      } else if (msg.role === 'assistant') {
        const msgEl = this.messagesContainerEl.createEl('div', { cls: 'harness-message harness-message-assistant' });
        const headerEl = msgEl.createEl('div', { cls: 'harness-message-header' });
        const activeAgent = this.plugin.agentManager
          ? this.plugin.agentManager.getActiveAgent(this.currentSession.activeAgentId)
          : undefined;
        const agentDisplayName = msg.name || activeAgent?.name || 'Harness Bot';
        headerEl.createSpan({
          text: `${agentDisplayName} (${this.currentSession.model || this.plugin.settings.activeModel})`,
          cls: 'harness-message-header-title',
        });

        const rawContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
        const parsed = parseThoughts(rawContent);

        const copyBtn = headerEl.createEl('button', { cls: 'harness-msg-copy-btn' });
        copyBtn.setAttribute('aria-label', 'Copy response');
        copyBtn.setAttribute('title', 'Copy response');
        setIcon(copyBtn, 'copy');
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const textToCopy = parsed.finalAnswer || rawContent;
          this.copyToClipboard(textToCopy, copyBtn, 'Response copied to clipboard');
        });

        const bodyEl = msgEl.createEl('div', { cls: 'harness-message-body' });

        // Render Reasoning / Thoughts collapsible card
        if (parsed.thoughts.length > 0) {
          for (const thought of parsed.thoughts) {
            await this.renderThinkingCard(bodyEl, thought, false);
          }
        }

        // Render Tool Calls
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            if (tc.function.name === 'invoke_subagent') {
              let parsedArgs: Record<string, any> = {};
              try {
                parsedArgs = JSON.parse(tc.function.arguments || '{}');
              } catch (e) {
                parsedArgs = {};
              }
              const agentConfig = this.plugin.agentManager?.getAgent(parsedArgs.agent_id);
              const workspacePath = agentConfig?.workspacePath;
              const agentName = agentConfig?.name || parsedArgs.agent_id;
              const toolResultMsg = this.currentSession.messages.find(
                (m) => m.role === 'tool' && (m.tool_call_id === tc.id || (m.name === 'invoke_subagent' && !m.tool_call_id))
              );
              const toolOutput = typeof toolResultMsg?.content === 'string'
                ? toolResultMsg.content
                : toolResultMsg?.content
                ? JSON.stringify(toolResultMsg.content)
                : undefined;

              await SubagentCard.renderHistorical(
                bodyEl,
                this.app,
                this,
                tc,
                toolOutput,
                workspacePath,
                agentName
              );
            } else {
              this.renderToolCallCard(bodyEl, tc.function.name, tc.function.arguments, false);
            }
          }
        }

        // Render Final Answer in rich Markdown
        if (parsed.finalAnswer) {
          const answerContainer = bodyEl.createEl('div', { cls: 'harness-answer-text' });
          await MarkdownRenderer.render(this.app, parsed.finalAnswer, answerContainer, '', this);
          this.enhanceCodeBlocksWithCopyButton(answerContainer);
        }
      } else if (msg.role === 'tool') {
        const isRenderedByAssistant = this.currentSession.messages.some(
          (m) => m.role === 'assistant' && m.tool_calls?.some((tc) => (msg.tool_call_id && tc.id === msg.tool_call_id) || tc.function.name === 'invoke_subagent')
        );
        if (msg.name === 'invoke_subagent' && isRenderedByAssistant) {
          continue;
        }
        const rawContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
        this.renderToolOutputCard(this.messagesContainerEl, msg.name || 'tool', rawContent, false);
      }
    }

    this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
  }

  async onClose(): Promise<void> {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    if (this.searchableModelSelect) {
      this.searchableModelSelect.destroy();
    }
  }
}
