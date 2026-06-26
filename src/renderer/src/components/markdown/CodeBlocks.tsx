import React, { memo, useCallback, useRef } from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy, Play, Terminal } from 'lucide-react'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { normalizeLineEndings } from '../../utils/markdownParser'
import { useDeferHeavyRendering, useDeferredHighlighting } from './DeferredHighlighting'

export const LinesDisplay = memo(function LinesDisplay({
  code,
  language,
  onScroll,
  isStreaming = false
}: {
  code: string
  language?: string
  onScroll?: () => void
  isStreaming?: boolean
}): React.JSX.Element {
  const normalizedCode = normalizeLineEndings(code)
  const lines = normalizedCode.split('\n')
  const hasSyntax = !!language && language !== 'text'
  const gutterRef = useRef<HTMLDivElement>(null)
  const codeRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const deferHeavy = useDeferHeavyRendering()
  const highlightReady = useDeferredHighlighting(deferHeavy, codeRef)
  const showPlain = isStreaming || (deferHeavy && !highlightReady)

  const handleCodeScroll = useCallback(() => {
    if (syncing.current) return
    syncing.current = true
    if (gutterRef.current && codeRef.current) {
      gutterRef.current.scrollTop = codeRef.current.scrollTop
    }
    requestAnimationFrame(() => {
      syncing.current = false
    })
    onScroll?.()
  }, [onScroll])

  const handleGutterScroll = useCallback(() => {
    if (syncing.current) return
    syncing.current = true
    if (gutterRef.current && codeRef.current) {
      codeRef.current.scrollTop = gutterRef.current.scrollTop
    }
    requestAnimationFrame(() => {
      syncing.current = false
    })
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
        {hasSyntax && !showPlain ? (
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

export const CommandBlock = memo(function CommandBlock({
  code
}: {
  code: string
}): React.JSX.Element {
  const { copied, copy } = useCopyToClipboard()

  const handleRun = useCallback(async (): Promise<void> => {
    await copy(code)
  }, [copy, code])

  return (
    <div className="md-command-block">
      <div className="md-command-header">
        <span className="md-command-label">
          <Terminal size={12} />
          Command
        </span>
        <button
          type="button"
          className="md-command-run"
          onClick={handleRun}
          title={copied ? 'Copied to clipboard' : 'Copy command to clipboard'}
        >
          {copied ? (
            <>
              <Check size={12} />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Play size={12} />
              <span>Run</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter language="bash" style={oneDark} className="md-command-syntax">
        {code}
      </SyntaxHighlighter>
    </div>
  )
})

export const CommitBlock = memo(function CommitBlock({
  code
}: {
  code: string
}): React.JSX.Element {
  const { copied, copy } = useCopyToClipboard()
  const handleCopy = useCallback(async (): Promise<void> => {
    await copy(code)
  }, [copy, code])

  return (
    <div className="md-commit-block">
      <span className="md-commit-text" title={code}>
        {code}
      </span>
      <button
        type="button"
        className={`md-commit-copy${copied ? ' copied' : ''}`}
        onClick={handleCopy}
        title={copied ? 'Copied' : 'Copy commit message'}
        aria-label={copied ? 'Copied' : 'Copy commit message'}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  )
})

export const GenericCodeBlock = memo(function GenericCodeBlock({
  language,
  code,
  showLangLabel,
  isStreaming = false
}: {
  language: string
  code: string
  showLangLabel: boolean
  isStreaming?: boolean
}): React.JSX.Element {
  const deferHeavy = useDeferHeavyRendering()
  const containerRef = useRef<HTMLDivElement>(null)
  const highlightReady = useDeferredHighlighting(deferHeavy, containerRef)
  const showPlain = isStreaming || (deferHeavy && !highlightReady)

  return (
    <div className="md-code-block-wrapper" ref={containerRef}>
      {showLangLabel && <div className="md-code-lang">{language}</div>}
      {showPlain ? (
        <pre className="md-syntax-block md-plain-pre">
          <code>{code}</code>
        </pre>
      ) : (
        <SyntaxHighlighter language={language} style={oneDark} className="md-syntax-block">
          {code}
        </SyntaxHighlighter>
      )}
    </div>
  )
})
