import { App, normalizePath } from 'obsidian';
import { AgentConfig, HarnessSettings, ToolResult, ToolSchema } from '../types';
import { AgentTool } from './base';
import { ToolRegistry } from './registry';
import { SkillManager } from '../skills/skill-manager';
import { McpManager } from '../mcp/mcp-manager';
import { AgentManager } from '../engine/agent-manager';
import { SubagentRunner } from './agents/types';

export class ScopedToolRegistry {
  public workspacePath: string;

  constructor(
    private baseRegistry: ToolRegistry,
    private agent: AgentConfig,
    private app: App
  ) {
    const raw = (this.agent.workspacePath || '').trim();
    if (!raw || raw === '.' || raw === '/') {
      this.workspacePath = '';
    } else {
      this.workspacePath = normalizePath(raw).replace(/^\/+/, '').replace(/\/+$/, '');
    }
  }

  /**
   * Checks if a given Vault path is inside the scoped workspace folder.
   * If workspacePath is empty/undefined, returns true (unrestricted vault access).
   */
  isPathWithinWorkspace(rawPath: string): boolean {
    if (!this.workspacePath) {
      return true; // unrestricted access
    }

    if (!rawPath || typeof rawPath !== 'string') {
      return false;
    }

    if (rawPath.includes('..')) {
      return false;
    }

    const normalizedPath = normalizePath(rawPath).replace(/^\/+/, '').replace(/\/+$/, '');
    if (normalizedPath.includes('..')) {
      return false;
    }

    return (
      normalizedPath === this.workspacePath ||
      normalizedPath.startsWith(this.workspacePath + '/')
    );
  }

