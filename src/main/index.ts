import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, relative, dirname } from 'path'
import {
  readdirSync,
  readFileSync,
  openSync,
  readSync,
  closeSync,
  existsSync,
  writeFileSync,
  unlinkSync,
  mkdirSync
} from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import ignore, { type Ignore } from 'ignore'
import icon from '../../resources/icon.png?asset'
import {
  initDatabase,
  closeDatabase,
  touchWorkspace,
  getWorkspaceState,
  getLastWorkspace,
  setFileState,
  removeFileState,
  clearFileStates,
  setDirExpanded,
  pruneWorkspaceState
} from './database'
import { startWatching, stopWatching } from './watcher'

interface IgnoreRule {
  dir: string
  ig: Ignore
}

function isBinaryFile(filePath: string): boolean {
  try {
    const fd = openSync(filePath, 'r')
    const buffer = Buffer.alloc(8192)
    const bytesRead = readSync(fd, buffer, 0, 8192, 0)
    closeSync(fd)
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true
    }
    return false
  } catch {
    return false
  }
}

function loadIgnoreRules(dir: string, parentRules: IgnoreRule[], isRoot: boolean): IgnoreRule[] {
  const rules = [...parentRules]
  const patterns: string[] = []
  if (isRoot) {
    patterns.push('.git')
  }
  for (const ignoreFile of ['.gitignore', '.hellignore']) {
    try {
      const content = readFileSync(join(dir, ignoreFile), 'utf-8')
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

function readDirTree(path: string, parentRules: IgnoreRule[], isRoot: boolean): FileNode[] {
  const currentRules = loadIgnoreRules(path, parentRules, isRoot)
  try {
    const entries = readdirSync(path, { withFileTypes: true })
    return entries
      .filter((entry) => {
        const fullPath = join(path, entry.name)
        return !isEntryIgnored(fullPath, entry.isDirectory(), currentRules)
      })
      .map((entry) => {
        const fullPath = join(path, entry.name)
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: fullPath,
            type: 'directory' as const,
            children: readDirTree(fullPath, currentRules, false)
          }
        }
        return {
          name: entry.name,
          path: fullPath,
          type: 'file' as const,
          isBinary: isBinaryFile(fullPath)
        }
      })
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

  ipcMain.handle('read-directory', async (_, dirPath: string) => {
    return readDirTree(dirPath, [], true)
  })

  ipcMain.handle('read-directory-tree', async (_, dirPath: string) => {
    const nodes = readDirTree(dirPath, [], true)
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
