import { LLMMessage, ToolCall, ToolSchema } from '../../types';

export interface ProviderResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface CompletionOptions {
  reasoningEffort?: 'default' | 'low' | 'medium' | 'high' | string;
}

export abstract class LLMProvider {
  abstract name: string;

  /**
   * Executes a completion request to the LLM Provider.
   * Calls onChunk callback for real-time text streaming.
   * Supports cancellation via AbortSignal.
   */
  abstract chatCompletion(
    apiKey: string,
    baseUrl: string,
    model: string,
    systemPrompt: string,
    messages: LLMMessage[],
    tools: ToolSchema[],
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
    options?: CompletionOptions
  ): Promise<ProviderResponse>;
}

