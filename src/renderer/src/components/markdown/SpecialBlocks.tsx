import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy, Play } from 'lucide-react'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { useFileContent } from '../../hooks/useFileContent'
import { FilePathDisplay } from './MarkdownPrimitives'

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
        <span className="md-command-label">Command</span>
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

// Memoized generic code block — skips re-highlighting when code text + language
// are unchanged (i.e. for all completed blocks during streaming).
export const GenericCodeBlock = memo(function GenericCodeBlock({
  language,
  code,
  showLangLabel
}: {
  language: string
  code: string
  showLangLabel: boolean
}): React.JSX.Element {
  return (
    <div className="md-code-block-wrapper">
      {showLangLabel && <div className="md-code-lang">{language}</div>}
      <SyntaxHighlighter language={language} style={oneDark} className="md-syntax-block">
        {code}
      </SyntaxHighlighter>
    </div>
  )
})

export function FileExistenceChecker({
  path,
  onStatus
}: {
  path: string
  onStatus: (path: string, exists: boolean | null) => void
}): null {
  const state = useFileContent(path)
  useEffect(() => {
    if (state === null) {
      onStatus(path, null)
    } else {
      onStatus(path, state.exists)
    }
  }, [state, path, onStatus])
  return null
}

export const TaskBlock = memo(function TaskBlock({
  taskId,
  files,
  description
}: {
  taskId: string
  files: string[]
  description: string
}): React.JSX.Element {
  const { copied, copy } = useCopyToClipboard()
  const [fileExistsMap, setFileExistsMap] = useState<Map<string, boolean | null>>(new Map())

  const handleStatus = useCallback((path: string, exists: boolean | null) => {
    setFileExistsMap((prev) => {
      if (prev.get(path) === exists) return prev
      const next = new Map(prev)
      next.set(path, exists)
      return next
    })
  }, [])

  const missingFiles = useMemo(
    () => files.filter((f) => fileExistsMap.get(f) === false),
    [files, fileExistsMap]
  )

  const buildMessage = useCallback((): string => {
    if (missingFiles.length === 0) return description
    return `Files: ${missingFiles.join(', ')}\n${description}`
  }, [missingFiles, description])

  const handleCopy = useCallback(async (): Promise<void> => {
    await copy(buildMessage())
  }, [copy, buildMessage])

  const handleRun = useCallback((): void => {
    window.dispatchEvent(
      new CustomEvent('task-run', { detail: { files, description: buildMessage() } })
    )
  }, [files, buildMessage])

  return (
    <div className="md-file-block md-task-block">
      {files.map((f) => (
        <FileExistenceChecker key={f} path={f} onStatus={handleStatus} />
      ))}
      <div className="md-file-header">
        <div className="md-file-header-left">
          <span className="md-file-status-label task">TASK {taskId}</span>
          <span className="md-task-file-count" title={files.join(', ')}>
            {files.length} file{files.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="md-file-header-actions">
          <button
            type="button"
            className={`md-file-copy${copied ? ' copied' : ''}`}
            onClick={handleCopy}
            title={copied ? 'Copied' : 'Copy description'}
            aria-label={copied ? 'Copied' : 'Copy description'}
          >
            {copied ? <Check size={14} strokeWidth={2.25} /> : <Copy size={14} strokeWidth={2} />}
          </button>
          <button type="button" className="md-file-apply task" onClick={handleRun} title="Run task">
            <Play size={12} />
            <span>Run</span>
          </button>
        </div>
      </div>
      <div className="md-task-files-list">
        {files.length > 0 ? (
          files.map((f, i) => (
            <span key={i} className="md-task-file-chip" title={f}>
              <FilePathDisplay path={f} />
            </span>
          ))
        ) : (
          <span className="md-task-no-files">No files</span>
        )}
      </div>
      <div className="md-task-description">
        {description.split('\n').map((line, i) => (
          <p key={i} className="md-task-paragraph">
            {line || '\u00A0'}
          </p>
        ))}
      </div>
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
        className="md-commit-copy"
        onClick={handleCopy}
        title={copied ? 'Copied' : 'Copy commit message'}
        aria-label={copied ? 'Copied' : 'Copy commit message'}
      >
        {copied ? <Check size={14} strokeWidth={2.25} /> : <Copy size={14} strokeWidth={2} />}
      </button>
    </div>
  )
})
