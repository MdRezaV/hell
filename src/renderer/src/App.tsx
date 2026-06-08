import { useState, useRef, useEffect, useCallback } from 'react'
import FileExplorer, { type FileTag } from './components/FileExplorer'
import AIChat, { type AIChatHandle } from './components/AIChat'
import StatusBar from './components/StatusBar'
import { WorkspaceContext } from './WorkspaceContext'

type FileStates = Map<string, FileTag>

const MIN_LEFT_WIDTH = 160
const MAX_LEFT_WIDTH = 520
const DEFAULT_LEFT_WIDTH = 280

function App(): React.JSX.Element {
  const [leftWidth, setLeftWidth] = useState<number>(DEFAULT_LEFT_WIDTH)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [fileStates, setFileStates] = useState<FileStates>(new Map())
  const [filePaths, setFilePaths] = useState<Set<string>>(new Set())
  const copySnapshotRef = useRef<Set<string>>(new Set())
  const isResizing = useRef(false)
  const layoutRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<AIChatHandle>(null)

  const handleWorkspaceChange = useCallback((path: string | null): void => {
    setWorkspace(path)
    setFileStates(new Map())
    setFilePaths(new Set())
    copySnapshotRef.current = new Set()
  }, [])

  const handleToggleFile = useCallback((paths: string[], checked: boolean): void => {
    setFileStates((prev) => {
      const next = new Map(prev)
      if (checked) {
        paths.forEach((p) => {
          if (!next.has(p)) next.set(p, 'PND')
        })
      } else {
        paths.forEach((p) => {
          if (next.get(p) !== 'ADD') next.delete(p)
        })
      }
      return next
    })
  }, [])

  const handleFilePathsChange = useCallback((paths: Set<string>): void => {
    setFilePaths(paths)
  }, [])

  const handleCopy = useCallback(async (): Promise<void> => {
    const pendingFiles: string[] = []
    fileStates.forEach((state, path) => {
      if ((state === 'PND' || state === 'INQ') && filePaths.has(path)) {
        pendingFiles.push(path)
      }
    })

    const success = await chatRef.current?.copyByIndex(undefined, pendingFiles)
    if (!success) return

    setFileStates((prev) => {
      const next = new Map(prev)
      const snapshot = new Set<string>()
      next.forEach((state, path) => {
        if (state === 'PND') {
          snapshot.add(path)
          next.set(path, 'INQ')
        } else if (state === 'INQ') {
          snapshot.add(path)
        }
      })
      copySnapshotRef.current = snapshot
      return next
    })
  }, [fileStates, filePaths])

  const handleNewChat = useCallback((): void => {
    setFileStates((prev) => {
      const next = new Map<string, FileTag>()
      prev.forEach((_, path) => {
        next.set(path, 'PND')
      })
      return next
    })
    copySnapshotRef.current = new Set()
  }, [])

  const handlePaste = useCallback(async (): Promise<void> => {
    await chatRef.current?.pasteAsAssistant()

    const snapshot = copySnapshotRef.current
    setFileStates((prev) => {
      const next = new Map(prev)
      snapshot.forEach((path) => {
        next.set(path, 'ADD')
      })
      next.forEach((state, path) => {
        if (state === 'INQ') next.set(path, 'ADD')
      })
      return next
    })
    copySnapshotRef.current = new Set()
  }, [])

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
              onToggleFile={handleToggleFile}
              onFilePathsChange={handleFilePathsChange}
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
