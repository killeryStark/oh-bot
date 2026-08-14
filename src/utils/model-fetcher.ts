import { requestUrl } from 'obsidian';

/**
 * Queries an OpenAI-compatible /models endpoint to retrieve available model IDs.
 */
export async function fetchAvailableModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  try {
    let cleanBase = baseUrl.replace(/\/+$/, '');
    if (!cleanBase.endsWith('/models')) {
      cleanBase = cleanBase + '/models';
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await requestUrl({
      url: cleanBase,
      method: 'GET',
      headers,
    });

    const data = res.json;
    if (data && Array.isArray(data.data)) {
      return data.data
        .map((m: any) => m.id || m.name)
        .filter((id: any) => typeof id === 'string')
        .sort();
    } else if (Array.isArray(data)) {
      return data
        .map((m: any) => (typeof m === 'string' ? m : m.id || m.name))
        .filter((id: any) => typeof id === 'string')
        .sort();
    }

    return [];
  } catch (err) {
    console.error('Failed to fetch models from endpoint:', err);
    return [];
  }
}
