import { App, TFile, normalizePath } from 'obsidian';
import { AgentConfig, DEFAULT_MAIN_SYSTEM_PROMPT, HarnessSettings } from '../types';

export class AgentManager {
  constructor(
    private app: App,
    private settings: HarnessSettings,
    private onSaveSettings: () => Promise<void>
  ) {}

  /**
   * Updates internal settings reference if changed.
   */
  setSettings(settings: HarnessSettings): void {
    this.settings = settings;
  }

  /**
   * Initializes the agents list ensuring the default 'main' agent exists
   * and an activeAgentId is set.
   */
  async init(): Promise<void> {
    if (!this.settings.agents) {
      this.settings.agents = [];
    }

    let modified = false;
    const hasMain = this.settings.agents.some((a) => a.id === 'main' || a.isDefaultMain);

    if (!hasMain) {
      const mainAgent: AgentConfig = {
        id: 'main',
        name: 'Main Agent',
        description: 'Default autonomous agent with full vault access and orchestration capabilities.',
        systemPrompt: this.settings.systemPrompt || DEFAULT_MAIN_SYSTEM_PROMPT,
        workspacePath: '',
        agentMdFile: 'AGENT.md',
        isDefaultMain: true,
        allowedTools: ['*'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.settings.agents.unshift(mainAgent);
      modified = true;
    }

    if (!this.settings.activeAgentId) {
      this.settings.activeAgentId = 'main';
      modified = true;
    }

    if (modified) {
      await this.onSaveSettings();
    }
  }

  /**
   * Looks up an agent by exact ID, case-insensitive ID, or case-insensitive name.
   */
  getAgent(idOrName: string): AgentConfig | undefined {
    if (!idOrName || !this.settings.agents) return undefined;
    const target = idOrName.trim();
    const lower = target.toLowerCase();

    // 1. Exact ID match
    let match = this.settings.agents.find((a) => a.id === target);
    if (match) return match;

    // 2. Case-insensitive ID match
    match = this.settings.agents.find((a) => a.id.toLowerCase() === lower);
    if (match) return match;

    // 3. Exact Name match
    match = this.settings.agents.find((a) => a.name === target);
    if (match) return match;

    // 4. Case-insensitive Name match
    match = this.settings.agents.find((a) => a.name.toLowerCase() === lower);
    return match;
  }

  /**
   * Returns all configured agents.
   */
  getAllAgents(): AgentConfig[] {
    return this.settings.agents || [];
  }

  /**
   * Returns the main default agent, or the first configured agent.
   */
  getDefaultAgent(): AgentConfig {
    const agents = this.getAllAgents();
    const main = agents.find((a) => a.isDefaultMain || a.id === 'main');
    if (main) return main;
    if (agents.length > 0) return agents[0];

    return {
      id: 'main',
      name: 'Main Agent',
      description: 'Default autonomous agent with full vault access and orchestration capabilities.',
      systemPrompt: DEFAULT_MAIN_SYSTEM_PROMPT,
      workspacePath: '',
      agentMdFile: 'AGENT.md',
      isDefaultMain: true,
      allowedTools: ['*'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Returns the active agent for a session or globally, falling back to default agent.
   */
  getActiveAgent(sessionAgentId?: string): AgentConfig {
    if (sessionAgentId) {
      const agent = this.getAgent(sessionAgentId);
      if (agent) return agent;
    }
    if (this.settings.activeAgentId) {
      const agent = this.getAgent(this.settings.activeAgentId);
      if (agent) return agent;
    }
    return this.getDefaultAgent();
  }

  /**
   * Upserts an agent in settings.agents, sets timestamps, and persists settings.
   */
  async createOrUpdateAgent(
    agentData: Partial<AgentConfig> & { id: string; name: string }
  ): Promise<AgentConfig> {
    if (!this.settings.agents) {
      this.settings.agents = [];
    }

    const existingIndex = this.settings.agents.findIndex((a) => a.id === agentData.id);
    const now = Date.now();
    let finalAgent: AgentConfig;

    if (existingIndex >= 0) {
      const existing = this.settings.agents[existingIndex];
      finalAgent = {
        ...existing,
        ...agentData,
        updatedAt: now,
      };
      this.settings.agents[existingIndex] = finalAgent;
    } else {
      finalAgent = {
        description: '',
        systemPrompt: '',
        workspacePath: '',
        agentMdFile: 'AGENT.md',
        allowedTools: ['*'],
        isDefaultMain: false,
        ...agentData,
        createdAt: now,
        updatedAt: now,
      };
      this.settings.agents.push(finalAgent);
    }

    await this.onSaveSettings();
    return finalAgent;
  }

  /**
   * Deletes an agent from settings. Prevents deleting default main agent.
   */
  async deleteAgent(id: string): Promise<boolean> {
    if (!this.settings.agents) return false;
    const agent = this.settings.agents.find((a) => a.id === id);
    if (!agent) return false;

    if (agent.isDefaultMain || agent.id === 'main') {
      return false;
    }

    this.settings.agents = this.settings.agents.filter((a) => a.id !== id);

    if (this.settings.activeAgentId === id) {
      this.settings.activeAgentId = 'main';
    }

    await this.onSaveSettings();
    return true;
  }

  /**
   * Resolves effective system prompt for an agent, augmenting with AGENT.md
   * instructions if workspacePath is configured and file exists in vault.
   */
  async resolveEffectiveSystemPrompt(agent: AgentConfig): Promise<string> {
    let prompt = agent.systemPrompt || '';

    if (agent.workspacePath && agent.workspacePath.trim().length > 0) {
      const ws = agent.workspacePath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      const mdFileName = (agent.agentMdFile || 'AGENT.md').trim().replace(/^\/+/, '');
      const targetPath = normalizePath(ws ? `${ws}/${mdFileName}` : mdFileName);

      const file = this.app.vault.getAbstractFileByPath(targetPath);
      if (file instanceof TFile) {
        try {
          const agentMdContent = await this.app.vault.cachedRead(file);
          if (agentMdContent && agentMdContent.trim().length > 0) {
            prompt += `\n\n# Agent Workspace Instructions (${targetPath}):\n${agentMdContent}`;
          }
        } catch (err) {
          console.warn(`Failed to read agent instructions file at ${targetPath}:`, err);
        }
      }
    }

    return prompt;
  }

  /**
   * Scaffolds the workspace directory hierarchy and initial AGENT.md instruction file if missing.
   */
  async scaffoldWorkspace(
    workspacePath: string,
    agentMdContent?: string,
    agentName?: string
  ): Promise<{ folderCreated: boolean; fileCreated: boolean; agentMdPath: string }> {
    const cleanWorkspace = workspacePath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    let folderCreated = false;

    if (cleanWorkspace.length > 0) {
      const parts = cleanWorkspace.split('/').filter(Boolean);
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const existing = this.app.vault.getAbstractFileByPath(currentPath);
        if (!existing) {
          try {
            await this.app.vault.createFolder(currentPath);
            folderCreated = true;
          } catch (err) {
            const checkAgain = this.app.vault.getAbstractFileByPath(currentPath);
            if (!checkAgain) {
              throw err;
            }
          }
        }
      }
    }

    const agentMdPath = normalizePath(cleanWorkspace ? `${cleanWorkspace}/AGENT.md` : 'AGENT.md');
    let fileCreated = false;

    const existingFile = this.app.vault.getAbstractFileByPath(agentMdPath);
    if (!existingFile) {
      const name = agentName || (cleanWorkspace ? cleanWorkspace.split('/').pop() : 'Custom Agent') || 'Agent';
      const content =
        agentMdContent ??
        `# ${name} Instructions\n\nWrite specialized instructions, objectives, constraints, and custom workflows for this agent here.`;
      await this.app.vault.create(agentMdPath, content);
      fileCreated = true;
    }

    return { folderCreated, fileCreated, agentMdPath };
  }
}
