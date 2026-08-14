import { Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, HarnessSettings } from './types';
import { HarnessSettingTab } from './ui/settings-tab';
import { HarnessChatView, HARNESS_VIEW_TYPE } from './ui/chat-view';
import { SkillManager } from './skills/skill-manager';
import { SkillsModal } from './ui/skills-modal';
import { McpManager } from './mcp/mcp-manager';
import { McpModal } from './ui/mcp-modal';

export default class HarnessPlugin extends Plugin {
  settings: HarnessSettings = DEFAULT_SETTINGS;
  skillManager!: SkillManager;
  mcpManager!: McpManager;

  async onload() {
    await this.loadSettings();

    // Initialize Skill Manager
    this.skillManager = new SkillManager(this.app, this.settings, async () => {
      await this.saveSettings();
    });
    await this.skillManager.init();

    // Initialize MCP Manager
    this.mcpManager = new McpManager(this.app, this.settings, async () => {
      await this.saveSettings();
    });
    await this.mcpManager.init();

    // Register Obsidian deep link protocol handler for OAuth 2.1 PKCE (obsidian://oh-bot-mcp-auth)
    this.registerObsidianProtocolHandler('oh-bot-mcp-auth', async (params) => {
      await this.mcpManager.handleOAuthCallback(params);
    });

    // Register Sidebar Chat View
    this.registerView(HARNESS_VIEW_TYPE, (leaf) => new HarnessChatView(leaf, this));

    // Ribbon Icon
    this.addRibbonIcon('bot', 'Open Obsidian Harness Bot', () => {
      this.activateView();
    });

    // Command Palette Commands
    this.addCommand({
      id: 'open-obsidian-harness-bot',
      name: 'Open Obsidian Harness Bot',
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: 'open-harness-skills-modal',
      name: 'Open Skills & Marketplace (/skills)',
      callback: () => {
        new SkillsModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: 'open-harness-mcp-modal',
      name: 'Open MCP Servers & Integrations (/mcp)',
      callback: () => {
        new McpModal(this.app, this).open();
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
