import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  Children,
  isValidElement,
  type ReactNode
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Play, Check, FileCode2 } from 'lucide-react'
import { trimSingleNewline, findMatchedBlocks, preprocessFileBlocks } from '../utils/markdownParser'
import { useWorkspace } from '../WorkspaceContext'

interface MarkdownProps {
  content: string
}

type CustomBlockRenderer = (code: string) => React.JSX.Element

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
      <FileCode2 size={14} strokeWidth={2} className="md-file-path-icon" />
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

function LinesDisplay({ code }: { code: string }): React.JSX.Element {
  const lines = code.split('\n')
  return (
    <div className="md-file-lines">
      {lines.map((line, i) => (
        <div key={i} className="md-file-line">
          <div className="md-file-line-number">{i + 1}</div>
          <div className="md-file-line-content">
            <code>{line}</code>
          </div>
        </div>
      ))}
    </div>
  )
}

interface FileState {
  exists: boolean
  content: string | null
}

function useFileContent(path: string): FileState | null {
  const { workspace } = useWorkspace()
  const [fileState, setFileState] = useState<FileState | null>(null)

  useEffect(() => {
    if (!workspace) {
      setFileState({ exists: false, content: null })
      return
    }
    let cancelled = false
    setFileState(null)
    window.electron.ipcRenderer.invoke('read-file', workspace, path).then((result: FileState) => {
      if (!cancelled) setFileState(result)
    })
    return () => {
      cancelled = true
    }
  }, [workspace, path])

  return fileState
}

function FileReplaceBlock({
  path,
  oldCode,
  newCode
}: {
  path: string
  oldCode: string
  newCode: string
}): React.JSX.Element {
  const [copied, setCopied] = useState<'old' | 'new' | null>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const isSyncing = useRef(false)
  const fileState = useFileContent(path)
  const notFound = fileState !== null && !fileState.exists

  const handleCopy = async (code: string, type: 'old' | 'new'): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(type)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      /* ignore */
    }
  }

  const syncScroll = useCallback((source: 'left' | 'right') => {
    if (isSyncing.current) return
    isSyncing.current = true
    const from = source === 'left' ? leftRef.current : rightRef.current
    const to = source === 'left' ? rightRef.current : leftRef.current
    if (from && to) {
      to.scrollTop = from.scrollTop
      to.scrollLeft = from.scrollLeft
    }
    window.requestAnimationFrame(() => {
      isSyncing.current = false
    })
  }, [])

  return (
    <div className="md-file-block md-file-replace-block">
      <div className="md-file-header">
        <div className="md-file-header-left">
          {notFound && <span className="md-file-status-label error">NOT FOUND</span>}
          <FilePathDisplay path={path} />
        </div>
      </div>
      {notFound && (
        <div className="md-file-error">Cannot replace: file does not exist</div>
      )}
      <div className="md-file-diff">
        <div className="md-file-diff-side old">
          <div className="md-file-diff-header">
            <span className="md-file-replace-label old">Removed</span>
            <button
              type="button"
              className={`md-file-copy${copied === 'old' ? ' copied' : ''}`}
              onClick={() => handleCopy(oldCode, 'old')}
              title={copied === 'old' ? 'Copied' : 'Copy removed code'}
              aria-label={copied === 'old' ? 'Copied' : 'Copy removed code'}
            >
              {copied === 'old' ? (
                <Check size={16} strokeWidth={2.25} />
              ) : (
                <FileCode2 size={16} strokeWidth={2} />
              )}
            </button>
          </div>
          <div
            ref={leftRef}
            className="md-file-code md-file-diff-code"
            onScroll={() => syncScroll('left')}
          >
            <LinesDisplay code={oldCode} />
          </div>
        </div>
        <div className="md-file-diff-divider" />
        <div className="md-file-diff-side new">
          <div className="md-file-diff-header">
            <span className="md-file-replace-label new">Added</span>
            <button
              type="button"
              className={`md-file-copy${copied === 'new' ? ' copied' : ''}`}
              onClick={() => handleCopy(newCode, 'new')}
              title={copied === 'new' ? 'Copied' : 'Copy added code'}
              aria-label={copied === 'new' ? 'Copied' : 'Copy added code'}
            >
              {copied === 'new' ? (
                <Check size={16} strokeWidth={2.25} />
              ) : (
                <FileCode2 size={16} strokeWidth={2} />
              )}
            </button>
          </div>
          <div
            ref={rightRef}
            className="md-file-code md-file-diff-code"
            onScroll={() => syncScroll('right')}
          >
            <LinesDisplay code={newCode} />
          </div>
        </div>
      </div>
    </div>
  )
}

