import React, { memo } from 'react'

interface StatusBarProps {
  onCopy: () => void
  onPaste: () => void
}

const StatusBar = memo(function StatusBar({ onCopy, onPaste }: StatusBarProps): React.JSX.Element {
  return (
    <div className="statusbar">
      <span className="statusbar-item">Ready</span>
      <span className="statusbar-spacer"></span>
      <div className="flex gap-0">
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
