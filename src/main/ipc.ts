import { BrowserWindow, dialog, ipcMain } from 'electron'
import { dirname, join } from 'path'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { formatTreeText, readDirTree } from './fsUtils'
import {
  batchRemoveFileStates,
  batchSetFileStates,
  clearAllData,
  clearFileStates,
  createChatSession,
  deleteChatSession,
  getChatSession,
  getChatSessions,
  getLastWorkspace,
  getWorkspaceState,
  pruneWorkspaceState,
  removeFileState,
  setDirExpanded,
  setFileState,
  snapshotWorkspaceStateToSession,
  touchWorkspace,
  updateChatSession
} from './database'
import { startWatching, stopWatching } from './watcher'
import { log } from './logger'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeHandle(channel: string, fn: (...args: any[]) => any): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args)
    } catch (e) {
      log.error(`IPC handler '${channel}' failed:`, e)
      throw e
    }
  })
}

export function registerIpcHandlers(): void {
  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  safeHandle('open-workspace', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    log.info('Workspace opened:', result.filePaths[0])
    return result.filePaths[0]
  })

  safeHandle('read-file', async (_, workspace: string, relativePath: string) => {
    const fullPath = join(workspace, relativePath)
    if (!existsSync(fullPath)) {
      return { exists: false, error: false, content: null }
    }
    try {
      const content = readFileSync(fullPath, 'utf-8')
      return { exists: true, error: false, content }
    } catch (e) {
      log.error('Failed to read file:', relativePath, e)
      return { exists: true, error: true, content: null }
    }
  })

  safeHandle('write-file', async (_, workspace: string, relativePath: string, content: string) => {
    try {
      const fullPath = join(workspace, relativePath)
      mkdirSync(dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, content, 'utf-8')
      return { success: true }
    } catch (e: unknown) {
      log.error('Failed to write file:', relativePath, e)
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  safeHandle('delete-file', async (_, workspace: string, relativePath: string) => {
    try {
      const fullPath = join(workspace, relativePath)
      unlinkSync(fullPath)
      return { success: true }
    } catch (e: unknown) {
      log.error('Failed to delete file:', relativePath, e)
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  safeHandle('db:get-last-workspace', async () => {
    const path = getLastWorkspace()
    if (path && existsSync(path)) return path
    return null
  })

  safeHandle('db:touch-workspace', async (_, workspacePath: string) => {
    touchWorkspace(workspacePath)
  })

  safeHandle('db:get-workspace-state', async (_, workspacePath: string) => {
    return getWorkspaceState(workspacePath)
  })

  safeHandle(
    'db:set-file-state',
    async (_, workspacePath: string, absolutePath: string, tag: string) => {
      setFileState(workspacePath, absolutePath, tag)
    }
  )

  safeHandle('db:remove-file-state', async (_, workspacePath: string, absolutePath: string) => {
    removeFileState(workspacePath, absolutePath)
  })

  safeHandle(
    'db:batch-set-file-states',
    async (_, workspacePath: string, states: Array<{ absolutePath: string; tag: string }>) => {
      batchSetFileStates(workspacePath, states)
    }
  )

  safeHandle(
    'db:batch-remove-file-states',
    async (_, workspacePath: string, absolutePaths: string[]) => {
      batchRemoveFileStates(workspacePath, absolutePaths)
    }
  )

  safeHandle('db:clear-file-states', async (_, workspacePath: string) => {
    clearFileStates(workspacePath)
  })

  safeHandle('db:clear-all', async () => {
    clearAllData()
  })

  safeHandle(
    'db:set-dir-expanded',
    async (_, workspacePath: string, absolutePath: string, expanded: boolean) => {
      setDirExpanded(workspacePath, absolutePath, expanded)
    }
  )

  safeHandle('workspace:watch', async (event, workspacePath: string | null) => {
    if (!workspacePath) {
      stopWatching()
      return
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    startWatching(workspacePath, () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('workspace:changed')
      }
    })
  })

  safeHandle(
    'db:prune-workspace-state',
    async (_, workspacePath: string, validFilePaths: string[], validDirPaths: string[]) => {
      pruneWorkspaceState(workspacePath, validFilePaths, validDirPaths)
    }
  )

  safeHandle(
    'db:create-chat-session',
    async (
      _,
      workspacePath: string | null,
      title: string,
      messages: string,
      fileStates?: string,
      expandedDirs?: string,
      dirStructureTag?: string
    ) => {
      if (fileStates !== undefined && expandedDirs !== undefined) {
        return createChatSession(
          workspacePath,
          title,
          messages,
          fileStates,
          expandedDirs,
          dirStructureTag
        )
      }
      if (workspacePath) {
        const snapshot = snapshotWorkspaceStateToSession(workspacePath)
        return createChatSession(
          workspacePath,
          title,
          messages,
          snapshot.fileStates,
          snapshot.expandedDirs,
          dirStructureTag
        )
      }
      return createChatSession(
        workspacePath,
        title,
        messages,
        undefined,
        undefined,
        dirStructureTag
      )
    }
  )

  safeHandle(
    'db:update-chat-session',
    async (
      _,
      id: string,
      title: string,
      messages: string,
      fileStates?: string,
      expandedDirs?: string,
      dirStructureTag?: string
    ) => {
      if (fileStates !== undefined && expandedDirs !== undefined) {
        updateChatSession(id, title, messages, fileStates, expandedDirs, dirStructureTag)
      } else {
        const session = getChatSession(id)
        if (session?.workspace_path) {
          const snapshot = snapshotWorkspaceStateToSession(session.workspace_path)
          updateChatSession(
            id,
            title,
            messages,
            snapshot.fileStates,
            snapshot.expandedDirs,
            dirStructureTag
          )
        } else {
          updateChatSession(id, title, messages, undefined, undefined, dirStructureTag)
        }
      }
    }
  )

  safeHandle('db:get-chat-sessions', async (_, workspacePath: string | null) => {
    return getChatSessions(workspacePath)
  })

  safeHandle('db:get-chat-session', async (_, id: string) => {
    return getChatSession(id)
  })

  safeHandle('db:delete-chat-session', async (_, id: string) => {
    deleteChatSession(id)
  })

  safeHandle('read-directory', async (_, dirPath: string) => {
    return await readDirTree(dirPath, [], true)
  })

  safeHandle('search-file-content', async (_, workspace: string, query: string) => {
    const q = query.toLowerCase()
    const tree = await readDirTree(workspace, [], true)
    const result: string[] = []

    async function walk(nodes: typeof tree): Promise<void> {
      for (const node of nodes) {
        if (node.type === 'file' && !node.isBinary) {
          try {
            const stream = createReadStream(node.path, {
              encoding: 'utf-8',
              highWaterMark: 64 * 1024
            })
            let found = false
            let overlap = ''
            const overlapSize = Math.max(0, q.length - 1)

            for await (const chunk of stream) {
              const text = overlap + chunk
              if (text.toLowerCase().includes(q)) {
                found = true
                stream.destroy()
                break
              }
              overlap = text.length > overlapSize ? text.slice(-overlapSize) : text
            }
            if (found) result.push(node.path)
          } catch {
            /* skip unreadable files */
          }
        }
        if (node.children) await walk(node.children)
      }
    }

    await walk(tree)
    return result
  })

  safeHandle('count-lines', async (_, workspace: string, relativePaths: string[]) => {
    let total = 0
    for (const rel of relativePaths) {
      const fullPath = join(workspace, rel)
      if (!existsSync(fullPath)) continue
      try {
        const content = readFileSync(fullPath, 'utf-8')
        if (content.length === 0) continue
        let newlines = 0
        for (let i = 0; i < content.length; i++) {
          if (content[i] === '\n') newlines++
        }
        total += newlines + 1
      } catch (e) {
        log.error('Failed to count lines for file:', rel, e)
      }
    }
    return total
  })

  safeHandle('read-directory-tree', async (_, dirPath: string) => {
    const nodes = await readDirTree(dirPath, [], true)
    const dirName = dirPath.split(/[/\\]/).pop() || dirPath
    return formatTreeText(dirName, nodes)
  })
}
