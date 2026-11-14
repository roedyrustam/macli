import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface McpServerConfig {
  type?: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * Manages stdio connections and tool invocations against external MCP servers.
 */
export class McpClientManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();

  public async connectServer(
    name: string,
    config: McpServerConfig,
    timeoutMs: number = 5000
  ): Promise<Client | null> {
    if (!config.command) {
      return null;
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      cwd: config.cwd,
      stderr: 'pipe',
      env: { ...(process.env as Record<string, string>), ...(config.env || {}) },
    });

    const client = new Client(
      { name: 'macli-client', version: '2.0.0' },
      { capabilities: {} }
    );

    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        client.connect(transport),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Connection timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);

      if (timer) clearTimeout(timer);
      this.transports.set(name, transport);
      this.clients.set(name, client);
      return client;
    } catch (error: unknown) {
      if (timer) clearTimeout(timer);
      try {
        await transport.close();
      } catch (closeErr: unknown) {
        void closeErr;
      }
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[MCP] Skipping unavailable server "${name}": ${message}\n`);
      return null;
    }
  }

  public async getTools(name: string) {
    const client = this.clients.get(name);
    if (!client) return [];

    try {
      const result = await client.listTools();
      return result.tools;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[MCP] Failed to list tools from "${name}": ${message}\n`);
      return [];
    }
  }

  public async executeTool(serverName: string, toolName: string, args: Record<string, unknown>) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP Client ${serverName} is not connected.`);
    }

    return client.callTool({
      name: toolName,
      arguments: args,
    });
  }

  public getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  public async disconnectAll(): Promise<void> {
    for (const [, transport] of this.transports.entries()) {
      try {
        await transport.close();
      } catch (err: unknown) {
        void err;
      }
    }
    this.transports.clear();
    this.clients.clear();
  }
}
