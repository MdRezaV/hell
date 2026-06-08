import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { dirname, join, relative } from 'path'
import { existsSync, mkdirSync, promises as fsp, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import ignore, { type Ignore } from 'ignore'
import icon from '../../resources/icon.png?asset'
import {
  batchRemoveFileStates,
  batchSetFileStates,
  clearFileStates,
  closeDatabase,
  createChatSession,
  deleteChatSession,
  getChatSession,
  getChatSessions,
  getIncludeDirStructure,
  getLastWorkspace,
  getWorkspaceState,
  initDatabase,
  pruneWorkspaceState,
  removeFileState,
  setDirExpanded,
  setFileState,
  setIncludeDirStructure,
  touchWorkspace,
  updateChatSession
} from './database'
import { startWatching, stopWatching } from './watcher'

interface IgnoreRule {
  dir: string
  ig: Ignore
}

const TEXT_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'sass',
  'md',
  'mdx',
  'txt',
  'xml',
  'svg',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'c',
  'cpp',
  'cc',
  'cxx',
  'h',
  'hpp',
  'cs',
  'php',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'cmd',
  'sql',
  'toml',
  'ini',
  'conf',
  'env',
  'gitignore',
  'editorconfig',
  'lua',
  'r',
  'swift',
  'dart',
  'scala',
  'clj',
  'erl',
  'ex',
  'exs',
  'hs',
  'ml',
  'fs',
  'vim',
  'tex',
  'vue',
  'svelte',
  'graphql',
  'gql',
  'prisma',
  'proto',
  'lock',
  'mod',
  'sum'
])

const binaryCheckCache = new Map<string, boolean>()
const BINARY_CACHE_MAX = 1024

async function isBinaryFile(filePath: string): Promise<boolean> {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (ext && TEXT_EXTENSIONS.has(ext)) return false

  const cached = binaryCheckCache.get(filePath)
  if (cached !== undefined) return cached

  try {
    const fd = await fsp.open(filePath, 'r')
    const buffer = Buffer.alloc(8192)
    const { bytesRead } = await fd.read(buffer, 0, 8192, 0)
    await fd.close()
    let isBin = false
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        isBin = true
        break
      }
    }
    if (binaryCheckCache.size >= BINARY_CACHE_MAX) {
      const firstKey = binaryCheckCache.keys().next().value
      if (firstKey !== undefined) binaryCheckCache.delete(firstKey)
    }
    binaryCheckCache.set(filePath, isBin)
    return isBin
  } catch {
    return false
  }
}

async function loadIgnoreRules(
  dir: string,
  parentRules: IgnoreRule[],
  isRoot: boolean
): Promise<IgnoreRule[]> {
  const rules = [...parentRules]
  const patterns: string[] = []
  if (isRoot) {
    patterns.push('.git')
  }
  for (const ignoreFile of ['.gitignore', '.hellignore']) {
    try {
      const content = await fsp.readFile(join(dir, ignoreFile), 'utf-8')
      patterns.push(content)
    } catch {
      // ignore file doesn't exist
    }
  }
  if (patterns.length > 0) {
    rules.push({ dir, ig: ignore().add(patterns.join('\n')) })
  }
  return rules
}

function isEntryIgnored(entryPath: string, isDirectory: boolean, rules: IgnoreRule[]): boolean {
  for (const rule of rules) {
    const rel = relative(rule.dir, entryPath).replace(/\\/g, '/')
    if (rel.startsWith('..')) continue
    const testPath = isDirectory ? `${rel}/` : rel
    if (rule.ig.ignores(testPath)) return true
  }
  return false
}

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  isBinary?: boolean
}

async function readDirTree(
  path: string,
  parentRules: IgnoreRule[],
  isRoot: boolean
): Promise<FileNode[]> {
  const currentRules = await loadIgnoreRules(path, parentRules, isRoot)
  try {
    const entries = await fsp.readdir(path, { withFileTypes: true })
    const filtered = entries.filter((entry) => {
      const fullPath = join(path, entry.name)
      return !isEntryIgnored(fullPath, entry.isDirectory(), currentRules)
    })

    const results: FileNode[] = []
    for (const entry of filtered) {
      const fullPath = join(path, entry.name)
      if (entry.isDirectory()) {
        const children = await readDirTree(fullPath, currentRules, false)
        results.push({
          name: entry.name,
          path: fullPath,
          type: 'directory' as const,
          children
        })
      } else {
        const bin = await isBinaryFile(fullPath)
        results.push({
          name: entry.name,
          path: fullPath,
          type: 'file' as const,
          isBinary: bin
        })
      }
    }
    return results
  } catch {
    return []
  }
}

