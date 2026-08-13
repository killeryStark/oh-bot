import { App } from 'obsidian';
import { AgentStepEvent, HarnessSettings, LLMMessage, ToolCall } from '../types';
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

    // Register LLM Providers
    this.providers.set('openrouter', new OpenRouterProvider());
    this.providers.set('openai', new OpenAIProvider());
    this.providers.set('anthropic', new AnthropicProvider());
    this.providers.set('ollama', new OllamaProvider());
  }

  private getActiveProvider(): { provider: LLMProvider; apiKey: string } {
    const providerType = this.settings.defaultProvider || 'openrouter';
    const provider = this.providers.get(providerType);

    if (!provider) {
      throw new Error(`Unsupported provider type: ${providerType}`);
    }

    let secretName = '';
    if (providerType === 'openrouter') secretName = this.settings.openRouterSecretName;
    else if (providerType === 'openai') secretName = this.settings.openAiSecretName;
    else if (providerType === 'anthropic') secretName = this.settings.anthropicSecretName;

    const apiKey = secretName ? this.secretManager.getSecret(secretName) || '' : '';

    if (providerType !== 'ollama' && !apiKey) {
      throw new Error(`No API key found for secret "${secretName}". Please set it in plugin settings using SecretStorage.`);
    }

    return { provider, apiKey };
  }

  /**
   * Runs the multi-step agent turn loop.
   */
  async runTurn(
    history: LLMMessage[],
    onEvent: (event: AgentStepEvent) => void,
    onConfirm?: ConfirmationCallback
  ): Promise<LLMMessage[]> {
    const { provider, apiKey } = this.getActiveProvider();
    const messages: LLMMessage[] = [...history];
    const tools = this.toolRegistry.getSchemas();
    const maxSteps = this.settings.maxAgentSteps || 10;

    let step = 0;
    let keepRunning = true;

    while (keepRunning && step < maxSteps) {
      step++;

      let streamContent = '';
      const response = await provider.chatCompletion(
        apiKey,
        this.settings.customBaseUrl,
        this.settings.defaultModel,
        this.settings.systemPrompt,
        messages,
        tools,
        (chunk) => {
          streamContent += chunk;
          onEvent({
            type: 'chunk',
            step,
            content: streamContent,
          });
        }
      );

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
