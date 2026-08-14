import { App, TFile, TFolder } from 'obsidian';

export interface MentionItem {
  name: string;
  path: string;
  isFolder: boolean;
}

export class MentionHelper {
  /**
   * Returns all searchable files and folders in the Vault for @ autocomplete suggestions.
   */
  static getVaultItems(app: App, query = ''): MentionItem[] {
    const allFiles = app.vault.getAllLoadedFiles();
    const queryLower = query.toLowerCase();

    const items: MentionItem[] = [];
    for (const item of allFiles) {
      if (item.path === '/' || item.path === '') continue;

      const isFolder = item instanceof TFolder;
      if (
        !queryLower ||
        item.name.toLowerCase().includes(queryLower) ||
        item.path.toLowerCase().includes(queryLower)
      ) {
        items.push({
          name: item.name,
          path: item.path,
          isFolder,
        });
      }
    }

    return items
      .sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.path.localeCompare(b.path);
      })
      .slice(0, 15);
  }

  /**
   * Scans a message for @references and attaches the real file/folder contents.
   */
  static async resolveMentions(app: App, userText: string): Promise<string> {
    const mentionRegex = /@([a-zA-Z0-9_\-\.\/]+)/g;
    const matches = Array.from(userText.matchAll(mentionRegex));

    if (matches.length === 0) return userText;

    let enrichedText = userText;
    const attachedBlocks: string[] = [];

    for (const match of matches) {
      const targetPath = match[1];
      const item = app.vault.getAbstractFileByPath(targetPath);

      if (item instanceof TFile) {
        try {
          const content = await app.vault.read(item);
          attachedBlocks.push(
            `[Attached Note: @${item.path}]\n\`\`\`markdown\n${content}\n\`\`\``
          );
        } catch (e) {
          // Ignore read errors
        }
      } else if (item instanceof TFolder) {
        try {
          const children = item.children.map((c) => `- ${c.name} (${c instanceof TFolder ? 'folder' : 'file'})`).join('\n');
          attachedBlocks.push(
            `[Attached Folder: @${item.path}]\n\`\`\`\n${children}\n\`\`\``
          );
        } catch (e) {
          // Ignore folder read errors
        }
      }
    }

    if (attachedBlocks.length > 0) {
      enrichedText = `${enrichedText}\n\n${attachedBlocks.join('\n\n')}`;
    }

    return enrichedText;
  }
}
