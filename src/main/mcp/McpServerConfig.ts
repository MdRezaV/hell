export interface McpServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'sse' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  enabled: boolean
}

export interface McpWorkspaceConfig {
  servers: McpServerConfig[]
}

export interface McpToolInfo {
  serverId: string
  serverName: string
  toolName: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpToolResult {
  success: boolean
  content: string
  isError: boolean
  error?: string
}

export const DEFAULT_MCP_SERVERS: McpServerConfig[] = [
  {
    id: 'shadcn',
    name: 'shadcn/ui',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/shadcn-mcp@latest'],
    enabled: true
  }
]