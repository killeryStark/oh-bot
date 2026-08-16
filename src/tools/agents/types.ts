import { AgentConfig, AgentStepEvent } from '../../types';

export type SubagentRunner = (
  agent: AgentConfig,
  taskPrompt: string,
  onEvent?: (event: AgentStepEvent) => void,
  signal?: AbortSignal
) => Promise<{ success: boolean; output: string; error?: string }>;
