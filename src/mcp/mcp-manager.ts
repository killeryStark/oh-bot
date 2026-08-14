import { App, Notice } from 'obsidian';
import { HarnessSettings, ToolResult, ToolSchema } from '../types';
import { SecretManager } from '../utils/secrets';
import { openExternalUrl } from '../utils/browser';
import { McpClient } from './client';
import { McpOAuthHelper } from './oauth';
import { McpCatalogItem, McpCatalogManifest, McpServerConfig } from './types';

// Bundled starter catalog
const DEFAULT_CATALOG: McpCatalogItem[] = [
  {
    id: 'todoist',
    name: 'Todoist (Official Hosted Remote MCP)',
    description: 'Official hosted Todoist MCP server for managing tasks, projects, sections, comments, and reminders in real time.',
    url: 'https://ai.todoist.net/mcp',
    authType: 'bearer',
    authDescription: 'Requires Personal API Token from Todoist Settings -> Integrations -> Developer -> API token.',
    docUrl: 'https://app.todoist.com/app/settings/integrations/developer',
    tags: ['tasks', 'productivity', 'todoist', 'remote-sse'],
  },
];

export class McpManager {
  private app: App;
  private settings: HarnessSettings;
  private onSaveSettings: () => Promise<void>;
  private secretManager: SecretManager;
  private catalog: McpCatalogItem[] = DEFAULT_CATALOG;

  constructor(app: App, settings: HarnessSettings, onSaveSettings: () => Promise<void>) {
    this.app = app;
    this.settings = settings;
    this.onSaveSettings = onSaveSettings;
    this.secretManager = new SecretManager(app);
  }

  async init(): Promise<void> {
    if (!this.settings.mcpServers) {
      this.settings.mcpServers = [];
    }

    // Load bundled catalog if available
    try {
      const adapter = this.app.vault.adapter;
      const manifestPath = `${(this.app.vault as any).configDir}/plugins/oh-bot/marketplace/mcp.json`;
      if (await adapter.exists(manifestPath)) {
        const raw = await adapter.read(manifestPath);
        const manifest: McpCatalogManifest = JSON.parse(raw);
        if (manifest.servers && Array.isArray(manifest.servers)) {
          this.catalog = manifest.servers;
        }
      }
    } catch (e) {
      // Fallback to default catalog
      this.catalog = DEFAULT_CATALOG;
    }
  }

  getAllServers(): McpServerConfig[] {
    return this.settings.mcpServers || [];
  }

  getEnabledServers(): McpServerConfig[] {
    return (this.settings.mcpServers || []).filter((s) => s.enabled);
  }

  getServer(id: string): McpServerConfig | undefined {
    return (this.settings.mcpServers || []).find((s) => s.id === id);
  }

  getCatalog(): McpCatalogItem[] {
    return this.catalog;
  }

  async addServer(config: McpServerConfig): Promise<void> {
    if (!this.settings.mcpServers) {
      this.settings.mcpServers = [];
    }
    const existingIndex = this.settings.mcpServers.findIndex((s) => s.id === config.id);
    if (existingIndex >= 0) {
      this.settings.mcpServers[existingIndex] = config;
    } else {
      this.settings.mcpServers.push(config);
    }
    await this.onSaveSettings();
  }

  async updateServer(id: string, updates: Partial<McpServerConfig>): Promise<void> {
    const server = this.getServer(id);
    if (!server) {
      throw new Error(`MCP Server "${id}" not found.`);
    }
    Object.assign(server, updates);
    await this.onSaveSettings();
  }

  async removeServer(id: string): Promise<void> {
    const server = this.getServer(id);
    if (!server) return;

    // Clean up secrets
    if (server.apiKeySecretName) {
      this.secretManager.setSecret(server.apiKeySecretName, '');
    }
    if (server.oauthConfig?.accessTokenSecretName) {
      this.secretManager.setSecret(server.oauthConfig.accessTokenSecretName, '');
    }
    if (server.oauthConfig?.refreshTokenSecretName) {
      this.secretManager.setSecret(server.oauthConfig.refreshTokenSecretName, '');
    }

    this.settings.mcpServers = (this.settings.mcpServers || []).filter((s) => s.id !== id);
    await this.onSaveSettings();
  }

  async toggleServer(id: string, enabled: boolean): Promise<void> {
    const server = this.getServer(id);
    if (!server) return;
    server.enabled = enabled;
    await this.onSaveSettings();
  }

