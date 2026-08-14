import { App, Modal, Notice, Setting, setIcon, ButtonComponent } from 'obsidian';
import * as obsidianModule from 'obsidian';
import { McpAuthType, McpServerConfig } from '../../mcp/types';
import { McpManager } from '../../mcp/mcp-manager';
import { SecretManager } from '../../utils/secrets';
import { openExternalUrl } from '../../utils/browser';

export class McpServerEditModal extends Modal {
  private mcpManager: McpManager;
  private secretManager: SecretManager;
  private serverToEdit?: McpServerConfig;
  private onSaved: () => void;

  private name: string = '';
  private url: string = '';
  private description: string = '';
  private authType: McpAuthType = 'bearer';
  private apiKeySecretName: string = '';
  private customHeaderName: string = 'X-API-Key';
  private apiToken: string = '';
  private showPassword: boolean = false;

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
      this.name = serverToEdit.name || '';
      this.url = serverToEdit.url || '';
      this.description = serverToEdit.description || '';
      this.authType = serverToEdit.authType || 'bearer';
      this.apiKeySecretName = serverToEdit.apiKeySecretName || `oh_bot_secret_mcp_${serverToEdit.id}_token`;
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

  private attachFocusScroll(inputEl: HTMLElement) {
    inputEl.addEventListener('focus', () => {
      setTimeout(() => {
        inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 250);
    });
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('harness-modal-content');
    contentEl.addClass('harness-mcp-edit-modal');

    // Header
    const isEdit = !!this.serverToEdit;
    contentEl.createEl('h2', { text: isEdit ? `Edit MCP Server: ${this.name}` : 'Add Web MCP Server' });

    // Server Name
    new Setting(contentEl)
      .setName('Server Name')
      .setDesc('Friendly display name for this remote MCP service.')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Todoist (Remote MCP)')
          .setValue(this.name)
          .onChange((v) => (this.name = v));
        this.attachFocusScroll(text.inputEl);
      });

    // Endpoint URL
    new Setting(contentEl)
      .setName('Remote URL')
      .setDesc('Remote SSE or Streamable HTTP POST endpoint.')
      .addText((text) => {
        text
          .setPlaceholder('https://ai.todoist.net/mcp')
          .setValue(this.url)
          .onChange((v) => (this.url = v));
        this.attachFocusScroll(text.inputEl);
      });

    // Todoist Token Helper (if relevant)
    if (this.url.includes('todoist') || this.name.toLowerCase().includes('todoist')) {
      const helperBox = contentEl.createEl('div', { cls: 'harness-mcp-helper-box' });
      helperBox.style.padding = '10px 12px';
      helperBox.style.margin = '8px 0 14px 0';
      helperBox.style.borderRadius = '6px';
      helperBox.style.backgroundColor = 'var(--background-secondary-alt)';
      helperBox.style.border = '1px solid var(--interactive-accent)';

      const title = helperBox.createEl('div');
      title.createEl('strong', { text: '💡 How to get your Todoist API Token:' });

      const desc = helperBox.createEl('p', {
        text: '1. Click the button below to open Todoist Developer Settings in browser.\n2. Copy your Personal API Token.\n3. Click "Paste" in the API Token field below.',
        cls: 'harness-subtext',
      });
      desc.style.margin = '4px 0 8px 0';
      desc.style.whiteSpace = 'pre-line';

      const openBtn = helperBox.createEl('button', {
        text: '🔗 Open Todoist Token Settings',
        cls: 'harness-btn-sm mod-cta',
      });
      openBtn.addEventListener('click', () => {
        openExternalUrl('https://app.todoist.com/app/settings/integrations/developer');
      });
    }

