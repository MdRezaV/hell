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
      <div className="flex gap-0">
        <button
          onClick={onClearDb}
          title="Clear all database data"
          className="inline-flex items-center justify-center px-2 h-[18px] text-[10px] font-bold tracking-wider text-white bg-[rgba(0,0,0,0.15)] border border-[rgba(255,255,255,0.2)] border-r-0 rounded-none cursor-pointer leading-none hover:bg-[rgba(180,40,40,0.5)] active:bg-[rgba(180,40,40,0.7)]"
        >
          CLEAR DB
        </button>
        <button
          onClick={onPaste}
          className="inline-flex items-center justify-center px-2 h-[18px] text-[10px] font-bold tracking-wider text-white bg-[rgba(0,0,0,0.15)] border border-[rgba(255,255,255,0.2)] border-r-0 rounded-none cursor-pointer leading-none hover:bg-[rgba(0,0,0,0.3)] active:bg-[rgba(0,0,0,0.4)]"
        >
          PASTE
        </button>
        <button
          onClick={onCopy}
          className="inline-flex items-center justify-center px-2 h-[18px] text-[10px] font-bold tracking-wider text-white bg-[rgba(0,0,0,0.15)] border border-[rgba(255,255,255,0.2)] rounded-none cursor-pointer leading-none hover:bg-[rgba(0,0,0,0.3)] active:bg-[rgba(0,0,0,0.4)]"
        >
          COPY
        </button>
      </div>
    </div>
  )
})

export default StatusBar
