import { useState, useRef, useEffect, useCallback } from 'react'
import FileExplorer, { type FileTag } from './components/FileExplorer'
import AIChat, { type AIChatHandle } from './components/AIChat'
import StatusBar from './components/StatusBar'
import { WorkspaceContext } from './WorkspaceContext'

type FileStates = Map<string, FileTag>

const MIN_LEFT_WIDTH = 160
const MAX_LEFT_WIDTH = 520
const DEFAULT_LEFT_WIDTH = 280

function joinWithWorkspace(workspace: string, relPath: string): string {
  const sep = workspace.includes('\\') ? '\\' : '/'
  return workspace + sep + relPath
}

function App(): React.JSX.Element {
  const [leftWidth, setLeftWidth] = useState<number>(DEFAULT_LEFT_WIDTH)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [fileStates, setFileStates] = useState<FileStates>(new Map())
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [filePaths, setFilePaths] = useState<Set<string>>(new Set())
  const [includeDirStructure, setIncludeDirStructure] = useState(true)
  const [dirStructureAddedAtIndex, setDirStructureAddedAtIndex] = useState<number | null>(null)
  const copySnapshotRef = useRef<Set<string>>(new Set())
  const isResizing = useRef(false)
  const layoutRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<AIChatHandle>(null)

  const loadWorkspaceState = useCallback(async (path: string): Promise<void> => {
    const state: { fileStates: Array<[string, string]>; expandedDirs: string[] } =
      await window.electron.ipcRenderer.invoke('db:get-workspace-state', path)
    const includeDir = (await window.electron.ipcRenderer.invoke(
      'db:get-include-dir-structure',
      path
    )) as boolean
    setIncludeDirStructure(includeDir)
    const fsMap = new Map<string, FileTag>()
    for (const [rel] of state.fileStates) {
      const abs = joinWithWorkspace(path, rel)
      fsMap.set(abs, 'PND')
      window.electron.ipcRenderer.invoke('db:set-file-state', path, abs, 'PND')
    }
    const expSet = new Set<string>()
    for (const rel of state.expandedDirs) {
      expSet.add(joinWithWorkspace(path, rel))
    }
    setFileStates(fsMap)
    setExpandedDirs(expSet)
    setDirStructureAddedAtIndex(null)
  }, [])

  const handleWorkspaceChange = useCallback(
    async (path: string | null, { restore = true } = {}): Promise<void> => {
      setWorkspace(path)
      setFilePaths(new Set())
      copySnapshotRef.current = new Set()
      await window.electron.ipcRenderer.invoke('workspace:watch', path)
      if (path) {
        await window.electron.ipcRenderer.invoke('db:touch-workspace', path)
        if (restore) {
          await loadWorkspaceState(path)
        } else {
          setFileStates(new Map())
          setExpandedDirs(new Set())
        }
      } else {
        setFileStates(new Map())
        setExpandedDirs(new Set())
      }
    },
    [loadWorkspaceState]
  )

  useEffect(() => {
    let cancelled = false
    window.electron.ipcRenderer
      .invoke('db:get-last-workspace')
      .then(async (path: string | null) => {
        if (!cancelled && path) {
          await handleWorkspaceChange(path)
        }
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [handleWorkspaceChange])

  const handleToggleFile = useCallback(
    (paths: string[], checked: boolean): void => {
      setFileStates((prev) => {
        const next = new Map(prev)
        if (checked) {
          paths.forEach((p) => {
            if (!next.has(p)) {
              next.set(p, 'PND')
              if (workspace) {
                window.electron.ipcRenderer.invoke('db:set-file-state', workspace, p, 'PND')
              }
            }
          })
        } else {
          paths.forEach((p) => {
            const current = next.get(p)
            if (current && current !== 'ADD') {
              next.delete(p)
              if (workspace) {
                window.electron.ipcRenderer.invoke('db:remove-file-state', workspace, p)
              }
            }
          })
        }
        return next
      })
    },
    [workspace]
  )

  const handleToggleExpand = useCallback(
    (path: string, expanded: boolean): void => {
      setExpandedDirs((prev) => {
        const next = new Set(prev)
        if (expanded) next.add(path)
        else next.delete(path)
        return next
      })
      if (workspace) {
        window.electron.ipcRenderer.invoke('db:set-dir-expanded', workspace, path, expanded)
      }
    },
    [workspace]
  )

  const handleClearSelections = useCallback(async (): Promise<void> => {
    if (!workspace) return
    await window.electron.ipcRenderer.invoke('db:clear-file-states', workspace)
    setFileStates(new Map())
    copySnapshotRef.current = new Set()
  }, [workspace])

  const handleFilePathsChange = useCallback((paths: Set<string>): void => {
    setFilePaths(paths)
  }, [])

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!workspace) return

    const pendingFilesPromises = Array.from(fileStates.entries()).map(
      async ([absolutePath, state]) => {
        if ((state === 'PND' || state === 'INQ') && filePaths.has(absolutePath)) {
          let relativePath = absolutePath
          if (relativePath.startsWith(workspace)) {
            relativePath = relativePath.substring(workspace.length)
            if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
              relativePath = relativePath.substring(1)
            }
          }
          const res: { exists: boolean; error: boolean; content: string | null } =
            await window.electron.ipcRenderer.invoke('read-file', workspace, relativePath)
          if (!res.exists) return null
          if (res.error) return { path: relativePath, content: 'ERROR READING FILE' }
          if (res.content !== null) return { path: relativePath, content: res.content }
        }
        return null
      }
    )

    const results = await Promise.all(pendingFilesPromises)
    const pendingFiles = results.filter((f): f is { path: string; content: string } => f !== null)

    const currentIndex = chatRef.current?.getResolvedUserIndex() ?? 0
    let dirStructure: string | undefined
    if (includeDirStructure) {
      if (dirStructureAddedAtIndex === null || dirStructureAddedAtIndex === currentIndex) {
        dirStructure = await window.electron.ipcRenderer.invoke('read-directory-tree', workspace)
        if (dirStructureAddedAtIndex === null) {
          setDirStructureAddedAtIndex(currentIndex)
        }
      }
    }

    const success = await chatRef.current?.copyByIndex(undefined, pendingFiles, dirStructure)
    if (!success) return

    setFileStates((prev) => {
      const next = new Map(prev)
      const snapshot = new Set<string>()
      next.forEach((state, path) => {
        if (state === 'PND') {
          snapshot.add(path)
          next.set(path, 'INQ')
          if (workspace) {
            window.electron.ipcRenderer.invoke('db:set-file-state', workspace, path, 'INQ')
          }
        } else if (state === 'INQ') {
          snapshot.add(path)
        }
      })
      copySnapshotRef.current = snapshot
      return next
    })
  }, [fileStates, filePaths, workspace, includeDirStructure, dirStructureAddedAtIndex])

  const handleNewChat = useCallback((): void => {
    setFileStates((prev) => {
      const next = new Map<string, FileTag>()
      prev.forEach((_, path) => {
        next.set(path, 'PND')
        if (workspace) {
          window.electron.ipcRenderer.invoke('db:set-file-state', workspace, path, 'PND')
        }
      })
      return next
    })
    copySnapshotRef.current = new Set()
    setDirStructureAddedAtIndex(null)
  }, [workspace])

  const handlePaste = useCallback(async (): Promise<void> => {
    await chatRef.current?.pasteAsAssistant()

    const snapshot = copySnapshotRef.current
    setFileStates((prev) => {
      const next = new Map(prev)
      snapshot.forEach((path) => {
        next.set(path, 'ADD')
        if (workspace) {
          window.electron.ipcRenderer.invoke('db:set-file-state', workspace, path, 'ADD')
        }
      })
      next.forEach((state, path) => {
        if (state === 'INQ') {
          next.set(path, 'ADD')
          if (workspace) {
            window.electron.ipcRenderer.invoke('db:set-file-state', workspace, path, 'ADD')
          }
        }
      })
      return next
    })
    copySnapshotRef.current = new Set()
  }, [workspace])

  const startResize = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!isResizing.current || !layoutRef.current) return
      const rect = layoutRef.current.getBoundingClientRect()
      const newWidth = e.clientX - rect.left
      setLeftWidth(Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, newWidth)))
    }

    const handleMouseUp = (): void => {
      if (!isResizing.current) return
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <WorkspaceContext.Provider value={{ workspace }}>
      <div className="flex flex-col w-full h-full">
        <div className="flex flex-1 overflow-hidden" ref={layoutRef}>
          <div
            className="min-w-[160px] max-w-[520px] border-r border-border bg-background-soft flex flex-col"
            style={{
              width: `${leftWidth}px`,
              flexBasis: `${leftWidth}px`,
              flexGrow: 0,
              flexShrink: 0
            }}
          >
            <FileExplorer
              workspace={workspace}
              onWorkspaceChange={handleWorkspaceChange}
              fileStates={fileStates}
              expandedDirs={expandedDirs}
              onToggleFile={handleToggleFile}
              onToggleExpand={handleToggleExpand}
              onClearSelections={handleClearSelections}
              onFilePathsChange={handleFilePathsChange}
              includeDirStructure={includeDirStructure}
              onIncludeDirStructureChange={(value) => {
                setIncludeDirStructure(value)
                if (workspace) {
                  window.electron.ipcRenderer.invoke(
                    'db:set-include-dir-structure',
                    workspace,
                    value
                  )
                }
              }}
            />
          </div>
          <div
            className="w-[3px] cursor-col-resize bg-transparent relative flex-shrink-0 z-10 transition-[background] duration-normal hover:bg-accent active:bg-accent before:absolute before:top-0 before:bottom-0 before:-left-[3px] before:-right-[3px]"
            onMouseDown={startResize}
          />
          <div className="flex-1 bg-background flex overflow-hidden min-w-0">
            <AIChat ref={chatRef} onNewChat={handleNewChat} />
          </div>
        </div>
        <StatusBar onCopy={handleCopy} onPaste={handlePaste} />
      </div>
    </WorkspaceContext.Provider>
  )
}

export default App
