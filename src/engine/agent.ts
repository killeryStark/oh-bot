import { App } from 'obsidian';
import { AgentStepEvent, HarnessSettings, LLMMessage, ProviderConfig, ToolCall } from '../types';
import { LLMProvider } from './providers/base';
import { OpenRouterProvider } from './providers/openrouter';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { OllamaProvider } from './providers/ollama';
import { ToolRegistry } from '../tools/registry';
import { SecretManager } from '../utils/secrets';

export type ConfirmationCallback = (toolCall: ToolCall) => Promise<boolean>;

export class AgentHarness {
  private app: App;
  private settings: HarnessSettings;
  private secretManager: SecretManager;
  private toolRegistry: ToolRegistry;
  private providers: Map<string, LLMProvider> = new Map();

  constructor(app: App, settings: HarnessSettings, toolRegistry: ToolRegistry) {
    this.app = app;
    this.settings = settings;
    this.secretManager = new SecretManager(app);
    this.toolRegistry = toolRegistry;
    this.toolRegistry.setSettings(settings);

    // Register Base LLM Providers
    this.providers.set('openrouter', new OpenRouterProvider());
    this.providers.set('openai', new OpenAIProvider());
    this.providers.set('gemini', new OpenAIProvider());
    this.providers.set('custom-openai', new OpenAIProvider());
    this.providers.set('anthropic', new AnthropicProvider());
    this.providers.set('ollama', new OllamaProvider());
  }

  private getActiveProviderConfig(providerId?: string): { provider: LLMProvider; config: ProviderConfig; apiKey: string } {
    const targetId = providerId || this.settings.activeProviderId || 'openrouter';
    const config = this.settings.providers.find((p) => p.id === targetId) || this.settings.providers[0];

    if (!config) {
      throw new Error(`No provider found for ID "${targetId}"`);
    }

    let provider = this.providers.get(config.type);
    if (!provider) {
      provider = this.providers.get('openai'); // Fallback to OpenAI-compatible
    }

    if (!provider) {
      throw new Error(`Unsupported provider type: ${config.type}`);
    }

    const apiKey = config.apiKeySecretName ? this.secretManager.getSecret(config.apiKeySecretName) || '' : '';

    if (config.type !== 'ollama' && !apiKey) {
      throw new Error(`No API key found for provider "${config.name}". Please set it in Settings.`);
    }

    return { provider, config, apiKey };
  }

  /**
   * Runs the multi-step agent turn loop with AbortSignal support.
   */
  async runTurn(
    history: LLMMessage[],
    onEvent: (event: AgentStepEvent) => void,
    onConfirm?: ConfirmationCallback,
    overrideProviderId?: string,
    overrideModel?: string,
    signal?: AbortSignal,
    extraSystemDirectives?: string
  ): Promise<LLMMessage[]> {
    const { provider, config, apiKey } = this.getActiveProviderConfig(overrideProviderId);
    this.toolRegistry.setSettings(this.settings);
    const model = overrideModel || this.settings.activeModel || config.models[0] || 'anthropic/claude-3.7-sonnet';
    const messages: LLMMessage[] = [...history];
    const tools = this.toolRegistry.getSchemas();
    const maxSteps = 25; // Sensible internal step limit (pi-agent harness style)
    const effectiveSystemPrompt = extraSystemDirectives
      ? `${this.settings.systemPrompt}\n\n${extraSystemDirectives}`
      : this.settings.systemPrompt;

    let step = 0;
    let keepRunning = true;

    while (keepRunning && step < maxSteps) {
      if (signal?.aborted) {
        throw new Error('Generation stopped by user.');
      }

      step++;

      let streamContent = '';
      const response = await provider.chatCompletion(
        apiKey,
        config.baseUrl,
        model,
        effectiveSystemPrompt,
        messages,
        tools,
        (chunk) => {
          if (signal?.aborted) return;
          streamContent += chunk;
          onEvent({
            type: 'chunk',
            step,
            content: streamContent,
          });
        },
        signal
      );

      if (signal?.aborted) {
        throw new Error('Generation stopped by user.');
      }

      // Add assistant response to conversation history
      const assistantMessage: LLMMessage = {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
      };
      messages.push(assistantMessage);

      // If model requested tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          if (signal?.aborted) break;

          onEvent({
            type: 'tool_call',
            step,
            toolCall,
          });

          const toolInstance = this.toolRegistry.getTool(toolCall.function.name);
          
          // Check safety mode
          if (toolInstance?.isMutation && this.settings.safetyMode === 'strict') {
            onEvent({
              type: 'awaiting_confirmation',
              step,
              toolCall,
            });

            if (onConfirm) {
              const approved = await onConfirm(toolCall);
              if (!approved) {
                const cancelledResult = {
                  success: false,
                  output: '',
                  error: 'User denied file modification permission for this tool execution.',
                };
                messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolCall.function.name,
                  content: JSON.stringify(cancelledResult),
                });
                onEvent({
                  type: 'tool_result',
                  step,
                  toolResult: { toolCallId: toolCall.id, result: cancelledResult },
                });
                continue;
              }
            }
          }

          // Parse arguments
          let parsedArgs: Record<string, any> = {};
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch (e) {
            parsedArgs = {};
          }

          // Execute tool
          const result = await this.toolRegistry.executeTool(toolCall.function.name, parsedArgs, this.app);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: result.success ? result.output : `Error: ${result.error}`,
          });

          onEvent({
            type: 'tool_result',
            step,
            toolResult: { toolCallId: toolCall.id, result },
          });
        }
      } else {
        // No tool calls means model reached final answer
        keepRunning = false;
        onEvent({
          type: 'finish',
          step,
          content: response.content,
        });
      }
    }

    if (step >= maxSteps) {
      onEvent({
        type: 'finish',
        step,
        content: `[Agent reached maximum step limit (${maxSteps})].`,
      });
    }

    return messages;
  }
}
