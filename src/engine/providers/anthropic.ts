import { CompletionOptions, LLMProvider, ProviderResponse } from './base';
import { LLMMessage, ToolCall, ToolSchema } from '../../types';
import { prepareNetworkPayloadMessages, sortToolSchemasDeterministically } from '../../utils/cache-helpers';
import { SSEStreamParser } from '../stream-parser';
import { requestUrl } from 'obsidian';

export class AnthropicProvider extends LLMProvider {
  name = 'anthropic';

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
    const endpoint = (baseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '') + '/messages';
    const sortedTools = sortToolSchemasDeterministically(tools);
    const networkMessages = prepareNetworkPayloadMessages(messages);

    const formattedMessages = networkMessages.map((msg) => {
      let content = msg.content;
      if (Array.isArray(content)) {
        content = content.map((part: any) => {
          if (part.type === 'image_url' && part.image_url?.url?.startsWith('data:')) {
            const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              return {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: match[1],
                  data: match[2],
                },
              };
            }
          }
          return part;
        });
      }
      return {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content,
      };
    });

    const formattedTools = sortedTools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    // Attach Anthropic ephemeral prompt caching on system prompt
    const payload: any = {
      model: model || 'claude-3-7-sonnet-20250219',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: formattedMessages,
      stream: true,
    };

    if (options?.reasoningEffort && options.reasoningEffort !== 'default' && options.reasoningEffort !== 'none') {
      let budget = 4096;
      if (options.reasoningEffort === 'low') budget = 2048;
      else if (options.reasoningEffort === 'medium') budget = 8192;
      else if (options.reasoningEffort === 'high') budget = 16384;
      payload.thinking = { type: 'enabled', budget_tokens: budget };
      payload.max_tokens = Math.max(payload.max_tokens || 4096, budget + 4096);
    }

    if (formattedTools.length > 0) {
      payload.tools = formattedTools;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic HTTP ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      const parser = new SSEStreamParser();

      let fullContent = '';
      const toolCallList: ToolCall[] = [];
      let currentToolCall: { id: string; name: string; argsStr: string } | null = null;

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
            try {
              const parsed = JSON.parse(ev.data);

              if (parsed.type === 'content_block_delta') {
                if (parsed.delta?.type === 'text_delta') {
                  const chunk = parsed.delta.text;
                  fullContent += chunk;
                  if (onChunk) onChunk(chunk);
                } else if (parsed.delta?.type === 'input_json_delta') {
                  if (currentToolCall) {
                    currentToolCall.argsStr += parsed.delta.partial_json;
                  }
                }
              } else if (parsed.type === 'content_block_start') {
                if (parsed.content_block?.type === 'tool_use') {
                  currentToolCall = {
                    id: parsed.content_block.id,
                    name: parsed.content_block.name,
                    argsStr: '',
                  };
                }
              } else if (parsed.type === 'content_block_stop') {
                if (currentToolCall) {
                  toolCallList.push({
                    id: currentToolCall.id,
                    type: 'function',
                    function: {
                      name: currentToolCall.name,
                      arguments: currentToolCall.argsStr,
                    },
                  });
                  currentToolCall = null;
                }
              }
            } catch (e) {
              // Ignore invalid lines
            }
          }
        }
      }

      return {
        content: fullContent,
        toolCalls: toolCallList.length > 0 ? toolCallList : undefined,
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
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ ...payload, stream: false }),
      });

      const resJson = reqRes.json;
      let textContent = '';
      const toolCalls: ToolCall[] = [];

      for (const block of resJson.content || []) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
        }
      }

      return {
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    }
  }
}
