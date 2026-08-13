export type ProviderType = 'openrouter' | 'openai' | 'anthropic' | 'ollama';

export type SafetyMode = 'strict' | 'auto';

export interface HarnessSettings {
  openRouterSecretName: string;
  openAiSecretName: string;
  anthropicSecretName: string;
  defaultProvider: ProviderType;
  defaultModel: string;
  customBaseUrl: string;
  systemPrompt: string;
  safetyMode: SafetyMode;
  maxAgentSteps: number;
}

export const DEFAULT_SETTINGS: HarnessSettings = {
  openRouterSecretName: 'openrouter-api-key',
  openAiSecretName: 'openai-api-key',
  anthropicSecretName: 'anthropic-api-key',
  defaultProvider: 'openrouter',
  defaultModel: 'anthropic/claude-3.7-sonnet',
  customBaseUrl: 'http://localhost:11434/v1',
  systemPrompt: 'You are an autonomous AI Agent inside Obsidian. You have tools to read, create, patch, search, and inspect notes in the vault. Use these tools step-by-step to fulfill the user request.',
  safetyMode: 'strict',
  maxAgentSteps: 10,
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
