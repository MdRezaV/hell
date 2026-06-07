import FileExplorer from './components/FileExplorer'
import Versions from './components/Versions'

function WelcomePanel(): React.JSX.Element {
  return (
    <div className="welcome-panel panel">
      <svg className="welcome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
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
  return (
    <div className="ide-layout">
      <div className="titlebar">
        <span className="titlebar-title">Hell</span>
      </div>
      <div className="main-content">
        <div className="left-pane">
          <FileExplorer />
        </div>
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