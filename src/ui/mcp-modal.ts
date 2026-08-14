import { App, Modal, Notice, setIcon } from 'obsidian';
import type HarnessPlugin from '../main';
import { McpServerConfig, McpCatalogItem } from '../mcp/types';
import { McpToolsViewModal } from './components/mcp-tools-view-modal';
import { McpServerEditModal } from './components/mcp-server-edit-modal';

export class McpModal extends Modal {
  private plugin: HarnessPlugin;
  private activeTab: 'configured' | 'catalog' = 'configured';
  private searchQuery: string = '';
  private isSyncingAll: boolean = false;

  constructor(app: App, plugin: HarnessPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('harness-mcp-modal');

    await this.render();
  }

  private async render() {
    const { contentEl } = this;
    contentEl.empty();

    // Modal Header
    const headerEl = contentEl.createEl('div', { cls: 'harness-modal-header' });
    const titleEl = headerEl.createEl('h2', { text: 'MCP Servers & Integrations' });
    titleEl.style.margin = '0';

    const controlsRowEl = contentEl.createEl('div', { cls: 'harness-mcp-controls-row' });

    // Tabs
    const tabsContainerEl = controlsRowEl.createEl('div', { cls: 'harness-tab-group' });

    const allServers = this.plugin.mcpManager.getAllServers();
    const serverCount = allServers.length;

    const tabConfiguredBtn = tabsContainerEl.createEl('button', {
      cls: `harness-tab-btn ${this.activeTab === 'configured' ? 'is-active' : ''}`,
      text: `Configured Servers (${serverCount})`,
    });
    tabConfiguredBtn.addEventListener('click', () => {
      this.activeTab = 'configured';
      this.render();
    });

    const tabCatalogBtn = tabsContainerEl.createEl('button', {
      cls: `harness-tab-btn ${this.activeTab === 'catalog' ? 'is-active' : ''}`,
      text: 'Catalog & Add',
    });
    tabCatalogBtn.addEventListener('click', () => {
      this.activeTab = 'catalog';
      this.render();
    });

    // Global Sync/Refresh Button
    const refreshBtn = controlsRowEl.createEl('button', { cls: 'clickable-icon' });
    refreshBtn.setAttribute('aria-label', 'Sync & Test all enabled MCP servers');
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', async () => {
      if (this.isSyncingAll) return;
      this.isSyncingAll = true;
      new Notice('Syncing all enabled MCP servers...');
      const enabledServers = this.plugin.mcpManager.getEnabledServers();
      for (const s of enabledServers) {
        try {
          await this.plugin.mcpManager.testAndSyncServer(s.id);
        } catch (e) {
          // Handled per server in state
        }
      }
      this.isSyncingAll = false;
      new Notice('MCP Sync completed.');
      await this.render();
    });

    // Search Input
    const searchContainerEl = contentEl.createEl('div', { cls: 'harness-search-wrapper' });
    const searchInput = searchContainerEl.createEl('input', {
      type: 'search',
      cls: 'harness-search-input',
      placeholder: 'Search MCP servers by name, description, or tools...',
      value: this.searchQuery,
    });
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.toLowerCase().trim();
      this.renderBody(bodyContainerEl);
    });

    // Body Container
    const bodyContainerEl = contentEl.createEl('div', { cls: 'harness-mcp-body' });
    this.renderBody(bodyContainerEl);
  }

  private renderBody(container: HTMLElement) {
    container.empty();

    if (this.activeTab === 'configured') {
      this.renderConfiguredList(container);
    } else {
      this.renderCatalogList(container);
    }
  }

  private renderConfiguredList(container: HTMLElement) {
    let servers = this.plugin.mcpManager.getAllServers();

    if (this.searchQuery) {
      servers = servers.filter(
        (s) =>
          s.name.toLowerCase().includes(this.searchQuery) ||
          (s.description && s.description.toLowerCase().includes(this.searchQuery)) ||
          (s.cachedTools && s.cachedTools.some((t) => t.name.toLowerCase().includes(this.searchQuery) || (t.description || '').toLowerCase().includes(this.searchQuery)))
      );
    }

    if (servers.length === 0) {
      const emptyEl = container.createEl('div', { cls: 'harness-empty-state' });
      emptyEl.createEl('p', {
        text: this.searchQuery
          ? 'No MCP servers matching your search query.'
          : 'No MCP servers configured yet. Switch to the "Catalog & Add" tab to connect Todoist or custom remote MCP servers.',
      });
      const addBtn = emptyEl.createEl('button', { text: 'Open Catalog & Add', cls: 'mod-cta' });
      addBtn.addEventListener('click', () => {
        this.activeTab = 'catalog';
        this.render();
      });
      return;
    }

    const gridEl = container.createEl('div', { cls: 'harness-mcp-grid' });

    for (const server of servers) {
      const cardEl = gridEl.createEl('div', {
        cls: `harness-mcp-card ${server.enabled ? 'is-enabled' : 'is-disabled'}`,
      });

      // Card Header
      const cardHeaderEl = cardEl.createEl('div', { cls: 'harness-mcp-card-header' });
      const titleWrapper = cardHeaderEl.createEl('div', { cls: 'harness-mcp-title-wrapper' });

      titleWrapper.createEl('strong', { text: server.name, cls: 'harness-mcp-title' });

      // Transport badge
      titleWrapper.createEl('span', { text: 'Remote SSE', cls: 'harness-source-badge mod-remote' });

      // Status badge
      let statusText = 'Disabled';
      let statusCls = 'mod-disabled';

      if (server.enabled) {
        if (server.lastError) {
          statusText = 'Error';
          statusCls = 'mod-error';
        } else {
          const toolCount = server.cachedTools ? server.cachedTools.length : 0;
          statusText = `Connected (${toolCount} tool${toolCount === 1 ? '' : 's'})`;
          statusCls = 'mod-connected';
        }
      }

      const statusBadge = titleWrapper.createEl('span', {
        text: statusText,
        cls: `harness-status-badge ${statusCls}`,
      });
      if (server.lastError) {
        statusBadge.setAttribute('title', server.lastError);
      }

      // Enable / Disable Toggle Switch
      const toggleWrapper = cardHeaderEl.createEl('div', { cls: 'harness-switch-wrapper' });
      const toggleLabel = toggleWrapper.createEl('label', { cls: 'harness-switch' });
      toggleLabel.setAttribute('aria-label', server.enabled ? 'Disable Server' : 'Enable Server');
      const toggleInput = toggleLabel.createEl('input', { type: 'checkbox' });
      toggleInput.checked = server.enabled;
      toggleLabel.createEl('span', { cls: 'harness-slider round' });

      toggleInput.addEventListener('change', async () => {
        await this.plugin.mcpManager.toggleServer(server.id, toggleInput.checked);
        cardEl.toggleClass('is-enabled', toggleInput.checked);
        cardEl.toggleClass('is-disabled', !toggleInput.checked);
        toggleLabel.setAttribute('aria-label', toggleInput.checked ? 'Disable Server' : 'Enable Server');
        await this.render();
      });

      // URL display
      const urlRow = cardEl.createEl('div', { cls: 'harness-mcp-url-row' });
      urlRow.createEl('code', { text: server.url, cls: 'harness-mcp-url' });

      // Description
      if (server.description) {
        cardEl.createEl('p', { text: server.description, cls: 'harness-mcp-desc' });
      }

      // Error message if present
      if (server.lastError && server.enabled) {
        const errorBox = cardEl.createEl('div', { cls: 'harness-mcp-error-box' });
        errorBox.createEl('span', { text: `⚠️ ${server.lastError}` });
      }

      // Meta / Auth Row
      const metaRowEl = cardEl.createEl('div', { cls: 'harness-mcp-meta-row' });
      const authInfo = metaRowEl.createEl('span', { cls: 'harness-mcp-auth-label' });
      
      const authToken = this.plugin.mcpManager.getAuthToken(server);
      let authStatusText = 'Auth: None';
      if (server.authType === 'bearer') {
        authStatusText = authToken ? 'Auth: Bearer Token ✓' : 'Auth: Bearer Token (Missing)';
      } else if (server.authType === 'custom_headers') {
        authStatusText = authToken ? `Auth: ${server.customHeaderName || 'Custom'} ✓` : 'Auth: Custom Header (Missing)';
      } else if (server.authType === 'oauth2') {
        authStatusText = authToken ? 'Auth: OAuth 2.1 Connected ✓' : 'Auth: OAuth (Login Required)';
      }
      authInfo.setText(authStatusText);

      // Card Actions Footer
      const actionsEl = cardEl.createEl('div', { cls: 'harness-mcp-actions' });

      // Sync & Test Button
      const testBtn = actionsEl.createEl('button', { text: 'Sync & Test', cls: 'harness-btn-sm' });
      testBtn.addEventListener('click', async () => {
        try {
          testBtn.disabled = true;
          testBtn.setText('Testing...');
          const tools = await this.plugin.mcpManager.testAndSyncServer(server.id);
          new Notice(`✓ ${server.name}: Synced ${tools.length} tool(s).`);
          await this.render();
        } catch (err: any) {
          new Notice(`Test failed: ${err.message}`);
          await this.render();
        } finally {
          testBtn.disabled = false;
          testBtn.setText('Sync & Test');
        }
      });

      // OAuth Login Button (if oauth2 auth type)
      if (server.authType === 'oauth2') {
        const oauthBtn = actionsEl.createEl('button', {
          text: authToken ? 'Re-login OAuth' : 'Login with OAuth',
          cls: 'harness-btn-sm mod-cta',
        });
        oauthBtn.addEventListener('click', async () => {
          try {
            await this.plugin.mcpManager.startOAuthFlow(server.id);
          } catch (err: any) {
            new Notice(`OAuth error: ${err.message}`);
          }
        });
      }

      // View Tools Button
      const viewToolsBtn = actionsEl.createEl('button', { text: 'View Tools', cls: 'harness-btn-sm' });
      viewToolsBtn.addEventListener('click', () => {
        new McpToolsViewModal(this.app, server).open();
      });

      // Edit Button
      const editBtn = actionsEl.createEl('button', { text: 'Edit', cls: 'harness-btn-sm' });
      editBtn.addEventListener('click', () => {
        new McpServerEditModal(this.app, this.plugin.mcpManager, () => this.render(), server).open();
      });

      // Delete Button
      const deleteBtn = actionsEl.createEl('button', { text: 'Delete', cls: 'harness-btn-sm mod-warning' });
      deleteBtn.addEventListener('click', async () => {
        await this.plugin.mcpManager.removeServer(server.id);
        new Notice(`Removed ${server.name}`);
        await this.render();
      });
    }
  }

  private renderCatalogList(container: HTMLElement) {
    // 1. Curated Catalog Section
    container.createEl('h3', { text: 'Curated Remote MCP Servers' });

    const catalogItems = this.plugin.mcpManager.getCatalog();
    const installedServers = this.plugin.mcpManager.getAllServers();

    const catalogGridEl = container.createEl('div', { cls: 'harness-mcp-grid' });

    for (const item of catalogItems) {
      const isInstalled = installedServers.some((s) => s.id === item.id);
      const cardEl = catalogGridEl.createEl('div', { cls: 'harness-mcp-card mod-catalog' });

      // Card Header
      const headerRowEl = cardEl.createEl('div', { cls: 'harness-mcp-card-header' });
      const titleWrapper = headerRowEl.createEl('div', { cls: 'harness-mcp-title-wrapper' });
      titleWrapper.createEl('strong', { text: item.name, cls: 'harness-mcp-title' });
      titleWrapper.createEl('span', { text: 'Verified', cls: 'harness-source-badge mod-installed' });

      // Description
      cardEl.createEl('p', { text: item.description, cls: 'harness-mcp-desc' });

      if (item.authDescription) {
        const authDesc = cardEl.createEl('p', { text: `ℹ️ ${item.authDescription}`, cls: 'harness-subtext' });
        authDesc.style.fontSize = '12px';
      }

      // Tags
      if (item.tags && item.tags.length > 0) {
        const tagsContainer = cardEl.createEl('div', { cls: 'harness-mcp-tags' });
        for (const tag of item.tags) {
          tagsContainer.createEl('span', { text: `#${tag}`, cls: 'harness-tag-pill' });
        }
      }

      // Actions Row
      const actionsEl = cardEl.createEl('div', { cls: 'harness-mcp-actions' });
      actionsEl.style.marginTop = '12px';

      if (isInstalled) {
        const installedBtn = actionsEl.createEl('button', {
          text: 'Configured (Manage in Tab 1)',
          cls: 'harness-btn-sm',
        });
        installedBtn.addEventListener('click', () => {
          this.activeTab = 'configured';
          this.render();
        });
      } else {
        // Quick Add with Token
        const addTokenBtn = actionsEl.createEl('button', {
          text: 'Add & Set API Token',
          cls: 'harness-btn-sm mod-cta',
        });
        addTokenBtn.addEventListener('click', async () => {
          const serverConfig = await this.plugin.mcpManager.installFromCatalog(item);
          new McpServerEditModal(this.app, this.plugin.mcpManager, () => this.render(), serverConfig).open();
        });

        // Quick Add with OAuth (if supported)
        if (item.oauthDefaults) {
          const addOAuthBtn = actionsEl.createEl('button', {
            text: 'Connect with OAuth',
            cls: 'harness-btn-sm',
          });
          addOAuthBtn.addEventListener('click', async () => {
            const serverConfig = await this.plugin.mcpManager.installFromCatalog(item);
            serverConfig.authType = 'oauth2';
            await this.plugin.mcpManager.updateServer(serverConfig.id, serverConfig);
            await this.plugin.mcpManager.startOAuthFlow(serverConfig.id);
            this.activeTab = 'configured';
            await this.render();
          });
        }
      }
    }

    // 2. Custom Server Section
    const customSectionEl = container.createEl('div', { cls: 'harness-mcp-custom-section' });
    customSectionEl.style.marginTop = '28px';

    customSectionEl.createEl('h3', { text: 'Add Custom Remote MCP Server' });
    customSectionEl.createEl('p', {
      text: 'Connect any remote MCP server running over SSE or Streamable HTTP POST. Supports custom Bearer tokens, headers, or OAuth 2.1.',
      cls: 'harness-subtext',
    });

    const addCustomBtn = customSectionEl.createEl('button', {
      text: '+ Add Custom MCP Server',
      cls: 'mod-cta',
    });
    addCustomBtn.addEventListener('click', () => {
      new McpServerEditModal(this.app, this.plugin.mcpManager, () => {
        this.activeTab = 'configured';
        this.render();
      }).open();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
