import { requestUrl } from 'obsidian';
import { SecretManager } from '../utils/secrets';
import { McpServerConfig } from './types';

export interface PendingOAuthState {
  serverId: string;
  codeVerifier: string;
  tokenUrl: string;
  clientId?: string;
  accessTokenSecretName: string;
  refreshTokenSecretName?: string;
  createdAt: number;
}

export class McpOAuthHelper {
  private static pendingStates: Map<string, PendingOAuthState> = new Map();

  /**
   * Generates a cryptographically random string for PKCE and state verification.
   */
  static generateRandomString(length: number = 43): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomValues = new Uint8Array(length);
    window.crypto.getRandomValues(randomValues);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[randomValues[i] % charset.length];
    }
    return result;
  }

  /**
   * Computes SHA-256 base64url-encoded code challenge from code_verifier.
   */
  static async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Prepares and starts the PKCE authorization flow, returning the authorization URL to open.
   */
  static async startOAuthFlow(server: McpServerConfig): Promise<string> {
    const oauth = server.oauthConfig;
    if (!oauth || !oauth.authorizationUrl || !oauth.tokenUrl) {
      throw new Error(`Server "${server.name}" has incomplete OAuth configuration.`);
    }

    if (!oauth.clientId) {
      throw new Error(`OAuth login requires a registered Client ID. For ${server.name}, please use your Personal API Token (Bearer Auth) instead.`);
    }

    const state = this.generateRandomString(32);
    const codeVerifier = this.generateRandomString(64);
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    this.pendingStates.set(state, {
      serverId: server.id,
      codeVerifier,
      tokenUrl: oauth.tokenUrl,
      clientId: oauth.clientId,
      accessTokenSecretName: oauth.accessTokenSecretName || `oh_bot_secret_mcp_${server.id}_access`,
      refreshTokenSecretName: oauth.refreshTokenSecretName || `oh_bot_secret_mcp_${server.id}_refresh`,
      createdAt: Date.now(),
    });

    // Clean up old pending states (older than 15 minutes)
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [key, val] of this.pendingStates.entries()) {
      if (val.createdAt < cutoff) {
        this.pendingStates.delete(key);
      }
    }

    const authUrl = new URL(oauth.authorizationUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', 'obsidian://oh-bot-mcp-auth');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    if (oauth.clientId) {
      authUrl.searchParams.set('client_id', oauth.clientId);
    }
    if (oauth.scopes && oauth.scopes.length > 0) {
      authUrl.searchParams.set('scope', oauth.scopes.join(' '));
    }

    return authUrl.toString();
  }

  /**
   * Handles the OAuth callback from `obsidian://oh-bot-mcp-auth?code=...&state=...`
   */
  static async handleCallback(
    params: Record<string, string>,
    secretManager: SecretManager
  ): Promise<{ serverId: string; success: boolean; error?: string }> {
    const code = params.code;
    const state = params.state;
    const errorParam = params.error || params.error_description;

    if (errorParam) {
      return { serverId: '', success: false, error: `OAuth provider error: ${errorParam}` };
    }

    if (!code || !state) {
      return { serverId: '', success: false, error: 'Missing code or state parameters in OAuth callback.' };
    }

    const pending = this.pendingStates.get(state);
    if (!pending) {
      return { serverId: '', success: false, error: 'Invalid or expired OAuth state session.' };
    }

    this.pendingStates.delete(state);

    try {
      const bodyParams: Record<string, string> = {
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'obsidian://oh-bot-mcp-auth',
        code_verifier: pending.codeVerifier,
      };

      if (pending.clientId) {
        bodyParams.client_id = pending.clientId;
      }

      // Convert bodyParams to URLSearchParams string
      const formBody = new URLSearchParams(bodyParams).toString();

      const response = await requestUrl({
        url: pending.tokenUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: formBody,
        throw: false,
      });

      if (response.status < 200 || response.status >= 300) {
        return {
          serverId: pending.serverId,
          success: false,
          error: `Token exchange failed (HTTP ${response.status}): ${response.text}`,
        };
      }

      const tokenData = typeof response.json === 'object' ? response.json : JSON.parse(response.text);
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;

      if (!accessToken) {
        return {
          serverId: pending.serverId,
          success: false,
          error: 'Token response did not contain an access_token.',
        };
      }

      // Store tokens securely in SecretManager
      secretManager.setSecret(pending.accessTokenSecretName, accessToken);
      if (refreshToken && pending.refreshTokenSecretName) {
        secretManager.setSecret(pending.refreshTokenSecretName, refreshToken);
      }

      return { serverId: pending.serverId, success: true };
    } catch (err: any) {
      return {
        serverId: pending.serverId,
        success: false,
        error: `OAuth token exchange failed: ${err.message}`,
      };
    }
  }
}
