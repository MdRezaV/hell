import React, { memo, useCallback, useRef, useState } from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { normalizeLineEndings } from '../../utils/markdownParser'
import '../../styles/Markdown.css'

export function FileIncludeAddButton({ path }: { path: string }): React.JSX.Element {
  const [status, setStatus] = useState<'idle' | 'added' | 'notFound'>('idle')

  const handleClick = useCallback((): void => {
    const detail: { path: string; matched?: boolean } = { path }
    const event = new CustomEvent('file-include-add', { detail })
    window.dispatchEvent(event)
    setStatus(detail.matched ? 'added' : 'notFound')
  }, [path])

  let label = 'Add'
  let className = 'md-file-include-add'
  if (status === 'added') {
    label = 'Added'
    className += ' added'
  } else if (status === 'notFound') {
    label = 'Not Found'
    className += ' not-found'
  }

  return (
    <button
      type="button"
      className={className}
      title={status === 'notFound' ? 'File not found in workspace' : 'Add file'}
      onClick={handleClick}
      disabled={status === 'added'}
    >
      {label}
    </button>
  )
}

export function FilePathDisplay({ path }: { path: string }): React.JSX.Element {
  const segments = path.split(/[/\\]/)
  return (
    <span className="md-file-path" title={path}>
      <span className="md-file-path-text">
        {segments.map((seg, i) => (
          <span key={i}>
            {i > 0 && <span className="md-file-path-segment">/</span>}
            <span className="md-file-path-segment">{seg}</span>
          </span>
        ))}
      </span>
    </span>
  )
}

export const LinesDisplay = memo(function LinesDisplay({
  code,
  language,
  onScroll
}: {
  code: string
  language?: string
  onScroll?: () => void
}): React.JSX.Element {
  const normalizedCode = normalizeLineEndings(code)
  const lines = normalizedCode.split('\n')
  const hasSyntax = !!language && language !== 'text'
  const gutterRef = useRef<HTMLDivElement>(null)
  const codeRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  const handleCodeScroll = useCallback(() => {
    if (syncing.current) return
    syncing.current = true
    if (gutterRef.current && codeRef.current) {
      gutterRef.current.scrollTop = codeRef.current.scrollTop
    }
    syncing.current = false
    onScroll?.()
  }, [onScroll])

  const handleGutterScroll = useCallback(() => {
    if (syncing.current) return
    syncing.current = true
    if (gutterRef.current && codeRef.current) {
      codeRef.current.scrollTop = gutterRef.current.scrollTop
    }
    syncing.current = false
  }, [])

  return (
    <>
      <div className="md-file-gutter" ref={gutterRef} onScroll={handleGutterScroll}>
        {lines.map((_, i) => (
          <div key={i} className="md-file-line-number">
            {i + 1}
          </div>
        ))}
      </div>
      <div className="md-file-code-scroll" onScroll={handleCodeScroll} ref={codeRef}>
        {hasSyntax ? (
          <SyntaxHighlighter language={language} style={oneDark} className="md-file-syntax">
            {normalizedCode}
          </SyntaxHighlighter>
        ) : (
          <div className="md-file-code-lines">
            {lines.map((line, i) => (
              <div key={i} className="md-file-line-content">
                <code>{line}</code>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
})
