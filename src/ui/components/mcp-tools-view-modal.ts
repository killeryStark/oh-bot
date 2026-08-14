import { App, Modal } from 'obsidian';
import { McpServerConfig } from '../../mcp/types';
import { ToolSchema } from '../../types';

export class McpToolsViewModal extends Modal {
  private server: McpServerConfig;

  constructor(app: App, server: McpServerConfig) {
    super(app);
    this.server = server;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('harness-mcp-tools-modal');

    // Header
    const headerEl = contentEl.createEl('div', { cls: 'harness-modal-header' });
    const titleEl = headerEl.createEl('h2', { text: `Tools: ${this.server.name}` });
    titleEl.style.margin = '0';

    const tools = this.server.cachedTools || [];
    contentEl.createEl('p', {
      text: tools.length > 0
        ? `This MCP server provides ${tools.length} tool${tools.length === 1 ? '' : 's'} available to the autonomous agent.`
        : 'No tools discovered for this server yet. Try clicking "Sync / Test" in the MCP servers list.',
      cls: 'harness-subtext',
    });

    if (tools.length === 0) {
      const closeBtn = contentEl.createEl('button', { text: 'Close', cls: 'mod-cta' });
      closeBtn.style.marginTop = '16px';
      closeBtn.addEventListener('click', () => this.close());
      return;
    }

    const toolsContainer = contentEl.createEl('div', { cls: 'harness-mcp-tools-list' });

    for (const tool of tools) {
      const cardEl = toolsContainer.createEl('div', { cls: 'harness-mcp-tool-card' });
      
      const titleRow = cardEl.createEl('div', { cls: 'harness-mcp-tool-header' });
      titleRow.createEl('code', { text: tool.name, cls: 'harness-tool-name-badge' });

      if (tool.description) {
        cardEl.createEl('p', { text: tool.description, cls: 'harness-tool-desc' });
      }

      // Parameters
      const properties = tool.parameters?.properties || {};
      const propKeys = Object.keys(properties);
      const requiredProps = new Set(tool.parameters?.required || []);

      if (propKeys.length > 0) {
        const paramsHeader = cardEl.createEl('div', { cls: 'harness-tool-params-title' });
        paramsHeader.createEl('strong', { text: 'Parameters:' });

        const paramsList = cardEl.createEl('div', { cls: 'harness-tool-params-list' });
        for (const key of propKeys) {
          const prop = properties[key] || {};
          const itemEl = paramsList.createEl('div', { cls: 'harness-tool-param-item' });

          const nameLine = itemEl.createEl('div', { cls: 'harness-param-name-row' });
          nameLine.createEl('code', { text: key, cls: 'harness-param-name' });
          nameLine.createEl('span', { text: ` (${prop.type || 'any'})`, cls: 'harness-param-type' });

          if (requiredProps.has(key)) {
            nameLine.createEl('span', { text: 'required', cls: 'harness-badge-required' });
          }

          if (prop.description) {
            itemEl.createEl('div', { text: prop.description, cls: 'harness-param-desc' });
          }
        }
      }
    }

    const footerEl = contentEl.createEl('div', { cls: 'harness-modal-footer' });
    footerEl.style.marginTop = '16px';
    const closeBtn = footerEl.createEl('button', { text: 'Close', cls: 'mod-cta' });
    closeBtn.addEventListener('click', () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
