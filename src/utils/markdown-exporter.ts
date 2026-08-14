import { App } from 'obsidian';
import { LLMMessage } from '../types';
import { parseThoughts } from './thought-helper';

export class MarkdownExporter {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Exports conversation history to a clean, formatted Markdown note in the "Agent Chats/" Vault folder.
   */
  async exportChatToMarkdown(messages: LLMMessage[], modelName: string): Promise<string> {
    const folderPath = 'Agent Chats';
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }

    const now = new Date();
    const dateStr = now.toISOString().replace(/T/, ' ').replace(/\..+/, '');
    const fileDateStr = now.toISOString().slice(0, 10) + '-' + now.toTimeString().slice(0, 5).replace(':', '-');
    const filename = `${folderPath}/Agent Chat ${fileDateStr}.md`;

    let mdContent = `---
tags:
  - agent-chat
created: ${dateStr}
model: ${modelName}
---

# Harness Bot Chat Session (${dateStr})

`;

    for (const msg of messages) {
      if (msg.role === 'user') {
        const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        mdContent += `### 👤 User\n${text}\n\n`;
      } else if (msg.role === 'assistant') {
        mdContent += `### 🤖 Harness Bot\n`;

        const raw = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const parsed = parseThoughts(raw);

        // Thoughts formatted as an Obsidian callout
        if (parsed.thoughts.length > 0) {
          for (const thought of parsed.thoughts) {
            mdContent += `> [!NOTE]- Reasoning / Рассуждения\n> ${thought.split('\n').join('\n> ')}\n\n`;
          }
        }

        // Clean final markdown answer
        if (parsed.finalAnswer) {
          mdContent += `${parsed.finalAnswer}\n\n`;
        }

        // Tool Calls
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          mdContent += `> [!EXAMPLE]- Tool Calls Requested\n`;
          for (const tc of msg.tool_calls) {
            mdContent += `> - **\`${tc.function.name}\`**\n> \`\`\`json\n> ${tc.function.arguments.split('\n').join('\n> ')}\n> \`\`\`\n`;
          }
          mdContent += `\n`;
        }
      } else if (msg.role === 'tool') {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        mdContent += `> [!INFO]- Tool Output: ${msg.name || 'tool'}\n> \`\`\`\n> ${content.split('\n').join('\n> ')}\n> \`\`\`\n\n`;
      }
    }

    const createdFile = await this.app.vault.create(filename, mdContent);
    return createdFile.path;
  }
}
