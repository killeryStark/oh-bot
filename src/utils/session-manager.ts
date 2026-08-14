import { ChatSession, LLMMessage } from '../types';

export class SessionManager {
  /**
   * Generates a clean human-readable session title from the user prompt.
   */
  static generateTitle(firstUserMessage: string): string {
    const clean = firstUserMessage.replace(/[\n\r]+/g, ' ').trim();
    if (clean.length === 0) return 'New Chat Session';
    if (clean.length <= 40) return clean;

    const words = clean.split(' ');
    let result = '';
    for (const w of words) {
      if ((result + ' ' + w).trim().length > 35) break;
      result = (result + ' ' + w).trim();
    }
    return result ? `${result}...` : clean.slice(0, 35) + '...';
  }

  /**
   * Creates a new empty session object.
   */
  static createNewSession(providerId: string, model: string): ChatSession {
    const id = `session_${Date.now()}`;
    return {
      id,
      title: 'New Chat Session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      providerId,
      model,
    };
  }
}
