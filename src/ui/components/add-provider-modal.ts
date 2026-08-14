import { App, Modal, Setting, SecretComponent, Notice } from 'obsidian';
import { ProviderConfig } from '../../types';
import { fetchAvailableModels } from '../../utils/model-fetcher';
import { SecretManager } from '../../utils/secrets';

export class AddProviderModal extends Modal {
  private onAdd: (provider: ProviderConfig) => Promise<void>;
  private secretManager: SecretManager;

  private providerName = '';
  private baseUrl = 'https://api.openai.com/v1';
  private secretName = `oh_bot_secret_custom_${Date.now()}`;
  private modelsStr = '';

  constructor(app: App, onAdd: (provider: ProviderConfig) => Promise<void>) {
    super(app);
    this.onAdd = onAdd;
    this.secretManager = new SecretManager(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('harness-modal-content');

    contentEl.createEl('h2', { text: 'Add Custom OpenAI-Compatible Provider' });

    new Setting(contentEl)
      .setName('Provider Name')
      .setDesc('e.g. DeepSeek, Groq, Together AI, LM Studio')
      .addText((text) =>
        text
          .setPlaceholder('My Custom Provider')
          .onChange((val) => {
            this.providerName = val.trim();
          })
      );

    new Setting(contentEl)
      .setName('Base URL')
      .setDesc('API Base URL (e.g. https://api.deepseek.com/v1 or http://localhost:1234/v1)')
      .addText((text) =>
        text
          .setValue(this.baseUrl)
          .onChange((val) => {
            this.baseUrl = val.trim();
          })
      );

    new Setting(contentEl)
      .setName('API Key Secret')
      .setDesc('Select or store secret in Obsidian SecretStorage')
      .addComponent((el) => {
        try {
          return new SecretComponent(this.app, el)
            .setValue(this.secretName)
            .onChange((val) => {
              this.secretName = val;
            });
        } catch {
          const input = el.createEl('input', { type: 'password', value: this.secretName });
          input.addEventListener('change', (e) => {
            this.secretName = (e.target as HTMLInputElement).value;
          });
          return el as any;
        }
      });

    new Setting(contentEl)
      .setName('Models (comma separated)')
      .setDesc('e.g. deepseek-chat, deepseek-reasoner')
      .addTextArea((text) => {
        text.setPlaceholder('model-1, model-2').onChange((val) => {
          this.modelsStr = val;
        });
      })
      .addButton((btn) =>
        btn.setButtonText('🔄 Auto-Fetch Models').onClick(async () => {
          const apiKey = this.secretManager.getSecret(this.secretName) || '';
          new Notice('Fetching models from endpoint...');
          const fetched = await fetchAvailableModels(this.baseUrl, apiKey);
          if (fetched.length > 0) {
            this.modelsStr = fetched.join(', ');
            new Notice(`Found ${fetched.length} models!`);
            this.onOpen(); // Re-render with new text
          } else {
            new Notice('Could not fetch models automatically. Please enter model names manually.');
          }
        })
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText('Save Provider')
          .setCta()
          .onClick(async () => {
            if (!this.providerName) {
              new Notice('Please enter a provider name.');
              return;
            }

            const modelList = this.modelsStr
              .split(',')
              .map((m) => m.trim())
              .filter((m) => m.length > 0);

            const newProvider: ProviderConfig = {
              id: `custom_${Date.now()}`,
              name: this.providerName,
              type: 'custom-openai',
              baseUrl: this.baseUrl,
              apiKeySecretName: this.secretName,
              models: modelList.length > 0 ? modelList : ['default-model'],
              enabled: true,
              isCustom: true,
            };

            await this.onAdd(newProvider);
            new Notice(`Provider "${this.providerName}" added!`);
            this.close();
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}
