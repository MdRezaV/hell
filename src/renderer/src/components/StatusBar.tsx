import React, { memo } from 'react'
import '../styles/StatusBar.css'

interface StatusBarProps {
  onCopy: () => void
  onPaste: () => void
  onClearDb: () => void
}

const StatusBar = memo(function StatusBar({
  onCopy,
  onPaste,
  onClearDb
}: StatusBarProps): React.JSX.Element {
  return (
    <div className="statusbar">
      <span className="statusbar-item">Ready</span>
      <span className="statusbar-spacer"></span>
      <div className="statusbar-btn-group">
        <button
          onClick={onClearDb}
          title="Clear all database data"
          className="statusbar-btn statusbar-btn-danger"
        >
          CLEAR DB
        </button>
        <button onClick={onPaste} className="statusbar-btn">
          PASTE
        </button>
        <button onClick={onCopy} className="statusbar-btn">
          COPY
        </button>
      </div>
    </div>
  )
})

export default StatusBar
