import { App, Modal, Setting } from 'obsidian';
import { ToolCall } from '../../types';

export class ConfirmationModal extends Modal {
  private toolCall: ToolCall;
  private onResult: (approved: boolean) => void;

  constructor(app: App, toolCall: ToolCall, onResult: (approved: boolean) => void) {
    super(app);
    this.toolCall = toolCall;
    this.onResult = onResult;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('harness-modal-content');

    contentEl.createEl('h3', { text: '⚠️ File Action Confirmation' });
    contentEl.createEl('p', {
      text: `The AI Agent is requesting permission to execute tool: "${this.toolCall.function.name}".`,
    });

    const codeBlock = contentEl.createEl('pre');
    codeBlock.createEl('code', { text: this.toolCall.function.arguments });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Deny')
          .onClick(() => {
            this.onResult(false);
            this.close();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText('Approve & Execute')
          .setCta()
          .onClick(() => {
            this.onResult(true);
            this.close();
          })
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
