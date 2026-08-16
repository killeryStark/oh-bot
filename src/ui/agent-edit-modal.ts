import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import type HarnessPlugin from '../main';
import { AgentConfig, DEFAULT_MAIN_SYSTEM_PROMPT } from '../types';

export class AgentEditModal extends Modal {
  private id: string;
  private name: string;
  private description: string;
  private systemPrompt: string;
  private workspacePath: string;
  private providerId: string;
  private model: string;
  private allowedTools: string[];
  private autoSlugId: boolean;

  constructor(
    app: App,
    private plugin: HarnessPlugin,
    private agent?: AgentConfig,
    private onSaved?: (agent: AgentConfig) => void
  ) {
    super(app);
    this.id = agent?.id || '';
    this.name = agent?.name || '';
    this.description = agent?.description || '';
    this.systemPrompt =
      agent?.systemPrompt ??
      (agent
        ? ''
        : `You are a specialized subagent focused on specific tasks in this workspace.\nAnalyze objectives carefully, use available tools, and produce clear, concise outputs.`);
    this.workspacePath = agent?.workspacePath || '';
    this.providerId = agent?.providerId || '';
    this.model = agent?.model || '';
    this.allowedTools = agent?.allowedTools ? [...agent.allowedTools] : ['*'];
    this.autoSlugId = !agent;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[\s\W-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('harness-modal-content');
    contentEl.addClass('harness-agent-edit-modal');

    // Title
    const titleText = this.agent ? `Edit Agent: ${this.agent.name}` : 'Create New Agent';
    contentEl.createEl('h2', { text: titleText });

    // Agent Name
    let idInputTextComponent: any = null;

    new Setting(contentEl)
      .setName('Agent Name')
      .setDesc('Display name for this agent (e.g. Research Analyst, Code Reviewer)')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Research Analyst')
          .setValue(this.name)
          .onChange((val) => {
            this.name = val;
            if (this.autoSlugId && !this.agent?.isDefaultMain && idInputTextComponent) {
              this.id = this.slugify(val);
              idInputTextComponent.setValue(this.id);
            }
          });
      });

    // Agent ID
    const idSetting = new Setting(contentEl)
      .setName('Agent ID')
      .setDesc(
        this.agent?.isDefaultMain
          ? 'Default main agent ID cannot be changed'
          : 'Unique slug identifier used in tool calls and subagent delegation'
      );

    idSetting.addText((text) => {
      idInputTextComponent = text;
      text.setPlaceholder('e.g. research-analyst').setValue(this.id);
      if (this.agent?.isDefaultMain) {
        text.setDisabled(true);
        text.inputEl.setAttribute('readonly', 'true');
      } else {
        text.onChange((val) => {
          this.id = val.trim();
          this.autoSlugId = false;
        });
      }
    });

    // Description
    new Setting(contentEl)
      .setName('Description')
      .setDesc("Role, specialty, and purpose of this agent")
      .addTextArea((text) => {
        text
          .setPlaceholder('e.g. Gathers notes, synthesizes insights, and produces analytical research summaries')
          .setValue(this.description)
          .onChange((val) => {
            this.description = val;
          });
        text.inputEl.rows = 2;
        text.inputEl.style.width = '100%';
      });

    // System Prompt
    const promptSetting = new Setting(contentEl)
      .setName('System Prompt')
      .setDesc('Base instructions, behaviors, constraints, and workflow directives');

    promptSetting.addTextArea((text) => {
      text
        .setPlaceholder('Enter system instructions...')
        .setValue(this.systemPrompt)
        .onChange((val) => {
          this.systemPrompt = val;
        });
      text.inputEl.style.fontFamily = 'var(--font-monospace)';
      text.inputEl.style.minHeight = '120px';
      text.inputEl.style.width = '100%';
    });

    // Workspace Path + Scaffold button
    const wsSetting = new Setting(contentEl)
      .setName('Workspace Path')
      .setDesc('Folder in vault where this agent operates (e.g. Projects/Research). Leave empty for full vault access.');

    wsSetting.addText((text) => {
      text
        .setPlaceholder('Projects/Research')
        .setValue(this.workspacePath)
        .onChange((val) => {
          this.workspacePath = val.trim();
        });
    });

