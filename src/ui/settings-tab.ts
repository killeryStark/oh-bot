import { App, PluginSettingTab, Setting, Notice, setIcon } from 'obsidian';
import type HarnessPlugin from '../main';
import { SafetyMode, SearchProviderType } from '../types';
import { AddProviderModal } from './components/add-provider-modal';
import { EditModelsModal } from './components/edit-models-modal';
import { fetchAvailableModels } from '../utils/model-fetcher';
import { SecretManager } from '../utils/secrets';
import { SkillsModal } from './skills-modal';
import { McpModal } from './mcp-modal';
import { SearchableModelSelect } from './components/searchable-model-select';
import { AgentEditModal } from './agent-edit-modal';

export class HarnessSettingTab extends PluginSettingTab {
  plugin: HarnessPlugin;
  private selectedConfigProviderId: string;
  private secretManager: SecretManager;
  private activeModelSelects: SearchableModelSelect[] = [];

  constructor(app: App, plugin: HarnessPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.secretManager = new SecretManager(app);
    this.selectedConfigProviderId = this.plugin.settings.activeProviderId || this.plugin.settings.providers[0]?.id || 'openrouter';
  }

  public hide(): void {
    super.hide();
    this.destroyActiveModelSelects();
  }

  private destroyActiveModelSelects(): void {
    for (const select of this.activeModelSelects) {
      try {
        select.destroy();
      } catch (e) {
        // ignore
      }
    }
    this.activeModelSelects = [];
  }

  private async saveSettings(): Promise<void> {
    await this.plugin.saveSettings();
    if (this.plugin.toolRegistry) {
      this.plugin.toolRegistry.setSettings(this.plugin.settings);
    }
  }

