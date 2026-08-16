import { CompletionOptions, LLMProvider, ProviderResponse } from './base';
import { LLMMessage, ToolCall, ToolSchema } from '../../types';
import { prepareNetworkPayloadMessages, sortToolSchemasDeterministically } from '../../utils/cache-helpers';
import { SSEStreamParser } from '../stream-parser';
import { requestUrl } from 'obsidian';

export class OpenAIProvider extends LLMProvider {
  name = 'openai';

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
    const endpoint = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
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
      model: model || 'gpt-4o',
      messages: formattedMessages,
      stream: true,
    };

    if (options?.reasoningEffort && options.reasoningEffort !== 'default' && options.reasoningEffort !== 'none') {
      payload.reasoning_effort = options.reasoningEffort;
    }

    if (formattedTools.length > 0) {
      payload.tools = formattedTools;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI HTTP ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      const parser = new SSEStreamParser();

      let fullContent = '';
      const toolCallMap: Record<number, { id: string; name: string; args: string }> = {};

      if (reader) {
        while (true) {
          if (signal?.aborted) {
            reader.cancel();
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const events = parser.feed(text);

          for (const ev of events) {
            if (ev.data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(ev.data);
              const delta = parsed.choices?.[0]?.delta;

              if (delta?.content) {
                fullContent += delta.content;
                if (onChunk) onChunk(delta.content);
              }

              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCallMap[idx]) {
                    toolCallMap[idx] = { id: tc.id || '', name: tc.function?.name || '', args: '' };
                  }
                  if (tc.id) toolCallMap[idx].id = tc.id;
                  if (tc.function?.name) toolCallMap[idx].name = tc.function.name;
                  if (tc.function?.arguments) toolCallMap[idx].args += tc.function.arguments;
                }
              }
            } catch (e) {
              // Ignore invalid JSON chunk lines
            }
          }
        }
      }

      const finalToolCalls: ToolCall[] = Object.values(toolCallMap).map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: tc.args,
        },
      }));

      return {
        content: fullContent,
        toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      };
    } catch (err: any) {
      if (signal?.aborted || err.name === 'AbortError') {
        throw new Error('Generation stopped by user.');
      }

      const reqRes = await requestUrl({
        url: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ ...payload, stream: false }),
      });

      const resJson = reqRes.json;
      const choice = resJson.choices?.[0]?.message;
      return {
        content: choice?.content || '',
        toolCalls: choice?.tool_calls,
      };
    }
  }
}