    wsSetting.addButton((btn) => {
      btn.setButtonText('Scaffold Folder & AGENT.md');
      btn.setTooltip('Create workspace folder and AGENT.md instructions file in vault');
      setIcon(btn.buttonEl, 'folder-plus');
      btn.onClick(async () => {
        if (!this.workspacePath.trim()) {
          new Notice('Please enter a workspace path first.');
          return;
        }
        try {
          const res = await this.plugin.agentManager.scaffoldWorkspace(
            this.workspacePath,
            undefined,
            this.name || undefined
          );
          new Notice(`Workspace and AGENT.md created! (${res.agentMdPath})`);
        } catch (err: any) {
          new Notice(`Failed to scaffold workspace: ${err?.message || err}`);
        }
      });
    });

    // LLM Provider & Model Overrides
    contentEl.createEl('h3', { text: 'LLM Overrides (Optional)' });

    let modelSelectEl: HTMLSelectElement | null = null;

    const providerSetting = new Setting(contentEl)
      .setName('LLM Provider Override')
      .setDesc('Select dedicated provider or inherit from chat session');

    providerSetting.addDropdown((dropdown) => {
      dropdown.addOption('', 'Inherit from Chat/Session (Default)');
      for (const prov of this.plugin.settings.providers) {
        dropdown.addOption(prov.id, prov.name);
      }
      dropdown.setValue(this.providerId);
      dropdown.onChange((val) => {
        this.providerId = val;
        this.updateModelDropdown(modelSelectEl);
      });
    });

    const modelSetting = new Setting(contentEl)
      .setName('LLM Model Override')
      .setDesc('Select model for chosen provider or inherit default');

    modelSetting.addDropdown((dropdown) => {
      modelSelectEl = dropdown.selectEl;
      this.populateModelOptions(dropdown.selectEl);
      dropdown.setValue(this.model);
      dropdown.onChange((val) => {
        this.model = val;
      });
    });

    // Allowed Tools
    contentEl.createEl('h3', { text: 'Tool Permissions' });

    const toolsContainer = contentEl.createEl('div', { cls: 'harness-tools-permission-section' });
    toolsContainer.style.marginBottom = '16px';

    this.renderToolPermissions(toolsContainer);

    // Action Buttons
    const buttonsSetting = new Setting(contentEl);

    // Delete Button (if not default main)
    if (!this.agent?.isDefaultMain && this.agent?.id) {
      buttonsSetting.addButton((btn) => {
        btn.setButtonText('Delete Agent');
        btn.setWarning();
        setIcon(btn.buttonEl, 'trash');
        btn.onClick(async () => {
          if (confirm(`Are you sure you want to delete agent "${this.name || this.id}"?`)) {
            const deleted = await this.plugin.agentManager.deleteAgent(this.id);
            if (deleted) {
              new Notice(`Deleted agent "${this.name || this.id}".`);
              if (this.agent && this.onSaved) {
                this.onSaved(this.agent);
              }
              this.close();
            } else {
              new Notice('Could not delete agent.');
            }
          }
        });
      });
    }

    // Cancel Button
    buttonsSetting.addButton((btn) => {
      btn.setButtonText('Cancel');
      btn.onClick(() => {
        this.close();
      });
    });

