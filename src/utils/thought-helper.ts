export interface ParsedMessageContent {
  thoughts: string[];
  finalAnswer: string;
}

/**
 * Parses out <thought>...</thought> or <think>...</think> blocks from message content.
 */
export function parseThoughts(raw: string): ParsedMessageContent {
  if (!raw) {
    return { thoughts: [], finalAnswer: '' };
  }

  const thoughts: string[] = [];

  // Match closed thought tags
  let clean = raw.replace(/<(?:thought|think)>([\s\S]*?)<\/(?:thought|think)>/gi, (_, thoughtContent) => {
    const trimmed = thoughtContent.trim();
    if (trimmed) {
      thoughts.push(trimmed);
    }
    return '';
  });

  // Check for open unclosed thought tag (during streaming)
  const openMatch = clean.match(/<(?:thought|think)>([\s\S]*)$/i);
  if (openMatch) {
    const trimmed = openMatch[1].trim();
    if (trimmed) {
      thoughts.push(trimmed);
    }
    clean = clean.slice(0, openMatch.index);
  }

  return {
    thoughts,
    finalAnswer: clean.trim(),
  };
}
