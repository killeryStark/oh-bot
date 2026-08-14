import { Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, HarnessSettings } from './types';
import { HarnessSettingTab } from './ui/settings-tab';
import { HarnessChatView, HARNESS_VIEW_TYPE } from './ui/chat-view';

export default class HarnessPlugin extends Plugin {
  settings: HarnessSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    // Register Sidebar Chat View
    this.registerView(HARNESS_VIEW_TYPE, (leaf) => new HarnessChatView(leaf, this));

    // Ribbon Icon
    this.addRibbonIcon('bot', 'Open Obsidian Harness Bot', () => {
      this.activateView();
    });

    // Command Palette Command
    this.addCommand({
      id: 'open-obsidian-harness-bot',
      name: 'Open Obsidian Harness Bot',
      callback: () => {
        this.activateView();
      },
    });

    // Settings Tab
    this.addSettingTab(new HarnessSettingTab(this.app, this));
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;

    const leaves = workspace.getLeavesOfType(HARNESS_VIEW_TYPE);
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: HARNESS_VIEW_TYPE,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  onunload() {
    // Cleanup views
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.providers || this.settings.providers.length === 0) {
      this.settings.providers = DEFAULT_SETTINGS.providers;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
