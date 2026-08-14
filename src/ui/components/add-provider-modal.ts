import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import { ProviderConfig } from '../../types';
import { fetchAvailableModels } from '../../utils/model-fetcher';
import { SecretManager } from '../../utils/secrets';

export class AddProviderModal extends Modal {
  private onAdd: (provider: ProviderConfig) => Promise<void>;
  private secretManager: SecretManager;

  private providerName = '';
  private baseUrl = 'https://api.openai.com/v1';
  private apiKey = '';
  private models: string[] = [];

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
      .setName('API Key')
      .setDesc('API Key will be automatically stored in Obsidian SecretStorage')
      .addText((text) => {
        text.inputEl.type = 'password';
        text.setPlaceholder('Enter API Key').onChange((val) => {
          this.apiKey = val.trim();
        });
      });

    const modelsSetting = new Setting(contentEl)
      .setName('Available Models')
      .setDesc('List of models available on this provider')
      .addTextArea((text) => {
        text
          .setPlaceholder('model-name-1, model-name-2')
          .setValue(this.models.join(', '))
          .onChange((val) => {
            this.models = val
              .split(',')
              .map((m) => m.trim())
              .filter((m) => m.length > 0);
          });
      });

    modelsSetting.addButton((btn) => {
      btn.setTooltip('Fetch Models from Endpoint');
      setIcon(btn.buttonEl, 'refresh-cw');
      btn.onClick(async () => {
        new Notice('Fetching models from endpoint...');
        const fetched = await fetchAvailableModels(this.baseUrl, this.apiKey);
        if (fetched.length > 0) {
          this.models = fetched;
          new Notice(`Found ${fetched.length} models!`);
          this.onOpen();
        } else {
          new Notice('Could not fetch models automatically. Please specify model names manually.');
        }
      });
    });

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

            const uniqueId = `custom_${Date.now()}`;
            const secretId = `oh_bot_secret_${uniqueId}`;

            if (this.apiKey) {
              this.secretManager.setSecret(secretId, this.apiKey);
            }

            const newProvider: ProviderConfig = {
              id: uniqueId,
              name: this.providerName,
              type: 'custom-openai',
              baseUrl: this.baseUrl,
              apiKeySecretName: secretId,
              models: this.models.length > 0 ? this.models : ['default-model'],
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
