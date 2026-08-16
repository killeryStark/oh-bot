import { CompletionOptions, LLMProvider, ProviderResponse } from './base';
import { LLMMessage, ToolCall, ToolSchema } from '../../types';
import { prepareNetworkPayloadMessages, sortToolSchemasDeterministically } from '../../utils/cache-helpers';
import { requestUrl } from 'obsidian';

export class OllamaProvider extends LLMProvider {
  name = 'ollama';

  async chatCompletion(
    apiKey: string,
    baseUrl: string,
    model: string,
    systemPrompt: string,
    messages: LLMMessage[],
    tools: ToolSchema[],
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
    options?: CompletionOptions
  ): Promise<ProviderResponse> {
    const endpoint = (baseUrl || 'http://localhost:11434/v1').replace(/\/$/, '') + '/chat/completions';
    const sortedTools = sortToolSchemasDeterministically(tools);
    const networkMessages = prepareNetworkPayloadMessages(messages);

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...networkMessages,
    ];

    const formattedTools = sortedTools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const payload: any = {
      model: model || 'llama3',
      messages: formattedMessages,
      stream: false,
    };

    if (formattedTools.length > 0) {
      payload.tools = formattedTools;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    if (signal?.aborted) {
      throw new Error('Generation stopped by user.');
    }

    const reqRes = await requestUrl({
      url: endpoint,
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const resJson = reqRes.json;
    const choice = resJson.choices?.[0]?.message;

    if (choice?.content && onChunk) {
      onChunk(choice.content);
    }

    const toolCalls: ToolCall[] = (choice?.tool_calls || []).map((tc: any) => ({
      id: tc.id || `call_${Date.now()}`,
      type: 'function',
      function: {
        name: tc.function?.name || '',
        arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || {}),
      },
    }));

    return {
      content: choice?.content || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
