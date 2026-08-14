import { App } from 'obsidian';

export class SecretManager {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  private normalizeKey(secretName: string): string {
    return secretName.startsWith('oh_bot_') ? secretName : `oh_bot_${secretName}`;
  }

  /**
   * Retrieves the secret value associated with the given secret name using SecretStorage API or fallback.
   */
  getSecret(secretName: string): string | null {
    if (!secretName) {
      return null;
    }

    const key = this.normalizeKey(secretName);

    try {
      const secretStorage = (this.app as any).secretStorage;
      if (secretStorage && typeof secretStorage.getSecret === 'function') {
        const secret = secretStorage.getSecret(key) || secretStorage.getSecret(secretName);
        if (secret) return secret;
      }
    } catch (e) {
      // Ignore secretStorage errors
    }

    try {
      const localVal = window.localStorage.getItem(key) || window.localStorage.getItem(secretName);
      if (localVal) return localVal;
    } catch (e) {
      // Ignore localStorage errors
    }

    return null;
  }

  /**
   * Stores secret value in SecretStorage and local storage fallback.
   */
  setSecret(secretName: string, value: string): void {
    if (!secretName) return;

    const key = this.normalizeKey(secretName);

    try {
      const secretStorage = (this.app as any).secretStorage;
      if (secretStorage && typeof secretStorage.setSecret === 'function') {
        secretStorage.setSecret(key, value);
        secretStorage.setSecret(secretName, value);
      }
    } catch (e) {
      // Ignore secretStorage errors
    }

    try {
      if (value) {
        window.localStorage.setItem(key, value);
        window.localStorage.setItem(secretName, value);
      } else {
        window.localStorage.removeItem(key);
        window.localStorage.removeItem(secretName);
      }
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Checks if a secret is present and non-empty.
   */
  hasSecret(secretName: string): boolean {
    const val = this.getSecret(secretName);
    return !!val && val.trim().length > 0;
  }
}
