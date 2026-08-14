import { App, Modal, Notice, setIcon, Setting } from 'obsidian';
import type HarnessPlugin from '../main';
import { MarketplaceRegistry } from '../skills/marketplace';
import { MarketplaceSkillItem, SkillMetadata } from '../skills/types';

export class SkillsModal extends Modal {
  private plugin: HarnessPlugin;
  private activeTab: 'installed' | 'marketplace' = 'installed';
  private searchQuery: string = '';
  private marketplaceCatalog: MarketplaceSkillItem[] = [];
  private isLoadingMarketplace: boolean = false;

  constructor(app: App, plugin: HarnessPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('harness-skills-modal');

    await this.render();
  }

  private async render() {
    const { contentEl } = this;
    contentEl.empty();

    // Modal Header
    const headerEl = contentEl.createEl('div', { cls: 'harness-modal-header' });
    const titleEl = headerEl.createEl('h2', { text: 'Skills & Marketplace' });
    titleEl.style.margin = '0';

    const controlsRowEl = contentEl.createEl('div', { cls: 'harness-skills-controls-row' });

    // Tabs
    const tabsContainerEl = controlsRowEl.createEl('div', { cls: 'harness-tab-group' });

    const allSkills = this.plugin.skillManager.getAllSkills();
    const installedCount = allSkills.length;

    const tabInstalledBtn = tabsContainerEl.createEl('button', {
      cls: `harness-tab-btn ${this.activeTab === 'installed' ? 'is-active' : ''}`,
      text: `Installed & Local (${installedCount})`,
    });
    tabInstalledBtn.addEventListener('click', () => {
      this.activeTab = 'installed';
      this.render();
    });

    const tabMarketplaceBtn = tabsContainerEl.createEl('button', {
      cls: `harness-tab-btn ${this.activeTab === 'marketplace' ? 'is-active' : ''}`,
      text: 'Marketplace & Import',
    });
    tabMarketplaceBtn.addEventListener('click', async () => {
      this.activeTab = 'marketplace';
      await this.loadMarketplace();
      this.render();
    });

    // Refresh Button
    const refreshBtn = controlsRowEl.createEl('button', { cls: 'clickable-icon' });
    refreshBtn.setAttribute('aria-label', 'Rescan Vault & Reload Marketplace');
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', async () => {
      new Notice('Rescanning Vault skills and reloading marketplace...');
      await this.plugin.skillManager.refreshLocalSkills();
      if (this.activeTab === 'marketplace') {
        await this.loadMarketplace(true);
      }
      await this.render();
    });

    // Search Input
    const searchContainerEl = contentEl.createEl('div', { cls: 'harness-search-wrapper' });
    const searchInput = searchContainerEl.createEl('input', {
      type: 'search',
      cls: 'harness-search-input',
      placeholder: 'Search skills by name, description, author, or tags...',
      value: this.searchQuery,
    });
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.toLowerCase().trim();
      this.renderBody(bodyContainerEl);
    });

    // Body Container
    const bodyContainerEl = contentEl.createEl('div', { cls: 'harness-skills-body' });
    this.renderBody(bodyContainerEl);
  }

  private async loadMarketplace(force: boolean = false) {
    if (this.marketplaceCatalog.length === 0 || force) {
      this.isLoadingMarketplace = true;
      try {
        this.marketplaceCatalog = await MarketplaceRegistry.fetchCatalog(
          this.plugin.settings.customMarketplaceUrl
        );
      } catch (err) {
        console.warn('Failed to load marketplace catalog:', err);
      } finally {
        this.isLoadingMarketplace = false;
      }
    }
  }

  private renderBody(container: HTMLElement) {
    container.empty();

    if (this.activeTab === 'installed') {
      this.renderInstalledList(container);
    } else {
      this.renderMarketplaceList(container);
    }
  }

  private renderInstalledList(container: HTMLElement) {
    let skills = this.plugin.skillManager.getAllSkills();

    if (this.searchQuery) {
      skills = skills.filter(
        (s) =>
          s.name.toLowerCase().includes(this.searchQuery) ||
          s.description.toLowerCase().includes(this.searchQuery) ||
          (s.author && s.author.toLowerCase().includes(this.searchQuery)) ||
          (s.tags && s.tags.some((t) => t.toLowerCase().includes(this.searchQuery)))
      );
    }

    if (skills.length === 0) {
      const emptyEl = container.createEl('div', { cls: 'harness-empty-state' });
      emptyEl.createEl('p', {
        text: this.searchQuery
          ? 'No skills matching your search query.'
          : 'No skills installed yet. Visit the Marketplace tab or place SKILL.md files into .agents/skills/ in your Vault.',
      });
      return;
    }

    const gridEl = container.createEl('div', { cls: 'harness-skills-grid' });

    for (const skill of skills) {
      const cardEl = gridEl.createEl('div', { cls: `harness-skill-card ${skill.enabled ? 'is-enabled' : 'is-disabled'}` });

      // Card Header
      const cardHeaderEl = cardEl.createEl('div', { cls: 'harness-skill-card-header' });
      const titleWrapper = cardHeaderEl.createEl('div', { cls: 'harness-skill-title-wrapper' });

      const nameEl = titleWrapper.createEl('strong', { text: skill.name, cls: 'harness-skill-title' });
      if (skill.version) {
        titleWrapper.createEl('span', { text: ` v${skill.version}`, cls: 'harness-skill-version' });
      }

      // Source Badge
      let badgeText = 'Installed';
      let badgeCls = 'mod-installed';
      if (skill.sourceType === 'local_vault') {
        badgeText = skill.localPath ? `Vault: ${skill.localPath}` : 'Vault Local';
        badgeCls = 'mod-vault';
      } else if (skill.sourceUrl?.includes('github.com')) {
        badgeText = 'GitHub';
        badgeCls = 'mod-github';
      }
      const badgeEl = titleWrapper.createEl('span', { text: badgeText, cls: `harness-source-badge ${badgeCls}` });
      if (skill.localPath) {
        badgeEl.setAttribute('title', skill.localPath);
      }

      // Enable / Disable Toggle Switch
      const toggleWrapper = cardHeaderEl.createEl('div', { cls: 'harness-switch-wrapper' });
      const toggleLabel = toggleWrapper.createEl('label', { cls: 'harness-switch' });
      toggleLabel.setAttribute('aria-label', skill.enabled ? 'Disable Skill' : 'Enable Skill');
      const toggleInput = toggleLabel.createEl('input', { type: 'checkbox' });
      toggleInput.checked = skill.enabled;
      toggleLabel.createEl('span', { cls: 'harness-slider round' });

      toggleInput.addEventListener('change', async () => {
        await this.plugin.skillManager.toggleSkill(skill.id, toggleInput.checked);
        cardEl.toggleClass('is-enabled', toggleInput.checked);
        cardEl.toggleClass('is-disabled', !toggleInput.checked);
        toggleLabel.setAttribute('aria-label', toggleInput.checked ? 'Disable Skill' : 'Enable Skill');
      });

      // Description
      if (skill.description) {
        cardEl.createEl('p', { text: skill.description, cls: 'harness-skill-desc' });
      }

      // Tags & Author row
      const metaRowEl = cardEl.createEl('div', { cls: 'harness-skill-meta-row' });
      if (skill.author) {
        const authorEl = metaRowEl.createEl('span', { cls: 'harness-skill-author' });
        authorEl.createEl('span', { text: 'By: ' });
        if (skill.homepage) {
          const authorLink = authorEl.createEl('a', { text: skill.author, href: skill.homepage });
          authorLink.setAttribute('target', '_blank');
        } else {
          authorEl.createEl('span', { text: skill.author });
        }
      }

      if (skill.tags && skill.tags.length > 0) {
        const tagsContainer = metaRowEl.createEl('div', { cls: 'harness-skill-tags' });
        for (const tag of skill.tags) {
          tagsContainer.createEl('span', { text: `#${tag}`, cls: 'harness-tag-pill' });
        }
      }

      // Card Actions Footer
      const actionsEl = cardEl.createEl('div', { cls: 'harness-skill-actions' });

      // View Content Button
      const viewBtn = actionsEl.createEl('button', { text: 'View Instructions', cls: 'harness-btn-sm' });
      viewBtn.addEventListener('click', () => {
        new SkillViewModal(this.app, skill).open();
      });

      // Update from Git Button (if sourceUrl present)
      if (skill.sourceUrl && skill.sourceType === 'installed') {
        const updateBtn = actionsEl.createEl('button', { text: 'Update', cls: 'harness-btn-sm' });
        updateBtn.addEventListener('click', async () => {
          try {
            updateBtn.disabled = true;
            updateBtn.setText('Updating...');
            await this.plugin.skillManager.updateSkillFromGit(skill.id);
            await this.render();
          } catch (err: any) {
            new Notice(`Update failed: ${err.message}`);
          } finally {
            updateBtn.disabled = false;
            updateBtn.setText('Update');
          }
        });
      }

      // Delete Button (only for installed skills, not vault local)
      if (skill.sourceType === 'installed') {
        const deleteBtn = actionsEl.createEl('button', { text: 'Delete', cls: 'harness-btn-sm mod-warning' });
        deleteBtn.addEventListener('click', async () => {
          await this.plugin.skillManager.uninstallSkill(skill.id);
          await this.render();
        });
      }
    }
  }

  private renderMarketplaceList(container: HTMLElement) {
    // 1. Custom Git / URL Import Card
    const importBoxEl = container.createEl('div', { cls: 'harness-import-box' });
    importBoxEl.createEl('h3', { text: 'Import Skill from Git Repository or URL' });
    importBoxEl.createEl('p', {
      text: 'Enter a GitHub repository URL (e.g. https://github.com/owner/repo or tree/main/skills/skill-name) or direct raw SKILL.md URL:',
      cls: 'harness-subtext',
    });

    const importRowEl = importBoxEl.createEl('div', { cls: 'harness-import-row' });
    const importInput = importRowEl.createEl('input', {
      type: 'text',
      cls: 'harness-import-input',
      placeholder: 'https://github.com/owner/repo or owner/repo',
    });
    const importBtn = importRowEl.createEl('button', { text: 'Import & Install', cls: 'mod-cta' });

    importBtn.addEventListener('click', async () => {
      const url = importInput.value.trim();
      if (!url) {
        new Notice('Please enter a Git repository or skill URL.');
        return;
      }

      try {
        importBtn.disabled = true;
        importBtn.setText('Importing...');
        await this.plugin.skillManager.installFromUrl(url);
        importInput.value = '';
        this.activeTab = 'installed';
        await this.render();
      } catch (err: any) {
        new Notice(`Import error: ${err.message}`);
      } finally {
        importBtn.disabled = false;
        importBtn.setText('Import & Install');
      }
    });

    // 2. Curated Marketplace Catalog
    container.createEl('h3', { text: 'Curated Marketplace Catalog' });

    if (this.isLoadingMarketplace) {
      container.createEl('p', { text: 'Loading marketplace catalog...' });
      return;
    }

    let items = this.marketplaceCatalog;
    if (this.searchQuery) {
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(this.searchQuery) ||
          i.description.toLowerCase().includes(this.searchQuery) ||
          i.author.toLowerCase().includes(this.searchQuery) ||
          (i.tags && i.tags.some((t) => t.toLowerCase().includes(this.searchQuery)))
      );
    }

    const gridEl = container.createEl('div', { cls: 'harness-skills-grid' });
    const installedSkills = this.plugin.skillManager.getAllSkills();

    for (const item of items) {
      const isInstalled = installedSkills.some((s) => s.id === item.id);
      const cardEl = gridEl.createEl('div', { cls: 'harness-skill-card' });

      // Card Header
      const headerRowEl = cardEl.createEl('div', { cls: 'harness-skill-card-header' });
      const titleWrapper = headerRowEl.createEl('div', { cls: 'harness-skill-title-wrapper' });
      titleWrapper.createEl('strong', { text: item.name, cls: 'harness-skill-title' });
      if (item.version) {
        titleWrapper.createEl('span', { text: ` v${item.version}`, cls: 'harness-skill-version' });
      }

      // Description
      cardEl.createEl('p', { text: item.description, cls: 'harness-skill-desc' });

      // Meta Row
      const metaRowEl = cardEl.createEl('div', { cls: 'harness-skill-meta-row' });
      const authorEl = metaRowEl.createEl('span', { cls: 'harness-skill-author' });
      authorEl.createEl('span', { text: 'By: ' });
      if (item.homepage) {
        const link = authorEl.createEl('a', { text: item.author, href: item.homepage });
        link.setAttribute('target', '_blank');
      } else {
        authorEl.createEl('span', { text: item.author });
      }

      if (item.tags && item.tags.length > 0) {
        const tagsContainer = metaRowEl.createEl('div', { cls: 'harness-skill-tags' });
        for (const tag of item.tags) {
          tagsContainer.createEl('span', { text: `#${tag}`, cls: 'harness-tag-pill' });
        }
      }

      // Actions Row
      const actionsEl = cardEl.createEl('div', { cls: 'harness-skill-actions' });
      const actionBtn = actionsEl.createEl('button', {
        text: isInstalled ? 'Installed (Uninstall)' : 'Install Skill',
        cls: `harness-btn-sm ${isInstalled ? 'mod-warning' : 'mod-cta'}`,
      });

      actionBtn.addEventListener('click', async () => {
        try {
          actionBtn.disabled = true;
          if (isInstalled) {
            await this.plugin.skillManager.uninstallSkill(item.id);
          } else {
            actionBtn.setText('Installing...');
            await this.plugin.skillManager.installFromMarketplace(item);
          }
          await this.render();
        } catch (err: any) {
          new Notice(`Failed: ${err.message}`);
        } finally {
          actionBtn.disabled = false;
        }
      });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Modal to view complete markdown instructions of a skill.
 */
export class SkillViewModal extends Modal {
  private skill: SkillMetadata;

  constructor(app: App, skill: SkillMetadata) {
    super(app);
    this.skill = skill;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('harness-skill-view-modal');

    contentEl.createEl('h2', { text: `Skill: ${this.skill.name}` });

    if (this.skill.description) {
      contentEl.createEl('p', { text: this.skill.description, cls: 'harness-subtext' });
    }

    const preEl = contentEl.createEl('pre', { cls: 'harness-skill-content-preview' });
    preEl.createEl('code', { text: this.skill.content });

    const closeBtn = contentEl.createEl('button', { text: 'Close', cls: 'mod-cta' });
    closeBtn.style.marginTop = '16px';
    closeBtn.addEventListener('click', () => {
      this.close();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
