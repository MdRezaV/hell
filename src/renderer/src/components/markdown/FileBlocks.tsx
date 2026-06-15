import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Copy, X } from 'lucide-react'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { useScrollSync } from '../../hooks/useScrollSync'
import { useFileContent } from '../../hooks/useFileContent'
import { useWorkspace } from '../../WorkspaceContext'
import { getLanguageFromPath } from '../../utils/languageDetection'
import {
  applyFileDelete,
  applyFileMove,
  applyFileReplace,
  applyFileWrite,
  invalidateFileContentCache
} from '../../utils/fileApply'
import { FilePathDisplay, LinesDisplay } from './MarkdownPrimitives'
import { type ApplyBlockStatus, useApplyRegistration } from './ApplyAllContext'

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
  const [notFound, setNotFound] = useState(false)
  const checkedOldCodeRef = useRef<string | null>(null)
  const [applyState, setApplyState] = useState<'idle' | 'applied' | 'error'>('idle')

  useEffect(() => {
    if (fileState === null) return
    if (checkedOldCodeRef.current === oldCode) return
    checkedOldCodeRef.current = oldCode
    setNotFound(
      !fileState.exists || fileState.content === null || !fileState.content.includes(oldCode)
    )
  }, [fileState, oldCode])

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

  const applyStatus: ApplyBlockStatus = notFound ? 'notFound' : applyState
  useApplyRegistration(handleApply, applyStatus)

  return (
    <div className="md-file-block md-file-replace-block">
      <div className="md-file-header">
        <div className="md-file-header-left">
          {notFound && <span className="md-file-status-label error">NOT FOUND</span>}
          <FilePathDisplay path={path} />
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
              <span>Apply</span>
            )}
          </button>
        </div>
      </div>
      <div className="md-file-diff">
        <div className="md-file-diff-side old">
          <div className="md-file-diff-header">
            <span className="md-file-replace-label old">SEARCH</span>
            <button
              type="button"
              className={`md-file-copy${copiedOld ? ' copied' : ''}`}
              onClick={handleCopyOld}
              title={copiedOld ? 'Copied' : 'Copy search code'}
              aria-label={copiedOld ? 'Copied' : 'Copy search code'}
            >
              {copiedOld ? (
                <Check size={14} strokeWidth={2.25} />
              ) : (
                <Copy size={14} strokeWidth={2} />
              )}
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
            <span className="md-file-replace-label new">REPLACE</span>
            <button
              type="button"
              className={`md-file-copy${copiedNew ? ' copied' : ''}`}
              onClick={handleCopyNew}
              title={copiedNew ? 'Copied' : 'Copy replace code'}
              aria-label={copiedNew ? 'Copied' : 'Copy replace code'}
            >
              {copiedNew ? (
                <Check size={14} strokeWidth={2.25} />
              ) : (
                <Copy size={14} strokeWidth={2} />
              )}
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
          <span className="md-file-status-label moved">MOVED</span>
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
              <span>Apply</span>
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
            <span className="md-file-status-label error">NOT FOUND</span>
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
          <span className="md-file-status-label deleted">DELETED</span>
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
            {copied ? <Check size={14} strokeWidth={2.25} /> : <Copy size={14} strokeWidth={2} />}
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
              <span>Apply</span>
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
          {isCreated && <span className="md-file-status-label created">CREATED</span>}
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
            {copied ? <Check size={14} strokeWidth={2.25} /> : <Copy size={14} strokeWidth={2} />}
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
              <span>Apply</span>
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