  display(): void {
    this.destroyActiveModelSelects();

    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('harness-settings-container');

    containerEl.createEl('h2', { text: 'Obsidian Harness Bot Settings' });

    // Active Default Provider
    new Setting(containerEl)
      .setName('Default Active Provider')
      .setDesc('Select the default AI provider for agent operations')
      .addDropdown((dropdown) => {
        dropdown.addOption('', '(Not configured)');
        for (const prov of this.plugin.settings.providers) {
          const hasKey = prov.type === 'ollama' || this.secretManager.hasSecret(prov.apiKeySecretName);
          const label = hasKey ? prov.name : `${prov.name} (Key missing)`;
          dropdown.addOption(prov.id, label);
        }
        dropdown.setValue(this.plugin.settings.activeProviderId || '');
        dropdown.onChange(async (val) => {
          this.plugin.settings.activeProviderId = val;
          const activeProv = this.plugin.settings.providers.find((p) => p.id === val);
          if (activeProv && activeProv.models.length > 0) {
            this.plugin.settings.activeModel = activeProv.models[0];
          } else {
            this.plugin.settings.activeModel = '';
          }
          await this.saveSettings();
          this.display();
        });
      });

    // Active Default Model
    const currentActiveProvider = this.plugin.settings.providers.find(
      (p) => p.id === this.plugin.settings.activeProviderId
    );

    const modelSetting = new Setting(containerEl)
      .setName('Default Active Model')
      .setDesc(currentActiveProvider ? `Select model for ${currentActiveProvider.name}` : 'Select an active provider first');

    const availableModels = currentActiveProvider ? currentActiveProvider.models : [];
    let selectedModel = '';
    if (availableModels.length > 0) {
      if (availableModels.includes(this.plugin.settings.activeModel)) {
        selectedModel = this.plugin.settings.activeModel;
      } else {
        selectedModel = availableModels[0];
        this.plugin.settings.activeModel = selectedModel;
        void this.saveSettings();
      }
    }

    const defaultModelSelect = new SearchableModelSelect(modelSetting.controlEl, {
      models: availableModels,
      selectedModel: selectedModel,
      placeholder: currentActiveProvider
        ? (availableModels.length > 0 ? 'Select model...' : '(No models configured)')
        : '(No provider selected)',
      onChange: async (val) => {
        this.plugin.settings.activeModel = val;
        await this.saveSettings();
      },
    });
    this.activeModelSelects.push(defaultModelSelect);

    containerEl.createEl('h3', { text: 'Provider Configuration' });

    // Provider Config Selector
    const providerSelectSetting = new Setting(containerEl)
      .setName('Select Provider to Configure')
      .setDesc('Choose a provider to configure its API key, base URL, and model list')
      .addDropdown((dropdown) => {
        for (const prov of this.plugin.settings.providers) {
          dropdown.addOption(prov.id, prov.name);
        }
        dropdown.setValue(this.selectedConfigProviderId);
        dropdown.onChange((val) => {
          this.selectedConfigProviderId = val;
          this.display();
        });
      });

    providerSelectSetting.addButton((btn) => {
      btn.setButtonText('+ Custom Provider');
      btn.buttonEl.setAttribute('aria-label', 'Add custom provider');
      btn.buttonEl.setAttribute('title', 'Add custom provider');
      btn.setCta();
      btn.onClick(() => {
        new AddProviderModal(this.app, async (newProvider) => {
          this.plugin.settings.providers.push(newProvider);
          this.selectedConfigProviderId = newProvider.id;
          if (!this.plugin.settings.activeProviderId) {
            this.plugin.settings.activeProviderId = newProvider.id;
            this.plugin.settings.activeModel = newProvider.models[0] || '';
          }
          await this.saveSettings();
          this.display();
        }).open();
      });
    });

    const configProvider = this.plugin.settings.providers.find(
      (p) => p.id === this.selectedConfigProviderId
    );

    if (configProvider) {
      const providerCardEl = containerEl.createEl('div', { cls: 'harness-provider-card' });
      providerCardEl.style.border = '1px solid var(--background-modifier-border)';
      providerCardEl.style.borderRadius = '8px';
      providerCardEl.style.padding = '12px';
      providerCardEl.style.marginBottom = '16px';
      providerCardEl.style.backgroundColor = 'var(--background-secondary)';

      providerCardEl.createEl('h4', { text: `Configuration: ${configProvider.name}` });

      // Base URL Setting
      new Setting(providerCardEl)
        .setName('Base URL')
        .setDesc('API Endpoint URL')
        .addText((text) =>
          text.setValue(configProvider.baseUrl).onChange(async (val) => {
            configProvider.baseUrl = val.trim();
            await this.saveSettings();
          })
        );

      // API Key Input
      const hasKey = this.secretManager.hasSecret(configProvider.apiKeySecretName);
      const keySetting = new Setting(providerCardEl)
        .setName('API Key')
        .setDesc(hasKey ? 'Key is configured in SecretStorage' : 'Enter API Key to store securely');

      keySetting.addText((text) => {
        text.inputEl.type = 'password';
        text.setPlaceholder(hasKey ? '••••••••••••••••' : 'Enter API Key');
        text.onChange(async (val) => {
          const trimmed = val.trim();
          if (trimmed) {
            this.secretManager.setSecret(configProvider.apiKeySecretName, trimmed);
            if (!this.plugin.settings.activeProviderId) {
              this.plugin.settings.activeProviderId = configProvider.id;
              this.plugin.settings.activeModel = configProvider.models[0] || '';
            }
            await this.saveSettings();
            new Notice(`API Key saved for ${configProvider.name}`);
          }
        });
      });

      if (hasKey) {
        keySetting.addButton((btn) => {
          btn.setButtonText('Clear Key');
          btn.buttonEl.setAttribute('aria-label', 'Clear API key');
          btn.buttonEl.setAttribute('title', 'Clear API key');
          btn.setWarning();
          btn.onClick(async () => {
            this.secretManager.setSecret(configProvider.apiKeySecretName, '');
            new Notice(`API Key cleared for ${configProvider.name}`);
            this.display();
          });
        });
      }

      // Available Models Dropdown + Round Refresh Button + Round Edit Pencil Button
      const modelsSetting = new Setting(providerCardEl)
        .setName('Available Models')
        .setDesc(`${configProvider.models.length} model(s) configured`);

      const providerModelSelect = new SearchableModelSelect(modelsSetting.controlEl, {
        models: configProvider.models,
        selectedModel: configProvider.models[0] || '',
        placeholder: configProvider.models.length === 0 ? '(No models loaded)' : 'Search models...',
        onChange: () => {
          // Model selected in provider preview
        },
      });
      this.activeModelSelects.push(providerModelSelect);

      // Round Refresh Button
      modelsSetting.addButton((btn) => {
        btn.setClass('harness-btn-icon-round');
        btn.setTooltip('Fetch models from endpoint');
        btn.buttonEl.setAttribute('aria-label', 'Fetch models from endpoint');
        btn.buttonEl.setAttribute('title', 'Fetch models from endpoint');
        setIcon(btn.buttonEl, 'refresh-cw');
        btn.onClick(async () => {
          const apiKey = this.secretManager.getSecret(configProvider.apiKeySecretName) || '';
          new Notice(`Fetching models for ${configProvider.name}...`);
          const fetched = await fetchAvailableModels(configProvider.baseUrl, apiKey);
          if (fetched.length > 0) {
            configProvider.models = fetched;
            if (this.plugin.settings.activeProviderId === configProvider.id && fetched.length > 0) {
              this.plugin.settings.activeModel = fetched[0];
            }
            await this.saveSettings();
            new Notice(`Updated ${configProvider.name} with ${fetched.length} models!`);
            this.display();
          } else {
            new Notice('Could not fetch models automatically from endpoint.');
          }
        });
      });

      // Round Edit (Pencil) Button
      modelsSetting.addButton((btn) => {
        btn.setClass('harness-btn-icon-round');
        btn.setTooltip('Edit models list');
        btn.buttonEl.setAttribute('aria-label', 'Edit models list');
        btn.buttonEl.setAttribute('title', 'Edit models list');
        setIcon(btn.buttonEl, 'pencil');
        btn.onClick(() => {
          new EditModelsModal(this.app, configProvider, async (updatedModels) => {
            configProvider.models = updatedModels;
            if (this.plugin.settings.activeProviderId === configProvider.id) {
              if (!updatedModels.includes(this.plugin.settings.activeModel)) {
                this.plugin.settings.activeModel = updatedModels[0] || '';
              }
            }
            await this.saveSettings();
            this.display();
          }).open();
        });
      });

      // Delete custom provider button
      if (configProvider.isCustom) {
        const deleteSetting = new Setting(providerCardEl)
          .setName('Delete Provider')
          .setDesc('Remove this custom provider from settings');

        deleteSetting.addButton((btn) => {
          btn.setButtonText('Delete Provider');
          btn.buttonEl.setAttribute('aria-label', 'Delete provider');
          btn.buttonEl.setAttribute('title', 'Delete provider');
          setIcon(btn.buttonEl, 'trash');
          btn.setWarning();
          btn.onClick(async () => {
            this.plugin.settings.providers = this.plugin.settings.providers.filter(
              (p) => p.id !== configProvider.id
            );
            this.selectedConfigProviderId = this.plugin.settings.providers[0]?.id || 'openrouter';
            if (this.plugin.settings.activeProviderId === configProvider.id) {
              this.plugin.settings.activeProviderId = '';
              this.plugin.settings.activeModel = '';
            }
            await this.saveSettings();
            new Notice(`Deleted provider "${configProvider.name}".`);
            this.display();
          });
        });
      }
    }

    containerEl.createEl('h3', { text: 'General & Safety' });

    // Safety Mode
    new Setting(containerEl)
      .setName('Vault Modification Safety Mode')
      .setDesc('Strict mode prompts for user confirmation before writing or modifying any Vault file')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('strict', 'Strict (Prompt before file edits)')
          .addOption('auto', 'Auto (Auto-approve file edits)')
          .setValue(this.plugin.settings.safetyMode)
          .onChange(async (value) => {
            this.plugin.settings.safetyMode = value as SafetyMode;
            await this.saveSettings();
          })
      );

