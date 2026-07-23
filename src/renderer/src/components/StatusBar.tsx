import React, { memo } from 'react'
import { Settings } from 'lucide-react'
import '../styles/StatusBar.css'

interface StatusBarProps {
  lineCount: number | null
  tokenCount: number | null
  onCopy: () => void
  onPaste: () => void
  onSettings: () => void
}

function formatLineCount(n: number | null): string {
  if (n === null) return 'Ready'
  if (n === 0) return '0 lines'
  if (n >= 1000) return (n / 1000).toFixed(2) + 'K lines'
  return n + ' lines'
}

function formatTokenCount(n: number | null): string {
  if (n === null) return ''
  if (n === 0) return '0 tokens'
  if (n >= 1000) return (n / 1000).toFixed(2) + 'K tokens'
  return n + ' tokens'
}

function formatStats(lineCount: number | null, tokenCount: number | null): string {
  if (lineCount === null || tokenCount === null) return 'Ready'
  return `${formatLineCount(lineCount)} - ${formatTokenCount(tokenCount)}`
}

const StatusBar = memo(function StatusBar({
  lineCount,
  tokenCount,
  onCopy,
  onPaste,
  onSettings
}: StatusBarProps): React.JSX.Element {
  return (
    <div className="statusbar">
      <span className="statusbar-item">{formatStats(lineCount, tokenCount)}</span>
      <span className="statusbar-spacer"></span>
      <div className="statusbar-btn-group">
        <button onClick={onPaste} className="statusbar-btn">
          PASTE
        </button>
        <button onClick={onCopy} className="statusbar-btn">
          COPY
        </button>
        <button onClick={onSettings} className="statusbar-btn" title="Settings">
          <Settings size={12} />
        </button>
      </div>
    </div>
  )
})

export default StatusBar
