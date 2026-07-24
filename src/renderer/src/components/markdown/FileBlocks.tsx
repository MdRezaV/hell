import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { diffLines } from 'diff'
import {
  ArrowRight,
  Check,
  CircleAlert,
  Copy,
  FileCode,
  FilePlus,
  ListChecks,
  MoveRight,
  Play,
  Plus,
  Replace,
  Search,
  Trash2,
  Undo2,
  X
} from 'lucide-react'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { useScrollSync } from '../../hooks/useScrollSync'
import { useFileContent } from '../../hooks/useFileContent'
import { useWorkspace } from '../../WorkspaceContext'
import { getLanguageFromPath } from '../../utils/markdownLanguages'
import { normalizeLineEndings } from '../../utils/markdownParser'
import {
  applyFileDelete,
  applyFileMove,
  applyFileReplace,
  applyFileWrite,
  detectReplaceState,
  invalidateFileContentCache,
  unapplyFileReplace
} from '../../utils/fileApply'
import { LinesDisplay, type LineHighlight } from './CodeBlocks'
import { ApplyBlockStatus, useApplyRegistration } from '@renderer/hooks/useApplyAll'
import { useFileIncludeContext } from './ApplyAll'

function computeLineDiff(
  oldCode: string,
  newCode: string
): { oldHighlights: LineHighlight[]; newHighlights: LineHighlight[] } {
  const changes = diffLines(oldCode, newCode)
  const oldHighlights: LineHighlight[] = []
  const newHighlights: LineHighlight[] = []

  for (const part of changes) {
    const lines = part.value.split('\n')
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop()
    }
    for (let k = 0; k < lines.length; k++) {
      if (part.added) {
        newHighlights.push('added')
      } else if (part.removed) {
        oldHighlights.push('removed')
      } else {
        oldHighlights.push('unchanged')
        newHighlights.push('unchanged')
      }
    }
  }

  return { oldHighlights, newHighlights }
}

export function FileIncludeAddButton({ path }: { path: string }): React.JSX.Element {
  const [status, setStatus] = useState<'idle' | 'added' | 'notFound'>('idle')
  const includeCtx = useFileIncludeContext()
  const register = includeCtx?.register
  const unregister = includeCtx?.unregister
  const markAdded = includeCtx?.markAdded
  const markNotFound = includeCtx?.markNotFound

  useEffect(() => {
    register?.(path)
    return () => {
      unregister?.(path)
    }
  }, [path, register, unregister])

  const handleClick = useCallback((): void => {
    const detail: { path: string; matched?: boolean } = { path }
    const event = new CustomEvent('file-include-add', { detail })
    window.dispatchEvent(event)
    if (detail.matched) {
      setStatus('added')
      markAdded?.(path)
    } else {
      setStatus('notFound')
      markNotFound?.(path)
    }
  }, [path, markAdded, markNotFound])

  const effectiveStatus = status === 'idle' && includeCtx?.addedPaths.has(path) ? 'added' : status

  let label = 'Add'
  let className = 'md-file-include-add'
  if (effectiveStatus === 'added') {
    label = 'Added'
    className += ' added'
  } else if (effectiveStatus === 'notFound') {
    label = 'Not Found'
    className += ' not-found'
  }

  return (
    <button
      type="button"
      className={className}
      title={effectiveStatus === 'notFound' ? 'File not found in workspace' : 'Add file'}
      onClick={handleClick}
      disabled={effectiveStatus === 'added'}
    >
      {effectiveStatus === 'added' ? (
        <Check size={10} />
      ) : effectiveStatus === 'notFound' ? (
        <X size={10} />
      ) : (
        <Plus size={10} />
      )}
      <span>{label}</span>
    </button>
  )
}

