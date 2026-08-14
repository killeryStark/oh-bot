import { requestUrl, RequestUrlParam } from 'obsidian';
import { ToolResult, ToolSchema } from '../types';
import { McpAuthType, McpJsonRpcRequest, McpJsonRpcResponse, McpToolDefinition } from './types';

export interface McpClientOptions {
  url: string;
  authType: McpAuthType;
  authToken?: string;
  customHeaderName?: string;
  timeoutMs?: number;
}

export class McpClient {
  private url: string;
  private authType: McpAuthType;
  private authToken?: string;
  private customHeaderName?: string;
  private timeoutMs: number;
  private postUrl: string | null = null;
  private nextRequestId: number = 1;

  constructor(options: McpClientOptions) {
    this.url = options.url.trim().replace(/\/+$/, '');
    this.authType = options.authType;
    this.authToken = options.authToken;
    this.customHeaderName = options.customHeaderName;
    this.timeoutMs = options.timeoutMs || 30000;
  }

  /**
   * Generates authorization & common HTTP headers.
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/event-stream, text/plain, */*',
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      if (this.authType === 'bearer' || this.authType === 'oauth2') {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      } else if (this.authType === 'custom_headers' && this.customHeaderName) {
        headers[this.customHeaderName] = this.authToken;
      }
    }

    return headers;
  }

  /**
   * Discovers the POST endpoint for message exchange.
   * Handles standard MCP SSE endpoints (which yield an 'endpoint' event)
   * or fallback to direct POST on the provided URL.
   */
  private async discoverEndpoint(): Promise<string> {
    if (this.postUrl) {
      return this.postUrl;
    }

    try {
      // 1. Try SSE handshake via fetch with stream reading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 8000));

      const sseHeaders = { ...this.getHeaders(), 'Accept': 'text/event-stream' };
      const response = await fetch(this.url, {
        method: 'GET',
        headers: sseHeaders,
        signal: controller.signal,
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Read first few chunks looking for the endpoint event
        for (let i = 0; i < 5; i++) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE lines
          const lines = buffer.split('\n');
          for (let j = 0; j < lines.length; j++) {
            const line = lines[j].trim();
            if (line.startsWith('event: endpoint') || line.startsWith('event: message')) {
              const dataLine = lines.slice(j + 1).find(l => l.trim().startsWith('data:'));
              if (dataLine) {
                const endpointData = dataLine.replace(/^data:\s*/, '').trim();
                reader.cancel();
                clearTimeout(timeoutId);

                // Resolve relative URL
                if (endpointData.startsWith('http://') || endpointData.startsWith('https://')) {
                  this.postUrl = endpointData;
                } else {
                  const base = new URL(this.url);
                  const resolved = new URL(endpointData, base.origin);
                  this.postUrl = resolved.toString();
                }
                return this.postUrl;
              }
            }
          }
        }
        reader.cancel();
      }
      clearTimeout(timeoutId);
    } catch (err) {
      // Ignore SSE handshake error and fallback to direct URL
    }

    // Direct HTTP POST fallback (Standard Streamable HTTP MCP)
    this.postUrl = this.url;
    return this.postUrl;
  }

  /**
   * Sends a JSON-RPC request to the MCP server.
   */
  private async sendJsonRpc(method: string, params?: Record<string, any>): Promise<any> {
    const postEndpoint = await this.discoverEndpoint();
    const requestId = this.nextRequestId++;

    const payload: McpJsonRpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    const reqOptions: RequestUrlParam = {
      url: postEndpoint,
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      throw: false,
    };

    const res = await requestUrl(reqOptions);

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Authentication error (${res.status}): Please check API Token or OAuth permissions.`);
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`MCP Server HTTP ${res.status}: ${res.text || 'Request failed'}`);
    }

    let json: McpJsonRpcResponse;
    try {
      json = typeof res.json === 'object' ? res.json : JSON.parse(res.text);
    } catch (e) {
      throw new Error(`Failed to parse JSON-RPC response: ${res.text}`);
    }

    if (json.error) {
      throw new Error(`MCP Error [${json.error.code}]: ${json.error.message}`);
    }

    return json.result;
  }

  /**
   * Initializes session with the MCP server.
   */
  async initialize(): Promise<void> {
    const initResult = await this.sendJsonRpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: false },
        sampling: {},
      },
      clientInfo: {
        name: 'obsidian-harness-bot',
        version: '1.0.0',
      },
    });

    // Send initialized notification (optional in some implementations, standard in MCP spec)
    try {
      const postEndpoint = await this.discoverEndpoint();
      await requestUrl({
        url: postEndpoint,
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }),
        throw: false,
      });
    } catch (e) {
      // Ignored for notifications
    }
  }

  /**
   * Fetches the list of tools exposed by the MCP server.
   */
  async listTools(): Promise<ToolSchema[]> {
    let result: any;
    try {
      result = await this.sendJsonRpc('tools/list', {});
    } catch (err: any) {
      // If server requires initialize first, try to initialize once
      await this.initialize();
      result = await this.sendJsonRpc('tools/list', {});
    }

    const tools: McpToolDefinition[] = result?.tools || [];
    const schemas: ToolSchema[] = [];

    for (const tool of tools) {
      const inputSchema = tool.inputSchema || { type: 'object', properties: {} };
      schemas.push({
        name: tool.name,
        description: tool.description || `Tool provided by MCP Server (${tool.name})`,
        parameters: {
          type: 'object',
          properties: inputSchema.properties || {},
          required: inputSchema.required || [],
        },
      });
    }

    return schemas;
  }

  /**
   * Calls a remote MCP tool and formats the response as a ToolResult.
   */
  async callTool(name: string, args: Record<string, any>): Promise<ToolResult> {
    try {
      const result = await this.sendJsonRpc('tools/call', {
        name,
        arguments: args,
      });

      if (!result) {
        return {
          success: true,
          output: 'Tool executed successfully with empty result.',
        };
      }

      // Handle standard MCP CallToolResult structure
      if (Array.isArray(result.content)) {
        const textParts = result.content
          .map((item: any) => {
            if (item.type === 'text') return item.text;
            if (item.type === 'resource') return JSON.stringify(item.resource, null, 2);
            return JSON.stringify(item);
          })
          .join('\n');

        if (result.isError) {
          return {
            success: false,
            output: '',
            error: textParts || 'MCP Tool reported an error during execution.',
          };
        }

        return {
          success: true,
          output: textParts || 'Success',
        };
      }

      if (typeof result === 'string') {
        return { success: true, output: result };
      }

      return {
        success: true,
        output: JSON.stringify(result, null, 2),
      };
    } catch (err: any) {
      return {
        success: false,
        output: '',
        error: `MCP callTool "${name}" failed: ${err.message}`,
      };
    }
  }
}