function formatTreeText(rootName: string, nodes: FileNode[]): string {
  let result = `- ${rootName}/\n`
  const walk = (list: FileNode[], indent: string): void => {
    for (const node of list) {
      if (node.type === 'directory') {
        result += `${indent}- ${node.name}/\n`
        if (node.children && node.children.length > 0) {
          walk(node.children, indent + '  ')
        }
      } else {
        result += `${indent}- ${node.name}\n`
      }
    }
  }
  walk(nodes, '  ')
  return result
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  initDatabase()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('open-workspace', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('read-file', async (_, workspace: string, relativePath: string) => {
    const fullPath = join(workspace, relativePath)
    if (!existsSync(fullPath)) {
      return { exists: false, error: false, content: null }
    }
    try {
      const content = readFileSync(fullPath, 'utf-8')
      return { exists: true, error: false, content }
    } catch {
      return { exists: true, error: true, content: null }
    }
  })

  ipcMain.handle(
    'write-file',
    async (_, workspace: string, relativePath: string, content: string) => {
      try {
        const fullPath = join(workspace, relativePath)
        mkdirSync(dirname(fullPath), { recursive: true })
        writeFileSync(fullPath, content, 'utf-8')
        return { success: true }
      } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcMain.handle('delete-file', async (_, workspace: string, relativePath: string) => {
    try {
      const fullPath = join(workspace, relativePath)
      unlinkSync(fullPath)
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('db:get-last-workspace', async () => {
    const path = getLastWorkspace()
    if (path && existsSync(path)) return path
    return null
  })

  ipcMain.handle('db:touch-workspace', async (_, workspacePath: string) => {
    touchWorkspace(workspacePath)
  })

  ipcMain.handle('db:get-workspace-state', async (_, workspacePath: string) => {
    return getWorkspaceState(workspacePath)
  })

  ipcMain.handle(
    'db:set-file-state',
    async (_, workspacePath: string, absolutePath: string, tag: string) => {
      setFileState(workspacePath, absolutePath, tag)
    }
  )

  ipcMain.handle('db:remove-file-state', async (_, workspacePath: string, absolutePath: string) => {
    removeFileState(workspacePath, absolutePath)
  })

  ipcMain.handle(
    'db:batch-set-file-states',
    async (_, workspacePath: string, states: Array<{ absolutePath: string; tag: string }>) => {
      batchSetFileStates(workspacePath, states)
    }
  )

  ipcMain.handle(
    'db:batch-remove-file-states',
    async (_, workspacePath: string, absolutePaths: string[]) => {
      batchRemoveFileStates(workspacePath, absolutePaths)
    }
  )

  ipcMain.handle('db:clear-file-states', async (_, workspacePath: string) => {
    clearFileStates(workspacePath)
  })

  ipcMain.handle(
    'db:set-dir-expanded',
    async (_, workspacePath: string, absolutePath: string, expanded: boolean) => {
      setDirExpanded(workspacePath, absolutePath, expanded)
    }
  )

  ipcMain.handle('workspace:watch', async (event, workspacePath: string | null) => {
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

  ipcMain.handle(
    'db:prune-workspace-state',
    async (_, workspacePath: string, validFilePaths: string[], validDirPaths: string[]) => {
      pruneWorkspaceState(workspacePath, validFilePaths, validDirPaths)
    }
  )

  ipcMain.handle(
    'db:create-chat-session',
    async (_, workspacePath: string | null, title: string, messages: string) => {
      return createChatSession(workspacePath, title, messages)
    }
  )

  ipcMain.handle(
    'db:update-chat-session',
    async (_, id: string, title: string, messages: string) => {
      updateChatSession(id, title, messages)
    }
  )

  ipcMain.handle('db:get-chat-sessions', async (_, workspacePath: string | null) => {
    return getChatSessions(workspacePath)
  })

  ipcMain.handle('db:get-chat-session', async (_, id: string) => {
    return getChatSession(id)
  })

  ipcMain.handle('db:delete-chat-session', async (_, id: string) => {
    deleteChatSession(id)
  })

  ipcMain.handle('db:get-include-dir-structure', async (_, workspacePath: string) => {
    return getIncludeDirStructure(workspacePath)
  })

  ipcMain.handle(
    'db:set-include-dir-structure',
    async (_, workspacePath: string, value: boolean) => {
      setIncludeDirStructure(workspacePath, value)
    }
  )

  ipcMain.handle('read-directory', async (_, dirPath: string) => {
    return await readDirTree(dirPath, [], true)
  })

  ipcMain.handle('read-directory-tree', async (_, dirPath: string) => {
    const nodes = await readDirTree(dirPath, [], true)
    const dirName = dirPath.split(/[/\\]/).pop() || dirPath
    return formatTreeText(dirName, nodes)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  stopWatching()
  closeDatabase()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
