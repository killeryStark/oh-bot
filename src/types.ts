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

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: LLMMessage[];
  providerId: string;
  model: string;
}

import { SkillMetadata } from './skills/types';

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
}

export const DEFAULT_SETTINGS: HarnessSettings = {
  providers: DEFAULT_PROVIDERS,
  activeProviderId: '',
  activeModel: '',
  systemPrompt: 'You are an autonomous AI Agent inside Obsidian. You have tools to read, create, patch, search, and inspect notes in the vault. Use these tools step-by-step to fulfill the user request.',
  safetyMode: 'strict',
  sessions: [],
  currentSessionId: '',
  installedSkills: [],
  customMarketplaceUrl: '',
  scanVaultSkills: true,
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
}
