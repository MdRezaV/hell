import React, {
  Children,
  isValidElement,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
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
import { Check, Copy, Play, X } from 'lucide-react'
import { getActiveParser, parseReplaceBlock } from '../utils/markdownParser'
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

function detectLanguage(code: string): string {
  const cached = autoLanguageCache.get(code)
  if (cached !== undefined) return cached
  const detected = hljs.highlightAuto(code).language || 'text'
  autoLanguageCache.set(code, detected)
  if (autoLanguageCache.size > AUTO_LANG_CACHE_MAX) {
    const firstKey = autoLanguageCache.keys().next().value
    if (firstKey !== undefined) autoLanguageCache.delete(firstKey)
  }
  return detected
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    const el = node as { props: { children?: ReactNode } }
    return extractText(el.props.children)
  }
  return ''
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
  const lines = code.split('\n')
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
            {code}
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

interface FileState {
  exists: boolean
  content: string | null
}

interface FileStateCache {
  data: FileState
  path: string
  workspace: string
}

const FILE_CACHE_MAX = 256

const fileContentCache = new Map<string, Promise<FileState>>()

function invalidateFileContentCache(workspace: string, path: string): void {
  fileContentCache.delete(`${workspace}::${path}`)
  window.dispatchEvent(new CustomEvent('file-content-invalidated', { detail: { workspace, path } }))
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
    window.addEventListener('file-content-invalidated', handler)
    return () => window.removeEventListener('file-content-invalidated', handler)
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
      const promise = window.electron.ipcRenderer.invoke(
        'read-file',
        workspace,
        path
      ) as Promise<FileState>
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
  const notFound =
    fileState !== null &&
    (!fileState.exists || fileState.content === null || !fileState.content.includes(oldCode))
  const [applyState, setApplyState] = useState<'idle' | 'applied' | 'error'>('idle')

  const handleCopyOld = useCallback(async (): Promise<void> => {
    await copyOld(oldCode)
  }, [copyOld, oldCode])

  const handleCopyNew = useCallback(async (): Promise<void> => {
    await copyNew(newCode)
  }, [copyNew, newCode])

  const handleApply = useCallback(async (): Promise<void> => {
    if (!workspace) return
    const fileResult: FileState = await window.electron.ipcRenderer.invoke(
      'read-file',
      workspace,
      path
    )
    if (!fileResult.exists || fileResult.content === null) {
      setApplyState('error')
      return
    }
    const content = fileResult.content
    if (!content.includes(oldCode)) {
      setApplyState('error')
      return
    }
    const newContent = content.replace(oldCode, newCode)
    const result: { success: boolean; error?: string } = await window.electron.ipcRenderer.invoke(
      'write-file',
      workspace,
      path,
      newContent
    )
    if (result.success) invalidateFileContentCache(workspace, path)
    setApplyState(result.success ? 'applied' : 'error')
  }, [workspace, path, oldCode, newCode])

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
    const readResult: FileState = await window.electron.ipcRenderer.invoke(
      'read-file',
      workspace,
      oldPath
    )
    if (!readResult.exists || readResult.content === null) {
      setApplyState('error')
      return
    }
    const writeResult: { success: boolean; error?: string } =
      await window.electron.ipcRenderer.invoke('write-file', workspace, newPath, readResult.content)
    if (!writeResult.success) {
      setApplyState('error')
      return
    }
    const deleteResult: { success: boolean; error?: string } =
      await window.electron.ipcRenderer.invoke('delete-file', workspace, oldPath)
    if (deleteResult.success) {
      invalidateFileContentCache(workspace, oldPath)
      invalidateFileContentCache(workspace, newPath)
    }
    setApplyState(deleteResult.success ? 'applied' : 'error')
  }, [workspace, oldPath, newPath])

  return (
    <div className="md-file-block">
      <div className="md-file-header">
        <div className="md-file-header-left">
          <span className="md-file-status-label moved">MOVED</span>
          <FilePathDisplay path={oldPath} />
          <span className="md-file-move-arrow" style={{ margin: '0 8px', opacity: 0.6 }}>
            →
          </span>
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
    if (!workspace) return
    const result: { success: boolean; error?: string } = await window.electron.ipcRenderer.invoke(
      'delete-file',
      workspace,
      path
    )
    if (result.success) invalidateFileContentCache(workspace, path)
    setApplyState(result.success ? 'applied' : 'error')
  }, [workspace, path])

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
    const result: { success: boolean; error?: string } = await window.electron.ipcRenderer.invoke(
      'write-file',
      workspace,
      path,
      code
    )
    if (result.success) invalidateFileContentCache(workspace, path)
    setApplyState(result.success ? 'applied' : 'error')
  }, [workspace, path, code])

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
          } else {
            const match = /language-(\w+)/.exec(childProps.className)
            if (match) language = match[1]
          }
        }
        codeText = extractText(childProps.children).replace(/\n$/, '')
      }
    })

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
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  }
}

const Markdown = memo(function Markdown({ content }: MarkdownProps): React.JSX.Element {
  const processedContent = getActiveParser().preprocess(content)

  return (
    <div className="md-content">
      <ReactMarkdown remarkPlugins={markdownRemarkPlugins} components={markdownComponents}>
        {processedContent}
      </ReactMarkdown>
    </div>
  )
})

export default Markdown
