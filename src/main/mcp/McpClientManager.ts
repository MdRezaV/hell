import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { log } from '../logger'
import {
  DEFAULT_MCP_SERVERS,
  type McpServerConfig,
  type McpToolInfo,
  type McpToolResult
} from './McpServerConfig'

interface ManagedConnection {
  client: Client
  tools: McpToolInfo[]
}

const TOOL_CALL_TIMEOUT_MS = 30_000

class McpClientManager {
  private connections = new Map<string, ManagedConnection>()
  private connecting = new Map<string, Promise<ManagedConnection>>()

  async loadAppConfig(): Promise<McpServerConfig[]> {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    try {
      const content = await readFile(settingsPath, 'utf-8')
      const settings = JSON.parse(content) as { mcpServers?: McpServerConfig[] }
      if (Array.isArray(settings.mcpServers) && settings.mcpServers.length > 0) {
        return settings.mcpServers
      }
    } catch {
      /* settings file missing or malformed — fall through to defaults */
    }
    return DEFAULT_MCP_SERVERS.map((s) => ({ ...s }))
  }

  async loadWorkspaceConfig(workspacePath: string): Promise<McpServerConfig[]> {
    const configPath = join(workspacePath, '.hell', 'mcp.json')
    try {
      const content = await readFile(configPath, 'utf-8')
      const parsed = JSON.parse(content) as { servers?: McpServerConfig[] }
      return Array.isArray(parsed.servers) ? parsed.servers : []
    } catch {
      return []
    }
  }

  async saveWorkspaceConfig(
    workspacePath: string,
    servers: McpServerConfig[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const dir = join(workspacePath, '.hell')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'mcp.json'), JSON.stringify({ servers }, null, 2), 'utf-8')
      return { success: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error('Failed to save workspace MCP config:', msg)
      return { success: false, error: msg }
    }
  }

  async getMergedServers(workspacePath: string | null): Promise<McpServerConfig[]> {
    const appServers = await this.loadAppConfig()
    if (!workspacePath) return appServers
    const wsServers = await this.loadWorkspaceConfig(workspacePath)
    const merged = new Map<string, McpServerConfig>()
    for (const s of appServers) merged.set(s.id, s)
    for (const s of wsServers) merged.set(s.id, s)
    return [...merged.values()]
  }

  private createTransport(config: McpServerConfig): StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport {
    if (config.transport === 'stdio') {
      return new StdioClientTransport({
        command: config.command ?? 'npx',
        args: config.args ?? [],
        env: config.env ? { ...process.env, ...config.env } : undefined
      })
    }
    if (config.transport === 'sse') {
      return new SSEClientTransport(new URL(config.url ?? 'http://localhost:3000/sse'), {
        requestInit: { headers: config.headers }
      })
    }
    return new StreamableHTTPClientTransport(
      new URL(config.url ?? 'http://localhost:3000/mcp'),
      { requestInit: { headers: config.headers } }
    )
  }

  private async connectServer(config: McpServerConfig): Promise<ManagedConnection> {
    const existing = this.connections.get(config.id)
    if (existing) return existing

    const inFlight = this.connecting.get(config.id)
    if (inFlight) return inFlight

    const promise = (async (): Promise<ManagedConnection> => {
      const client = new Client({ name: 'hell', version: '1.0.0' })
      const transport = this.createTransport(config)
      await client.connect(transport)

      const { tools } = await client.listTools()
      const toolInfos: McpToolInfo[] = (tools ?? []).map((t) => ({
        serverId: config.id,
        serverName: config.name,
        toolName: t.name,
        description: t.description ?? '',
        inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>
      }))

      const conn: ManagedConnection = { client, tools: toolInfos }
      this.connections.set(config.id, conn)
      log.info(`MCP server '${config.id}' connected (${toolInfos.length} tools)`)
      return conn
    })()

    this.connecting.set(config.id, promise)
    try {
      return await promise
    } finally {
      this.connecting.delete(config.id)
    }
  }

  async getAllTools(workspacePath: string | null): Promise<McpToolInfo[]> {
    const servers = await this.getMergedServers(workspacePath)
    const enabled = servers.filter((s) => s.enabled)
    const allTools: McpToolInfo[] = []

    await Promise.allSettled(
      enabled.map(async (config) => {
        try {
          const conn = await this.connectServer(config)
          allTools.push(...conn.tools)
        } catch (e) {
          log.error(`MCP server '${config.id}' failed to connect:`, e)
        }
      })
    )

    return allTools
  }

  async callTool(
    workspacePath: string | null,
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    try {
      const servers = await this.getMergedServers(workspacePath)
      const config = servers.find((s) => s.id === serverId)
      if (!config) {
        return { success: false, content: '', isError: true, error: `Server '${serverId}' not found` }
      }
      if (!config.enabled) {
        return { success: false, content: '', isError: true, error: `Server '${serverId}' is disabled` }
      }

      const conn = await this.connectServer(config)

      const result = await Promise.race([
        conn.client.callTool({ name: toolName, arguments: args }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool call timed out after ${TOOL_CALL_TIMEOUT_MS}ms`)), TOOL_CALL_TIMEOUT_MS)
        )
      ])

      const textParts: string[] = []
      if (Array.isArray(result.content)) {
        for (const part of result.content) {
          if (part && typeof part === 'object' && 'type' in part && part.type === 'text' && 'text' in part) {
            textParts.push(String(part.text))
          }
        }
      }

      return {
        success: true,
        content: textParts.join('\n'),
        isError: result.isError === true
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`MCP tool call failed (${serverId}/${toolName}):`, msg)
      return { success: false, content: '', isError: true, error: msg }
    }
  }

  async getServerStatus(
    workspacePath: string | null
  ): Promise<Array<{ id: string; connected: boolean; toolCount: number }>> {
    const servers = await this.getMergedServers(workspacePath)
    return servers.map((s) => {
      const conn = this.connections.get(s.id)
      return {
        id: s.id,
        connected: !!conn,
        toolCount: conn?.tools.length ?? 0
      }
    })
  }

  async disconnectServer(serverId: string): Promise<void> {
    const conn = this.connections.get(serverId)
    if (conn) {
      try {
        await conn.client.close()
      } catch (e) {
        log.error(`Error closing MCP server '${serverId}':`, e)
      }
      this.connections.delete(serverId)
    }
  }

  async shutdown(): Promise<void> {
    const ids = [...this.connections.keys()]
    await Promise.allSettled(ids.map((id) => this.disconnectServer(id)))
    log.info('All MCP connections closed')
  }
}

export const mcpManager = new McpClientManager()