import { App, TFolder } from 'obsidian';
import { LLMMessage } from '../types';

export class MarkdownExporter {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Exports conversation history to a formatted Markdown note in the "Agent Chats/" Vault folder.
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

# 🤖 Agent Chat Session (${dateStr})

`;

    for (const msg of messages) {
      if (msg.role === 'user') {
        mdContent += `### 👤 User\n${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        if (msg.content) {
          mdContent += `### 🤖 Assistant\n${msg.content}\n\n`;
        }
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          mdContent += `> 🛠️ **Tool Calls Requested:**\n`;
          for (const tc of msg.tool_calls) {
            mdContent += `> - \`${tc.function.name}\` \`\`\`json\n${tc.function.arguments}\n\`\`\`\n`;
          }
          mdContent += `\n`;
        }
      } else if (msg.role === 'tool') {
        mdContent += `> ⚙️ **Tool Result (${msg.name}):**\n\`\`\`\n${msg.content}\n\`\`\`\n\n`;
      }
    }

    const createdFile = await this.app.vault.create(filename, mdContent);
    return createdFile.path;
  }
}
