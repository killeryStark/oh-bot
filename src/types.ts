export type ProviderType = 'openrouter' | 'anthropic' | 'gemini' | 'openai' | 'ollama' | 'custom-openai';

export type SafetyMode = 'strict' | 'auto';

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKeySecretName: string;
  models: string[];
  enabled: boolean;
  isCustom?: boolean;
}

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeySecretName: 'oh_bot_secret_openrouter',
    models: [
      'anthropic/claude-3.7-sonnet',
      'anthropic/claude-3.5-haiku',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'deepseek/deepseek-r1',
      'google/gemini-2.5-flash',
      'meta-llama/llama-3.3-70b-instruct'
    ],
    enabled: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeySecretName: 'oh_bot_secret_anthropic',
    models: [
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022'
    ],
    enabled: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini (AI Studio)',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKeySecretName: 'oh_bot_secret_gemini',
    models: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ],
    enabled: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKeySecretName: 'oh_bot_secret_openai',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.5-preview',
      'o3-mini',
      'o1'
    ],
    enabled: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    type: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKeySecretName: 'oh_bot_secret_ollama',
    models: [
      'llama3.3',
      'qwen2.5-coder',
      'deepseek-r1',
      'mistral'
    ],
    enabled: true,
  },
];

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  workspacePath?: string;
  agentMdFile?: string;
  providerId?: string;
  model?: string;
  allowedTools?: string[];
  isDefaultMain?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SubagentStepContext {
  agentId: string;
  agentName: string;
  taskId: string;
  workspacePath?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: LLMMessage[];
  providerId: string;
  model: string;
  activeAgentId?: string;
}

export type SearchProviderType = 'duckduckgo' | 'searxng' | 'tavily';

import { SkillMetadata } from './skills/types';
import { McpServerConfig } from './mcp/types';

export const DEFAULT_MAIN_SYSTEM_PROMPT = `You are an autonomous AI Agent inside Obsidian running on Desktop and Mobile.
You have access to a rich set of built-in tools to fulfill the user's request step-by-step:
1. Vault Operations: Read, create, patch, list, and search notes and directories in the vault.
2. Web Research: Search the web (web_search) and fetch clean web page markdown (fetch_web_page) for up-to-date facts and articles.
3. PDF Document Generation: Create beautifully styled, publication-ready PDF documents and reports (generate_pdf) directly into the vault with themes ('anthropic-report', 'academic', 'minimal').
4. Skills & Extensibility: Create and run specialized workflow skills and remote MCP tools.

Always think step-by-step, use tools autonomously to verify or retrieve information, and provide clear, well-structured markdown responses.`;

export interface HarnessSettings {
  providers: ProviderConfig[];
  activeProviderId: string;
  activeModel: string;
  systemPrompt: string;
  safetyMode: SafetyMode;
  sessions: ChatSession[];
  currentSessionId?: string;
  installedSkills?: SkillMetadata[];
  customMarketplaceUrl?: string;
  scanVaultSkills?: boolean;
  mcpServers?: McpServerConfig[];
  searchProvider?: SearchProviderType;
  searxngUrl?: string;
  tavilyApiKeySecretName?: string;
  defaultPdfFolder?: string;
  agents: AgentConfig[];
  activeAgentId?: string;
}

export const DEFAULT_SETTINGS: HarnessSettings = {
  providers: DEFAULT_PROVIDERS,
  activeProviderId: '',
  activeModel: '',
  systemPrompt: DEFAULT_MAIN_SYSTEM_PROMPT,
  safetyMode: 'strict',
  sessions: [],
  currentSessionId: '',
  installedSkills: [],
  customMarketplaceUrl: '',
  scanVaultSkills: true,
  mcpServers: [],
  searchProvider: 'duckduckgo',
  searxngUrl: 'http://localhost:8080',
  tavilyApiKeySecretName: 'oh_bot_secret_tavily',
  defaultPdfFolder: 'Documents/Generated',
  agents: [
    {
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
    }
  ],
  activeAgentId: 'main',
};

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | any[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export type AgentStepEventType = 
  | 'thought' 
  | 'chunk' 
  | 'tool_call' 
  | 'tool_result' 
  | 'awaiting_confirmation' 
  | 'finish' 
  | 'error';

export interface AgentStepEvent {
  type: AgentStepEventType;
  step: number;
  content?: string;
  toolCall?: ToolCall;
  toolResult?: { toolCallId: string; result: ToolResult };
  error?: string;
  subagentContext?: SubagentStepContext;
}
