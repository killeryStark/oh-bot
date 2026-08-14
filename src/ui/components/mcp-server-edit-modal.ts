import { App, Modal, Notice, Setting } from 'obsidian';
import { McpAuthType, McpServerConfig } from '../../mcp/types';
import { McpManager } from '../../mcp/mcp-manager';
import { SecretManager } from '../../utils/secrets';

export class McpServerEditModal extends Modal {
  private mcpManager: McpManager;
  private secretManager: SecretManager;
  private serverToEdit?: McpServerConfig;
  private onSaved: () => void;

  private name: string = '';
  private url: string = '';
  private description: string = '';
  private authType: McpAuthType = 'bearer';
  private customHeaderName: string = 'X-API-Key';
  private apiToken: string = '';

  // OAuth fields
  private oauthAuthUrl: string = '';
  private oauthTokenUrl: string = '';
  private oauthClientId: string = '';
  private oauthScopes: string = '';

  constructor(
    app: App,
    mcpManager: McpManager,
    onSaved: () => void,
    serverToEdit?: McpServerConfig
  ) {
    super(app);
    this.mcpManager = mcpManager;
    this.secretManager = new SecretManager(app);
    this.serverToEdit = serverToEdit;
    this.onSaved = onSaved;

    if (serverToEdit) {
      this.name = serverToEdit.name;
      this.url = serverToEdit.url;
      this.description = serverToEdit.description || '';
      this.authType = serverToEdit.authType;
      this.customHeaderName = serverToEdit.customHeaderName || 'X-API-Key';
      
      const existingToken = mcpManager.getAuthToken(serverToEdit);
      this.apiToken = existingToken || '';

      if (serverToEdit.oauthConfig) {
        this.oauthAuthUrl = serverToEdit.oauthConfig.authorizationUrl || '';
        this.oauthTokenUrl = serverToEdit.oauthConfig.tokenUrl || '';
        this.oauthClientId = serverToEdit.oauthConfig.clientId || '';
        this.oauthScopes = (serverToEdit.oauthConfig.scopes || []).join(' ');
      }
    }
  }

  onOpen() {
    this.render();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('harness-mcp-edit-modal');

    // Header
    const isEdit = !!this.serverToEdit;
    contentEl.createEl('h2', { text: isEdit ? `Edit MCP Server: ${this.name}` : 'Add Web MCP Server' });

    // Server Name
    new Setting(contentEl)
      .setName('Server Name')
      .setDesc('A friendly display name for this remote MCP service.')
      .addText((text) =>
        text
          .setPlaceholder('e.g. My Remote Tools')
          .setValue(this.name)
          .onChange((v) => (this.name = v))
      );

    // Endpoint URL
    new Setting(contentEl)
      .setName('Remote SSE / Streamable HTTP URL')
      .setDesc('The remote URL endpoint (supports standard MCP SSE or Streamable HTTP POST).')
      .addText((text) =>
        text
          .setPlaceholder('https://example.com/mcp or https://example.com/sse')
          .setValue(this.url)
          .onChange((v) => (this.url = v))
      );

    // Description
    new Setting(contentEl)
      .setName('Description (Optional)')
      .setDesc('Brief summary of tools provided by this server.')
      .addText((text) =>
        text
          .setPlaceholder('e.g. Web search and article fetching')
          .setValue(this.description)
          .onChange((v) => (this.description = v))
      );

    // Auth Type Dropdown
    new Setting(contentEl)
      .setName('Authentication Method')
      .setDesc('Select how the client should authenticate with this MCP endpoint.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('bearer', 'Bearer Token (Authorization: Bearer ...)')
          .addOption('custom_headers', 'Custom Header (e.g. X-API-Key)')
          .addOption('oauth2', 'OAuth 2.1 (PKCE Web Redirect)')
          .addOption('none', 'No Authentication (Public Endpoint)')
          .setValue(this.authType)
          .onChange((v) => {
            this.authType = v as McpAuthType;
            this.render();
          })
      );

    // Auth Details Section
    if (this.authType === 'bearer') {
      new Setting(contentEl)
        .setName('API Token / Secret')
        .setDesc('Stored securely in Obsidian SecretManager. Will not appear in plain text.')
        .addText((text) => {
          text.inputEl.type = 'password';
          text
            .setPlaceholder('Enter API token or secret key...')
            .setValue(this.apiToken)
            .onChange((v) => (this.apiToken = v));
        });
    } else if (this.authType === 'custom_headers') {
      new Setting(contentEl)
        .setName('Custom Header Name')
        .setDesc('HTTP header name to include.')
        .addText((text) =>
          text
            .setPlaceholder('X-API-Key')
            .setValue(this.customHeaderName)
            .onChange((v) => (this.customHeaderName = v))
        );

      new Setting(contentEl)
        .setName('Header Value / API Key')
        .setDesc('Stored securely in Obsidian SecretManager.')
        .addText((text) => {
          text.inputEl.type = 'password';
          text
            .setPlaceholder('Enter API key...')
            .setValue(this.apiToken)
            .onChange((v) => (this.apiToken = v));
        });
    } else if (this.authType === 'oauth2') {
      new Setting(contentEl)
        .setName('Authorization URL')
        .setDesc('OAuth provider authorization endpoint.')
        .addText((text) =>
          text
            .setPlaceholder('https://provider.com/oauth/authorize')
            .setValue(this.oauthAuthUrl)
            .onChange((v) => (this.oauthAuthUrl = v))
        );

      new Setting(contentEl)
        .setName('Token URL')
        .setDesc('OAuth provider token exchange endpoint.')
        .addText((text) =>
          text
            .setPlaceholder('https://provider.com/oauth/token')
            .setValue(this.oauthTokenUrl)
            .onChange((v) => (this.oauthTokenUrl = v))
        );

      new Setting(contentEl)
        .setName('Client ID (Optional)')
        .setDesc('OAuth client identifier if required by the service.')
        .addText((text) =>
          text
            .setPlaceholder('client_id_123')
            .setValue(this.oauthClientId)
            .onChange((v) => (this.oauthClientId = v))
        );

      new Setting(contentEl)
        .setName('Scopes (Optional)')
        .setDesc('Space-separated list of OAuth scopes.')
        .addText((text) =>
          text
            .setPlaceholder('read write data:all')
            .setValue(this.oauthScopes)
            .onChange((v) => (this.oauthScopes = v))
        );
    }

    // Action Buttons
    const footerEl = contentEl.createEl('div', { cls: 'harness-modal-footer' });
    footerEl.style.marginTop = '20px';
    footerEl.style.display = 'flex';
    footerEl.style.justifyContent = 'flex-end';
    footerEl.style.gap = '10px';

    const cancelBtn = footerEl.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = footerEl.createEl('button', {
      text: isEdit ? 'Save Changes' : 'Save & Test Connection',
      cls: 'mod-cta',
    });

    saveBtn.addEventListener('click', async () => {
      await this.handleSave(saveBtn);
    });
  }

