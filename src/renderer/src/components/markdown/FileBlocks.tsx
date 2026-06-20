import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  CircleAlert,
  Copy,
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
import {
  applyFileDelete,
  applyFileMove,
  applyFileReplace,
  applyFileWrite,
  invalidateFileContentCache,
  unapplyFileReplace
} from '../../utils/fileApply'
import { LinesDisplay } from './CodeBlocks'
import { ApplyBlockStatus, useApplyRegistration } from '@renderer/hooks/useApplyAll'


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
      {status === 'added' ? (
        <Check size={10} />
      ) : status === 'notFound' ? (
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
  newCode
}: {
  path: string
  oldCode: string
  newCode: string
}): React.JSX.Element {
  const { copied: copiedOld, copy: copyOld } = useCopyToClipboard()
  const { copied: copiedNew, copy: copyNew } = useCopyToClipboard()
  const { leftRef, rightRef, handleLeftScroll, handleRightScroll } = useScrollSync()
  const fileState = useFileContent(path)
  const { workspace } = useWorkspace()
  const [applyState, setApplyState] = useState<'idle' | 'applied' | 'error'>('idle')

  const notFound = useMemo(() => {
    if (applyState === 'applied') return false
    if (fileState === null) return false
    return !fileState.exists || fileState.content === null || !fileState.content.includes(oldCode)
  }, [fileState, oldCode, applyState])

  const replaceInFile = useMemo(() => {
    if (fileState === null) return false
    return (
      !!fileState.exists &&
      fileState.content !== null &&
      fileState.content.includes(newCode) &&
      !fileState.content.includes(oldCode)
    )
  }, [fileState, oldCode, newCode])

  useEffect(() => {
    if (applyState === 'idle' && replaceInFile) {
      setApplyState('applied')
    }
  }, [applyState, replaceInFile])

  const handleCopyOld = useCallback(async (): Promise<void> => {
    await copyOld(oldCode)
  }, [copyOld, oldCode])

  const handleCopyNew = useCallback(async (): Promise<void> => {
    await copyNew(newCode)
  }, [copyNew, newCode])

  const handleApply = useCallback(async (): Promise<void> => {
    if (!workspace) return
    const result = await applyFileReplace(workspace, path, oldCode, newCode)
    if (result.success) invalidateFileContentCache(workspace, path)
    setApplyState(result.success ? 'applied' : 'error')
  }, [workspace, path, oldCode, newCode])

  const handleUnapply = useCallback(async (): Promise<void> => {
    if (!workspace) return
    const result = await unapplyFileReplace(workspace, path, oldCode, newCode)
    if (result.success) {
      invalidateFileContentCache(workspace, path)
      setApplyState('idle')
    } else {
      setApplyState('error')
    }
  }, [workspace, path, oldCode, newCode])

  const applyStatus: ApplyBlockStatus = notFound ? 'notFound' : applyState
  useApplyRegistration(handleApply, applyStatus, handleUnapply)

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
            className={`md-file-apply unapply${applyState === 'applied' ? '' : ' disabled'}`}
            onClick={handleUnapply}
            disabled={applyState !== 'applied'}
            title={applyState === 'applied' ? 'Revert applied changes' : 'Apply changes first'}
          >
            <Undo2 size={12} />
            <span>UnApply</span>
          </button>
          <button
            type="button"
            className={`md-file-apply${applyState === 'applied' ? ' applied' : ''}${applyState === 'error' ? ' error' : ''}`}
            onClick={handleApply}
            disabled={applyState === 'applied'}
            title={
              applyState === 'applied'
                ? 'Already applied'
                : applyState === 'error'
                  ? 'Failed to apply'
                  : 'Apply changes'
            }
          >
            {applyState === 'applied' ? (
              <>
                <Check size={12} />
                <span>Applied</span>
              </>
            ) : applyState === 'error' ? (
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
              code={oldCode}
              language={getLanguageFromPath(path)}
              onScroll={handleLeftScroll}
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
              code={newCode}
              language={getLanguageFromPath(path)}
              onScroll={handleRightScroll}
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
  const [applyState, setApplyState] = useState<'idle' | 'applied' | 'error'>('idle')

  const handleApply = useCallback(async (): Promise<void> => {
    if (!workspace) return
    const result = await applyFileMove(workspace, oldPath, newPath)
    if (result.success) {
      invalidateFileContentCache(workspace, oldPath)
      invalidateFileContentCache(workspace, newPath)
    }
    setApplyState(result.success ? 'applied' : 'error')
  }, [workspace, oldPath, newPath])

  useApplyRegistration(handleApply, applyState)

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
            className={`md-file-apply${applyState === 'applied' ? ' applied' : ''}${applyState === 'error' ? ' error' : ''}`}
            onClick={handleApply}
            title={
              applyState === 'applied'
                ? 'Applied'
                : applyState === 'error'
                  ? 'Failed to apply'
                  : 'Apply move'
            }
          >
            {applyState === 'applied' ? (
              <>
                <Check size={12} />
                <span>Applied</span>
              </>
            ) : applyState === 'error' ? (
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
  path
}: {
  path: string
}): React.JSX.Element {
  const fileState = useFileContent(path)
  const { copied, copy } = useCopyToClipboard()
  const { workspace } = useWorkspace()
  const [applyState, setApplyState] = useState<'idle' | 'applied' | 'error'>('idle')

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!fileState?.content) return
    await copy(fileState.content)
  }, [copy, fileState])

  const handleApply = useCallback(async (): Promise<void> => {
    if (!workspace || !fileState?.exists) return
    const result = await applyFileDelete(workspace, path)
    if (result.success) invalidateFileContentCache(workspace, path)
    setApplyState(result.success ? 'applied' : 'error')
  }, [workspace, path, fileState])

  const deleteStatus: ApplyBlockStatus = !fileState
    ? 'idle'
    : !fileState.exists
      ? 'notFound'
      : applyState
  useApplyRegistration(handleApply, deleteStatus)

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
        <div className="md-file-error">
          File not found — may already be deleted or the path is incorrect
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
          <button
            type="button"
            className={`md-file-copy${copied ? ' copied' : ''}`}
            onClick={handleCopy}
            title={copied ? 'Copied' : 'Copy content'}
            aria-label={copied ? 'Copied' : 'Copy content'}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button
            type="button"
            className={`md-file-apply${applyState === 'applied' ? ' applied' : ''}${applyState === 'error' ? ' error' : ''}`}
            onClick={handleApply}
            title={
              applyState === 'applied'
                ? 'Applied'
                : applyState === 'error'
                  ? 'Failed to apply'
                  : 'Apply changes'
            }
          >
            {applyState === 'applied' ? (
              <>
                <Check size={12} />
                <span>Applied</span>
              </>
            ) : applyState === 'error' ? (
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
        <LinesDisplay code={fileState.content || ''} language={getLanguageFromPath(path)} />
      </div>
    </div>
  )
})