    containerEl.createEl('h3', { text: 'Agents & Subagents (Multi-Agent System)' });

    const agentsHeaderSetting = new Setting(containerEl)
      .setName('Configured Agents')
      .setDesc(
        'Autonomous primary agents and specialized subagents with scoped workspaces, custom system prompts, and tool permissions.'
      )
      .addButton((btn) => {
        btn.setButtonText('+ Add New Agent');
        btn.setCta();
        setIcon(btn.buttonEl, 'plus');
        btn.buttonEl.setAttribute('aria-label', 'Add new agent');
        btn.buttonEl.setAttribute('title', 'Add new agent');
        btn.onClick(() => {
          new AgentEditModal(this.app, this.plugin, undefined, () => this.display()).open();
        });
      });

    const agents = this.plugin.settings.agents || [];
    const agentsListContainer = containerEl.createEl('div', { cls: 'harness-agents-list' });
    agentsListContainer.style.display = 'flex';
    agentsListContainer.style.flexDirection = 'column';
    agentsListContainer.style.gap = '10px';
    agentsListContainer.style.marginBottom = '20px';

    if (agents.length === 0) {
      const emptyEl = agentsListContainer.createEl('div', {
        cls: 'harness-agents-empty',
        text: 'No agents configured. Click "+ Add New Agent" to create one.',
      });
      emptyEl.style.padding = '12px';
      emptyEl.style.color = 'var(--text-muted)';
      emptyEl.style.fontStyle = 'italic';
    }

