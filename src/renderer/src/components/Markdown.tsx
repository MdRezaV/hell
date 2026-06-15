import React, {
  Children,
  isValidElement,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { useCopyToClipboard } from '../hooks/useCopyToClipboard'
import { useScrollSync } from '../hooks/useScrollSync'
import { ArrowRight, Check, Copy, Play, X } from 'lucide-react'
import '../styles/Markdown.css'
import { getActiveParser, parseReplaceBlock, segmentContent } from '../utils/markdownParser'
import { detectLanguage, getLanguageFromPath } from '../utils/markdownLanguages'
import {
  applyFileDelete,
  applyFileMove,
  applyFileReplace,
  applyFileWrite,
  invalidateFileContentCache
} from '../utils/fileApply'
import { useWorkspace } from '../WorkspaceContext'
import { useFileContent } from '../hooks/useFileContent'
import { ApplyAllBar, ApplyAllProvider } from './markdown/ApplyAll'
import { ApplyBlockStatus, useApplyRegistration } from './markdown/applyAll'
import { CommandBlock, CommitBlock, GenericCodeBlock, LinesDisplay } from './markdown/CodeBlocks'

interface MarkdownProps {
  content: string
}

type CustomBlockRenderer = (code: string) => React.JSX.Element

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node || typeof node !== 'object') return ''

  const stack: ReactNode[] = [node]
  const parts: string[] = []

  while (stack.length > 0) {
    const current = stack.pop()
    if (current == null) continue
    if (typeof current === 'string') {
      parts.push(current)
    } else if (typeof current === 'number') {
      parts.push(String(current))
    } else if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i--) {
        stack.push(current[i])
      }
    } else if (typeof current === 'object' && 'props' in current) {
      const props = (current as { props?: { children?: ReactNode } }).props
      if (props?.children != null) {
        stack.push(props.children)
      }
    }
  }

  return parts.join('')
}

function FileIncludeAddButton({ path }: { path: string }): React.JSX.Element {
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

function FilePathDisplay({ path }: { path: string }): React.JSX.Element {
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

const FileReplaceBlock = memo(function FileReplaceBlock({
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

const FileMoveBlock = memo(function FileMoveBlock({
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

const FileDeleteBlock = memo(function FileDeleteBlock({
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

const FileBlock = memo(function FileBlock({
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

const TaskBlock = memo(function TaskBlock({
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

const CUSTOM_BLOCK_RENDERERS: Record<string, CustomBlockRenderer> = {
  command: (code) => <CommandBlock code={code} />,
  commit: (code) => <CommitBlock code={code} />
}

// Defined at module scope so React does not unmount/remount code blocks on every
// render of <Markdown>. This was the primary source of lag during streaming.
const markdownRemarkPlugins = [remarkGfm, remarkBreaks]

const markdownComponents: Components = {
  pre({
    children,
    node: _node
  }: React.ComponentPropsWithoutRef<'pre'> & { node?: unknown }): React.JSX.Element {
    void _node
    let language = ''
    let codeText = ''
    let filePath = ''

    Children.forEach(children, (child) => {
      if (isValidElement(child)) {
        const childProps = child.props as {
          className?: string
          children?: ReactNode
        }
        if (childProps.className) {
          if (childProps.className.startsWith('language-file-replace:')) {
            filePath = childProps.className.slice('language-file-replace:'.length)
            language = 'file-replace'
          } else if (childProps.className.startsWith('language-file-delete:')) {
            filePath = childProps.className.slice('language-file-delete:'.length)
            language = 'file-delete'
          } else if (childProps.className.startsWith('language-file-move:')) {
            filePath = childProps.className.slice('language-file-move:'.length)
            language = 'file-move'
          } else if (childProps.className.startsWith('language-file:')) {
            filePath = childProps.className.slice('language-file:'.length)
            language = 'file'
          } else if (childProps.className.startsWith('language-task:')) {
            filePath = childProps.className.slice('language-task:'.length)
            language = 'task'
          } else {
            const match = /language-(\w+)/.exec(childProps.className)
            if (match) language = match[1]
          }
        }
        codeText = extractText(childProps.children).replace(/\n$/, '')
      }
    })

    if (filePath && language === 'task') {
      const lines = codeText.split('\n')
      let filesStr = ''
      const descLines: string[] = []
      for (const l of lines) {
        if (/^Files\s*:/i.test(l)) {
          filesStr = l.replace(/^Files\s*:\s*/i, '').trim()
        } else if (/^Description\s*:/i.test(l)) {
          descLines.push(l.replace(/^Description\s*:\s*/i, '').trim())
        } else {
          descLines.push(l)
        }
      }
      const description = descLines
        .join('\n')
        .replace(/\[END]\s*$/, '')
        .trim()
      const files = filesStr
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
      return <TaskBlock taskId={filePath} files={files} description={description} />
    }

    if (filePath) {
      if (language === 'file-replace') {
        const parsed = parseReplaceBlock(codeText)
        const oldCode = parsed?.oldCode ?? ''
        const newCode = parsed?.newCode ?? ''
        return <FileReplaceBlock path={filePath} oldCode={oldCode} newCode={newCode} />
      }
      if (language === 'file-delete') {
        return <FileDeleteBlock path={filePath} />
      }
      if (language === 'file-move') {
        const arrowIdx = filePath.indexOf('->')
        const oldPath = arrowIdx >= 0 ? filePath.slice(0, arrowIdx) : filePath
        const newPath = arrowIdx >= 0 ? filePath.slice(arrowIdx + 2) : ''
        return <FileMoveBlock oldPath={oldPath} newPath={newPath} />
      }
      return <FileBlock path={filePath} code={codeText} />
    }

    const customRenderer = CUSTOM_BLOCK_RENDERERS[language]
    if (customRenderer) {
      return customRenderer(codeText)
    }

    const resolvedLanguage = language || detectLanguage(codeText)

    // Only show label for explicitly-specified or auto-detected (non-text) languages
    const showLangLabel = !language && resolvedLanguage !== 'text'

    return (
      <GenericCodeBlock
        language={resolvedLanguage}
        code={codeText}
        showLangLabel={showLangLabel || !!language}
      />
    )
  },
  code({
    className,
    children,
    node: _node,
    ...props
  }: React.ComponentPropsWithoutRef<'code'> & { node?: unknown }): React.JSX.Element {
    void _node
    const text = extractText(children)
    if (!className && text.startsWith('file-include:')) {
      const includePath = text.slice('file-include:'.length)
      return (
        <span className="md-file-include">
          <code {...props}>{includePath}</code>
          <FileIncludeAddButton path={includePath} />
        </span>
      )
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  }
}

// Each segment is an independent, memoized ReactMarkdown instance.
// During streaming only the last segment's content changes, so all
// previous segments are skipped by React.memo — no re-parsing, no
// re-highlighting.
const MarkdownSegment = memo(function MarkdownSegment({
  content
}: {
  content: string
}): React.JSX.Element {
  return (
    <ReactMarkdown remarkPlugins={markdownRemarkPlugins} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  )
})

const Markdown = memo(function Markdown({ content }: MarkdownProps): React.JSX.Element {
  const processedContent = useMemo(() => getActiveParser().preprocess(content), [content])
  const segments = useMemo(() => segmentContent(processedContent), [processedContent])

  return (
    <ApplyAllProvider>
      <div className="md-content">
        {segments.map((segment, i) => (
          <MarkdownSegment key={i} content={segment} />
        ))}
        <ApplyAllBar />
      </div>
    </ApplyAllProvider>
  )
})

export default Markdown
