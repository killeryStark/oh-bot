import { App, Modal, Setting, setIcon } from 'obsidian';
import { ChatSession } from '../../types';

export class SessionsModal extends Modal {
  private sessions: ChatSession[];
  private currentSessionId: string;
  private onSelect: (sessionId: string) => void;
  private onDelete: (sessionId: string) => void;
  private onNewSession: () => void;

  constructor(
    app: App,
    sessions: ChatSession[],
    currentSessionId: string,
    onSelect: (sessionId: string) => void,
    onDelete: (sessionId: string) => void,
    onNewSession: () => void
  ) {
    super(app);
    this.sessions = [...sessions];
    this.currentSessionId = currentSessionId;
    this.onSelect = onSelect;
    this.onDelete = onDelete;
    this.onNewSession = onNewSession;
  }

  onOpen() {
    this.render();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('harness-modal-content');

    contentEl.createEl('h2', { text: 'Chat Sessions' });

    const topSetting = new Setting(contentEl)
      .setName('New Conversation')
      .setDesc('Start a fresh agent harness session');

    topSetting.addButton((btn) => {
      btn.setButtonText('+ New Session');
      btn.setCta();
      btn.buttonEl.setAttribute('aria-label', 'New chat session');
      btn.buttonEl.setAttribute('title', 'New session');
      btn.onClick(() => {
        this.onNewSession();
        this.close();
      });
    });

    contentEl.createEl('h4', { text: 'Previous Sessions' });

    const listEl = contentEl.createEl('div', { cls: 'harness-sessions-list' });
    listEl.style.maxHeight = '320px';
    listEl.style.overflowY = 'auto';
    listEl.style.display = 'flex';
    listEl.style.flexDirection = 'column';
    listEl.style.gap = '8px';
    listEl.style.marginBottom = '12px';

    if (this.sessions.length === 0) {
      listEl.createEl('div', { text: 'No previous chat sessions found.', cls: 'setting-item-description' });
      return;
    }

    // Sort newest first
    const sorted = [...this.sessions].sort((a, b) => b.updatedAt - a.updatedAt);

    for (const session of sorted) {
      const isCurrent = session.id === this.currentSessionId;
      const sessionRow = listEl.createEl('div', { cls: 'harness-session-row' });
      sessionRow.style.display = 'flex';
      sessionRow.style.alignItems = 'center';
      sessionRow.style.justifyContent = 'space-between';
      sessionRow.style.padding = '8px 10px';
      sessionRow.style.borderRadius = '6px';
      sessionRow.style.backgroundColor = isCurrent ? 'var(--background-modifier-active-hover)' : 'var(--background-secondary)';
      sessionRow.style.border = isCurrent ? '1px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)';

      const infoEl = sessionRow.createEl('div');
      infoEl.style.cursor = 'pointer';
      infoEl.style.flex = '1';
      infoEl.setAttribute('tabindex', '0');
      infoEl.setAttribute('role', 'button');
      infoEl.setAttribute('aria-label', `Select session: ${session.title}`);

      const titleEl = infoEl.createEl('div', { text: session.title, cls: 'harness-session-title' });
      titleEl.style.fontWeight = 'bold';
      titleEl.style.fontSize = '0.95em';

      const dateStr = new Date(session.updatedAt).toLocaleDateString() + ' ' + new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const metaEl = infoEl.createEl('div', {
        text: `${dateStr} • ${session.messages.length} messages • ${session.model || 'model'}`,
        cls: 'setting-item-description',
      });
      metaEl.style.fontSize = '0.75em';

      const handleSelect = () => {
        this.onSelect(session.id);
        this.close();
      };

      infoEl.addEventListener('click', handleSelect);
      infoEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      });

      const actionsEl = sessionRow.createEl('div');
      actionsEl.style.display = 'flex';
      actionsEl.style.gap = '4px';

      const delBtn = actionsEl.createEl('button', { cls: 'harness-btn-icon-round' });
      setIcon(delBtn, 'trash');
      delBtn.setAttribute('aria-label', 'Delete session');
      delBtn.setAttribute('title', 'Delete session');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onDelete(session.id);
        this.sessions = this.sessions.filter((s) => s.id !== session.id);
        this.render();
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
