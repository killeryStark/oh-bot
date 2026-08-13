export interface SSEEvent {
  event?: string;
  data: string;
}

export class SSEStreamParser {
  private buffer = '';

  /**
   * Processes a chunk of string text and extracts completed SSE event lines.
   */
  feed(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const events: SSEEvent[] = [];
    const lines = this.buffer.split('\n');

    // Keep unfinished tail in buffer
    this.buffer = lines.pop() || '';

    let currentEvent: Partial<SSEEvent> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentEvent.data !== undefined) {
          events.push(currentEvent as SSEEvent);
          currentEvent = {};
        }
        continue;
      }

      if (trimmed.startsWith('event:')) {
        currentEvent.event = trimmed.substring(6).trim();
      } else if (trimmed.startsWith('data:')) {
        const dataPart = trimmed.substring(5).trim();
        if (currentEvent.data) {
          currentEvent.data += '\n' + dataPart;
        } else {
          currentEvent.data = dataPart;
        }
      }
    }

    return events;
  }
}
