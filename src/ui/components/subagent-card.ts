import { App, MarkdownRenderer, Notice, setIcon } from 'obsidian';
import { AgentStepEvent, SubagentStepContext, ToolCall } from '../../types';
import { parseThoughts } from '../../utils/thought-helper';

export class SubagentCard {
  private detailsEl: HTMLDetailsElement;
  private summaryEl: HTMLElement;
  private statusBadgeEl: HTMLElement;
  private copyBtnEl: HTMLButtonElement;
  private bodyEl: HTMLElement;
  private thinkingContainerEl: HTMLElement;
  private toolsContainerEl: HTMLElement;
  private outputContainerEl: HTMLElement;

  private accumulatedContent = '';
  private toolCalls: Map<string, { name: string; args: string; result?: string; cardEl?: HTMLElement }> = new Map();
  private isFinalized = false;
  private hasError = false;

  constructor(
    private parentEl: HTMLElement,
    private context: SubagentStepContext,
    private app: App,
    private ownerComponent: any
  ) {
    // Collapsible container: <details class="harness-collapsible-card harness-subagent-card" open>
    this.detailsEl = this.parentEl.createEl('details', {
      cls: 'harness-collapsible-card harness-subagent-card',
    });
    this.detailsEl.open = true;

    // <summary class="harness-collapsible-summary harness-subagent-summary">
    this.summaryEl = this.detailsEl.createEl('summary', {
      cls: 'harness-collapsible-summary harness-subagent-summary',
    });

    // Left container
    const leftEl = this.summaryEl.createEl('div', {
      cls: 'harness-collapsible-summary-left',
    });

    const iconSpan = leftEl.createEl('span', { cls: 'harness-subagent-icon' });
    setIcon(iconSpan, 'zap');

    leftEl.createEl('span', {
      text: `Subagent: ${this.context.agentName}`,
      cls: 'harness-subagent-title',
    });

    if (this.context.workspacePath && this.context.workspacePath.trim().length > 0) {
      const cleanPath = this.context.workspacePath.trim();
      const wsBadge = leftEl.createEl('span', {
        text: `📁 ${cleanPath}`,
        cls: 'harness-workspace-badge',
      });
      wsBadge.setAttribute('title', `Workspace Scope: ${cleanPath}`);
    }

    // Right container
    const rightEl = this.summaryEl.createEl('div', {
      cls: 'harness-collapsible-summary-right',
    });

    // Status indicator
    this.statusBadgeEl = rightEl.createEl('span', {
      text: '⚡ Running...',
      cls: 'harness-subagent-status harness-status-running',
    });

    // Copy button
    this.copyBtnEl = rightEl.createEl('button', {
      cls: 'harness-tool-copy-btn',
    });
    this.copyBtnEl.setAttribute('aria-label', 'Copy subagent thoughts and text');
    this.copyBtnEl.setAttribute('title', 'Copy subagent thoughts and text');
    setIcon(this.copyBtnEl, 'copy');
    this.copyBtnEl.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.copyAllToClipboard();
    });

    // Expand/Collapse badge
    rightEl.createEl('span', {
      text: 'Subagent',
      cls: 'harness-collapsible-badge',
    });

    // <div class="harness-collapsible-body harness-subagent-body">
    this.bodyEl = this.detailsEl.createEl('div', {
      cls: 'harness-collapsible-body harness-subagent-body',
    });

    // Thinking / reasoning section
    this.thinkingContainerEl = this.bodyEl.createEl('div', {
      cls: 'harness-subagent-thinking-container',
    });
    this.thinkingContainerEl.style.display = 'none';

    // Tool calls container
    this.toolsContainerEl = this.bodyEl.createEl('div', {
      cls: 'harness-subagent-tools-container',
    });

    // Streaming text / output container
    this.outputContainerEl = this.bodyEl.createEl('div', {
      cls: 'harness-subagent-output-container',
    });
  }

  public getTaskId(): string {
    return this.context.taskId;
  }

  public getAgentName(): string {
    return this.context.agentName;
  }

  public getContext(): SubagentStepContext {
    return this.context;
  }

  public handleEvent(event: AgentStepEvent): void {
    if (event.type === 'chunk' && event.content) {
      this.accumulatedContent = event.content;
      const parsed = parseThoughts(this.accumulatedContent);

      if (parsed.thoughts.length > 0) {
        this.thinkingContainerEl.style.display = 'block';
        this.thinkingContainerEl.empty();
        for (const thought of parsed.thoughts) {
          const thoughtCard = this.thinkingContainerEl.createEl('details', {
            cls: 'harness-collapsible-card harness-thinking-card',
          });
          const summary = thoughtCard.createEl('summary', { cls: 'harness-collapsible-summary' });
          const left = summary.createEl('div', { cls: 'harness-collapsible-summary-left' });
          const iconSpan = left.createEl('span');
          setIcon(iconSpan, 'sparkles');
          left.createEl('span', { text: 'Subagent Reasoning' });

          const right = summary.createEl('div', { cls: 'harness-collapsible-summary-right' });
          const copyThoughtBtn = right.createEl('button', { cls: 'harness-tool-copy-btn' });
          copyThoughtBtn.setAttribute('aria-label', 'Copy reasoning');
          copyThoughtBtn.setAttribute('title', 'Copy reasoning');
          setIcon(copyThoughtBtn, 'copy');
          copyThoughtBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.copyText(thought, copyThoughtBtn, 'Reasoning copied to clipboard');
          });

          right.createEl('span', { text: 'View', cls: 'harness-collapsible-badge' });

          const tBody = thoughtCard.createEl('div', { cls: 'harness-collapsible-body harness-thinking-text' });
          tBody.setText(thought);
        }
      }

      if (parsed.finalAnswer) {
        this.outputContainerEl.setText(parsed.finalAnswer);
      } else if (parsed.thoughts.length === 0) {
        this.outputContainerEl.setText(this.accumulatedContent);
      }
    } else if (event.type === 'tool_call' && event.toolCall) {
      const tc = event.toolCall;
      const toolId = tc.id || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.renderToolCall(toolId, tc.function.name, tc.function.arguments);
    } else if (event.type === 'tool_result' && event.toolResult) {
      const { toolCallId, result } = event.toolResult;
      const resultStr = result.success ? result.output : `Error: ${result.error}`;
      this.renderToolResult(toolCallId, resultStr);
    } else if (event.type === 'finish') {
      if (!this.hasError) {
        this.statusBadgeEl.setText('✅ Completed');
        this.statusBadgeEl.className = 'harness-subagent-status harness-status-completed';
      }
    } else if (event.type === 'error') {
      this.hasError = true;
      this.statusBadgeEl.setText('❌ Error');
      this.statusBadgeEl.className = 'harness-subagent-status harness-status-error';
      if (event.error) {
        const errorBox = this.outputContainerEl.createEl('div', { cls: 'harness-subagent-error-box' });
        errorBox.setText(`Error: ${event.error}`);
      }
    }
  }

  public async finalize(content?: string): Promise<void> {
    if (this.isFinalized) return;
    this.isFinalized = true;

    const rawText = content !== undefined ? content : this.accumulatedContent;

    if (!this.hasError) {
      this.statusBadgeEl.setText('✅ Completed');
      this.statusBadgeEl.className = 'harness-subagent-status harness-status-completed';
    }

    if (!rawText && !this.outputContainerEl.textContent) {
      return;
    }

    const parsed = parseThoughts(rawText || '');

    // Render thoughts if any
    if (parsed.thoughts.length > 0) {
      this.thinkingContainerEl.style.display = 'block';
      this.thinkingContainerEl.empty();
      for (const thought of parsed.thoughts) {
        const thoughtCard = this.thinkingContainerEl.createEl('details', {
          cls: 'harness-collapsible-card harness-thinking-card',
        });
        const summary = thoughtCard.createEl('summary', { cls: 'harness-collapsible-summary' });
        const left = summary.createEl('div', { cls: 'harness-collapsible-summary-left' });
        const iconSpan = left.createEl('span');
        setIcon(iconSpan, 'sparkles');
        left.createEl('span', { text: 'Subagent Reasoning' });

        const right = summary.createEl('div', { cls: 'harness-collapsible-summary-right' });
        const copyThoughtBtn = right.createEl('button', { cls: 'harness-tool-copy-btn' });
        copyThoughtBtn.setAttribute('aria-label', 'Copy reasoning');
        copyThoughtBtn.setAttribute('title', 'Copy reasoning');
        setIcon(copyThoughtBtn, 'copy');
        copyThoughtBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.copyText(thought, copyThoughtBtn, 'Reasoning copied to clipboard');
        });

        right.createEl('span', { text: 'View', cls: 'harness-collapsible-badge' });

        const tBody = thoughtCard.createEl('div', { cls: 'harness-collapsible-body harness-thinking-text' });
        await MarkdownRenderer.render(this.app, thought, tBody, '', this.ownerComponent);
        this.enhanceCodeBlocksWithCopyButton(tBody);
      }
    }

    const answerToRender = parsed.finalAnswer || (parsed.thoughts.length === 0 ? rawText : '');
    if (answerToRender) {
      this.outputContainerEl.empty();
      const answerEl = this.outputContainerEl.createEl('div', { cls: 'harness-answer-text' });
      await MarkdownRenderer.render(this.app, answerToRender, answerEl, '', this.ownerComponent);
      this.enhanceCodeBlocksWithCopyButton(answerEl);
    }
  }

  private renderToolCall(toolId: string, toolName: string, argsStr: string): void {
    const cardEl = this.toolsContainerEl.createEl('details', {
      cls: 'harness-collapsible-card harness-tool-card',
    });
    cardEl.open = true;

    const summaryEl = cardEl.createEl('summary', { cls: 'harness-collapsible-summary' });
    const leftEl = summaryEl.createEl('div', { cls: 'harness-collapsible-summary-left' });
    const iconSpan = leftEl.createEl('span');
    setIcon(iconSpan, 'wrench');
    leftEl.createEl('span', { text: `Tool: ${toolName}` });

    const rightEl = summaryEl.createEl('div', { cls: 'harness-collapsible-summary-right' });
    const copyBtn = rightEl.createEl('button', { cls: 'harness-tool-copy-btn' });
    copyBtn.setAttribute('aria-label', 'Copy tool arguments');
    copyBtn.setAttribute('title', 'Copy tool arguments');
    setIcon(copyBtn, 'copy');
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const formatted = this.formatContentForCard(argsStr);
      this.copyText(formatted, copyBtn, 'Tool arguments copied to clipboard');
    });

    rightEl.createEl('span', { text: 'Args', cls: 'harness-collapsible-badge' });

    const bodyEl = cardEl.createEl('div', { cls: 'harness-collapsible-body' });
    const pre = bodyEl.createEl('pre');
    pre.createEl('code', { text: this.formatContentForCard(argsStr) });
    this.enhanceCodeBlocksWithCopyButton(bodyEl);

    this.toolCalls.set(toolId, {
      name: toolName,
      args: argsStr,
      cardEl,
    });
  }

  private renderToolResult(toolCallId: string, outputText: string): void {
    const toolEntry = this.toolCalls.get(toolCallId);
    const toolName = toolEntry?.name || 'tool';

    const cardEl = this.toolsContainerEl.createEl('details', {
      cls: 'harness-collapsible-card harness-tool-card',
    });
    cardEl.open = true;

    const summaryEl = cardEl.createEl('summary', { cls: 'harness-collapsible-summary' });
    const leftEl = summaryEl.createEl('div', { cls: 'harness-collapsible-summary-left' });
    const iconSpan = leftEl.createEl('span');
    setIcon(iconSpan, 'file-text');
    leftEl.createEl('span', { text: `Output: ${toolName}` });

    const rightEl = summaryEl.createEl('div', { cls: 'harness-collapsible-summary-right' });
    const copyBtn = rightEl.createEl('button', { cls: 'harness-tool-copy-btn' });
    copyBtn.setAttribute('aria-label', 'Copy tool output');
    copyBtn.setAttribute('title', 'Copy tool output');
    setIcon(copyBtn, 'copy');
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const formatted = this.formatContentForCard(outputText);
      this.copyText(formatted, copyBtn, 'Tool output copied to clipboard');
    });

    rightEl.createEl('span', { text: 'Result', cls: 'harness-collapsible-badge' });

    const bodyEl = cardEl.createEl('div', { cls: 'harness-collapsible-body' });
    const pre = bodyEl.createEl('pre');
    pre.createEl('code', { text: this.formatContentForCard(outputText) });
    this.enhanceCodeBlocksWithCopyButton(bodyEl);

    if (toolEntry) {
      toolEntry.result = outputText;
    }
  }

  private formatContentForCard(rawStr: string): string {
    if (!rawStr || rawStr.trim() === '') return '(empty)';
    try {
      const parsed = JSON.parse(rawStr);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return rawStr;
    }
  }

  private async copyAllToClipboard(): Promise<void> {
    const parts: string[] = [];
    const parsed = parseThoughts(this.accumulatedContent);

    if (parsed.thoughts.length > 0) {
      for (const t of parsed.thoughts) {
        parts.push(`[Reasoning]\n${t}`);
      }
    }

    for (const [_, tc] of this.toolCalls) {
      parts.push(`[Tool: ${tc.name}]\nArgs: ${tc.args}${tc.result ? `\nOutput: ${tc.result}` : ''}`);
    }

    if (parsed.finalAnswer) {
      parts.push(`[Response]\n${parsed.finalAnswer}`);
    } else if (this.accumulatedContent && parsed.thoughts.length === 0) {
      parts.push(this.accumulatedContent);
    }

    const fullText = parts.length > 0 ? parts.join('\n\n') : (this.bodyEl.innerText || '');
    await this.copyText(fullText, this.copyBtnEl, 'Subagent content copied to clipboard');
  }

  private async copyText(text: string, btnEl: HTMLElement, noticeText: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setIcon(btnEl, 'check');
      btnEl.addClass('is-copied');
      new Notice(noticeText);
      setTimeout(() => {
        setIcon(btnEl, 'copy');
        btnEl.removeClass('is-copied');
      }, 2000);
    } catch (e) {
      new Notice('Failed to copy to clipboard');
    }
  }

  private enhanceCodeBlocksWithCopyButton(containerEl: HTMLElement): void {
    const preElements = Array.from(containerEl.querySelectorAll('pre'));
    for (const pre of preElements) {
      if (pre.parentElement?.classList.contains('harness-code-block-wrapper')) {
        continue;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'harness-code-block-wrapper';

      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const copyBtn = wrapper.createEl('button', {
        cls: 'harness-code-copy-btn',
      });
      copyBtn.setAttribute('aria-label', 'Copy code');
      copyBtn.setAttribute('title', 'Copy code');
      setIcon(copyBtn, 'copy');

      copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const codeEl = pre.querySelector('code');
        const codeText = codeEl ? codeEl.innerText : pre.innerText;
        this.copyText(codeText, copyBtn, 'Code copied to clipboard');
      });
    }
  }

  /**
   * Static helper to render historical invoke_subagent tool calls and results.
   */
  public static async renderHistorical(
    parentEl: HTMLElement,
    app: App,
    ownerComponent: any,
    toolCall: ToolCall,
    toolResultOutput?: string,
    workspacePath?: string,
    agentName?: string
  ): Promise<SubagentCard> {
    let parsedArgs: Record<string, any> = {};
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
    } catch (e) {
      parsedArgs = {};
    }

    const resolvedAgentName = agentName || parsedArgs.agent_id || 'Subagent';
    const context: SubagentStepContext = {
      agentId: parsedArgs.agent_id || 'subagent',
      agentName: resolvedAgentName,
      taskId: toolCall.id || `subtask_${Date.now()}`,
      workspacePath: workspacePath,
    };

    const card = new SubagentCard(parentEl, context, app, ownerComponent);
    card.detailsEl.open = false; // Collapsed by default for historical messages

    // Render task description / prompt
    if (parsedArgs.task) {
      const taskCard = card.toolsContainerEl.createEl('details', {
        cls: 'harness-collapsible-card harness-tool-card',
      });
      const summary = taskCard.createEl('summary', { cls: 'harness-collapsible-summary' });
      const left = summary.createEl('div', { cls: 'harness-collapsible-summary-left' });
      const iconSpan = left.createEl('span');
      setIcon(iconSpan, 'zap');
      left.createEl('span', { text: 'Task Prompt' });

      const right = summary.createEl('div', { cls: 'harness-collapsible-summary-right' });
      const copyTaskBtn = right.createEl('button', { cls: 'harness-tool-copy-btn' });
      copyTaskBtn.setAttribute('aria-label', 'Copy task prompt');
      copyTaskBtn.setAttribute('title', 'Copy task prompt');
      setIcon(copyTaskBtn, 'copy');
      copyTaskBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.copyText(parsedArgs.task, copyTaskBtn, 'Task prompt copied to clipboard');
      });

      right.createEl('span', { text: 'Task', cls: 'harness-collapsible-badge' });

      const body = taskCard.createEl('div', { cls: 'harness-collapsible-body' });
      await MarkdownRenderer.render(app, parsedArgs.task, body, '', ownerComponent);
      card.enhanceCodeBlocksWithCopyButton(body);
    }

    // Render tool output if present
    if (toolResultOutput) {
      card.accumulatedContent = toolResultOutput;
      await card.finalize(toolResultOutput);
    } else {
      await card.finalize();
    }

    return card;
  }
}