    for (const agent of agents) {
      const cardEl = agentsListContainer.createEl('div', { cls: 'harness-agent-card' });
      cardEl.style.border = '1px solid var(--background-modifier-border)';
      cardEl.style.borderRadius = '8px';
      cardEl.style.padding = '12px 14px';
      cardEl.style.backgroundColor = 'var(--background-secondary)';
      cardEl.style.display = 'flex';
      cardEl.style.flexDirection = 'column';
      cardEl.style.gap = '8px';

      // Header row
      const cardHeader = cardEl.createEl('div', { cls: 'harness-agent-card-header' });
      cardHeader.style.display = 'flex';
      cardHeader.style.justifyContent = 'space-between';
      cardHeader.style.alignItems = 'center';
      cardHeader.style.gap = '8px';

      // Left title & badge
      const titleWrapper = cardHeader.createEl('div', { cls: 'harness-agent-title-wrapper' });
      titleWrapper.style.display = 'flex';
      titleWrapper.style.alignItems = 'center';
      titleWrapper.style.gap = '8px';

      const iconSpan = titleWrapper.createEl('span', { cls: 'harness-agent-card-icon' });
      setIcon(iconSpan, agent.isDefaultMain ? 'bot' : 'user');
      iconSpan.style.display = 'inline-flex';
      iconSpan.style.alignItems = 'center';
      iconSpan.style.color = agent.isDefaultMain ? 'var(--interactive-accent)' : 'var(--text-accent)';

      const nameEl = titleWrapper.createEl('span', {
        text: agent.name,
      });
      nameEl.style.fontWeight = '600';
      nameEl.style.fontSize = '1.05em';

      const idEl = titleWrapper.createEl('span', {
        text: `(${agent.id})`,
      });
      idEl.style.fontSize = '0.85em';
      idEl.style.color = 'var(--text-muted)';

      if (agent.isDefaultMain) {
        const badge = titleWrapper.createEl('span', {
          cls: 'harness-badge harness-badge-main',
          text: 'Default Main',
        });
        badge.style.fontSize = '0.75em';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '4px';
        badge.style.backgroundColor = 'var(--interactive-accent)';
        badge.style.color = 'var(--text-on-accent)';
        badge.style.fontWeight = '500';
      }

      // Actions (Edit, Delete)
      const actionsWrapper = cardHeader.createEl('div', { cls: 'harness-agent-card-actions' });
      actionsWrapper.style.display = 'flex';
      actionsWrapper.style.gap = '6px';
      actionsWrapper.style.alignItems = 'center';

      const editBtn = actionsWrapper.createEl('button', {
        cls: 'clickable-icon harness-btn-icon-round',
      });
      editBtn.setAttribute('aria-label', `Edit agent ${agent.name}`);
      editBtn.setAttribute('title', `Edit agent ${agent.name}`);
      setIcon(editBtn, 'pencil');
      editBtn.addEventListener('click', () => {
        new AgentEditModal(this.app, this.plugin, agent, () => this.display()).open();
      });

      if (!agent.isDefaultMain) {
        const deleteBtn = actionsWrapper.createEl('button', {
          cls: 'clickable-icon harness-btn-icon-round is-destructive',
        });
        deleteBtn.setAttribute('aria-label', `Delete agent ${agent.name}`);
        deleteBtn.setAttribute('title', `Delete agent ${agent.name}`);
        setIcon(deleteBtn, 'trash');
        deleteBtn.addEventListener('click', async () => {
          if (confirm(`Are you sure you want to delete agent "${agent.name}"?`)) {
            const deleted = await this.plugin.agentManager.deleteAgent(agent.id);
            if (deleted) {
              new Notice(`Deleted agent "${agent.name}".`);
              this.display();
            } else {
              new Notice('Could not delete agent.');
            }
          }
        });
      }

      // Description
      if (agent.description) {
        const descEl = cardEl.createEl('div', {
          cls: 'harness-agent-desc',
          text: agent.description,
        });
        descEl.style.fontSize = '0.88em';
        descEl.style.color = 'var(--text-normal)';
        descEl.style.lineHeight = '1.4';
      }

      // Info badges row
      const badgesRow = cardEl.createEl('div', { cls: 'harness-agent-badges-row' });
      badgesRow.style.display = 'flex';
      badgesRow.style.flexWrap = 'wrap';
      badgesRow.style.gap = '6px';
      badgesRow.style.fontSize = '0.8em';

      const createBadge = (text: string) => {
        const b = badgesRow.createEl('span', { cls: 'harness-agent-badge', text });
        b.style.padding = '2px 8px';
        b.style.borderRadius = '4px';
        b.style.backgroundColor = 'var(--background-primary)';
        b.style.border = '1px solid var(--background-modifier-border)';
        b.style.color = 'var(--text-muted)';
        return b;
      };

      createBadge(`📁 Workspace: ${agent.workspacePath || 'Full Vault'}`);
      createBadge(`🧠 Model: ${agent.model || 'Inherit'}`);
      createBadge(`🛠 Allowed Tools: ${agent.allowedTools?.join(', ') || '*'}`);
    }

