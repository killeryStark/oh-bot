import { App, PluginSettingTab, Setting, Notice, setIcon } from 'obsidian';
import type HarnessPlugin from '../main';
import { SafetyMode } from '../types';
import { AddProviderModal } from './components/add-provider-modal';
import { EditModelsModal } from './components/edit-models-modal';
import { fetchAvailableModels } from '../utils/model-fetcher';
import { SecretManager } from '../utils/secrets';
import { SkillsModal } from './skills-modal';

export class HarnessSettingTab extends PluginSettingTab {
  plugin: HarnessPlugin;
  private selectedConfigProviderId: string;
  private secretManager: SecretManager;

  constructor(app: App, plugin: HarnessPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.secretManager = new SecretManager(app);
    this.selectedConfigProviderId = this.plugin.settings.activeProviderId || this.plugin.settings.providers[0]?.id || 'openrouter';
  }

  display(): void {
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
          await this.plugin.saveSettings();
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

    if (currentActiveProvider && currentActiveProvider.models.length > 0) {
      modelSetting.addDropdown((dropdown) => {
        for (const m of currentActiveProvider.models) {
          dropdown.addOption(m, m);
        }
        if (currentActiveProvider.models.includes(this.plugin.settings.activeModel)) {
          dropdown.setValue(this.plugin.settings.activeModel);
        } else {
          dropdown.setValue(currentActiveProvider.models[0]);
          this.plugin.settings.activeModel = currentActiveProvider.models[0];
        }
        dropdown.onChange(async (val) => {
          this.plugin.settings.activeModel = val;
          await this.plugin.saveSettings();
        });
      });
    } else {
      modelSetting.addDropdown((dropdown) => {
        dropdown.addOption('', '(No models configured)');
        dropdown.setValue('');
      });
    }

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
      btn.setCta();
      btn.onClick(() => {
        new AddProviderModal(this.app, async (newProvider) => {
          this.plugin.settings.providers.push(newProvider);
          this.selectedConfigProviderId = newProvider.id;
          if (!this.plugin.settings.activeProviderId) {
            this.plugin.settings.activeProviderId = newProvider.id;
            this.plugin.settings.activeModel = newProvider.models[0] || '';
          }
          await this.plugin.saveSettings();
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
            await this.plugin.saveSettings();
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
            await this.plugin.saveSettings();
            new Notice(`API Key saved for ${configProvider.name}`);
          }
        });
      });

      if (hasKey) {
        keySetting.addButton((btn) => {
          btn.setButtonText('Clear Key');
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

      if (configProvider.models.length > 0) {
        modelsSetting.addDropdown((dropdown) => {
          for (const m of configProvider.models) {
            dropdown.addOption(m, m);
          }
          dropdown.setValue(configProvider.models[0]);
        });
      } else {
        modelsSetting.addDropdown((dropdown) => {
          dropdown.addOption('', '(No models loaded)');
        });
      }

      // Round Refresh Button
      modelsSetting.addButton((btn) => {
        btn.setClass('harness-btn-icon-round');
        btn.setTooltip('Fetch models from endpoint');
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
            await this.plugin.saveSettings();
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
        setIcon(btn.buttonEl, 'pencil');
        btn.onClick(() => {
          new EditModelsModal(this.app, configProvider, async (updatedModels) => {
            configProvider.models = updatedModels;
            if (this.plugin.settings.activeProviderId === configProvider.id) {
              if (!updatedModels.includes(this.plugin.settings.activeModel)) {
                this.plugin.settings.activeModel = updatedModels[0] || '';
              }
            }
            await this.plugin.saveSettings();
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
            await this.plugin.saveSettings();
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
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('h3', { text: 'Skills & Marketplace' });

    // Open Skills Modal Setting
    new Setting(containerEl)
      .setName('Manage Skills & Marketplace')
      .setDesc('Install skills from GitHub, browse the marketplace, or manage local vault skills')
      .addButton((btn) =>
        btn
          .setButtonText('Open Skills Manager')
          .setCta()
          .onClick(() => {
            new SkillsModal(this.app, this.plugin).open();
          })
      );

    // Auto-scan Vault Skills
    new Setting(containerEl)
      .setName('Auto-scan Vault Folders')
      .setDesc('Scan .agents/skills/, .skills/, .claude/skills/, .gemini/skills/ in Vault for local skills')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.scanVaultSkills !== false)
          .onChange(async (val) => {
            this.plugin.settings.scanVaultSkills = val;
            await this.plugin.saveSettings();
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
            await this.plugin.saveSettings();
          })
      );
  }
}
