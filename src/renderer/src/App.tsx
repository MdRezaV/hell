import React, { useCallback, useEffect, useRef, useState } from 'react'
import log from 'electron-log/renderer'
import FileExplorer, { type FileExplorerHandle, type FileTag } from './components/FileExplorer'
import AIChat, { type AIChatHandle, type ChatMessage } from './components/AIChat'
import StatusBar from './components/StatusBar'
import Settings from './components/Settings'
import { WorkspaceContext } from './WorkspaceContext'
import { useLoading } from './LoadingContext'
import { useResizableLayout } from './hooks/useResizableLayout'
import { deriveTitle, joinWithWorkspace } from './utils/appUtils'
import { invalidateWorkspaceFileCache } from './utils/fileApply'
import { resetPreprocessCache } from './utils/markdownParser'
import { CHAT_MODES } from './utils/PromptEngine'
import { selectPromptContent } from './utils/promptFileSelection'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useSettings } from './SettingsContext'
import ChatHistory, { type ChatHistoryHandle } from './components/ChatHistory'
import { FileIncludeProvider } from './components/markdown/ApplyAll'

type FileStates = Map<string, FileTag>

function App(): React.JSX.Element {
  const { leftWidth, rightWidth, layoutRef, startResizeLeft, startResizeRight } =
    useResizableLayout()
  const { withLoading } = useLoading()
  const { settings } = useSettings()
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [fileStates, setFileStates] = useState<FileStates>(new Map())
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [filePaths, setFilePaths] = useState<Set<string>>(new Set())
  const [allDirPaths, setAllDirPaths] = useState<Set<string>>(new Set())
  const [dirStructureTag, setDirStructureTag] = useState<FileTag | null>('PND')
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [chatHistoryKey, setChatHistoryKey] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const copySnapshotRef = useRef<Set<string>>(new Set())
  const lastPasteAddedRef = useRef<Set<string>>(new Set())
  const lastCopiedUserIndexRef = useRef<number>(-1)
  const chatRef = useRef<AIChatHandle>(null)
  const fileExplorerRef = useRef<FileExplorerHandle>(null)
  const chatHistoryRef = useRef<ChatHistoryHandle>(null)
  const activeChatIdRef = useRef<string | null>(null)
  const workspaceRef = useRef<string | null>(null)
  const fileStatesRef = useRef<FileStates>(new Map())
  const expandedDirsRef = useRef<Set<string>>(new Set())
  const dirStructureTagRef = useRef<FileTag | null>('PND')
  const dirStructureCopiedRef = useRef(false)
  const dirStructureInLastPasteRef = useRef(false)
  const isNewChatRef = useRef(false)

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

  useEffect(() => {
    dirStructureTagRef.current = dirStructureTag
  }, [dirStructureTag])

  const loadWorkspaceState = useCallback(async (path: string): Promise<void> => {
    try {
      const state: { fileStates: Array<[string, string]>; expandedDirs: string[] } =
        await window.electron.ipcRenderer.invoke('db:get-workspace-state', path)
      const fsMap = new Map<string, FileTag>()
      const batchStates: Array<{ absolutePath: string; tag: string }> = []
      for (const [rel, tag] of state.fileStates) {
        const abs = joinWithWorkspace(path, rel)
        fsMap.set(abs, tag as FileTag)
        batchStates.push({ absolutePath: abs, tag })
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
      setDirStructureTag('PND')
      dirStructureTagRef.current = 'PND'
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
        setDirStructureTag('PND')
        dirStructureTagRef.current = 'PND'
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
      const dst = dirStructureTagRef.current ?? ''
      const mode = chatRef.current.getMode()
      const taskId = chatRef.current.getTaskId()
      if (activeChatIdRef.current) {
        await window.electron.ipcRenderer.invoke(
          'db:update-chat-session',
          activeChatIdRef.current,
          title,
          JSON.stringify(messages),
          fs,
          ed,
          dst,
          mode,
          taskId
        )
      } else {
        const id = await window.electron.ipcRenderer.invoke(
          'db:create-chat-session',
          ws,
          title,
          JSON.stringify(messages),
          fs,
          ed,
          dst,
          mode,
          taskId
        )
        setActiveChatId(id)
      }
    } catch (e) {
      log.error('Failed to save chat:', e)
    }
  }, [serializeCurrentFileStates, serializeExpandedDirs])

  const handleWorkspaceChange = useCallback(
    async (path: string | null, { restore = true } = {}): Promise<void> => {
      await withLoading(async () => {
        try {
          await saveCurrentChat()
          log.info('Workspace changed:', path ?? '(none)')
          setActiveChatId(null)
          chatRef.current?.loadChat([])
          setWorkspace(path)
          setFilePaths(new Set())
          setAllDirPaths(new Set())
          copySnapshotRef.current = new Set()
          await window.electron.ipcRenderer.invoke('workspace:watch', path)
          if (path) {
            await window.electron.ipcRenderer.invoke('db:touch-workspace', path)
            if (restore) {
              await loadWorkspaceState(path)
            } else {
              setFileStates(new Map())
              setExpandedDirs(new Set())
              setDirStructureTag('PND')
              dirStructureTagRef.current = 'PND'
            }
          } else {
            setFileStates(new Map())
            setExpandedDirs(new Set())
            setDirStructureTag(null)
            dirStructureTagRef.current = null
          }
        } catch (e) {
          log.error('Failed to change workspace:', e)
        }
      })
    },
    [loadWorkspaceState, saveCurrentChat, withLoading]
  )

  useEffect(() => {
    let cancelled = false
    withLoading(async () => {
      const path: string | null = await window.electron.ipcRenderer.invoke('db:get-last-workspace')
      if (!cancelled && path) {
        await handleWorkspaceChange(path)
      }
    }).catch((e) => {
      log.warn('Failed to load last workspace', e)
    })
    return () => {
      cancelled = true
    }
  }, [handleWorkspaceChange, withLoading])

  const handleToggleFile = useCallback(
    (paths: string[], checked: boolean): void => {
      try {
        const filteredPaths = checked
          ? paths
          : paths.filter((p) => fileStatesRef.current.get(p) !== 'ADD')

        if (filteredPaths.length === 0) return

        setFileStates((prev) => {
          const next = new Map(prev)
          if (checked) {
            for (const p of filteredPaths) {
              if (!next.has(p)) next.set(p, 'PND')
            }
          } else {
            for (const p of filteredPaths) {
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
                filteredPaths.map((p) => ({ absolutePath: p, tag: 'PND' }))
              )
              .catch((e) => log.error('Failed to batch set file states:', e))
          } else {
            window.electron.ipcRenderer
              .invoke('db:batch-remove-file-states', workspace, filteredPaths)
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
      lastPasteAddedRef.current = new Set()
      dirStructureCopiedRef.current = false
      dirStructureInLastPasteRef.current = false
      lastCopiedUserIndexRef.current = -1
    } catch (e) {
      log.error('Failed to clear selections:', e)
    }
  }, [workspace])

  const handleFilePathsChange = useCallback((paths: Set<string>): void => {
    setFilePaths(paths)
  }, [])

  const handleDirPathsChange = useCallback((paths: Set<string>): void => {
    setAllDirPaths(paths)
  }, [])

  const handleOpenWorkspaceShortcut = useCallback(async (): Promise<void> => {
    try {
      const path = await window.electron.ipcRenderer.invoke('open-workspace')
      if (path) {
        await handleWorkspaceChange(path)
      }
    } catch (e) {
      log.error('Failed to open workspace:', e)
    }
  }, [handleWorkspaceChange])

  const handleFocusFileSearch = useCallback((): void => {
    fileExplorerRef.current?.focusSearch()
  }, [])

  const handleCollapseAll = useCallback((): void => {
    const currentExpanded = expandedDirsRef.current
    setExpandedDirs(new Set())
    if (workspace && currentExpanded.size > 0) {
      window.electron.ipcRenderer
        .invoke(
          'db:batch-set-dir-expanded',
          workspace,
          [...currentExpanded].map((p) => ({ absolutePath: p, expanded: false }))
        )
        .catch((e) => log.error('Failed to batch collapse dirs:', e))
    }
  }, [workspace])

  const handleExpandAll = useCallback((): void => {
    setExpandedDirs(new Set(allDirPaths))
    if (workspace && allDirPaths.size > 0) {
      window.electron.ipcRenderer
        .invoke(
          'db:batch-set-dir-expanded',
          workspace,
          [...allDirPaths].map((p) => ({ absolutePath: p, expanded: true }))
        )
        .catch((e) => log.error('Failed to batch expand dirs:', e))
    }
  }, [workspace, allDirPaths])

  const handleNavigateHistoryUp = useCallback((): void => {
    chatHistoryRef.current?.navigateUp()
  }, [])

  const handleNavigateHistoryDown = useCallback((): void => {
    chatHistoryRef.current?.navigateDown()
  }, [])

  const handleModeKey = useCallback((digit: number): void => {
    const index = digit - 1
    if (index < 0 || index >= CHAT_MODES.length) return
    const label = CHAT_MODES[index].label
    chatRef.current?.setMode(label)
  }, [])

  const isWelcomeScreen = useCallback((): boolean => {
    return (chatRef.current?.getMessages().length ?? 0) === 0
  }, [])

  const latestCopyFnRef = useRef<(() => Promise<void>) | undefined>(undefined)
  const latestPasteFnRef = useRef<(() => Promise<void>) | undefined>(undefined)

  useEffect(() => {
    latestCopyFnRef.current = async (): Promise<void> => {
      try {
        if (!workspace) return

        const currentUserIndex = chatRef.current?.getResolvedUserIndex() ?? 0
        if (currentUserIndex !== lastCopiedUserIndexRef.current) {
          lastPasteAddedRef.current = new Set()
          dirStructureInLastPasteRef.current = false
          lastCopiedUserIndexRef.current = currentUserIndex
        }

        const currentFileStates = fileStatesRef.current
        const currentDirStructureTag = dirStructureTagRef.current

                // 1. Determine what to include in the prompt
        const { pathsToInclude, pathsToMarkInq, includeDirStructure, transitionDirTag } =
          selectPromptContent(
            currentFileStates,
            filePaths,
            lastPasteAddedRef.current,
            currentDirStructureTag,
            dirStructureInLastPasteRef.current
          )

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

        // Record which paths are newly transitioned for copySnapshotRef
        copySnapshotRef.current = new Set(pathsToInclude)
        dirStructureCopiedRef.current = includeDirStructure



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
        let dirStructure: string | undefined
        if (includeDirStructure) {
          dirStructure = await window.electron.ipcRenderer.invoke('read-directory-tree', workspace)
          if (transitionDirTag) {
            setDirStructureTag('INQ')
            dirStructureTagRef.current = 'INQ'
          }
        }

        const success = await chatRef.current?.copyByIndex(undefined, pendingFiles, dirStructure)
        if (!success) return
      } catch (e) {
        log.error('Failed to copy context:', e)
      }
    }
  }, [workspace, filePaths])

  const handleCopy = useCallback(() => {
    latestCopyFnRef.current?.()
  }, [])

  const autoCopyRef = useRef(settings.autoCopy)
  useEffect(() => {
    autoCopyRef.current = settings.autoCopy
  }, [settings.autoCopy])

  const handleUserSend = useCallback(() => {
    if (autoCopyRef.current) {
      latestCopyFnRef.current?.()
    }
  }, [])

  const handleNewChat = useCallback(async (): Promise<void> => {
    isNewChatRef.current = true
    try {
      const currentMessages = chatRef.current?.getMessages() ?? []
      const prevActiveChatId = activeChatIdRef.current
      const savedDirStructureTag = dirStructureTagRef.current ?? ''

      resetPreprocessCache()
      chatRef.current?.loadChat([])

      copySnapshotRef.current = new Set()
      lastPasteAddedRef.current = new Set()
      dirStructureCopiedRef.current = false
      dirStructureInLastPasteRef.current = false
      lastCopiedUserIndexRef.current = -1
      if (dirStructureTag === 'ADD' || dirStructureTag === 'INQ') {
        setDirStructureTag('PND')
        dirStructureTagRef.current = 'PND'
      }
      setActiveChatId(null)

      const toConvert: string[] = []
      const nextFileStates = new Map(fileStates)
      fileStates.forEach((state, path) => {
        if (state === 'ADD' || state === 'INQ') {
          nextFileStates.set(path, 'PND')
          toConvert.push(path)
        }
      })
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

      if (currentMessages.length > 0) {
        const title = deriveTitle(currentMessages)
        const ws = workspaceRef.current
        const fs = serializeCurrentFileStates(fileStatesRef.current, ws)
        const ed = serializeExpandedDirs(expandedDirsRef.current)
        const savedMode = chatRef.current?.getMode() ?? ''
        const savedTaskId = chatRef.current?.getTaskId() ?? ''
        if (prevActiveChatId) {
          await window.electron.ipcRenderer.invoke(
            'db:update-chat-session',
            prevActiveChatId,
            title,
            JSON.stringify(currentMessages),
            fs,
            ed,
            savedDirStructureTag,
            savedMode,
            savedTaskId
          )
        } else {
          await window.electron.ipcRenderer.invoke(
            'db:create-chat-session',
            ws,
            title,
            JSON.stringify(currentMessages),
            fs,
            ed,
            savedDirStructureTag,
            savedMode,
            savedTaskId
          )
        }
      }
      setChatHistoryKey((k) => k + 1)
    } catch (e) {
      log.error('Failed to create new chat:', e)
    } finally {
      isNewChatRef.current = false
    }
  }, [fileStates, serializeCurrentFileStates, serializeExpandedDirs, dirStructureTag])

  const handleSelectChat = useCallback(
    async (id: string): Promise<void> => {
      await withLoading(async () => {
        try {
          await saveCurrentChat()
          resetPreprocessCache()
          chatRef.current?.loadChat([])
          setActiveChatId(null)

          await new Promise<void>((resolve) => setTimeout(resolve, 0))

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

            const restoredTag = session.dir_structure_tag
              ? (session.dir_structure_tag as FileTag)
              : null
            setDirStructureTag(restoredTag)
            dirStructureTagRef.current = restoredTag

            await new Promise<void>((resolve) => setTimeout(resolve, 0))

            const messages = JSON.parse(session.messages).map((m: ChatMessage) => ({
              ...m,
              variants: m.variants.map((v: ChatMessage['variants'][number]) => ({
                ...v,
                timestamp: new Date(v.timestamp)
              }))
            }))
            setActiveChatId(id)
            chatRef.current?.loadChat(
              messages,
              session.mode || undefined,
              id,
              session.task_id || undefined
            )
          }
        } catch (e) {
          log.error('Failed to select chat:', e)
        }
      })
    },
    [saveCurrentChat, workspace, applyChatSessionState, withLoading]
  )

  const handleMessagesChange = useCallback(
    async (messages: ChatMessage[], modeLabel: string, taskId: string) => {
      try {
        if (isNewChatRef.current) return
        if (messages.length === 0) return
        const title = deriveTitle(messages)
        const ws = workspaceRef.current
        const fs = serializeCurrentFileStates(fileStatesRef.current, ws)
        const ed = serializeExpandedDirs(expandedDirsRef.current)
        const dst = dirStructureTagRef.current ?? ''
        if (activeChatIdRef.current) {
          await window.electron.ipcRenderer.invoke(
            'db:update-chat-session',
            activeChatIdRef.current,
            title,
            JSON.stringify(messages),
            fs,
            ed,
            dst,
            modeLabel,
            taskId
          )
        } else {
          const id = await window.electron.ipcRenderer.invoke(
            'db:create-chat-session',
            ws,
            title,
            JSON.stringify(messages),
            fs,
            ed,
            dst,
            modeLabel,
            taskId
          )
          setActiveChatId(id)
          setChatHistoryKey((k) => k + 1)
        }
      } catch (e) {
        log.error('Failed to handle messages change:', e)
      }
    },
    [serializeCurrentFileStates, serializeExpandedDirs]
  )

  useEffect(() => {
    latestPasteFnRef.current = async (): Promise<void> => {
      try {
        if (workspace) {
          invalidateWorkspaceFileCache(workspace)
        }
        await chatRef.current?.pasteAsAssistant()
        await saveCurrentChat()

        const snapshot = copySnapshotRef.current
        const newlyAdded = new Set(snapshot)
        fileStatesRef.current.forEach((state, path) => {
          if (state === 'INQ') newlyAdded.add(path)
        })
        lastPasteAddedRef.current = newlyAdded
        dirStructureInLastPasteRef.current = dirStructureCopiedRef.current
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
        if (dirStructureTag === 'INQ') {
          setDirStructureTag('ADD')
          dirStructureTagRef.current = 'ADD'
        }
        copySnapshotRef.current = new Set()
      } catch (e) {
        log.error('Failed to paste:', e)
      }
    }
  }, [workspace, saveCurrentChat, dirStructureTag])

  const handlePaste = useCallback(() => {
    latestPasteFnRef.current?.()
  }, [])

  const handleDirStructureTagChange = useCallback((tag: FileTag | null) => {
    setDirStructureTag(tag)
    dirStructureTagRef.current = tag
  }, [])

  useGlobalShortcuts({
    onNewChat: handleNewChat,
    onOpenWorkspace: handleOpenWorkspaceShortcut,
    onFocusFileSearch: handleFocusFileSearch,
    onClearSelections: handleClearSelections,
    onCollapseAll: handleCollapseAll,
    onExpandAll: handleExpandAll,
    onNavigateHistoryUp: handleNavigateHistoryUp,
    onNavigateHistoryDown: handleNavigateHistoryDown,
    onCopy: handleCopy,
    onPaste: handlePaste,
    onModeKey: handleModeKey,
    isWelcomeScreen
  })

  useEffect(() => {
    const handleTaskRun = async (e: Event): Promise<void> => {
      const detail = (e as CustomEvent).detail as {
        files: string[]
        description: string
        taskId: string
      }
      if (!detail || !workspace) return

      const { files: taskFiles, description } = detail

      // 1. Match files
      const matchedPaths: string[] = []
      for (const tf of taskFiles) {
        const normTf = tf.replace(/\\/g, '/').replace(/^\//, '')
        let bestMatch: string | null = null
        let bestLen = -1
        for (const p of filePaths) {
          const normP = p.replace(/\\/g, '/')
          if (normP === normTf || normP.endsWith('/' + normTf) || normP.endsWith('\\' + normTf)) {
            if (normP.length > bestLen) {
              bestMatch = p
              bestLen = normP.length
            }
          }
        }
        if (bestMatch) matchedPaths.push(bestMatch)
      }

      // 2. Reset chat & states (similar to handleNewChat)
      isNewChatRef.current = true
      try {
        const currentMessages = chatRef.current?.getMessages() ?? []
        const prevActiveChatId = activeChatIdRef.current
        const savedDirStructureTag = dirStructureTagRef.current ?? ''
        chatRef.current?.loadChat([])
        copySnapshotRef.current = new Set()
        lastPasteAddedRef.current = new Set()
        dirStructureCopiedRef.current = false
        dirStructureInLastPasteRef.current = false
        lastCopiedUserIndexRef.current = -1
        setDirStructureTag('PND')
        dirStructureTagRef.current = 'PND'
        setActiveChatId(null)

        if (currentMessages.length > 0) {
          const title = deriveTitle(currentMessages)
          const ws = workspaceRef.current
          const fs = serializeCurrentFileStates(fileStatesRef.current, ws)
          const ed = serializeExpandedDirs(expandedDirsRef.current)
          const savedMode = chatRef.current?.getMode() ?? ''
          if (prevActiveChatId) {
            await window.electron.ipcRenderer.invoke(
              'db:update-chat-session',
              prevActiveChatId,
              title,
              JSON.stringify(currentMessages),
              fs,
              ed,
              savedDirStructureTag,
              savedMode
            )
          } else {
            await window.electron.ipcRenderer.invoke(
              'db:create-chat-session',
              ws,
              title,
              JSON.stringify(currentMessages),
              fs,
              ed,
              savedDirStructureTag,
              savedMode
            )
          }
        }
        setChatHistoryKey((k) => k + 1)

        // 3. Set file states
        if (filePaths.size > 0) {
          await window.electron.ipcRenderer.invoke('db:batch-remove-file-states', workspace, [
            ...filePaths
          ])
        }

        const nextFileStates = new Map<string, FileTag>()
        for (const p of matchedPaths) {
          nextFileStates.set(p, 'PND')
        }
        setFileStates(nextFileStates)

        if (matchedPaths.length > 0) {
          await window.electron.ipcRenderer.invoke(
            'db:batch-set-file-states',
            workspace,
            matchedPaths.map((p) => ({ absolutePath: p, tag: 'PND' }))
          )
        }

        // 4. Read files and run task
        const pendingFilesPromises = matchedPaths.map(async (absolutePath) => {
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

        const dirStructure = await window.electron.ipcRenderer.invoke(
          'read-directory-tree',
          workspace
        )

        await chatRef.current?.runTask(description, pendingFiles, dirStructure, detail.taskId)
        copySnapshotRef.current = new Set(matchedPaths)

        // Transition to INQ
        setFileStates((prev) => {
          const next = new Map(prev)
          for (const p of matchedPaths) next.set(p, 'INQ')
          return next
        })
        if (matchedPaths.length > 0) {
          await window.electron.ipcRenderer.invoke(
            'db:batch-set-file-states',
            workspace,
            matchedPaths.map((p) => ({ absolutePath: p, tag: 'INQ' }))
          )
        }
        setDirStructureTag('INQ')
        dirStructureTagRef.current = 'INQ'
      } catch (err) {
        log.error('Failed to run task:', err)
      } finally {
        isNewChatRef.current = false
      }
    }

    window.addEventListener('task-run', handleTaskRun)
    return () => {
      window.removeEventListener('task-run', handleTaskRun)
    }
  }, [workspace, filePaths, serializeCurrentFileStates, serializeExpandedDirs])

  const [lineCount, setLineCount] = useState<number | null>(null)
  const [tokenCount, setTokenCount] = useState<number | null>(null)

  useEffect(() => {
    if (!workspace) return

    const selectedAbsolute = [...fileStates.keys()].filter((p) => filePaths.has(p))
    let cancelled = false
    const timer = setTimeout(async () => {
      if (cancelled) return
      if (selectedAbsolute.length === 0) {
        setLineCount(0)
        setTokenCount(0)
        return
      }
      const relativePaths = selectedAbsolute.map((abs) => {
        let rel = abs
        if (rel.startsWith(workspace)) {
          rel = rel.substring(workspace.length)
          if (rel.startsWith('/') || rel.startsWith('\\')) rel = rel.substring(1)
        }
        return rel
      })
      try {
        const result = (await window.electron.ipcRenderer.invoke(
          'count-lines',
          workspace,
          relativePaths
        )) as { lines: number; tokens: number }
        if (!cancelled) {
          setLineCount(result.lines)
          setTokenCount(result.tokens)
        }
      } catch (e) {
        log.error('Failed to count lines:', e)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [workspace, fileStates, filePaths])

  return (
    <WorkspaceContext.Provider value={{ workspace }}>
      <FileIncludeProvider>
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
                ref={fileExplorerRef}
                workspace={workspace}
                onWorkspaceChange={handleWorkspaceChange}
                fileStates={fileStates}
                expandedDirs={expandedDirs}
                onToggleFile={handleToggleFile}
                onToggleExpand={handleToggleExpand}
                onClearSelections={handleClearSelections}
                onFilePathsChange={handleFilePathsChange}
                onDirPathsChange={handleDirPathsChange}
                dirStructureTag={dirStructureTag}
                onDirStructureTagChange={handleDirStructureTagChange}
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
                onUserSend={handleUserSend}
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
                ref={chatHistoryRef}
                workspace={workspace}
                activeChatId={activeChatId}
                onSelectChat={handleSelectChat}
                onNewChat={handleNewChat}
                refreshKey={chatHistoryKey}
              />
            </div>
          </div>
          <StatusBar
            lineCount={workspace ? (lineCount ?? 0) : null}
            tokenCount={workspace ? (tokenCount ?? 0) : null}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onSettings={() => setShowSettings(true)}
          />
        </div>
        {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      </FileIncludeProvider>
    </WorkspaceContext.Provider>
  )
}

export default App
