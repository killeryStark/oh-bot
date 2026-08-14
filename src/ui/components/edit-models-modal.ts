import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import { ProviderConfig } from '../../types';

export class EditModelsModal extends Modal {
  private provider: ProviderConfig;
  private onSave: (updatedModels: string[]) => Promise<void>;
  private models: string[];

  constructor(app: App, provider: ProviderConfig, onSave: (updatedModels: string[]) => Promise<void>) {
    super(app);
    this.provider = provider;
    this.models = [...provider.models];
    this.onSave = onSave;
  }

  onOpen() {
    this.render();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('harness-modal-content');

    contentEl.createEl('h2', { text: `Edit Models: ${this.provider.name}` });
    contentEl.createEl('p', {
      text: 'Manage, edit, or remove individual models for this provider.',
      cls: 'setting-item-description',
    });

    const listContainerEl = contentEl.createEl('div', { cls: 'harness-models-edit-list' });
    listContainerEl.style.display = 'flex';
    listContainerEl.style.flexDirection = 'column';
    listContainerEl.style.gap = '8px';
    listContainerEl.style.maxHeight = '280px';
    listContainerEl.style.overflowY = 'auto';
    listContainerEl.style.padding = '4px';
    listContainerEl.style.marginBottom = '12px';

    if (this.models.length === 0) {
      listContainerEl.createEl('div', { text: 'No models configured yet.', cls: 'setting-item-description' });
    }

    this.models.forEach((modelName, index) => {
      const rowEl = listContainerEl.createEl('div', { cls: 'harness-model-row' });
      rowEl.style.display = 'flex';
      rowEl.style.alignItems = 'center';
      rowEl.style.gap = '8px';

      const input = rowEl.createEl('input', { type: 'text', value: modelName });
      input.style.flex = '1';
      input.addEventListener('change', (e) => {
        const val = (e.target as HTMLInputElement).value.trim();
        if (val) {
          this.models[index] = val;
        }
      });

      const delBtn = rowEl.createEl('button', { cls: 'harness-btn-icon-round' });
      setIcon(delBtn, 'trash');
      delBtn.setAttribute('aria-label', 'Delete model');
      delBtn.addEventListener('click', () => {
        this.models.splice(index, 1);
        this.render();
      });
    });

    // Add New Model Row
    const addRowEl = contentEl.createEl('div');
    addRowEl.style.display = 'flex';
    addRowEl.style.gap = '8px';
    addRowEl.style.marginBottom = '16px';

    const addInput = addRowEl.createEl('input', {
      type: 'text',
      placeholder: 'Enter new model identifier (e.g. gpt-4o, claude-3-5-haiku)',
    });
    addInput.style.flex = '1';

    const addBtn = addRowEl.createEl('button', { text: ' Add Model' });
    setIcon(addBtn, 'plus');
    const handleAdd = () => {
      const val = addInput.value.trim();
      if (!val) {
        new Notice('Please enter a model identifier.');
        return;
      }
      if (!this.models.includes(val)) {
        this.models.push(val);
        this.render();
      } else {
        new Notice('This model already exists in the list.');
      }
    };

    addBtn.addEventListener('click', handleAdd);
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });

    // Footer actions
    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText('Save Changes')
          .setCta()
          .onClick(async () => {
            const cleanModels = this.models
              .map((m) => m.trim())
              .filter((m) => m.length > 0);
            await this.onSave(cleanModels);
            new Notice(`Models updated for ${this.provider.name}`);
            this.close();
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}
