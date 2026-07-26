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