  /**
   * Retrieves active authentication token for a server.
   */
  getAuthToken(server: McpServerConfig): string | undefined {
    if (server.authType === 'bearer' || server.authType === 'custom_headers') {
      if (server.apiKeySecretName) {
        return this.secretManager.getSecret(server.apiKeySecretName) || undefined;
      }
    } else if (server.authType === 'oauth2') {
      const accessSecret = server.oauthConfig?.accessTokenSecretName || `oh_bot_secret_mcp_${server.id}_access`;
      return this.secretManager.getSecret(accessSecret) || undefined;
    }
    return undefined;
  }

  /**
   * Instantiates an McpClient for a given server configuration.
   */
  createClient(server: McpServerConfig): McpClient {
    const token = this.getAuthToken(server);
    return new McpClient({
      url: server.url,
      authType: server.authType,
      authToken: token,
      customHeaderName: server.customHeaderName,
    });
  }

  /**
   * Tests connection to the server, queries tools/list, and caches the result.
   */
  async testAndSyncServer(serverId: string): Promise<ToolSchema[]> {
    const server = this.getServer(serverId);
    if (!server) {
      throw new Error(`MCP Server "${serverId}" not found.`);
    }

    const client = this.createClient(server);
    try {
      const tools = await client.listTools();
      server.cachedTools = tools;
      server.lastConnected = Date.now();
      server.lastError = undefined;
      await this.onSaveSettings();
      return tools;
    } catch (err: any) {
      server.lastError = err.message || 'Connection failed';
      await this.onSaveSettings();
      throw err;
    }
  }

  /**
   * Executes a tool on a remote MCP server.
   */
  async executeTool(serverId: string, toolName: string, args: Record<string, any>): Promise<ToolResult> {
    const server = this.getServer(serverId);
    if (!server) {
      return {
        success: false,
        output: '',
        error: `MCP Server "${serverId}" not found or has been removed.`,
      };
    }

    if (!server.enabled) {
      return {
        success: false,
        output: '',
        error: `MCP Server "${server.name}" is currently disabled.`,
      };
    }

    const client = this.createClient(server);
    return await client.callTool(toolName, args);
  }

  /**
   * Triggers the OAuth 2.1 PKCE authorization flow in the browser.
   */
  async startOAuthFlow(serverId: string): Promise<void> {
    const server = this.getServer(serverId);
    if (!server) {
      throw new Error(`Server "${serverId}" not found.`);
    }

    const authUrl = await McpOAuthHelper.startOAuthFlow(server);
    openExternalUrl(authUrl);
    new Notice(`Opening browser for ${server.name} authorization...`);
  }

  /**
   * Handles incoming OAuth deep link callback.
   */
  async handleOAuthCallback(params: Record<string, string>): Promise<{ serverId: string; success: boolean; error?: string }> {
    const result = await McpOAuthHelper.handleCallback(params, this.secretManager);
    if (result.success && result.serverId) {
      try {
        const server = this.getServer(result.serverId);
        if (server) {
          server.enabled = true;
          await this.testAndSyncServer(result.serverId);
          new Notice(`✓ Successfully connected to ${server.name}!`);
        }
      } catch (err: any) {
        new Notice(`Connected, but tool discovery failed: ${err.message}`);
      }
    }
    return result;
  }

  /**
   * Installs or adds an MCP server from the curated catalog.
   */
  async installFromCatalog(
    item: McpCatalogItem,
    customApiKey?: string
  ): Promise<McpServerConfig> {
    const secretKeyName = `oh_bot_secret_mcp_${item.id}_token`;

    if (customApiKey) {
      this.secretManager.setSecret(secretKeyName, customApiKey);
    }

    const serverConfig: McpServerConfig = {
      id: item.id,
      name: item.name,
      description: item.description,
      url: item.url,
      enabled: true,
      authType: item.authType,
      apiKeySecretName: secretKeyName,
      oauthConfig: item.oauthDefaults
        ? {
            authorizationUrl: item.oauthDefaults.authorizationUrl,
            tokenUrl: item.oauthDefaults.tokenUrl,
            clientId: item.oauthDefaults.clientId,
            scopes: item.oauthDefaults.scopes,
            accessTokenSecretName: `oh_bot_secret_mcp_${item.id}_access`,
            refreshTokenSecretName: `oh_bot_secret_mcp_${item.id}_refresh`,
          }
        : undefined,
      cachedTools: [],
    };

    await this.addServer(serverConfig);

    // Attempt initial sync if token is present or auth is none
    if (!customApiKey && item.authType !== 'none') {
      // Configured but awaiting token/oauth
      return serverConfig;
    }

    try {
      await this.testAndSyncServer(item.id);
    } catch (e) {
      // Ignored for initial add
    }

    return serverConfig;
  }
}
