import { LLMMessage, ToolSchema } from '../types';

/**
 * Sorts tool schemas deterministically to maximize prompt cache hits (>98%).
 * Sorts tools by name alphabetically, and sorts parameter property keys alphabetically.
 */
export function sortToolSchemasDeterministically(tools: ToolSchema[]): ToolSchema[] {
  return [...tools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => {
      const properties = tool.parameters.properties;
      const sortedPropertyKeys = Object.keys(properties).sort();
      const sortedProperties: Record<string, any> = {};

      for (const key of sortedPropertyKeys) {
        sortedProperties[key] = properties[key];
      }

      return {
        ...tool,
        parameters: {
          ...tool.parameters,
          properties: sortedProperties,
          required: tool.parameters.required ? [...tool.parameters.required].sort() : undefined,
        },
      };
    });
}

/**
 * Prepares network messages for payload submission to the LLM API.
 * Injects current date and time into the tail of the LATEST user message.
 * Does NOT alter the underlying UI or stored conversation state.
 */
export function prepareNetworkPayloadMessages(messages: LLMMessage[]): LLMMessage[] {
  if (messages.length === 0) return [];

  const networkMessages = JSON.parse(JSON.stringify(messages)) as LLMMessage[];
  
  // Find the last user message to append situational time metadata
  for (let i = networkMessages.length - 1; i >= 0; i--) {
    if (networkMessages[i].role === 'user') {
      const nowIso = new Date().toISOString();
      if (typeof networkMessages[i].content === 'string') {
        networkMessages[i].content = `${networkMessages[i].content}\n\n[Current Date & Time: ${nowIso}]`;
      } else if (Array.isArray(networkMessages[i].content)) {
        const textItem = (networkMessages[i].content as any[]).find((c) => c.type === 'text');
        if (textItem && typeof textItem.text === 'string') {
          textItem.text = `${textItem.text}\n\n[Current Date & Time: ${nowIso}]`;
        }
      }
      break;
    }
  }

  return networkMessages;
}

/**
 * Adds Anthropic / OpenRouter explicit `cache_control` markers for prompt caching.
 */
export function attachAnthropicCacheControl(systemPrompt: string, messages: any[], tools: any[]) {
  const formattedSystem = [
    {
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' },
    },
  ];

  // Mark the last message before turn with cache control if applicable
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (typeof lastMsg.content === 'string') {
      lastMsg.content = [
        {
          type: 'text',
          text: lastMsg.content,
          cache_control: { type: 'ephemeral' },
        },
      ];
    }
  }

  return { formattedSystem, messages, tools };
}
