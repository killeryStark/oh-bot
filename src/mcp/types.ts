import { ToolSchema } from '../types';

export type McpAuthType = 'none' | 'bearer' | 'custom_headers' | 'oauth2';

export interface McpOAuthConfig {
  clientId?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  accessTokenSecretName: string;
  refreshTokenSecretName?: string;
  expiresAt?: number;
}

export interface McpServerConfig {
  id: string;
  name: string;
  description?: string;
  url: string;
  enabled: boolean;
  authType: McpAuthType;
  apiKeySecretName?: string;
  customHeaderName?: string;
  oauthConfig?: McpOAuthConfig;
  cachedTools?: ToolSchema[];
  lastConnected?: number;
  lastError?: string;
}

export interface McpCatalogItem {
  id: string;
  name: string;
  description: string;
  url: string;
  authType: McpAuthType;
  authDescription?: string;
  docUrl?: string;
  tags?: string[];
  oauthDefaults?: {
    authorizationUrl: string;
    tokenUrl: string;
    clientId?: string;
    scopes?: string[];
  };
}

export interface McpCatalogManifest {
  version: string;
  servers: McpCatalogItem[];
}

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, any>;
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}