export function FilePathDisplay({ path }: { path: string }): React.JSX.Element {
  const segments = path.split(/[/\\]/)
  return (
    <span className="md-file-path" title={path}>
      <FileCode size={14} className="md-file-path-icon" />
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

export const FileReplaceBlock = memo(function FileReplaceBlock({
  path,
  oldCode,
  newCode,
  isStreaming = false
}: {
  path: string
  oldCode: string
  newCode: string
  isStreaming?: boolean
}): React.JSX.Element {
  const { copied: copiedOld, copy: copyOld } = useCopyToClipboard()
  const { copied: copiedNew, copy: copyNew } = useCopyToClipboard()
  const { leftRef, rightRef, handleLeftScroll, handleRightScroll } = useScrollSync()
  const fileState = useFileContent(path)
  const { workspace } = useWorkspace()
  const [applyState, setApplyState] = useState<'idle' | 'applied' | 'error'>('idle')

  const normalizedOldCode = useMemo(() => normalizeLineEndings(oldCode), [oldCode])
  const normalizedNewCode = useMemo(() => normalizeLineEndings(newCode), [newCode])
  const language = useMemo(() => getLanguageFromPath(path), [path])

  const { oldHighlights, newHighlights } = useMemo(
    () => computeLineDiff(normalizedOldCode, normalizedNewCode),
    [normalizedOldCode, normalizedNewCode]
  )

  const detectedState = useMemo(() => {
    const content = fileState?.content ?? null
    const normalizedContent = content !== null ? normalizeLineEndings(content) : null
    return detectReplaceState(
      normalizedContent,
      fileState?.exists ?? false,
      normalizedOldCode,
      normalizedNewCode
    )
  }, [fileState, normalizedOldCode, normalizedNewCode])

  const [prevDetectedState, setPrevDetectedState] = useState(detectedState)

  if (detectedState !== prevDetectedState) {
    setPrevDetectedState(detectedState)
    if (detectedState === 'applied' && applyState === 'idle') {
      setApplyState('applied')
    } else if (detectedState === 'idle' && applyState === 'applied') {
      setApplyState('idle')
    }
  }

  const notFound = detectedState === 'notFound' && applyState !== 'applied'

  const handleCopyOld = useCallback(async (): Promise<void> => {
    await copyOld(oldCode)
  }, [copyOld, oldCode])

  const handleCopyNew = useCallback(async (): Promise<void> => {
    await copyNew(newCode)
  }, [copyNew, newCode])

  const handleApply = useCallback(async (): Promise<void> => {
    if (!workspace) return
    const result = await applyFileReplace(workspace, path, oldCode, newCode)
    if (result.success) {
      invalidateFileContentCache(workspace, path)
      setApplyState('applied')
    } else {
      setApplyState('error')
      throw new Error('Apply failed')
    }
  }, [workspace, path, oldCode, newCode])

  const handleUnapply = useCallback(async (): Promise<void> => {
    if (!workspace) return
    const result = await unapplyFileReplace(workspace, path, oldCode, newCode)
    if (result.success) {
      invalidateFileContentCache(workspace, path)
      setApplyState('idle')
    } else {
      setApplyState('error')
      throw new Error('Unapply failed')
    }
  }, [workspace, path, oldCode, newCode])

  const applyStatus: ApplyBlockStatus = notFound ? 'notFound' : applyState
  const stableKey = `replace:${path}:${oldCode}:${newCode}`
  const effectiveStatus = useApplyRegistration(handleApply, applyStatus, handleUnapply, stableKey)

  return (
    <div className="md-file-block md-file-replace-block">
      <div className="md-file-header">
        <div className="md-file-header-left">
          {notFound && (
            <span className="md-file-status-label error">
              <CircleAlert size={12} />
              NOT FOUND
            </span>
          )}
          <FilePathDisplay path={path} />
        </div>
        <div className="md-file-header-actions">
          <button
            type="button"
            className={`md-file-apply unapply${effectiveStatus === 'applied' ? '' : ' disabled'}`}
            onClick={handleUnapply}
            disabled={effectiveStatus !== 'applied'}
            title={effectiveStatus === 'applied' ? 'Revert applied changes' : 'Apply changes first'}
          >
            <Undo2 size={12} />
            <span>UnApply</span>
          </button>
          <button
            type="button"
            className={`md-file-apply${effectiveStatus === 'applied' ? ' applied' : ''}${effectiveStatus === 'error' ? ' error' : ''}`}
            onClick={handleApply}
            disabled={effectiveStatus === 'applied'}
            title={
              effectiveStatus === 'applied'
                ? 'Already applied'
                : effectiveStatus === 'error'
                  ? 'Failed to apply'
                  : 'Apply changes'
            }
          >
            {effectiveStatus === 'applied' ? (
              <>
                <Check size={12} />
                <span>Applied</span>
              </>
            ) : effectiveStatus === 'error' ? (
              <>
                <X size={12} />
                <span>Error</span>
              </>
            ) : (
              <>
                <Check size={12} />
                <span>Apply</span>
              </>
            )}
          </button>
        </div>
      </div>
      <div className="md-file-diff">
        <div className="md-file-diff-side old">
          <div className="md-file-diff-header">
            <span className="md-file-replace-label old">
              <Search size={12} />
              SEARCH
            </span>
            <button
              type="button"
              className={`md-file-copy${copiedOld ? ' copied' : ''}`}
              onClick={handleCopyOld}
              title={copiedOld ? 'Copied' : 'Copy search code'}
              aria-label={copiedOld ? 'Copied' : 'Copy search code'}
            >
              {copiedOld ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
          <div ref={leftRef} className="md-file-code md-file-diff-code">
            <LinesDisplay
              code={normalizedOldCode}
              language={language}
              onScroll={handleLeftScroll}
              isStreaming={isStreaming}
              lineHighlights={oldHighlights}
            />
          </div>
        </div>
        <div className="md-file-diff-divider" />
        <div className="md-file-diff-side new">
          <div className="md-file-diff-header">
            <span className="md-file-replace-label new">
              <Replace size={12} />
              REPLACE
            </span>
            <button
              type="button"
              className={`md-file-copy${copiedNew ? ' copied' : ''}`}
              onClick={handleCopyNew}
              title={copiedNew ? 'Copied' : 'Copy replace code'}
              aria-label={copiedNew ? 'Copied' : 'Copy replace code'}
            >
              {copiedNew ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
          <div ref={rightRef} className="md-file-code md-file-diff-code">
            <LinesDisplay
              code={normalizedNewCode}
              language={language}
              onScroll={handleRightScroll}
              isStreaming={isStreaming}
              lineHighlights={newHighlights}
            />
          </div>
        </div>
      </div>
    </div>
  )
})

export const FileMoveBlock = memo(function FileMoveBlock({
  oldPath,
  newPath
}: {
  oldPath: string
  newPath: string
}): React.JSX.Element {
  const { workspace } = useWorkspace()
  const oldFileState = useFileContent(oldPath)
  const newFileState = useFileContent(newPath)
  const [applyState, setApplyState] = useState<'idle' | 'applied' | 'error'>('idle')

  const isMoveApplied = useMemo(
    () =>
      oldFileState !== null && newFileState !== null && !oldFileState.exists && newFileState.exists,
    [oldFileState, newFileState]
  )

  const [prevIsMoveApplied, setPrevIsMoveApplied] = useState(isMoveApplied)

  if (isMoveApplied !== prevIsMoveApplied) {
    setPrevIsMoveApplied(isMoveApplied)
    if (isMoveApplied && applyState === 'idle') {
      setApplyState('applied')
    }
  }

  const handleApply = useCallback(async (): Promise<void> => {
    if (!workspace) return
    const result = await applyFileMove(workspace, oldPath, newPath)
    if (result.success) {
      invalidateFileContentCache(workspace, oldPath)
      invalidateFileContentCache(workspace, newPath)
      setApplyState('applied')
    } else {
      setApplyState('error')
      throw new Error('Apply failed')
    }
  }, [workspace, oldPath, newPath])

  const stableKey = `move:${oldPath}:${newPath}`
  const effectiveStatus = useApplyRegistration(handleApply, applyState, undefined, stableKey)

  return (
    <div className="md-file-block">
      <div className="md-file-header">
        <div className="md-file-header-left">
          <span className="md-file-status-label moved">
            <MoveRight size={12} />
            MOVED
          </span>
          <FilePathDisplay path={oldPath} />
          <ArrowRight size={16} className="md-file-move-arrow" />
          <FilePathDisplay path={newPath} />
        </div>
        <div className="md-file-header-actions">
          <button
            type="button"
            className={`md-file-apply${effectiveStatus === 'applied' ? ' applied' : ''}${effectiveStatus === 'error' ? ' error' : ''}`}
            onClick={handleApply}
            title={
              effectiveStatus === 'applied'
                ? 'Applied'
                : effectiveStatus === 'error'
                  ? 'Failed to apply'
                  : 'Apply move'
            }
          >
            {effectiveStatus === 'applied' ? (
              <>
                <Check size={12} />
                <span>Applied</span>
              </>
            ) : effectiveStatus === 'error' ? (
              <>
                <X size={12} />
                <span>Error</span>
              </>
            ) : (
              <>
                <Check size={12} />
                <span>Apply</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
})

export const FileDeleteBlock = memo(function FileDeleteBlock({
  path,
  isStreaming = false
}: {
  path: string
  isStreaming?: boolean
}): React.JSX.Element {
  const fileState = useFileContent(path)
  const { copied, copy } = useCopyToClipboard()
  const { workspace } = useWorkspace()
  const [applyState, setApplyState] = useState<'idle' | 'applied' | 'error'>('idle')
  const language = useMemo(() => getLanguageFromPath(path), [path])
  const isBinary = useMemo(
    () => !!fileState?.content && fileState.content.includes('\0'),
    [fileState]
  )

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!fileState?.content || isBinary) return
    await copy(fileState.content)
  }, [copy, fileState, isBinary])

  const handleApply = useCallback(async (): Promise<void> => {
    if (!workspace || !fileState?.exists) return
    const result = await applyFileDelete(workspace, path)
    if (result.success) {
      invalidateFileContentCache(workspace, path)
      setApplyState('applied')
    } else {
      setApplyState('error')
      throw new Error('Apply failed')
    }
  }, [workspace, path, fileState])

  const isDeleteApplied = useMemo(() => fileState !== null && !fileState.exists, [fileState])

  const [prevIsDeleteApplied, setPrevIsDeleteApplied] = useState(isDeleteApplied)

  if (isDeleteApplied !== prevIsDeleteApplied) {
    setPrevIsDeleteApplied(isDeleteApplied)
    if (isDeleteApplied && applyState === 'idle') {
      setApplyState('applied')
    }
  }

  const deleteStatus: ApplyBlockStatus = !fileState
    ? 'idle'
    : !fileState.exists
      ? 'applied'
      : applyState
  const stableKey = `delete:${path}`
  const effectiveStatus = useApplyRegistration(handleApply, deleteStatus, undefined, stableKey)

  if (fileState === null) {
    return (
      <div className="md-file-block">
        <div className="md-file-header">
          <div className="md-file-header-left">
            <FilePathDisplay path={path} />
          </div>
        </div>
      </div>
    )
  }

  if (!fileState.exists) {
    const isMalformedPath = !path || !path.trim()
    if (isMalformedPath) {
      return (
        <div className="md-file-block">
          <div className="md-file-header">
            <div className="md-file-header-left">
              <span className="md-file-status-label error">
                <CircleAlert size={12} />
                NOT FOUND
              </span>
              <FilePathDisplay path={path} />
            </div>
          </div>
          <div className="md-file-error">File not found — the path is invalid</div>
        </div>
      )
    }
    return (
      <div className="md-file-block">
        <div className="md-file-header">
          <div className="md-file-header-left">
            <span className="md-file-status-label deleted">
              <Trash2 size={12} />
              DELETED
            </span>
            <FilePathDisplay path={path} />
          </div>
          <div className="md-file-header-actions">
            <button type="button" className="md-file-apply applied" disabled title="Applied">
              <Check size={12} />
              <span>Applied</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="md-file-block">
      <div className="md-file-header">
        <div className="md-file-header-left">
          <span className="md-file-status-label deleted">
            <Trash2 size={12} />
            DELETED
          </span>
          <FilePathDisplay path={path} />
        </div>
        <div className="md-file-header-actions">
          {!isBinary && (
            <button
              type="button"
              className={`md-file-copy${copied ? ' copied' : ''}`}
              onClick={handleCopy}
              title={copied ? 'Copied' : 'Copy content'}
              aria-label={copied ? 'Copied' : 'Copy content'}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
          <button
            type="button"
            className={`md-file-apply${effectiveStatus === 'applied' ? ' applied' : ''}${effectiveStatus === 'error' ? ' error' : ''}`}
            onClick={handleApply}
            title={
              effectiveStatus === 'applied'
                ? 'Applied'
                : effectiveStatus === 'error'
                  ? 'Failed to apply'
                  : 'Apply changes'
            }
          >
            {effectiveStatus === 'applied' ? (
              <>
                <Check size={12} />
                <span>Applied</span>
              </>
            ) : effectiveStatus === 'error' ? (
              <>
                <X size={12} />
                <span>Error</span>
              </>
            ) : (
              <>
                <Check size={12} />
                <span>Apply</span>
              </>
            )}
          </button>
        </div>
      </div>
      {isBinary ? (
        <div className="md-file-binary-notice">Binary file — content not displayed</div>
      ) : (
        <div className="md-file-code">
          <LinesDisplay
            code={fileState.content || ''}
            language={language}
            isStreaming={isStreaming}
          />
        </div>
      )}
    </div>
  )
})

export const FileBlock = memo(function FileBlock({
  path,
  code,
  isStreaming = false
}: {
  path: string
  code: string
  isStreaming?: boolean
}): React.JSX.Element {
  const { copied, copy } = useCopyToClipboard()
  const fileState = useFileContent(path)
  const { workspace } = useWorkspace()
  const [applyState, setApplyState] = useState<'idle' | 'applied' | 'error'>('idle')
  const language = useMemo(() => getLanguageFromPath(path), [path])

  const handleCopy = useCallback(async (): Promise<void> => {
    await copy(code)
  }, [copy, code])

  const handleApply = useCallback(async (): Promise<void> => {
    if (!workspace) return
    const result = await applyFileWrite(workspace, path, code)
    if (result.success) {
      invalidateFileContentCache(workspace, path)
      setApplyState('applied')
    } else {
      setApplyState('error')
      throw new Error('Apply failed')
    }
  }, [workspace, path, code])

  const isFileApplied = useMemo(
    () =>
      fileState !== null &&
      fileState.exists &&
      fileState.content !== null &&
      normalizeLineEndings(fileState.content) === normalizeLineEndings(code),
    [fileState, code]
  )

  const [prevIsFileApplied, setPrevIsFileApplied] = useState(isFileApplied)

  if (isFileApplied !== prevIsFileApplied) {
    setPrevIsFileApplied(isFileApplied)
    if (isFileApplied && applyState === 'idle') {
      setApplyState('applied')
    }
  }

  const stableKey = `file:${path}`
  const effectiveStatus = useApplyRegistration(handleApply, applyState, undefined, stableKey)

  const isCreated = fileState !== null && !fileState.exists

  return (
    <div className="md-file-block">
      <div className="md-file-header">
        <div className="md-file-header-left">
          {isCreated && (
            <span className="md-file-status-label created">
              <FilePlus size={12} />
              CREATED
            </span>
          )}
          <FilePathDisplay path={path} />
        </div>
        <div className="md-file-header-actions">
          <button
            type="button"
            className={`md-file-copy${copied ? ' copied' : ''}`}
            onClick={handleCopy}
            title={copied ? 'Copied' : 'Copy code'}
            aria-label={copied ? 'Copied' : 'Copy code'}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button
            type="button"
            className={`md-file-apply${effectiveStatus === 'applied' ? ' applied' : ''}${effectiveStatus === 'error' ? ' error' : ''}`}
            onClick={handleApply}
            title={
              effectiveStatus === 'applied'
                ? 'Applied'
                : effectiveStatus === 'error'
                  ? 'Failed to apply'
                  : 'Apply changes'
            }
          >
            {effectiveStatus === 'applied' ? (
              <>
                <Check size={12} />
                <span>Applied</span>
              </>
            ) : effectiveStatus === 'error' ? (
              <>
                <X size={12} />
                <span>Error</span>
              </>
            ) : (
              <>
                <Check size={12} />
                <span>Apply</span>
              </>
            )}
          </button>
        </div>
      </div>
      <div className="md-file-code">
        <LinesDisplay code={code} language={language} isStreaming={isStreaming} />
      </div>
    </div>
  )
})

function FileExistenceChecker({
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
      new CustomEvent('task-run', { detail: { files, description: buildMessage(), taskId } })
    )
  }, [files, buildMessage, taskId])

  return (
    <div className="md-file-block md-task-block">
      {files.map((f) => (
        <FileExistenceChecker key={f} path={f} onStatus={handleStatus} />
      ))}
      <div className="md-file-header">
        <div className="md-file-header-left">
          <span className="md-file-status-label task">
            <ListChecks size={12} />
            TASK {taskId}
          </span>
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
            {copied ? <Check size={12} /> : <Copy size={12} />}
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
