import { safeHandle } from '../ipc'
import { mcpManager } from './McpClientManager'
import type { McpServerConfig } from './McpServerConfig'

export function registerMcpIpcHandlers(): void {
  safeHandle('mcp:get-servers', async (_, workspacePath: string | null) => {
    return mcpManager.getMergedServers(workspacePath)
  })

  safeHandle('mcp:get-tools', async (_, workspacePath: string | null) => {
    return mcpManager.getAllTools(workspacePath)
  })

  safeHandle(
    'mcp:call-tool',
    async (
      _,
      workspacePath: string | null,
      serverId: string,
      toolName: string,
      args: Record<string, unknown>
    ) => {
      return mcpManager.callTool(workspacePath, serverId, toolName, args)
    }
  )

  safeHandle('mcp:server-status', async (_, workspacePath: string | null) => {
    return mcpManager.getServerStatus(workspacePath)
  })

  safeHandle('mcp:disconnect-server', async (_, serverId: string) => {
    await mcpManager.disconnectServer(serverId)
  })

  safeHandle(
    'mcp:save-workspace-config',
    async (_, workspacePath: string, servers: McpServerConfig[]) => {
      return mcpManager.saveWorkspaceConfig(workspacePath, servers)
    }
  )

  safeHandle('mcp:load-workspace-config', async (_, workspacePath: string) => {
    return mcpManager.loadWorkspaceConfig(workspacePath)
  })
}