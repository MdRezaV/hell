import React, {
  Children,
  createContext,
  isValidElement,
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useCopyToClipboard } from '../hooks/useCopyToClipboard'
import { useScrollSync } from '../hooks/useScrollSync'

// Register only commonly used languages (PrismLight requires explicit registration).
// This avoids loading the full Prism bundle (~300 languages) and dramatically
// reduces bundle size and highlighting time.
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import scss from 'react-syntax-highlighter/dist/esm/languages/prism/scss'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import markdownLang from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import cLang from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp'
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php'
import ruby from 'react-syntax-highlighter/dist/esm/languages/prism/ruby'
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker'
import hljs from 'highlight.js/lib/common'
import { ArrowRight, Check, Copy, Play, X } from 'lucide-react'
import log from 'electron-log/renderer'
import '../styles/Markdown.css'
import {
  getActiveParser,
  normalizeLineEndings,
  parseReplaceBlock,
  segmentContent
} from '../utils/markdownParser'
import {
  applyFileDelete,
  applyFileMove,
  applyFileReplace,
  applyFileWrite,
  FILE_CACHE_MAX,
  fileContentCache,
  type FileState,
  invalidateFileContentCache,
  ipcThrottle
} from '../utils/fileApply'
import { useWorkspace } from '../WorkspaceContext'

SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('js', javascript)
SyntaxHighlighter.registerLanguage('mjs', javascript)
SyntaxHighlighter.registerLanguage('cjs', javascript)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('ts', typescript)
SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('html', markup)
SyntaxHighlighter.registerLanguage('htm', markup)
SyntaxHighlighter.registerLanguage('markup', markup)
SyntaxHighlighter.registerLanguage('xml', markup)
SyntaxHighlighter.registerLanguage('svg', markup)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('scss', scss)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('jsonc', json)
SyntaxHighlighter.registerLanguage('yaml', yaml)
SyntaxHighlighter.registerLanguage('yml', yaml)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('py', python)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('sh', bash)
SyntaxHighlighter.registerLanguage('shell', bash)
SyntaxHighlighter.registerLanguage('zsh', bash)
SyntaxHighlighter.registerLanguage('fish', bash)
SyntaxHighlighter.registerLanguage('markdown', markdownLang)
SyntaxHighlighter.registerLanguage('md', markdownLang)
SyntaxHighlighter.registerLanguage('mdx', markdownLang)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('go', go)
SyntaxHighlighter.registerLanguage('rust', rust)
SyntaxHighlighter.registerLanguage('rs', rust)
SyntaxHighlighter.registerLanguage('java', java)
SyntaxHighlighter.registerLanguage('c', cLang)
SyntaxHighlighter.registerLanguage('cpp', cpp)
SyntaxHighlighter.registerLanguage('cc', cpp)
SyntaxHighlighter.registerLanguage('cxx', cpp)
SyntaxHighlighter.registerLanguage('hpp', cpp)
SyntaxHighlighter.registerLanguage('csharp', csharp)
SyntaxHighlighter.registerLanguage('cs', csharp)
SyntaxHighlighter.registerLanguage('php', php)
SyntaxHighlighter.registerLanguage('ruby', ruby)
SyntaxHighlighter.registerLanguage('rb', ruby)
SyntaxHighlighter.registerLanguage('docker', docker)
SyntaxHighlighter.registerLanguage('dockerfile', docker)

interface MarkdownProps {
  content: string
}

type CustomBlockRenderer = (code: string) => React.JSX.Element

// Cache hljs auto-detection results. highlightAuto is very expensive and runs
// on every render for unlabeled code blocks during streaming. The cache prevents
// redundant tokenization of identical code strings.
const autoLanguageCache = new Map<string, string>()
const AUTO_LANG_CACHE_MAX = 512

function codeFingerprint(code: string): string {
  // For short code the full string is a collision-free key.
  // For longer code use length + a hash of the first 256 chars so Map keys
  // stay small and lookups avoid O(code_length) string comparisons.
  if (code.length <= 256) return code
  let h = code.length
  for (let i = 0; i < 256; i++) {
    h = ((h << 5) - h + code.charCodeAt(i)) | 0
  }
  return `${code.length}:${(h >>> 0).toString(36)}`
}

function detectLanguage(code: string): string {
  // Skip expensive hljs auto-detection for tiny snippets — they are almost
  // always incomplete tokens arriving during streaming.
  if (code.length < 20) return 'text'

  const key = codeFingerprint(code)
  const cached = autoLanguageCache.get(key)
  if (cached !== undefined) return cached

  const sample = code.length > 2048 ? code.slice(0, 2048) : code
  const detected = hljs.highlightAuto(sample).language || 'text'
  autoLanguageCache.set(key, detected)
  if (autoLanguageCache.size > AUTO_LANG_CACHE_MAX) {
    const firstKey = autoLanguageCache.keys().next().value
    if (firstKey !== undefined) autoLanguageCache.delete(firstKey)
  }
  return detected
}

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