function FileDeleteBlock({ path }: { path: string }): React.JSX.Element {
  const fileState = useFileContent(path)
  const [copied, setCopied] = useState(false)

  const handleCopy = async (): Promise<void> => {
    if (!fileState?.content) return
    try {
      await navigator.clipboard.writeText(fileState.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

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
        <div className="md-file-error">File not found</div>
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
        <button
          type="button"
          className={`md-file-copy${copied ? ' copied' : ''}`}
          onClick={handleCopy}
          title={copied ? 'Copied' : 'Copy content'}
          aria-label={copied ? 'Copied' : 'Copy content'}
        >
          {copied ? (
            <Check size={16} strokeWidth={2.25} />
          ) : (
            <FileCode2 size={16} strokeWidth={2} />
          )}
        </button>
      </div>
      <div className="md-file-code">
        <LinesDisplay code={fileState.content || ''} />
      </div>
    </div>
  )
}

function FileBlock({ path, code }: { path: string; code: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const fileState = useFileContent(path)

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore clipboard errors */
    }
  }

  const isCreated = fileState !== null && !fileState.exists

  return (
    <div className="md-file-block">
      <div className="md-file-header">
        <div className="md-file-header-left">
          {isCreated && <span className="md-file-status-label created">CREATED</span>}
          <FilePathDisplay path={path} />
        </div>
        <button
          type="button"
          className={`md-file-copy${copied ? ' copied' : ''}`}
          onClick={handleCopy}
          title={copied ? 'Copied' : 'Copy code'}
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? (
            <Check size={16} strokeWidth={2.25} />
          ) : (
            <FileCode2 size={16} strokeWidth={2} />
          )}
        </button>
      </div>
      <div className="md-file-code">
        <LinesDisplay code={code} />
      </div>
    </div>
  )
}

function CommandBlock({ code }: { code: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleRun = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore clipboard errors */
    }
  }

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
      <pre className="md-command-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

const CUSTOM_BLOCK_RENDERERS: Record<string, CustomBlockRenderer> = {
  command: (code) => <CommandBlock code={code} />
}

function Markdown({ content }: MarkdownProps): React.JSX.Element {
  const processedContent = preprocessFileBlocks(content)

  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          pre({
            children,
            node: _node,
            ...props
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
                const { matched: oldBlocks } = findMatchedBlocks(codeText, 'old')
                const { matched: newBlocks } = findMatchedBlocks(codeText, 'new')
                const oldCode = oldBlocks.length > 0 ? trimSingleNewline(oldBlocks[0].body) : ''
                const newCode = newBlocks.length > 0 ? trimSingleNewline(newBlocks[0].body) : ''
                return <FileReplaceBlock path={filePath} oldCode={oldCode} newCode={newCode} />
              }
              if (language === 'file-delete') {
                return <FileDeleteBlock path={filePath} />
              }
              return <FileBlock path={filePath} code={codeText} />
            }

            const customRenderer = CUSTOM_BLOCK_RENDERERS[language]
            if (customRenderer) {
              return customRenderer(codeText)
            }

            return (
              <div className="md-code-block-wrapper">
                {language && <div className="md-code-lang">{language}</div>}
                <pre {...props}>{children}</pre>
              </div>
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
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}

export default Markdown