    // Auth Type Dropdown
    new Setting(contentEl)
      .setName('Authentication Method')
      .setDesc('Select how the client authenticates.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('bearer', 'Bearer Token (API Key / Personal Token)')
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
      // 1. SecretStorage picker (if supported by Obsidian SecretComponent)
      const SecretComp = (obsidianModule as any).SecretComponent;
      if (typeof SecretComp === 'function') {
        const defaultSecretName = this.apiKeySecretName || `oh_bot_secret_mcp_${this.serverToEdit?.id || 'todoist'}_token`;
        new Setting(contentEl)
          .setName('Secret in SecretStorage')
          .setDesc('Select or create a named secret in Obsidian Secret Storage')
          .addComponent((el) => {
            return new SecretComp(this.app, el)
              .setValue(this.apiKeySecretName || defaultSecretName)
              .onChange((val: string) => {
                this.apiKeySecretName = val;
                const secretVal = this.secretManager.getSecret(val);
                if (secretVal) {
                  this.apiToken = secretVal;
                }
              });
          });
      }

      const tokenSetting = new Setting(contentEl)
        .setName('API Token / Secret')
        .setDesc('Stored securely in Obsidian SecretManager.');

      tokenSetting.addText((text) => {
        text.inputEl.type = this.showPassword ? 'text' : 'password';
        text
          .setPlaceholder('Paste your API token here...')
          .setValue(this.apiToken)
          .onChange((v) => (this.apiToken = v));
        this.attachFocusScroll(text.inputEl);

        // Paste from Clipboard button
        tokenSetting.addButton((pasteBtn) => {
          pasteBtn.setButtonText('Paste');
          pasteBtn.setTooltip('Paste token from clipboard');
          pasteBtn.onClick(async () => {
            try {
              const clip = await navigator.clipboard.readText();
              if (clip && clip.trim()) {
                this.apiToken = clip.trim();
                text.setValue(this.apiToken);
                new Notice('✓ Token pasted from clipboard!');
              } else {
                new Notice('Clipboard is empty.');
              }
            } catch (err: any) {
              new Notice('Could not read clipboard. Please paste manually.');
            }
          });
        });

        // Show/Hide toggle button
        tokenSetting.addButton((showBtn) => {
          setIcon(showBtn.buttonEl, this.showPassword ? 'eye-off' : 'eye');
          showBtn.setTooltip(this.showPassword ? 'Hide Token' : 'Show Token');
          showBtn.onClick(() => {
            this.showPassword = !this.showPassword;
            text.inputEl.type = this.showPassword ? 'text' : 'password';
            setIcon(showBtn.buttonEl, this.showPassword ? 'eye-off' : 'eye');
            showBtn.setTooltip(this.showPassword ? 'Hide Token' : 'Show Token');
          });
        });
      });
    } else if (this.authType === 'custom_headers') {
      new Setting(contentEl)
        .setName('Custom Header Name')
        .setDesc('HTTP header name to send.')
        .addText((text) => {
          text
            .setPlaceholder('X-API-Key')
            .setValue(this.customHeaderName)
            .onChange((v) => (this.customHeaderName = v));
          this.attachFocusScroll(text.inputEl);
        });

      const headerValSetting = new Setting(contentEl)
        .setName('Header Value / API Key')
        .setDesc('Stored securely in Obsidian SecretManager.');

      headerValSetting.addText((text) => {
        text.inputEl.type = this.showPassword ? 'text' : 'password';
        text
          .setPlaceholder('Enter API key...')
          .setValue(this.apiToken)
          .onChange((v) => (this.apiToken = v));
        this.attachFocusScroll(text.inputEl);

        headerValSetting.addButton((pasteBtn) => {
          pasteBtn.setButtonText('Paste');
          pasteBtn.onClick(async () => {
            try {
              const clip = await navigator.clipboard.readText();
              if (clip && clip.trim()) {
                this.apiToken = clip.trim();
                text.setValue(this.apiToken);
                new Notice('✓ Key pasted from clipboard!');
              }
            } catch (e) {
              new Notice('Please paste key manually.');
            }
          });
        });
      });
    } else if (this.authType === 'oauth2') {
      new Setting(contentEl)
        .setName('Authorization URL')
        .setDesc('OAuth provider authorization endpoint.')
        .addText((text) => {
          text
            .setPlaceholder('https://provider.com/oauth/authorize')
            .setValue(this.oauthAuthUrl)
            .onChange((v) => (this.oauthAuthUrl = v));
          this.attachFocusScroll(text.inputEl);
        });

      new Setting(contentEl)
        .setName('Token URL')
        .setDesc('OAuth provider token exchange endpoint.')
        .addText((text) => {
          text
            .setPlaceholder('https://provider.com/oauth/token')
            .setValue(this.oauthTokenUrl)
            .onChange((v) => (this.oauthTokenUrl = v));
          this.attachFocusScroll(text.inputEl);
        });

      new Setting(contentEl)
        .setName('Client ID')
        .setDesc('OAuth client identifier registered with the service.')
        .addText((text) => {
          text
            .setPlaceholder('client_id_123')
            .setValue(this.oauthClientId)
            .onChange((v) => (this.oauthClientId = v));
          this.attachFocusScroll(text.inputEl);
        });

      new Setting(contentEl)
        .setName('Scopes (Optional)')
        .setDesc('Space-separated list of OAuth scopes.')
        .addText((text) => {
          text
            .setPlaceholder('data:read data:write')
            .setValue(this.oauthScopes)
            .onChange((v) => (this.oauthScopes = v));
          this.attachFocusScroll(text.inputEl);
        });
    }

