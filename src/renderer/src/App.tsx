import { useState, useRef, useEffect, useCallback } from 'react'
import { Code2 } from 'lucide-react'
import FileExplorer from './components/FileExplorer'
import Versions from './components/Versions'

const MIN_LEFT_WIDTH = 160
const MAX_LEFT_WIDTH = 520
const DEFAULT_LEFT_WIDTH = 280

function WelcomePanel(): React.JSX.Element {
  return (
    <div className="welcome-panel panel">
      <Code2 className="welcome-icon" size={64} strokeWidth={1} />
      <h2>Welcome</h2>
      <p>Open a workspace folder to browse and select files using the explorer panel.</p>
      <div className="welcome-shortcuts">
        <div className="shortcut-row">
          <span className="shortcut-label">Open Folder</span>
          <span className="shortcut-key"><span className="kbd">Ctrl</span><span className="kbd">O</span></span>
        </div>
        <div className="shortcut-row">
          <span className="shortcut-label">Toggle Sidebar</span>
          <span className="shortcut-key"><span className="kbd">Ctrl</span><span className="kbd">B</span></span>
        </div>
      </div>
    </div>
  )
}

function App(): React.JSX.Element {
  const [leftWidth, setLeftWidth] = useState<number>(DEFAULT_LEFT_WIDTH)
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
    <div className="ide-layout">
      <div className="main-content" ref={layoutRef}>
        <div className="left-pane" style={{ width: `${leftWidth}px`, flexBasis: `${leftWidth}px`, flexGrow: 0, flexShrink: 0 }}>
          <FileExplorer />
        </div>
        <div className="resize-handle" onMouseDown={startResize} />
        <div className="right-pane">
          <WelcomePanel />
        </div>
      </div>
      <div className="statusbar">
        <span className="statusbar-item">Ready</span>
        <span className="statusbar-spacer"></span>
        <Versions />
      </div>
    </div>
  )
}

export default App