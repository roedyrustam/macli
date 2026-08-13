import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class McpClientManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();

  public async connectServer(name: string, config: McpServerConfig): Promise<Client | null> {
    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...(process.env as Record<string, string>), ...(config.env || {}) }
      });

      const client = new Client(
        { name: 'macli-client', version: '1.0.0' },
        { capabilities: {} }
      );

      await client.connect(transport);
      
      this.transports.set(name, transport);
      this.clients.set(name, client);
      
      return client;
    } catch (error) {
      console.warn(`[MCP] Gagal menghubungkan ke server MCP "${name}":`, error);
      return null;
    }
  }

  public async getTools(name: string) {
    const client = this.clients.get(name);
    if (!client) return [];
    
    try {
      const result = await client.listTools();
      return result.tools;
    } catch (error) {
      console.warn(`[MCP] Gagal mendapatkan list tools dari server "${name}":`, error);
      return [];
    }
  }
  
  public async executeTool(serverName: string, toolName: string, args: any) {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP Client ${serverName} tidak terhubung.`);
    
    const result = await client.callTool({
      name: toolName,
      arguments: args
    });
    
    return result;
  }

  public async disconnectAll() {
    for (const [name, transport] of this.transports.entries()) {
      try {
        await transport.close();
      } catch (e) {}
    }
  }
}
