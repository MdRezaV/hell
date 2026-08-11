import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import { dirname, join } from 'path'
import { createReadStream } from 'fs'
import { access, copyFile, mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { getEncoding } from 'js-tiktoken'
import { formatTreeText, readDirTree } from './fsUtils'
import { PathTraversalError, WorkspacePath } from './pathSafety'
import {
  batchRemoveFileStates,
  batchSetDirExpanded,
  batchSetFileStates,
  clearAllData,
  clearFileStates,
  createChatSession,
  deleteChatSession,
  extractPreview,
  getChatSession,
  getChatSessions,
  getLastWorkspace,
  getWorkspaces,
  getWorkspaceState,
  pruneWorkspaceState,
  removeFileState,
  searchChatSessions,
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
      return Promise.reject(e)
    }
  })
}

let tiktokenEncoder: ReturnType<typeof getEncoding> | null = null
function getTiktokenEncoder(): ReturnType<typeof getEncoding> {
  if (!tiktokenEncoder) {
    tiktokenEncoder = getEncoding('cl100k_base')
  }
  return tiktokenEncoder
}

async function moveFileSafe(fullOldPath: string, fullNewPath: string): Promise<void> {
  try {
    await rename(fullOldPath, fullNewPath)
    return
  } catch (e: unknown) {
    if (!(e && typeof e === 'object' && 'code' in e && (e as { code: unknown }).code === 'EXDEV')) {
      throw e
    }
  }
  // Cross-device move fallback. fs.copyFile copies raw bytes, so binary
  // files are preserved. If the copy fails midway, remove the partial
  // destination so we never leave a corrupted file behind.
  try {
    await copyFile(fullOldPath, fullNewPath)
  } catch (copyError) {
    await unlink(fullNewPath).catch(() => {})
    throw copyError
  }
  await unlink(fullOldPath)
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

  safeHandle('clipboard:write-text', async (_, text: string) => {
    clipboard.writeText(text)
  })

  safeHandle('clipboard:read-text', async () => {
    return clipboard.readText()
  })

  safeHandle('read-file', async (_, workspace: string, relativePath: string) => {
    try {
      const fullPath = WorkspacePath.for(workspace).resolve(relativePath)
      const content = await readFile(fullPath, 'utf-8')
      return { exists: true, error: false, content }
    } catch (e) {
      if (e instanceof PathTraversalError) {
        log.error('Blocked read-file outside workspace:', relativePath, e.message)
        return { exists: false, error: true, content: null }
      }
      if (e && typeof e === 'object' && 'code' in e && (e as { code: unknown }).code === 'ENOENT') {
        return { exists: false, error: false, content: null }
      }
      log.error('Failed to read file:', relativePath, e)
      return { exists: true, error: true, content: null }
    }
  })

  safeHandle('write-file', async (_, workspace: string, relativePath: string, content: string) => {
    try {
      const fullPath = WorkspacePath.for(workspace).resolve(relativePath)
      await mkdir(dirname(fullPath), { recursive: true })
      await writeFile(fullPath, content, 'utf-8')
      return { success: true }
    } catch (e: unknown) {
      if (e instanceof PathTraversalError) {
        log.error('Blocked write-file outside workspace:', relativePath, e.message)
        return { success: false, error: 'Path escapes workspace' }
      }
      log.error('Failed to write file:', relativePath, e)
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  safeHandle('delete-file', async (_, workspace: string, relativePath: string) => {
    try {
      const fullPath = WorkspacePath.for(workspace).resolve(relativePath)
      await unlink(fullPath)
      return { success: true }
    } catch (e: unknown) {
      if (e instanceof PathTraversalError) {
        log.error('Blocked delete-file outside workspace:', relativePath, e.message)
        return { success: false, error: 'Path escapes workspace' }
      }
      log.error('Failed to delete file:', relativePath, e)
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  safeHandle('move-file', async (_, workspace: string, oldPath: string, newPath: string) => {
    try {
      const ws = WorkspacePath.for(workspace)
      const fullOldPath = ws.resolve(oldPath)
      const fullNewPath = ws.resolve(newPath)
      await mkdir(dirname(fullNewPath), { recursive: true })
      await moveFileSafe(fullOldPath, fullNewPath)
      return { success: true }
    } catch (e: unknown) {
      if (e instanceof PathTraversalError) {
        log.error('Blocked move-file outside workspace:', oldPath, '->', newPath, e.message)
        return { success: false, error: 'Path escapes workspace' }
      }
      log.error('Failed to move file:', oldPath, e)
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  safeHandle('db:get-last-workspace', async () => {
    const path = getLastWorkspace()
    if (path) {
      try {
        await access(path)
        return path
      } catch {
        return null
      }
    }
    return null
  })

  safeHandle('db:get-workspaces', async () => {
    return getWorkspaces()
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

  safeHandle(
    'db:batch-set-dir-expanded',
    async (
      _,
      workspacePath: string,
      entries: Array<{ absolutePath: string; expanded: boolean }>
    ) => {
      batchSetDirExpanded(workspacePath, entries)
    }
  )

  safeHandle('workspace:watch', async (event, workspacePath: string | null) => {
    if (!workspacePath) {
      stopWatching()
      return
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    await startWatching(workspacePath, () => {
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
      dirStructureTag?: string,
      mode?: string,
      taskId?: string
    ) => {
      const preview = extractPreview(messages)
      if (fileStates !== undefined && expandedDirs !== undefined) {
        return createChatSession(
          workspacePath,
          title,
          messages,
          fileStates,
          expandedDirs,
          dirStructureTag,
          mode,
          taskId,
          preview
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
          dirStructureTag,
          mode,
          taskId,
          preview
        )
      }
      return createChatSession(
        workspacePath,
        title,
        messages,
        undefined,
        undefined,
        dirStructureTag,
        mode,
        taskId,
        preview
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
      dirStructureTag?: string,
      mode?: string,
      taskId?: string
    ) => {
      const preview = extractPreview(messages)
      if (fileStates !== undefined && expandedDirs !== undefined) {
        updateChatSession(
          id,
          title,
          messages,
          fileStates,
          expandedDirs,
          dirStructureTag,
          mode,
          taskId,
          preview
        )
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
            dirStructureTag,
            mode,
            taskId,
            preview
          )
        } else {
          updateChatSession(
            id,
            title,
            messages,
            undefined,
            undefined,
            dirStructureTag,
            mode,
            taskId,
            preview
          )
        }
      }
    }
  )

  safeHandle('db:get-chat-sessions', async (_, workspacePath: string | null) => {
    return getChatSessions(workspacePath)
  })

  safeHandle('db:search-chat-sessions', async (_, workspacePath: string | null, query: string) => {
    return searchChatSessions(workspacePath, query)
  })

  safeHandle('db:get-chat-session', async (_, id: string) => {
    return getChatSession(id)
  })

  safeHandle('db:delete-chat-session', async (_, id: string) => {
    deleteChatSession(id)
  })

  // `workspace` is the tree root the renderer opened via `open-workspace` or chat-history restore;
  // there is no narrower boundary to enforce here since the whole point is reading that root.
  safeHandle('read-directory', async (_, workspace: string) => {
    return await readDirTree(workspace, [], true, workspace)
  })

  safeHandle('search-file-content', async (_, workspace: string, filePaths: string[], query: string) => {
    const ws = WorkspacePath.for(workspace)
    const q = query.toLowerCase()
    const overlapSize = Math.max(0, Buffer.byteLength(q, 'utf-8'))

    const fileQueue = filePaths.filter((p) => {
      if (ws.contains(p)) return true
      log.error('Blocked search-file-content outside workspace:', p)
      return false
    })

    // Stream-search a single file using a small byte-buffer overlap
    // instead of per-chunk string concatenation + slicing.
    async function searchFile(filePath: string): Promise<boolean> {
      try {
        const stream = createReadStream(filePath, {
          highWaterMark: 64 * 1024
        })
        let overlap: Buffer = Buffer.alloc(0)
        let found = false

        for await (const chunk of stream as AsyncIterable<Buffer>) {
          const searchArea = overlap.length === 0 ? chunk : Buffer.concat([overlap, chunk])

          if (searchArea.toString('utf-8').toLowerCase().includes(q)) {
            found = true
            stream.destroy()
            break
          }

          if (searchArea.length > overlapSize) {
            // subarray shares memory with searchArea; copy when the retained
            // slice is small so the large parent buffer can be GC'd.
            const tail = searchArea.subarray(searchArea.length - overlapSize)
            overlap = tail.length * 4 < searchArea.length ? Buffer.from(tail) : tail
          } else {
            overlap = searchArea
          }
        }
        return found
      } catch {
        return false
      }
    }

    const CONCURRENCY = 16
    const result: string[] = []

    async function worker(): Promise<void> {
      while (true) {
        const filePath = fileQueue.pop()
        if (!filePath) return
        if (await searchFile(filePath)) result.push(filePath)
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    return result
  })

  safeHandle('count-lines', async (_, workspace: string, relativePaths: string[]) => {
    let totalLines = 0
    let totalTokens = 0
    const enc = getTiktokenEncoder()
    const ws = WorkspacePath.for(workspace)

    const queue = relativePaths.slice()
    const CONCURRENCY = 8

    async function processFile(rel: string): Promise<void> {
      try {
        const fullPath = ws.resolve(rel)
        const buf = await readFile(fullPath)
        if (buf.length === 0) return
        let newlines = 0
        for (let i = 0; i < buf.length; i++) {
          if (buf[i] === 0x0a) newlines++
        }
        totalLines += newlines + 1
        totalTokens += enc.encode(buf.toString('utf-8')).length
      } catch (e: unknown) {
        if (e instanceof PathTraversalError) {
          log.error('Blocked count-lines outside workspace:', rel, e.message)
          return
        }
        if (
          e &&
          typeof e === 'object' &&
          'code' in e &&
          (e as { code: unknown }).code === 'ENOENT'
        ) {
          return
        }
        log.error('Failed to count lines for file:', rel, e)
      }
    }

    async function worker(): Promise<void> {
      while (true) {
        const rel = queue.pop()
        if (rel === undefined) return
        await processFile(rel)
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    return { lines: totalLines, tokens: totalTokens }
  })

  safeHandle('read-directory-tree', async (_, workspace: string) => {
    const nodes = await readDirTree(workspace, [], true, workspace)
    return formatTreeText(nodes)
  })

  safeHandle('spellcheck:replace', async (event, word: string) => {
    event.sender.replaceMisspelling(word)
  })

  safeHandle('spellcheck:add-to-dictionary', async (event, word: string) => {
    event.sender.session.addWordToSpellCheckerDictionary(word)
  })

  safeHandle('settings:load', async () => {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    try {
      const content = await readFile(settingsPath, 'utf-8')
      return JSON.parse(content)
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: unknown }).code !== 'ENOENT') {
        log.error('Failed to load settings:', e)
      }
      return null
    }
  })

  safeHandle('settings:save', async (_, json: string) => {
    const settingsDir = app.getPath('userData')
    const settingsPath = join(settingsDir, 'settings.json')
    await mkdir(settingsDir, { recursive: true })
    await writeFile(settingsPath, json, 'utf-8')
  })
}
