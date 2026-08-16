import { App } from 'obsidian';
import {
  AgentConfig,
  AgentStepEvent,
  DEFAULT_MAIN_SYSTEM_PROMPT,
  HarnessSettings,
  LLMMessage,
  ProviderConfig,
  SubagentStepContext,
  ToolCall,
} from '../types';
import { LLMProvider } from './providers/base';
import { OpenRouterProvider } from './providers/openrouter';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { OllamaProvider } from './providers/ollama';
import { ToolRegistry } from '../tools/registry';
import { ScopedToolRegistry } from '../tools/scoped-registry';
import { SecretManager } from '../utils/secrets';
import { AgentManager } from './agent-manager';

export type ConfirmationCallback = (toolCall: ToolCall) => Promise<boolean>;

export class AgentHarness {
  private app: App;
  private settings: HarnessSettings;
  private secretManager: SecretManager;
  private toolRegistry: ToolRegistry;
  private providers: Map<string, LLMProvider> = new Map();
  private agentManager?: AgentManager;
  private activeOnEvent?: (event: AgentStepEvent) => void;

  constructor(
    app: App,
    settings: HarnessSettings,
    toolRegistry: ToolRegistry,
    agentManager?: AgentManager
  ) {
    this.app = app;
    this.settings = settings;
    this.secretManager = new SecretManager(app);
    this.toolRegistry = toolRegistry;
    this.toolRegistry.setSettings(settings);
    this.agentManager = agentManager;

    // Register Base LLM Providers
    this.providers.set('openrouter', new OpenRouterProvider());
    this.providers.set('openai', new OpenAIProvider());
    this.providers.set('gemini', new OpenAIProvider());
    this.providers.set('custom-openai', new OpenAIProvider());
    this.providers.set('anthropic', new AnthropicProvider());
    this.providers.set('ollama', new OllamaProvider());

    // Wire subagent runner
    this.toolRegistry.setSubagentRunner(this.runSubagent.bind(this));
    if (this.agentManager) {
      this.toolRegistry.setAgentManager(this.agentManager);
    }
  }

  setAgentManager(agentManager: AgentManager): void {
    this.agentManager = agentManager;
    this.toolRegistry.setAgentManager(agentManager);
    this.toolRegistry.setSubagentRunner(this.runSubagent.bind(this));
  }

  setSettings(settings: HarnessSettings): void {
    this.settings = settings;
    this.toolRegistry.setSettings(settings);
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
   * Executes a specialized subagent task turn in isolation, scoping tools and workspace,
   * while bubbling execution events to the caller and UI.
   */
  async runSubagent(
    agent: AgentConfig,
    taskPrompt: string,
    onEvent?: (event: AgentStepEvent) => void,
    signal?: AbortSignal
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const taskId = `subtask_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const subagentContext: SubagentStepContext = {
      agentId: agent.id,
      agentName: agent.name,
      taskId,
      workspacePath: agent.workspacePath,
    };

    const forwardEvent = (event: AgentStepEvent) => {
      const wrappedEvent: AgentStepEvent = {
        ...event,
        subagentContext: event.subagentContext || subagentContext,
      };
      if (onEvent) {
        onEvent(wrappedEvent);
      } else if (this.activeOnEvent) {
        this.activeOnEvent(wrappedEvent);
      }
    };

    try {
      const initialMessages: LLMMessage[] = [
        {
          role: 'user',
          content: taskPrompt,
        },
      ];

      const updatedHistory = await this.runTurn(
        initialMessages,
        forwardEvent,
        undefined, // subagent turn confirmation handled within workspace sandbox
        agent.providerId,
        agent.model,
        signal,
        undefined,
        agent,
        subagentContext
      );

      const lastAssistant = [...updatedHistory].reverse().find((m) => m.role === 'assistant');
      const content = lastAssistant?.content;
      const output =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
          ? JSON.stringify(content)
          : '';

      return {
        success: true,
        output: output || '',
      };
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      forwardEvent({
        type: 'error',
        step: 0,
        error: errorMessage,
        subagentContext,
      });
      return {
        success: false,
        output: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Runs the multi-step agent turn loop with AbortSignal and subagent context support.
   */
  async runTurn(
    history: LLMMessage[],
    onEvent: (event: AgentStepEvent) => void,
    onConfirm?: ConfirmationCallback,
    overrideProviderId?: string,
    overrideModel?: string,
    signal?: AbortSignal,
    extraSystemDirectives?: string,
    agentConfig?: AgentConfig,
    subagentContext?: SubagentStepContext
  ): Promise<LLMMessage[]> {
    const targetProviderId = overrideProviderId || agentConfig?.providerId || this.settings.activeProviderId;
    const { provider, config, apiKey } = this.getActiveProviderConfig(targetProviderId);
    this.toolRegistry.setSettings(this.settings);

    const model =
      overrideModel ||
      agentConfig?.model ||
      this.settings.activeModel ||
      config.models[0] ||
      'anthropic/claude-3.7-sonnet';

    const messages: LLMMessage[] = [...history];

    // Determine scoped or base tool registry
    const registry = agentConfig
      ? new ScopedToolRegistry(this.toolRegistry, agentConfig, this.app)
      : this.toolRegistry;

    const tools = registry.getSchemas();
    const maxSteps = 25; // Sensible internal step limit (pi-agent harness style)

    // Resolve base system prompt
    let baseSystemPrompt = this.settings.systemPrompt || DEFAULT_MAIN_SYSTEM_PROMPT;
    if (agentConfig) {
      if (this.agentManager) {
        baseSystemPrompt = await this.agentManager.resolveEffectiveSystemPrompt(agentConfig);
      } else {
        baseSystemPrompt = agentConfig.systemPrompt || this.settings.systemPrompt || DEFAULT_MAIN_SYSTEM_PROMPT;
      }
    }

    const effectiveSystemPrompt = extraSystemDirectives
      ? `${baseSystemPrompt}\n\n${extraSystemDirectives}`
      : baseSystemPrompt;

    const emitEvent = (event: AgentStepEvent) => {
      const finalEvent: AgentStepEvent = subagentContext
        ? { ...event, subagentContext: event.subagentContext || subagentContext }
        : event;
      onEvent(finalEvent);
    };

    const previousActiveOnEvent = this.activeOnEvent;
    this.activeOnEvent = emitEvent;

    let step = 0;
    let keepRunning = true;

    try {
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
            emitEvent({
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

            emitEvent({
              type: 'tool_call',
              step,
              toolCall,
            });

            const toolInstance = registry.getTool(toolCall.function.name);

            // Check safety mode
            if (toolInstance?.isMutation && this.settings.safetyMode === 'strict') {
              emitEvent({
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
                  emitEvent({
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

            // Execute tool with scoped/base registry
            const result = await registry.executeTool(toolCall.function.name, parsedArgs, this.app);

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: result.success ? result.output : `Error: ${result.error}`,
            });

            emitEvent({
              type: 'tool_result',
              step,
              toolResult: { toolCallId: toolCall.id, result },
            });
          }
        } else {
          // No tool calls means model reached final answer
          keepRunning = false;
          emitEvent({
            type: 'finish',
            step,
            content: response.content,
          });
        }
      }

      if (step >= maxSteps) {
        emitEvent({
          type: 'finish',
          step,
          content: `[Agent reached maximum step limit (${maxSteps})].`,
        });
      }

      return messages;
    } finally {
      this.activeOnEvent = previousActiveOnEvent;
    }
  }
}