export const FileBlock = memo(function FileBlock({
  path,
  code
}: {
  path: string
  code: string
}): React.JSX.Element {
  const { copied, copy } = useCopyToClipboard()
  const fileState = useFileContent(path)
  const { workspace } = useWorkspace()
  const [applyState, setApplyState] = useState<'idle' | 'applied' | 'error'>('idle')

  const handleCopy = useCallback(async (): Promise<void> => {
    await copy(code)
  }, [copy, code])

  const handleApply = useCallback(async (): Promise<void> => {
    if (!workspace) return
    const result = await applyFileWrite(workspace, path, code)
    if (result.success) invalidateFileContentCache(workspace, path)
    setApplyState(result.success ? 'applied' : 'error')
  }, [workspace, path, code])

  useApplyRegistration(handleApply, applyState)

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
            className={`md-file-apply${applyState === 'applied' ? ' applied' : ''}${applyState === 'error' ? ' error' : ''}`}
            onClick={handleApply}
            title={
              applyState === 'applied'
                ? 'Applied'
                : applyState === 'error'
                  ? 'Failed to apply'
                  : 'Apply changes'
            }
          >
            {applyState === 'applied' ? (
              <>
                <Check size={12} />
                <span>Applied</span>
              </>
            ) : applyState === 'error' ? (
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
        <LinesDisplay code={code} language={getLanguageFromPath(path)} />
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