  private async handleSave(saveBtn: HTMLButtonElement) {
    if (!this.name.trim()) {
      new Notice('Please enter a server name.');
      return;
    }
    if (!this.url.trim()) {
      new Notice('Please enter a valid remote URL.');
      return;
    }

    const serverId = this.serverToEdit
      ? this.serverToEdit.id
      : this.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `mcp-${Date.now()}`;

    const secretKeyName = `oh_bot_secret_mcp_${serverId}_token`;

    if (this.apiToken.trim()) {
      this.secretManager.setSecret(secretKeyName, this.apiToken.trim());
    }

    const serverConfig: McpServerConfig = {
      id: serverId,
      name: this.name.trim(),
      description: this.description.trim(),
      url: this.url.trim(),
      enabled: this.serverToEdit ? this.serverToEdit.enabled : true,
      authType: this.authType,
      apiKeySecretName: (this.authType === 'bearer' || this.authType === 'custom_headers') ? secretKeyName : undefined,
      customHeaderName: this.authType === 'custom_headers' ? this.customHeaderName.trim() : undefined,
      oauthConfig: this.authType === 'oauth2'
        ? {
            authorizationUrl: this.oauthAuthUrl.trim(),
            tokenUrl: this.oauthTokenUrl.trim(),
            clientId: this.oauthClientId.trim() || undefined,
            scopes: this.oauthScopes.trim() ? this.oauthScopes.trim().split(/\s+/) : undefined,
            accessTokenSecretName: `oh_bot_secret_mcp_${serverId}_access`,
            refreshTokenSecretName: `oh_bot_secret_mcp_${serverId}_refresh`,
          }
        : undefined,
      cachedTools: this.serverToEdit ? this.serverToEdit.cachedTools : [],
    };

    try {
      saveBtn.disabled = true;
      saveBtn.setText('Testing Connection...');

      await this.mcpManager.addServer(serverConfig);

      if (this.authType !== 'oauth2') {
        try {
          const tools = await this.mcpManager.testAndSyncServer(serverId);
          new Notice(`✓ Connected! Discovered ${tools.length} tool(s).`);
        } catch (e: any) {
          new Notice(`Server saved, but test connection reported: ${e.message}`);
        }
      } else {
        new Notice(`Server saved. Click "Connect with OAuth" to log in.`);
      }

      this.onSaved();
      this.close();
    } catch (err: any) {
      new Notice(`Failed to save server: ${err.message}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.setText(this.serverToEdit ? 'Save Changes' : 'Save & Test Connection');
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