    containerEl.createEl('h3', { text: 'Web Search & Document Tools' });

    // Search Provider Dropdown
    new Setting(containerEl)
      .setName('Search Provider')
      .setDesc('Select the web search provider used by the web_search tool')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('duckduckgo', 'DuckDuckGo (Free / Zero-Config)')
          .addOption('searxng', 'SearXNG (Self-Hosted / Custom URL)')
          .addOption('tavily', 'Tavily Search (API Key)')
          .setValue(this.plugin.settings.searchProvider || 'duckduckgo')
          .onChange(async (val) => {
            this.plugin.settings.searchProvider = val as SearchProviderType;
            await this.saveSettings();
            this.display();
          });
      });

    // SearXNG Instance URL (only when searchProvider === 'searxng')
    if (this.plugin.settings.searchProvider === 'searxng') {
      new Setting(containerEl)
        .setName('SearXNG URL')
        .setDesc('Base URL of your SearXNG instance (e.g. http://localhost:8080 or https://searx.example.com)')
        .addText((text) => {
          text
            .setPlaceholder('http://localhost:8080')
            .setValue(this.plugin.settings.searxngUrl || '')
            .onChange(async (val) => {
              this.plugin.settings.searxngUrl = val.trim();
              await this.saveSettings();
            });
        });
    }

    // Tavily API Key (only when searchProvider === 'tavily')
    if (this.plugin.settings.searchProvider === 'tavily') {
      const tavilySecretName = this.plugin.settings.tavilyApiKeySecretName || 'oh_bot_secret_tavily';
      const hasTavilyKey = this.secretManager.hasSecret(tavilySecretName);

      const tavilySetting = new Setting(containerEl)
        .setName('Tavily API Key')
        .setDesc(
          hasTavilyKey
            ? 'Key is configured in SecretStorage'
            : 'Enter Tavily API Key to store securely'
        );

      tavilySetting.addText((text) => {
        text.inputEl.type = 'password';
        text.setPlaceholder(hasTavilyKey ? '••••••••••••••••' : 'Enter Tavily API Key');
        text.onChange(async (val) => {
          const trimmed = val.trim();
          if (trimmed) {
            this.secretManager.setSecret(tavilySecretName, trimmed);
            await this.saveSettings();
            new Notice('Tavily API Key saved');
          }
        });
      });

      if (hasTavilyKey) {
        tavilySetting.addButton((btn) => {
          btn.setButtonText('Clear Key');
          btn.buttonEl.setAttribute('aria-label', 'Clear Tavily API key');
          btn.buttonEl.setAttribute('title', 'Clear Tavily API key');
          btn.setWarning();
          btn.onClick(async () => {
            this.secretManager.setSecret(tavilySecretName, '');
            new Notice('Tavily API Key cleared');
            await this.saveSettings();
            this.display();
          });
        });
      }
    }

    // Default PDF Folder
    new Setting(containerEl)
      .setName('Default PDF Folder')
      .setDesc('Default folder path in the vault for generated PDF documents')
      .addText((text) => {
        text
          .setPlaceholder('Documents/Generated')
          .setValue(this.plugin.settings.defaultPdfFolder || '')
          .onChange(async (val) => {
            this.plugin.settings.defaultPdfFolder = val.trim();
            await this.saveSettings();
          });
      });

    containerEl.createEl('h3', { text: 'Skills & Marketplace' });

    // Open Skills Modal Setting
    new Setting(containerEl)
      .setName('Manage Skills & Marketplace')
      .setDesc('Install skills from GitHub, browse the marketplace, or manage local vault skills')
      .addButton((btn) => {
        btn.setButtonText('Open Skills Manager');
        btn.buttonEl.setAttribute('aria-label', 'Open Skills Manager');
        btn.buttonEl.setAttribute('title', 'Open Skills Manager');
        btn.setCta();
        btn.onClick(() => {
          new SkillsModal(this.app, this.plugin).open();
        });
      });

    // Auto-scan Vault Skills
    new Setting(containerEl)
      .setName('Auto-scan Vault Folders')
      .setDesc('Scan .agents/skills/, .skills/, .claude/skills/, .gemini/skills/ in Vault for local skills')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.scanVaultSkills !== false)
          .onChange(async (val) => {
            this.plugin.settings.scanVaultSkills = val;
            await this.saveSettings();
            await this.plugin.skillManager.refreshLocalSkills();
          })
      );

    // Custom Marketplace URL
    new Setting(containerEl)
      .setName('Custom Marketplace Manifest URL')
      .setDesc('Optional URL to load custom community skills manifest JSON')
      .addText((text) =>
        text
          .setPlaceholder('https://raw.githubusercontent.com/.../skills.json')
          .setValue(this.plugin.settings.customMarketplaceUrl || '')
          .onChange(async (val) => {
            this.plugin.settings.customMarketplaceUrl = val.trim();
            await this.saveSettings();
          })
      );

    containerEl.createEl('h3', { text: 'Model Context Protocol (MCP) Servers' });

    const mcpServers = this.plugin.mcpManager?.getAllServers() || [];
    const enabledMcpCount = mcpServers.filter((s) => s.enabled).length;

    new Setting(containerEl)
      .setName('Manage MCP Servers & Integrations')
      .setDesc(`${enabledMcpCount} of ${mcpServers.length} servers active. Connect remote tools like Todoist, web search, and custom APIs.`)
      .addButton((btn) => {
        btn.setButtonText('Open MCP Servers (/mcp)');
        btn.buttonEl.setAttribute('aria-label', 'Open MCP servers');
        btn.buttonEl.setAttribute('title', 'Open MCP servers');
        btn.setCta();
        btn.onClick(() => {
          new McpModal(this.app, this.plugin).open();
        });
      });
  }
}
