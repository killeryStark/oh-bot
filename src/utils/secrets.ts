import { App } from 'obsidian';

export class SecretManager {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Retrieves the secret value associated with the given secret name using SecretStorage API.
   */
  getSecret(secretName: string): string | null {
    if (!secretName) {
      return null;
    }

    // Access app.secretStorage provided by Obsidian v1.6+
    const secretStorage = (this.app as any).secretStorage;
    if (secretStorage && typeof secretStorage.getSecret === 'function') {
      const secret = secretStorage.getSecret(secretName);
      return secret || null;
    }

    return null;
  }
}
