import { App, PluginSettingTab, Setting, SecretComponent, Notice } from 'obsidian';
import type HarnessPlugin from '../main';
import { SafetyMode, ProviderConfig } from '../types';
import { AddProviderModal } from './components/add-provider-modal';
import { fetchAvailableModels } from '../utils/model-fetcher';
import { SecretManager } from '../utils/secrets';

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

    containerEl.createEl('h2', { text: 'Obsidian Harness Bot Settings' });

    // Active Default Provider
    new Setting(containerEl)
      .setName('Default Active Provider')
      .setDesc('Select the default AI provider for agent operations')
      .addDropdown((dropdown) => {
        for (const prov of this.plugin.settings.providers) {
          dropdown.addOption(prov.id, prov.name);
        }
        dropdown.setValue(this.plugin.settings.activeProviderId);
        dropdown.onChange(async (val) => {
          this.plugin.settings.activeProviderId = val;
          const activeProv = this.plugin.settings.providers.find((p) => p.id === val);
          if (activeProv && activeProv.models.length > 0) {
            this.plugin.settings.activeModel = activeProv.models[0];
          }
          await this.plugin.saveSettings();
          this.display(); // Refresh model dropdown
        });
      });

    // Active Default Model
    const currentActiveProvider = this.plugin.settings.providers.find(
      (p) => p.id === this.plugin.settings.activeProviderId
    ) || this.plugin.settings.providers[0];

    new Setting(containerEl)
      .setName('Default Active Model')
      .setDesc(`Select model for ${currentActiveProvider?.name || 'current provider'}`)
      .addDropdown((dropdown) => {
        const models = currentActiveProvider?.models || [];
        for (const m of models) {
          dropdown.addOption(m, m);
        }
        if (models.includes(this.plugin.settings.activeModel)) {
          dropdown.setValue(this.plugin.settings.activeModel);
        } else if (models.length > 0) {
          dropdown.setValue(models[0]);
        }
        dropdown.onChange(async (val) => {
          this.plugin.settings.activeModel = val;
          await this.plugin.saveSettings();
        });
      });

    containerEl.createEl('h3', { text: 'Provider Configuration' });

    // Provider Config Selector
    new Setting(containerEl)
      .setName('Select Provider to Configure')
      .setDesc('Choose a provider from the list to update its API key, base URL, or model list')
      .addDropdown((dropdown) => {
        for (const prov of this.plugin.settings.providers) {
          dropdown.addOption(prov.id, prov.name);
        }
        dropdown.setValue(this.selectedConfigProviderId);
        dropdown.onChange((val) => {
          this.selectedConfigProviderId = val;
          this.display();
        });
      })
      .addButton((btn) =>
        btn
          .setButtonText('+ Add Custom Provider')
          .setCta()
          .onClick(() => {
            new AddProviderModal(this.app, async (newProvider) => {
              this.plugin.settings.providers.push(newProvider);
              this.selectedConfigProviderId = newProvider.id;
              await this.plugin.saveSettings();
              this.display();
            }).open();
          })
      );

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

      providerCardEl.createEl('h4', { text: `⚙️ Settings for: ${configProvider.name}` });

      // Base URL Setting
      new Setting(providerCardEl)
        .setName('Base URL')
        .setDesc('Endpoint URL for this provider')
        .addText((text) =>
          text.setValue(configProvider.baseUrl).onChange(async (val) => {
            configProvider.baseUrl = val.trim();
            await this.plugin.saveSettings();
          })
        );

      // Secret Storage API Key Component
      new Setting(providerCardEl)
        .setName('API Key Secret')
        .setDesc(`Stored in Obsidian SecretStorage under ID: "${configProvider.apiKeySecretName}"`)
        .addComponent((el) => {
          try {
            return new SecretComponent(this.app, el)
              .setValue(configProvider.apiKeySecretName)
              .onChange(async (val) => {
                configProvider.apiKeySecretName = val;
                await this.plugin.saveSettings();
              });
          } catch {
            const input = el.createEl('input', { type: 'password', value: configProvider.apiKeySecretName });
            input.addEventListener('change', async (ev) => {
              configProvider.apiKeySecretName = (ev.target as HTMLInputElement).value;
              await this.plugin.saveSettings();
            });
            return el as any;
          }
        });

      // Models list management
      new Setting(providerCardEl)
        .setName('Available Models')
        .setDesc('Comma-separated list of model identifiers')
        .addTextArea((text) =>
          text.setValue(configProvider.models.join(', ')).onChange(async (val) => {
            configProvider.models = val
              .split(',')
              .map((m) => m.trim())
              .filter((m) => m.length > 0);
            await this.plugin.saveSettings();
          })
        )
        .addButton((btn) =>
          btn.setButtonText('🔄 Fetch Models from Endpoint').onClick(async () => {
            const apiKey = this.secretManager.getSecret(configProvider.apiKeySecretName) || '';
            new Notice(`Fetching models for ${configProvider.name}...`);
            const fetched = await fetchAvailableModels(configProvider.baseUrl, apiKey);
            if (fetched.length > 0) {
              configProvider.models = fetched;
              await this.plugin.saveSettings();
              new Notice(`Updated ${configProvider.name} with ${fetched.length} models!`);
              this.display();
            } else {
              new Notice('Could not fetch models automatically from endpoint.');
            }
          })
        );

      // Delete custom provider button
      if (configProvider.isCustom) {
        new Setting(providerCardEl)
          .setName('Delete Provider')
          .setDesc('Remove this custom provider from your settings')
          .addButton((btn) =>
            btn
              .setButtonText('🗑️ Delete Provider')
              .setWarning()
              .onClick(async () => {
                this.plugin.settings.providers = this.plugin.settings.providers.filter(
                  (p) => p.id !== configProvider.id
                );
                this.selectedConfigProviderId = this.plugin.settings.providers[0]?.id || 'openrouter';
                if (this.plugin.settings.activeProviderId === configProvider.id) {
                  this.plugin.settings.activeProviderId = this.selectedConfigProviderId;
                }
                await this.plugin.saveSettings();
                new Notice(`Deleted provider "${configProvider.name}".`);
                this.display();
              })
          );
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

    // System Prompt
    new Setting(containerEl)
      .setName('System Prompt')
      .setDesc('Base instructions for the Agent Harness')
      .addTextArea((text) =>
        text
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