const LinesDisplay = memo(function LinesDisplay({
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

interface FileStateCache {
  data: FileState
  path: string
  workspace: string
}

function useFileContent(path: string): FileState | null {
  const { workspace } = useWorkspace()
  const [cache, setCache] = useState<FileStateCache | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!workspace) return
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent).detail as { workspace: string; path: string }
      if (detail.workspace === workspace && detail.path === path) {
        setRefreshKey((k) => k + 1)
      }
    }
    const wsHandler = (e: Event): void => {
      const detail = (e as CustomEvent).detail as { workspace: string }
      if (detail.workspace === workspace) {
        setRefreshKey((k) => k + 1)
      }
    }
    window.addEventListener('file-content-invalidated', handler)
    window.addEventListener('workspace-files-invalidated', wsHandler)
    return () => {
      window.removeEventListener('file-content-invalidated', handler)
      window.removeEventListener('workspace-files-invalidated', wsHandler)
    }
  }, [workspace, path])

  useEffect(() => {
    if (!workspace) return
    const cacheKey = `${workspace}::${path}`
    let cancelled = false

    const existingPromise = fileContentCache.get(cacheKey)
    if (existingPromise) {
      existingPromise.then((result) => {
        if (!cancelled) setCache({ data: result, path, workspace })
      })
    } else {
      const promise = ipcThrottle(
        () => window.electron.ipcRenderer.invoke('read-file', workspace, path) as Promise<FileState>
      ).catch((e) => {
        log.error(`Failed to read file ${path}:`, e)
        return { exists: false, content: null }
      })
      if (fileContentCache.size >= FILE_CACHE_MAX) {
        const firstKey = fileContentCache.keys().next().value
        if (firstKey !== undefined) fileContentCache.delete(firstKey)
      }
      fileContentCache.set(cacheKey, promise)
      promise.then((result) => {
        if (!cancelled) setCache({ data: result, path, workspace })
      })
    }

    return () => {
      cancelled = true
    }
  }, [workspace, path, refreshKey])

  if (!workspace) {
    return { exists: false, content: null }
  }

  if (!cache || cache.path !== path || cache.workspace !== workspace) {
    return null
  }

  return cache.data
}

type ApplyBlockStatus = 'idle' | 'applied' | 'error' | 'notFound'

interface ApplyBlockInfo {
  apply: () => Promise<void>
  status: ApplyBlockStatus
}

interface ApplyAllContextValue {
  register: (id: string, apply: () => Promise<void>) => void
  unregister: (id: string) => void
  setStatus: (id: string, status: ApplyBlockStatus) => void
  blocks: Map<string, ApplyBlockInfo>
}

const ApplyAllContext = createContext<ApplyAllContextValue | null>(null)

function useApplyAllContext(): ApplyAllContextValue | null {
  return useContext(ApplyAllContext)
}

let applyIdCounter = 0

function useApplyRegistration(applyFn: () => Promise<void>, status: ApplyBlockStatus): void {
  const ctx = useApplyAllContext()
  const idRef = useRef(`apply-${++applyIdCounter}`)
  const applyRef = useRef(applyFn)

  useEffect(() => {
    applyRef.current = applyFn
  }, [applyFn])

  useEffect(() => {
    if (!ctx) return
    const id = idRef.current
    ctx.register(id, () => applyRef.current())
    return () => ctx.unregister(id)
  }, [ctx])

  useEffect(() => {
    if (!ctx) return
    ctx.setStatus(idRef.current, status)
  }, [ctx, status])
}

function ApplyAllProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [blocks, setBlocks] = useState<Map<string, ApplyBlockInfo>>(new Map())

  const register = useCallback((id: string, apply: () => Promise<void>) => {
    setBlocks((prev) => {
      const next = new Map(prev)
      next.set(id, { apply, status: prev.get(id)?.status ?? 'idle' })
      return next
    })
  }, [])

  const unregister = useCallback((id: string) => {
    setBlocks((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const setStatus = useCallback((id: string, status: ApplyBlockStatus) => {
    setBlocks((prev) => {
      const existing = prev.get(id)
      if (!existing || existing.status === status) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, status })
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ blocks, register, unregister, setStatus }),
    [blocks, register, unregister, setStatus]
  )

  return <ApplyAllContext.Provider value={value}>{children}</ApplyAllContext.Provider>
}

function ApplyAllBar(): React.JSX.Element | null {
  const ctx = useApplyAllContext()
  const [applying, setApplying] = useState(false)
  if (!ctx) return null
  const { blocks } = ctx
  const blockArr = [...blocks.values()]
  if (blockArr.length === 0) return null

  const idleBlocks = blockArr.filter((b) => b.status === 'idle')
  const idleCount = idleBlocks.length
  const hasWarning = blockArr.some((b) => b.status === 'notFound')
  const allApplied = blockArr.every((b) => b.status === 'applied')

  const handleApplyAll = async (): Promise<void> => {
    if (applying || idleCount === 0) return
    setApplying(true)
    for (const b of idleBlocks) {
      await b.apply()
    }
    setApplying(false)
  }

  let variantClass = ''
  let label = `Apply All (${idleCount})`
  let disabled = false

  if (allApplied) {
    variantClass = ' applied'
    label = 'All Applied'
    disabled = true
  } else if (applying) {
    label = 'Applying...'
    disabled = true
  } else if (hasWarning) {
    variantClass = ' warning'
    if (idleCount === 0) {
      label = 'Not Found'
      disabled = true
    }
  } else if (idleCount === 0) {
    disabled = true
  }

  return (
    <div className="md-apply-all-bar">
      <button
        type="button"
        className={`md-apply-all${variantClass}`}
        onClick={handleApplyAll}
        disabled={disabled}
      >
        {allApplied && <Check size={12} />}
        <span>{label}</span>
      </button>
    </div>
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

const CommandBlock = memo(function CommandBlock({ code }: { code: string }): React.JSX.Element {
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
const GenericCodeBlock = memo(function GenericCodeBlock({
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

const languageFromPathCache = new Map<string, string>()

function getLanguageFromPath(filePath: string): string {
  const cached = languageFromPathCache.get(filePath)
  if (cached !== undefined) return cached

  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext) return 'text'

  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    mjs: 'javascript',
    cjs: 'javascript',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    json: 'json',
    jsonc: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    svg: 'svg',
    py: 'python',
    pyw: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'bash',
    ps1: 'powershell',
    bat: 'batch',
    cmd: 'batch',
    md: 'markdown',
    mdx: 'markdown',
    sql: 'sql',
    dockerfile: 'docker',
    lua: 'lua',
    r: 'r',
    swift: 'swift',
    dart: 'dart',
    scala: 'scala',
    clj: 'clojure',
    ex: 'elixir',
    exs: 'elixir',
    erl: 'erlang',
    hs: 'haskell',
    ml: 'ocaml',
    fs: 'fsharp',
    vim: 'vim',
    tex: 'latex',
    ini: 'ini',
    conf: 'ini',
    env: 'ini'
  }

  const result = languageMap[ext] || 'text'
  languageFromPathCache.set(filePath, result)
  return result
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

  const handleCopy = useCallback(async (): Promise<void> => {
    await copy(description)
  }, [copy, description])

  const handleRun = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('task-run', { detail: { files, description } }))
  }, [files, description])

  return (
    <div className="md-file-block border-border bg-background-soft overflow-hidden">
      <div className="md-file-header">
        <div className="md-file-header-left">
          <span
            className="md-file-status-label"
            style={{
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#a855f7',
              border: '1px solid rgba(168, 85, 247, 0.3)'
            }}
          >
            TASK {taskId}
          </span>
          <span className="text-[11px] text-text-muted ml-2 font-mono" title={files.join(', ')}>
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
          <button
            type="button"
            className="md-file-apply"
            style={{
              background: 'rgba(34, 197, 94, 0.1)',
              color: '#22c55e',
              border: '1px solid rgba(34, 197, 94, 0.2)'
            }}
            onClick={handleRun}
            title="Run task"
          >
            <Play size={12} />
            <span>Run</span>
          </button>
        </div>
      </div>
      <div className="px-2 py-2 border-t border-border bg-background-soft flex flex-wrap gap-1">
        {files.length > 0 ? (
          files.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono text-text-secondary bg-background border border-border"
              title={f}
            >
              <FilePathDisplay path={f} />
            </span>
          ))
        ) : (
          <span className="text-[11px] text-text-muted font-mono">No files</span>
        )}
      </div>
      <div className="p-3 text-[13px] leading-relaxed text-text-primary border-t border-border bg-background">
        {description.split('\n').map((line, i) => (
          <p key={i} className={i === 0 ? '' : 'mt-2'}>
            {line || '\u00A0'}
          </p>
        ))}
      </div>
    </div>
  )
})

const CommitBlock = memo(function CommitBlock({ code }: { code: string }): React.JSX.Element {
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
