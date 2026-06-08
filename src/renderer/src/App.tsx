import { useState, useRef, useEffect, useCallback } from 'react'
import FileExplorer from './components/FileExplorer'
import AIChat from './components/AIChat'
import Versions from './components/Versions'
import { WorkspaceContext } from './WorkspaceContext'

const MIN_LEFT_WIDTH = 160
const MAX_LEFT_WIDTH = 520
const DEFAULT_LEFT_WIDTH = 280

function App(): React.JSX.Element {
  const [leftWidth, setLeftWidth] = useState<number>(DEFAULT_LEFT_WIDTH)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const isResizing = useRef(false)
  const layoutRef = useRef<HTMLDivElement>(null)

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
            style={{ width: `${leftWidth}px`, flexBasis: `${leftWidth}px`, flexGrow: 0, flexShrink: 0 }}
          >
            <FileExplorer workspace={workspace} onWorkspaceChange={setWorkspace} />
          </div>
          <div
            className="w-[3px] cursor-col-resize bg-transparent relative flex-shrink-0 z-10 transition-[background] duration-normal hover:bg-accent active:bg-accent before:absolute before:top-0 before:bottom-0 before:-left-[3px] before:-right-[3px]"
            onMouseDown={startResize}
          />
          <div className="flex-1 bg-background flex overflow-hidden min-w-0">
            <AIChat />
          </div>
        </div>
        <div className="flex items-center h-5 m-0 px-2.5 bg-accent flex-shrink-0 gap-3 leading-none">
          <span className="text-[11px] font-medium text-accent-text opacity-85 leading-none">Ready</span>
          <span className="flex-1"></span>
          <Versions />
        </div>
      </div>
    </WorkspaceContext.Provider>
  )
}

export default App
