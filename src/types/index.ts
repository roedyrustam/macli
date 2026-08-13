export interface Skill {
  id: string;
  name: string;
  description: string;
  source: 'antigravity' | 'claude' | 'mcp_server';
  content?: string;
  mcpServerName?: string; // If this is an MCP tool
  mcpToolArgsSchema?: any; // Input schema for MCP
  metadata?: Record<string, any>;
}

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}