  /**
   * Checks if a specific tool is permitted for this agent based on its configuration.
   */
  isToolAllowed(toolName: string): boolean {
    const allowed = this.agent.allowedTools;
    const isSubagent = !this.agent.isDefaultMain;

    // Subagents must not invoke subagents unless explicitly permitted in allowedTools to prevent recursion
    if (toolName === 'invoke_subagent' && isSubagent) {
      if (!allowed || !Array.isArray(allowed)) {
        return false;
      }
      return allowed.includes('invoke_subagent') || allowed.includes('subagent');
    }

    // Default or wildcard permission allows all standard tools
    if (!allowed || allowed.length === 0 || allowed.includes('*')) {
      return true;
    }

    // Exact name match
    if (allowed.includes(toolName)) {
      return true;
    }

    // Vault tools category & aliases
    const vaultTools = [
      'vault_read_file',
      'read_file',
      'vault_create_file',
      'create_file',
      'vault_patch_file',
      'patch_file',
      'vault_list_dir',
      'list_dir',
      'vault_search_notes',
      'search_notes',
    ];

    if (allowed.includes('vault')) {
      if (vaultTools.includes(toolName) || toolName.startsWith('vault_')) {
        return true;
      }
    }

    // Specific vault tool alias matching
    if (
      (toolName === 'vault_read_file' || toolName === 'read_file') &&
      (allowed.includes('read_file') || allowed.includes('vault_read_file'))
    ) {
      return true;
    }
    if (
      (toolName === 'vault_create_file' || toolName === 'create_file') &&
      (allowed.includes('create_file') || allowed.includes('vault_create_file'))
    ) {
      return true;
    }
    if (
      (toolName === 'vault_patch_file' || toolName === 'patch_file') &&
      (allowed.includes('patch_file') || allowed.includes('vault_patch_file'))
    ) {
      return true;
    }
    if (
      (toolName === 'vault_list_dir' || toolName === 'list_dir') &&
      (allowed.includes('list_dir') || allowed.includes('vault_list_dir'))
    ) {
      return true;
    }
    if (
      (toolName === 'vault_search_notes' || toolName === 'search_notes') &&
      (allowed.includes('search_notes') || allowed.includes('vault_search_notes'))
    ) {
      return true;
    }

    // Web category matching
    if (allowed.includes('web') || allowed.includes('web_search')) {
      if (toolName === 'web_search' || toolName === 'fetch_web_page') {
        return true;
      }
    }

    // PDF category matching
    if (allowed.includes('pdf') || allowed.includes('generate_pdf')) {
      if (toolName === 'generate_pdf') {
        return true;
      }
    }

    // Skills category matching
    if (allowed.includes('skills') || allowed.includes('skill')) {
      if (toolName === 'create_skill' || toolName === 'read_skill' || toolName === 'list_skills') {
        return true;
      }
    }

    // MCP tools matching
    if (allowed.includes('mcp')) {
      if (toolName.startsWith('mcp__')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns tool schemas allowed for this agent, enriched with workspace scope descriptions if sandboxed.
   */
  getSchemas(): ToolSchema[] {
    const schemas = this.baseRegistry.getSchemas();
    const filtered = schemas.filter((schema) => this.isToolAllowed(schema.name));

    if (!this.workspacePath) {
      return filtered;
    }

    return filtered.map((schema) => {
      const cloned: ToolSchema = JSON.parse(JSON.stringify(schema));
      const name = cloned.name;

      if (
        name === 'vault_read_file' ||
        name === 'read_file' ||
        name === 'vault_create_file' ||
        name === 'create_file' ||
        name === 'vault_patch_file' ||
        name === 'patch_file'
      ) {
        cloned.description = `${cloned.description} [Scoped to workspace: "${this.workspacePath}"]`;
        if (cloned.parameters?.properties?.path) {
          cloned.parameters.properties.path.description = `${cloned.parameters.properties.path.description || ''} (Must reside within workspace "${this.workspacePath}")`.trim();
        }
      } else if (name === 'vault_list_dir' || name === 'list_dir') {
        cloned.description = `${cloned.description} [Scoped to workspace: "${this.workspacePath}"]`;
        if (cloned.parameters?.properties?.path) {
          cloned.parameters.properties.path.description = `Relative path of directory within workspace "${this.workspacePath}" (defaults to workspace root if empty or ".")`;
        }
        if (cloned.parameters?.properties?.dir_path) {
          cloned.parameters.properties.dir_path.description = `Relative path of directory within workspace "${this.workspacePath}" (defaults to workspace root if empty or ".")`;
        }
      } else if (name === 'vault_search_notes' || name === 'search_notes') {
        cloned.description = `${cloned.description} [Scoped to notes within workspace: "${this.workspacePath}"]`;
      } else if (name === 'generate_pdf') {
        cloned.description = `${cloned.description} [Scoped to workspace: "${this.workspacePath}"]`;
        if (cloned.parameters?.properties?.filePath) {
          cloned.parameters.properties.filePath.description = `${cloned.parameters.properties.filePath.description || ''} (Must reside within workspace "${this.workspacePath}")`.trim();
        }
      }

      return cloned;
    });
  }

  /**
   * Returns tool instance if allowed, or undefined if filtered out.
   */
  getTool(name: string): AgentTool | undefined {
    if (!this.isToolAllowed(name)) {
      return undefined;
    }
    return this.baseRegistry.getTool(name);
  }

  /**
   * Executes a tool with sandboxing and workspace permission enforcement.
   */
  async executeTool(name: string, args: Record<string, any>, app: App): Promise<ToolResult> {
    const safeArgs = args || {};

    if (!this.isToolAllowed(name)) {
      return {
        success: false,
        output: '',
        error: `Tool "${name}" is not permitted for agent "${this.agent.name}".`,
      };
    }

    if (this.workspacePath) {
      const isFileTool =
        name === 'vault_read_file' ||
        name === 'read_file' ||
        name === 'vault_create_file' ||
        name === 'create_file' ||
        name === 'vault_patch_file' ||
        name === 'patch_file';

      if (isFileTool) {
        const targetPath = safeArgs.path;
        if (!targetPath || !this.isPathWithinWorkspace(targetPath)) {
          return {
            success: false,
            output: '',
            error: `Access denied: path "${targetPath}" is outside the assigned workspace "${this.workspacePath}".`,
          };
        }
      }

      if (name === 'generate_pdf') {
        const targetPath = safeArgs.filePath;
        if (!targetPath || typeof targetPath !== 'string') {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: "filePath" is required.',
          };
        }
        if (!this.isPathWithinWorkspace(targetPath)) {
          const candidate = `${this.workspacePath}/${targetPath.replace(/^\/+/, '')}`;
          if (this.isPathWithinWorkspace(candidate)) {
            safeArgs.filePath = candidate;
          } else {
            return {
              success: false,
              output: '',
              error: `Access denied: filePath "${targetPath}" is outside the assigned workspace "${this.workspacePath}".`,
            };
          }
        }
      }

      const isListDir = name === 'vault_list_dir' || name === 'list_dir';
      if (isListDir) {
        const rawTarget = safeArgs.dir_path !== undefined ? safeArgs.dir_path : safeArgs.path;
        if (!rawTarget || rawTarget === '.' || rawTarget === '/' || rawTarget === '') {
          safeArgs.dir_path = this.workspacePath;
          safeArgs.path = this.workspacePath;
        } else {
          if (!this.isPathWithinWorkspace(rawTarget)) {
            return {
              success: false,
              output: '',
              error: `Access denied: dir_path "${rawTarget}" is outside the assigned workspace "${this.workspacePath}".`,
            };
          }
          safeArgs.dir_path = rawTarget;
          safeArgs.path = rawTarget;
        }
      }

      const isSearchNotes = name === 'vault_search_notes' || name === 'search_notes';
      if (isSearchNotes) {
        const result = await this.baseRegistry.executeTool(name, safeArgs, app);
        if (result.success && result.output) {
          try {
            const parsed = JSON.parse(result.output);
            if (Array.isArray(parsed)) {
              const filtered = parsed.filter((item: any) => {
                if (!item) return false;
                const itemPath = item.path || (typeof item === 'string' ? item : undefined);
                return itemPath ? this.isPathWithinWorkspace(itemPath) : false;
              });
              return {
                ...result,
                output: JSON.stringify(filtered, null, 2),
              };
            }
          } catch {
            // Non-JSON output, return as is
          }
        }
        return result;
      }
    }

    return await this.baseRegistry.executeTool(name, safeArgs, app);
  }

  setSettings(settings: HarnessSettings): void {
    this.baseRegistry.setSettings(settings);
  }

  setSkillManager(skillManager: SkillManager): void {
    this.baseRegistry.setSkillManager(skillManager);
  }

  setMcpManager(mcpManager: McpManager): void {
    this.baseRegistry.setMcpManager(mcpManager);
  }

  setAgentManager(agentManager: AgentManager): void {
    this.baseRegistry.setAgentManager(agentManager);
  }

  setSubagentRunner(runner: SubagentRunner): void {
    this.baseRegistry.setSubagentRunner(runner);
  }

  getAgent(): AgentConfig {
    return this.agent;
  }

  getWorkspacePath(): string {
    return this.workspacePath;
  }

  getBaseRegistry(): ToolRegistry {
    return this.baseRegistry;
  }
}

