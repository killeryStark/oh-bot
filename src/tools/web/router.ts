import { App } from 'obsidian';
import { HarnessSettings, SearchProviderType } from '../../types';
import { SecretManager } from '../../utils/secrets';
import { DuckDuckGoAdapter } from './adapters/duckduckgo';
import { SearXNGAdapter } from './adapters/searxng';
import { TavilyAdapter } from './adapters/tavily';
import { SearchProvider, SearchResultItem } from './types';

export class SearchEngineRouter implements SearchProvider {
  private settings: HarnessSettings;
  private secretManager?: SecretManager;

  constructor(settings: HarnessSettings, secretManagerOrApp?: SecretManager | App) {
    this.settings = settings;
    if (secretManagerOrApp) {
      if (secretManagerOrApp instanceof SecretManager) {
        this.secretManager = secretManagerOrApp;
      } else if (typeof (secretManagerOrApp as any)?.getSecret === 'function') {
        this.secretManager = secretManagerOrApp as unknown as SecretManager;
      } else {
        this.secretManager = new SecretManager(secretManagerOrApp as App);
      }
    }
  }

  /**
   * Updates the router's settings reference.
   */
  updateSettings(settings: HarnessSettings): void {
    this.settings = settings;
  }

  /**
   * Resolves the configured SearchProvider adapter based on current settings.
   */
  getAdapter(overrideProvider?: SearchProviderType): SearchProvider {
    const provider = overrideProvider || this.settings.searchProvider || 'duckduckgo';

    switch (provider) {
      case 'searxng': {
        const searxngUrl = this.settings.searxngUrl || 'http://localhost:8080';
        return new SearXNGAdapter(searxngUrl);
      }
      case 'tavily': {
        const secretName = this.settings.tavilyApiKeySecretName || 'oh_bot_secret_tavily';
        const apiKey = this.secretManager ? (this.secretManager.getSecret(secretName) || '') : '';
        return new TavilyAdapter(apiKey);
      }
      case 'duckduckgo':
      default:
        return new DuckDuckGoAdapter();
    }
  }

  /**
   * Executes a search query using the active search provider adapter.
   */
  async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    const adapter = this.getAdapter();
    return await adapter.search(query, limit);
  }
}