    // Save Button
    buttonsSetting.addButton((btn) => {
      btn.setButtonText('Save Agent');
      btn.setCta();
      setIcon(btn.buttonEl, 'check');
      btn.onClick(async () => {
        await this.handleSave();
      });
    });
  }

  private populateModelOptions(selectEl: HTMLSelectElement): void {
    selectEl.empty();
    const defaultOpt = selectEl.createEl('option', {
      value: '',
      text: 'Inherit from Chat/Session (Default)',
    });
    defaultOpt.selected = this.model === '';

    let models: string[] = [];
    if (this.providerId) {
      const prov = this.plugin.settings.providers.find((p) => p.id === this.providerId);
      if (prov) {
        models = prov.models;
      }
    } else {
      // Gather models from active provider or all providers
      const activeProv = this.plugin.settings.providers.find(
        (p) => p.id === this.plugin.settings.activeProviderId
      );
      if (activeProv) {
        models = activeProv.models;
      } else {
        models = Array.from(new Set(this.plugin.settings.providers.flatMap((p) => p.models)));
      }
    }

    for (const m of models) {
      const opt = selectEl.createEl('option', { value: m, text: m });
      if (m === this.model) {
        opt.selected = true;
      }
    }

    if (this.model && !models.includes(this.model)) {
      const opt = selectEl.createEl('option', { value: this.model, text: `${this.model} (Custom)` });
      opt.selected = true;
    }
  }

  private updateModelDropdown(selectEl: HTMLSelectElement | null): void {
    if (!selectEl) return;
    this.populateModelOptions(selectEl);
    this.model = selectEl.value;
  }

  private renderToolPermissions(container: HTMLElement): void {
    container.empty();

    const isWildcard = this.allowedTools.includes('*');

    // Wildcard Setting Toggle
    new Setting(container)
      .setName('All Tools (*)')
      .setDesc('Grant full unrestricted access to all standard and custom tools')
      .addToggle((toggle) => {
        toggle.setValue(isWildcard).onChange((checked) => {
          if (checked) {
            this.allowedTools = ['*'];
          } else {
            this.allowedTools = ['vault', 'web', 'pdf', 'skills', 'mcp'];
          }
          this.renderToolPermissions(container);
        });
      });

    if (!isWildcard) {
      const categories = [
        {
          id: 'vault',
          name: 'Vault Operations',
          desc: 'Read, create, modify, patch, list, and search files inside the vault',
        },
        {
          id: 'web',
          name: 'Web Search & Research',
          desc: 'Search the web (web_search) and fetch markdown web pages (fetch_web_page)',
        },
        {
          id: 'pdf',
          name: 'PDF Document Generation',
          desc: 'Generate styled PDF reports and documents (generate_pdf)',
        },
        {
          id: 'skills',
          name: 'Skills & Workflows',
          desc: 'Create, inspect, and run specialized workflow skills (create_skill, read_skill, list_skills)',
        },
        {
          id: 'mcp',
          name: 'MCP External Tools',
          desc: 'Access connected Model Context Protocol server tools (mcp__*)',
        },
        {
          id: 'invoke_subagent',
          name: 'Subagent Delegation',
          desc: 'Allow this agent to invoke and orchestrate child subagents (invoke_subagent)',
        },
      ];

      const categoryGrid = container.createEl('div', { cls: 'harness-tool-categories-grid' });
      categoryGrid.style.display = 'grid';
      categoryGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(240px, 1fr))';
      categoryGrid.style.gap = '8px';
      categoryGrid.style.marginTop = '8px';

      for (const cat of categories) {
        const itemEl = categoryGrid.createEl('label', { cls: 'harness-tool-category-item' });
        itemEl.style.display = 'flex';
        itemEl.style.alignItems = 'flex-start';
        itemEl.style.gap = '8px';
        itemEl.style.padding = '8px 10px';
        itemEl.style.borderRadius = '6px';
        itemEl.style.border = '1px solid var(--background-modifier-border)';
        itemEl.style.backgroundColor = 'var(--background-secondary)';
        itemEl.style.cursor = 'pointer';

        const checkbox = itemEl.createEl('input', { type: 'checkbox' });
        checkbox.checked = this.allowedTools.includes(cat.id);
        checkbox.style.marginTop = '3px';

        const textWrapper = itemEl.createEl('div');
        const labelTitle = textWrapper.createEl('div', { text: cat.name });
        labelTitle.style.fontWeight = '500';
        labelTitle.style.fontSize = '0.9em';

        const labelDesc = textWrapper.createEl('div', { text: cat.desc });
        labelDesc.style.fontSize = '0.78em';
        labelDesc.style.color = 'var(--text-muted)';
        labelDesc.style.lineHeight = '1.3';

        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            if (!this.allowedTools.includes(cat.id)) {
              this.allowedTools.push(cat.id);
            }
          } else {
            this.allowedTools = this.allowedTools.filter((t) => t !== cat.id);
          }
        });
      }
    }
  }

  private async handleSave(): Promise<void> {
    const name = this.name.trim();
    if (!name) {
      new Notice('Agent Name cannot be empty.');
      return;
    }

    let id = this.id.trim();
    if (!id) {
      id = this.slugify(name);
    }

    if (!id) {
      new Notice('Agent ID cannot be empty.');
      return;
    }

    try {
      const toolsToSave =
        this.allowedTools.length === 0 ? ['*'] : this.allowedTools;

      const savedAgent = await this.plugin.agentManager.createOrUpdateAgent({
        id,
        name,
        description: this.description.trim(),
        systemPrompt: this.systemPrompt.trim(),
        workspacePath: this.workspacePath.trim(),
        providerId: this.providerId || undefined,
        model: this.model || undefined,
        allowedTools: toolsToSave,
        isDefaultMain: this.agent?.isDefaultMain,
      });

      new Notice(`Agent "${savedAgent.name}" saved!`);
      if (this.onSaved) {
        this.onSaved(savedAgent);
      }
      this.close();
    } catch (err: any) {
      new Notice(`Failed to save agent: ${err?.message || err}`);
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
