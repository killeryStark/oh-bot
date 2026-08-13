import { App, PluginSettingTab, Setting, SecretComponent } from 'obsidian';
import type HarnessPlugin from '../main';
import { ProviderType, SafetyMode } from '../types';

export class HarnessSettingTab extends PluginSettingTab {
  plugin: HarnessPlugin;

  constructor(app: App, plugin: HarnessPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Obsidian Agent Harness Settings' });

    // OpenRouter Key Secret
    new Setting(containerEl)
      .setName('OpenRouter Secret Name')
      .setDesc('Select or create a secret for OpenRouter API Key using Obsidian SecretStorage')
      .addComponent((el) => {
        try {
          return new SecretComponent(this.app, el)
            .setValue(this.plugin.settings.openRouterSecretName)
            .onChange(async (value) => {
              this.plugin.settings.openRouterSecretName = value;
              await this.plugin.saveSettings();
            });
        } catch (e) {
          // Fallback text input if SecretComponent is unavailable
          const textInput = el.createEl('input', { type: 'password', value: this.plugin.settings.openRouterSecretName });
          textInput.addEventListener('change', async (ev) => {
            this.plugin.settings.openRouterSecretName = (ev.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
          });
          return el as any;
        }
      });

    // OpenAI Key Secret
    new Setting(containerEl)
      .setName('OpenAI Secret Name')
      .setDesc('Select or create a secret for OpenAI API Key')
      .addComponent((el) => {
        try {
          return new SecretComponent(this.app, el)
            .setValue(this.plugin.settings.openAiSecretName)
            .onChange(async (value) => {
              this.plugin.settings.openAiSecretName = value;
              await this.plugin.saveSettings();
            });
        } catch (e) {
          const textInput = el.createEl('input', { type: 'password', value: this.plugin.settings.openAiSecretName });
          textInput.addEventListener('change', async (ev) => {
            this.plugin.settings.openAiSecretName = (ev.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
          });
          return el as any;
        }
      });

    // Anthropic Key Secret
    new Setting(containerEl)
      .setName('Anthropic Secret Name')
      .setDesc('Select or create a secret for Anthropic API Key')
      .addComponent((el) => {
        try {
          return new SecretComponent(this.app, el)
            .setValue(this.plugin.settings.anthropicSecretName)
            .onChange(async (value) => {
              this.plugin.settings.anthropicSecretName = value;
              await this.plugin.saveSettings();
            });
        } catch (e) {
          const textInput = el.createEl('input', { type: 'password', value: this.plugin.settings.anthropicSecretName });
          textInput.addEventListener('change', async (ev) => {
            this.plugin.settings.anthropicSecretName = (ev.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
          });
          return el as any;
        }
      });

    // Default Provider
    new Setting(containerEl)
      .setName('Default Provider')
      .setDesc('Select default LLM Provider')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('openrouter', 'OpenRouter')
          .addOption('openai', 'OpenAI')
          .addOption('anthropic', 'Anthropic')
          .addOption('ollama', 'Ollama / Custom OpenAI-Compatible')
          .setValue(this.plugin.settings.defaultProvider)
          .onChange(async (value) => {
            this.plugin.settings.defaultProvider = value as ProviderType;
            await this.plugin.saveSettings();
          })
      );

    // Default Model
    new Setting(containerEl)
      .setName('Default Model ID')
      .setDesc('Model identifier (e.g. anthropic/claude-3.7-sonnet, gpt-4o, llama3)')
      .addText((text) =>
        text
          .setPlaceholder('anthropic/claude-3.7-sonnet')
          .setValue(this.plugin.settings.defaultModel)
          .onChange(async (value) => {
            this.plugin.settings.defaultModel = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // Custom Base URL
    new Setting(containerEl)
      .setName('Custom Base URL (Ollama / Local Server)')
      .setDesc('Endpoint URL for Ollama or OpenAI-compatible custom servers')
      .addText((text) =>
        text
          .setPlaceholder('http://localhost:11434/v1')
          .setValue(this.plugin.settings.customBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.customBaseUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

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

    // Max Steps Limit
    new Setting(containerEl)
      .setName('Max Agent Iterations')
      .setDesc('Maximum tool-execution steps per turn (1 to 25)')
      .addSlider((slider) =>
        slider
          .setLimits(1, 25, 1)
          .setValue(this.plugin.settings.maxAgentSteps)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxAgentSteps = value;
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
