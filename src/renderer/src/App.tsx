import React, { useCallback, useEffect, useRef, useState } from 'react'
import log from 'electron-log/renderer'
import FileExplorer, { type FileTag } from './components/FileExplorer'
import AIChat, { type AIChatHandle, type ChatMessage } from './components/AIChat'
import ChatHistory from './components/ChatHistory'
import StatusBar from './components/StatusBar'
import { WorkspaceContext } from './WorkspaceContext'
import { useResizableLayout } from './hooks/useResizableLayout'
import { deriveTitle, joinWithWorkspace } from './utils/appUtils'

type FileStates = Map<string, FileTag>

function App(): React.JSX.Element {
  const { leftWidth, rightWidth, layoutRef, startResizeLeft, startResizeRight } =
    useResizableLayout()
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [fileStates, setFileStates] = useState<FileStates>(new Map())
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [filePaths, setFilePaths] = useState<Set<string>>(new Set())
  const [includeDirStructure, setIncludeDirStructure] = useState(true)
  const [dirStructureAddedAtIndex, setDirStructureAddedAtIndex] = useState<number | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [chatHistoryKey, setChatHistoryKey] = useState(0)
  const copySnapshotRef = useRef<Set<string>>(new Set())
  const chatRef = useRef<AIChatHandle>(null)
  const activeChatIdRef = useRef<string | null>(null)
  const workspaceRef = useRef<string | null>(null)
  const fileStatesRef = useRef<FileStates>(new Map())
  const expandedDirsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  useEffect(() => {
    workspaceRef.current = workspace
  }, [workspace])

  useEffect(() => {
    fileStatesRef.current = fileStates
  }, [fileStates])

  useEffect(() => {
    expandedDirsRef.current = expandedDirs
  }, [expandedDirs])

  const loadWorkspaceState = useCallback(async (path: string): Promise<void> => {
    try {
      const state: { fileStates: Array<[string, string]>; expandedDirs: string[] } =
        await window.electron.ipcRenderer.invoke('db:get-workspace-state', path)
      const includeDir = (await window.electron.ipcRenderer.invoke(
        'db:get-include-dir-structure',
        path
      )) as boolean
      setIncludeDirStructure(includeDir)
      const fsMap = new Map<string, FileTag>()
      const batchStates: Array<{ absolutePath: string; tag: string }> = []
      for (const [rel] of state.fileStates) {
        const abs = joinWithWorkspace(path, rel)
        fsMap.set(abs, 'PND')
        batchStates.push({ absolutePath: abs, tag: 'PND' })
      }
      if (batchStates.length > 0) {
        await window.electron.ipcRenderer.invoke('db:batch-set-file-states', path, batchStates)
      }
      const expSet = new Set<string>()
      for (const rel of state.expandedDirs) {
        expSet.add(joinWithWorkspace(path, rel))
      }
      setFileStates(fsMap)
      setExpandedDirs(expSet)
      setDirStructureAddedAtIndex(null)
    } catch (e) {
      log.error('Failed to load workspace state:', e)
    }
  }, [])

  const applyChatSessionState = useCallback(
    async (
      session: { workspace_path: string | null; file_states: string; expanded_dirs: string },
      targetWorkspace: string
    ): Promise<void> => {
      try {
        const savedFileStates = JSON.parse(session.file_states || '[]') as Array<{
          absolutePath: string
          tag: string
        }>
        const savedExpandedDirs = JSON.parse(session.expanded_dirs || '[]') as string[]

        const fsMap = new Map<string, FileTag>()
        const batchStates: Array<{ absolutePath: string; tag: string }> = []
        for (const { absolutePath, tag } of savedFileStates) {
          fsMap.set(absolutePath, tag as FileTag)
          batchStates.push({ absolutePath, tag })
        }
        if (batchStates.length > 0) {
          await window.electron.ipcRenderer.invoke(
            'db:batch-set-file-states',
            targetWorkspace,
            batchStates
          )
        }

        const expSet = new Set<string>(savedExpandedDirs)

        setFileStates(fsMap)
        setExpandedDirs(expSet)
        setDirStructureAddedAtIndex(null)
      } catch (e) {
        log.error('Failed to apply chat session state:', e)
      }
    },
    []
  )

  const serializeCurrentFileStates = useCallback(
    (currentFileStates: FileStates, ws: string | null): string => {
      if (!ws) return '[]'
      const arr: Array<{ absolutePath: string; tag: string }> = []
      currentFileStates.forEach((tag, path) => {
        arr.push({ absolutePath: path, tag })
      })
      return JSON.stringify(arr)
    },
    []
  )

  const serializeExpandedDirs = useCallback((dirs: Set<string>): string => {
    return JSON.stringify([...dirs])
  }, [])

  const saveCurrentChat = useCallback(async (): Promise<void> => {
    try {
      if (!chatRef.current) return
      const messages = chatRef.current.getMessages()
      if (messages.length === 0) return
      const title = deriveTitle(messages)
      const ws = workspaceRef.current
      const fs = serializeCurrentFileStates(fileStatesRef.current, ws)
      const ed = serializeExpandedDirs(expandedDirsRef.current)
      if (activeChatIdRef.current) {
        await window.electron.ipcRenderer.invoke(
          'db:update-chat-session',
          activeChatIdRef.current,
          title,
          JSON.stringify(messages),
          fs,
          ed
        )
      } else {
        const id = await window.electron.ipcRenderer.invoke(
          'db:create-chat-session',
          ws,
          title,
          JSON.stringify(messages),
          fs,
          ed
        )
        setActiveChatId(id)
      }
    } catch (e) {
      log.error('Failed to save chat:', e)
    }
  }, [serializeCurrentFileStates, serializeExpandedDirs])

  const handleWorkspaceChange = useCallback(
    async (path: string | null, { restore = true } = {}): Promise<void> => {
      try {
        await saveCurrentChat()
        log.info('Workspace changed:', path ?? '(none)')
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
        setActiveChatId(null)
        chatRef.current?.loadChat([])
      } catch (e) {
        log.error('Failed to change workspace:', e)
      }
    },
    [loadWorkspaceState, saveCurrentChat]
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
      .catch((e) => {
        log.warn('Failed to load last workspace', e)
      })
    return () => {
      cancelled = true
    }
  }, [handleWorkspaceChange])

  const handleToggleFile = useCallback(
    (paths: string[], checked: boolean): void => {
      try {
        setFileStates((prev) => {
          const next = new Map(prev)
          if (checked) {
            for (const p of paths) {
              if (!next.has(p)) next.set(p, 'PND')
            }
          } else {
            for (const p of paths) {
              next.delete(p)
            }
          }
          return next
        })
        if (workspace) {
          if (checked) {
            window.electron.ipcRenderer
              .invoke(
                'db:batch-set-file-states',
                workspace,
                paths.map((p) => ({ absolutePath: p, tag: 'PND' }))
              )
              .catch((e) => log.error('Failed to batch set file states:', e))
          } else {
            window.electron.ipcRenderer
              .invoke('db:batch-remove-file-states', workspace, paths)
              .catch((e) => log.error('Failed to batch remove file states:', e))
          }
        }
      } catch (e) {
        log.error('Failed to toggle file:', e)
      }
    },
    [workspace]
  )

  const handleToggleExpand = useCallback(
    (path: string, expanded: boolean): void => {
      try {
        setExpandedDirs((prev) => {
          const next = new Set(prev)
          if (expanded) next.add(path)
          else next.delete(path)
          return next
        })
        if (workspace) {
          window.electron.ipcRenderer
            .invoke('db:set-dir-expanded', workspace, path, expanded)
            .catch((e) => log.error('Failed to set dir expanded:', e))
        }
      } catch (e) {
        log.error('Failed to toggle expand:', e)
      }
    },
    [workspace]
  )

  const handleClearSelections = useCallback(async (): Promise<void> => {
    try {
      if (!workspace) return
      setFileStates((prev) => {
        const next = new Map<string, FileTag>()
        const toRemove: string[] = []
        prev.forEach((state, path) => {
          if (state === 'ADD') {
            next.set(path, 'ADD')
          } else {
            toRemove.push(path)
          }
        })
        if (toRemove.length > 0) {
          window.electron.ipcRenderer
            .invoke('db:batch-remove-file-states', workspace, toRemove)
            .catch((e) => log.error('Failed to batch remove file states:', e))
        }
        return next
      })
      copySnapshotRef.current = new Set()
    } catch (e) {
      log.error('Failed to clear selections:', e)
    }
  }, [workspace])

  const handleFilePathsChange = useCallback((paths: Set<string>): void => {
    setFilePaths(paths)
  }, [])

  const latestCopyFnRef = useRef<(() => Promise<void>) | undefined>(undefined)
  const latestPasteFnRef = useRef<(() => Promise<void>) | undefined>(undefined)

  useEffect(() => {
    latestCopyFnRef.current = async (): Promise<void> => {
      try {
        if (!workspace) return
        // 1. Transition PND -> INQ first and collect paths synchronously
        const pathsToInclude: string[] = []
        const pathsToMarkInq: string[] = []

        fileStates.forEach((state, path) => {
          if (filePaths.has(path)) {
            if (state === 'PND') {
              pathsToMarkInq.push(path)
            }
            if (state === 'PND' || state === 'INQ') {
              pathsToInclude.push(path)
            }
          }
        })

        if (pathsToMarkInq.length > 0) {
          setFileStates((prev) => {
            const next = new Map(prev)
            for (const p of pathsToMarkInq) {
              next.set(p, 'INQ')
            }
            return next
          })
          await window.electron.ipcRenderer.invoke(
            'db:batch-set-file-states',
            workspace,
            pathsToMarkInq.map((p) => ({ absolutePath: p, tag: 'INQ' }))
          )
        }

        // 2. Read file contents for all targeted paths
        const pendingFilesPromises = pathsToInclude.map(async (absolutePath) => {
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
          return null
        })

        const results = await Promise.all(pendingFilesPromises)
        const pendingFiles = results.filter(
          (f): f is { path: string; content: string } => f !== null
        )

        // 3. Prepare context and copy
        const currentIndex = chatRef.current?.getResolvedUserIndex() ?? 0
        let dirStructure: string | undefined
        if (includeDirStructure) {
          if (dirStructureAddedAtIndex === null || dirStructureAddedAtIndex === currentIndex) {
            dirStructure = await window.electron.ipcRenderer.invoke(
              'read-directory-tree',
              workspace
            )
            if (dirStructureAddedAtIndex === null) {
              setDirStructureAddedAtIndex(currentIndex)
            }
          }
        }

        const success = await chatRef.current?.copyByIndex(undefined, pendingFiles, dirStructure)
        if (!success) return
        copySnapshotRef.current = new Set(pathsToInclude)
      } catch (e) {
        log.error('Failed to copy context:', e)
      }
    }
  }, [workspace, fileStates, filePaths, includeDirStructure, dirStructureAddedAtIndex])

  const handleCopy = useCallback(() => {
    latestCopyFnRef.current?.()
  }, [])

  const handleNewChat = useCallback(async (): Promise<void> => {
    try {
      const toConvert: string[] = []
      const nextFileStates = new Map(fileStates)
      fileStates.forEach((state, path) => {
        if (state === 'ADD' || state === 'INQ') {
          nextFileStates.set(path, 'PND')
          toConvert.push(path)
        }
      })

      await saveCurrentChat()

      copySnapshotRef.current = new Set()
      setDirStructureAddedAtIndex(null)
      setActiveChatId(null)
      chatRef.current?.loadChat([])
      setChatHistoryKey((k) => k + 1)

      setFileStates(nextFileStates)
      const currentWorkspace = workspaceRef.current
      if (currentWorkspace && toConvert.length > 0) {
        window.electron.ipcRenderer
          .invoke(
            'db:batch-set-file-states',
            currentWorkspace,
            toConvert.map((p) => ({ absolutePath: p, tag: 'PND' }))
          )
          .catch((e) => log.error('Failed to convert file states to PND on new chat:', e))
      }
    } catch (e) {
      log.error('Failed to create new chat:', e)
    }
  }, [saveCurrentChat, fileStates])

  const handleSelectChat = useCallback(
    async (id: string): Promise<void> => {
      try {
        await saveCurrentChat()
        const session = await window.electron.ipcRenderer.invoke('db:get-chat-session', id)
        if (session) {
          const sessionWorkspace = session.workspace_path
          if (sessionWorkspace && sessionWorkspace !== workspace) {
            setWorkspace(sessionWorkspace)
            await window.electron.ipcRenderer.invoke('workspace:watch', sessionWorkspace)
            await window.electron.ipcRenderer.invoke('db:touch-workspace', sessionWorkspace)
          }

          const targetWorkspace = sessionWorkspace || workspace
          if (targetWorkspace) {
            await applyChatSessionState(session, targetWorkspace)
          }

          const messages = JSON.parse(session.messages).map((m: ChatMessage) => ({
            ...m,
            variants: m.variants.map((v: ChatMessage['variants'][number]) => ({
              ...v,
              timestamp: new Date(v.timestamp)
            }))
          }))
          setActiveChatId(id)
          chatRef.current?.loadChat(messages)
        }
      } catch (e) {
        log.error('Failed to select chat:', e)
      }
    },
    [saveCurrentChat, workspace, applyChatSessionState]
  )

  const handleMessagesChange = useCallback(
    async (messages: ChatMessage[]) => {
      try {
        if (messages.length === 0) return
        const title = deriveTitle(messages)
        const ws = workspaceRef.current
        const fs = serializeCurrentFileStates(fileStatesRef.current, ws)
        const ed = serializeExpandedDirs(expandedDirsRef.current)
        if (activeChatIdRef.current) {
          await window.electron.ipcRenderer.invoke(
            'db:update-chat-session',
            activeChatIdRef.current,
            title,
            JSON.stringify(messages),
            fs,
            ed
          )
        } else {
          const id = await window.electron.ipcRenderer.invoke(
            'db:create-chat-session',
            ws,
            title,
            JSON.stringify(messages),
            fs,
            ed
          )
          setActiveChatId(id)
        }
        setChatHistoryKey((k) => k + 1)
      } catch (e) {
        log.error('Failed to handle messages change:', e)
      }
    },
    [serializeCurrentFileStates, serializeExpandedDirs]
  )

  useEffect(() => {
    latestPasteFnRef.current = async (): Promise<void> => {
      try {
        await chatRef.current?.pasteAsAssistant()
        await saveCurrentChat()

        const snapshot = copySnapshotRef.current
        setFileStates((prev) => {
          const next = new Map(prev)
          const toAdd = new Set<string>()
          snapshot.forEach((path) => {
            next.set(path, 'ADD')
            toAdd.add(path)
          })
          next.forEach((state, path) => {
            if (state === 'INQ') {
              next.set(path, 'ADD')
              toAdd.add(path)
            }
          })
          if (workspace && toAdd.size > 0) {
            window.electron.ipcRenderer
              .invoke(
                'db:batch-set-file-states',
                workspace,
                [...toAdd].map((p) => ({ absolutePath: p, tag: 'ADD' }))
              )
              .catch((e) => log.error('Failed to batch set file states on paste:', e))
          }
          return next
        })
        copySnapshotRef.current = new Set()
      } catch (e) {
        log.error('Failed to paste:', e)
      }
    }
  }, [workspace, saveCurrentChat])

  const handlePaste = useCallback(() => {
    latestPasteFnRef.current?.()
  }, [])

  const handleClearDb = useCallback(async (): Promise<void> => {
    try {
      await window.electron.ipcRenderer.invoke('db:clear-all')
      setFileStates(new Map())
      setExpandedDirs(new Set())
      setFilePaths(new Set())
      setActiveChatId(null)
      copySnapshotRef.current = new Set()
      chatRef.current?.loadChat([])
      setChatHistoryKey((k) => k + 1)
      setDirStructureAddedAtIndex(null)
    } catch (e) {
      log.error('Failed to clear database:', e)
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
            onMouseDown={startResizeLeft}
          />
          <div className="flex-1 bg-background flex overflow-hidden min-w-0">
            <AIChat
              ref={chatRef}
              onNewChat={handleNewChat}
              onMessagesChange={handleMessagesChange}
            />
          </div>
          <div
            className="w-[3px] cursor-col-resize bg-transparent relative flex-shrink-0 z-10 transition-[background] duration-normal hover:bg-accent active:bg-accent before:absolute before:top-0 before:bottom-0 before:-left-[3px] before:-right-[3px]"
            onMouseDown={startResizeRight}
          />
          <div
            className="min-w-[160px] max-w-[520px] border-l border-border bg-background-soft flex flex-col"
            style={{
              width: `${rightWidth}px`,
              flexBasis: `${rightWidth}px`,
              flexGrow: 0,
              flexShrink: 0
            }}
          >
            <ChatHistory
              workspace={workspace}
              activeChatId={activeChatId}
              onSelectChat={handleSelectChat}
              onNewChat={handleNewChat}
              refreshKey={chatHistoryKey}
            />
          </div>
        </div>
        <StatusBar onCopy={handleCopy} onPaste={handlePaste} onClearDb={handleClearDb} />
      </div>
    </WorkspaceContext.Provider>
  )
}

export default App
