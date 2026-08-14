import { App } from 'obsidian';

export class SecretManager {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Retrieves the secret value associated with the given secret name using SecretStorage API or fallback.
   */
  getSecret(secretName: string): string | null {
    if (!secretName) {
      return null;
    }

    const secretStorage = (this.app as any).secretStorage;
    if (secretStorage && typeof secretStorage.getSecret === 'function') {
      const secret = secretStorage.getSecret(secretName);
      if (secret) return secret;
    }

    try {
      const localVal = window.localStorage.getItem(`oh_bot_${secretName}`);
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

    const secretStorage = (this.app as any).secretStorage;
    if (secretStorage && typeof secretStorage.setSecret === 'function') {
      secretStorage.setSecret(secretName, value);
    }

    try {
      if (value) {
        window.localStorage.setItem(`oh_bot_${secretName}`, value);
      } else {
        window.localStorage.removeItem(`oh_bot_${secretName}`);
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
