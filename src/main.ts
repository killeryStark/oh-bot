import { Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, HarnessSettings } from './types';
import { HarnessSettingTab } from './ui/settings-tab';
import { HarnessChatView, HARNESS_VIEW_TYPE } from './ui/chat-view';
import { SkillManager } from './skills/skill-manager';
import { SkillsModal } from './ui/skills-modal';
import { McpManager } from './mcp/mcp-manager';
import { McpModal } from './ui/mcp-modal';
import { ToolRegistry } from './tools/registry';
import { AgentManager } from './engine/agent-manager';

export default class HarnessPlugin extends Plugin {
  settings: HarnessSettings = DEFAULT_SETTINGS;
  skillManager!: SkillManager;
  mcpManager!: McpManager;
  toolRegistry!: ToolRegistry;
  agentManager!: AgentManager;

  async onload() {
    await this.loadSettings();

    // Initialize Agent Manager
    this.agentManager = new AgentManager(this.app, this.settings, async () => {
      await this.saveSettings();
    });
    await this.agentManager.init();

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

    // Initialize Tool Registry
    this.toolRegistry = new ToolRegistry(this.skillManager, this.mcpManager, this.settings, this.agentManager);
    this.toolRegistry.setAgentManager(this.agentManager);

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
    // Auto-upgrade legacy default system prompt if user hasn't customized it
    const legacyDefaultPrompt = 'You are an autonomous AI Agent inside Obsidian. You have tools to read, create, patch, search, and inspect notes in the vault. Use these tools step-by-step to fulfill the user request.';
    if (this.settings.systemPrompt === legacyDefaultPrompt) {
      this.settings.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
    }
    if (this.agentManager) {
      this.agentManager.setSettings(this.settings);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.toolRegistry) {
      this.toolRegistry.setSettings(this.settings);
    }
    if (this.agentManager) {
      this.agentManager.setSettings(this.settings);
    }
  }
}