    // Description (Optional)
    new Setting(contentEl)
      .setName('Description (Optional)')
      .setDesc('Brief summary of tools provided.')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Task management in Todoist')
          .setValue(this.description)
          .onChange((v) => (this.description = v));
        this.attachFocusScroll(text.inputEl);
      });

    // Action Buttons Row using Native Obsidian Setting API
    const actionSetting = new Setting(contentEl);
    actionSetting.settingEl.style.marginTop = '20px';
    actionSetting.settingEl.style.borderTop = '1px solid var(--background-modifier-border)';
    actionSetting.settingEl.style.paddingTop = '14px';

    actionSetting.addButton((btn) => {
      btn.setButtonText('Cancel');
      btn.onClick(() => {
        this.close();
      });
    });

    actionSetting.addButton((btn) => {
      btn.setButtonText(isEdit ? 'Save Changes' : 'Save & Test Connection');
      btn.setCta();
      btn.onClick(async () => {
        await this.handleSave(btn);
      });
    });
  }

  private async handleSave(saveButton?: ButtonComponent) {
    try {
      if (!this.name || !this.name.trim()) {
        new Notice('Please enter a server name.');
        return;
      }
      if (!this.url || !this.url.trim()) {
        new Notice('Please enter a valid remote URL.');
        return;
      }

      const serverId = this.serverToEdit
        ? this.serverToEdit.id
        : this.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `mcp-${Date.now()}`;

      const secretKeyName = this.apiKeySecretName || this.serverToEdit?.apiKeySecretName || `oh_bot_secret_mcp_${serverId}_token`;

      // Save token to SecretManager
      if (this.apiToken && this.apiToken.trim()) {
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

      if (saveButton) {
        saveButton.setDisabled(true);
        saveButton.setButtonText('Testing Connection...');
      }

      await this.mcpManager.addServer(serverConfig);

      if (this.authType !== 'oauth2') {
        try {
          const tools = await this.mcpManager.testAndSyncServer(serverId);
          new Notice(`✓ Connected! Discovered ${tools.length} tool(s).`);
        } catch (e: any) {
          new Notice(`Server saved, but test reported: ${e.message}`);
        }
      } else {
        new Notice(`Server saved. Click "Login with OAuth" to authenticate.`);
      }

      this.onSaved();
      this.close();
    } catch (err: any) {
      new Notice(`Failed to save server: ${err.message}`);
    } finally {
      if (saveButton) {
        saveButton.setDisabled(false);
        saveButton.setButtonText(this.serverToEdit ? 'Save Changes' : 'Save & Test Connection');
      }
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
