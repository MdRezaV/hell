
import { useState, useRef, useCallback, Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Play, Check, FileCode2 } from 'lucide-react'

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

function wrapInFence(code: string, lang: string): string {
  let maxBackticks = 0
  let maxTildes = 0
  const backtickMatch = code.match(/`+/g)
  if (backtickMatch) maxBackticks = Math.max(...backtickMatch.map((s) => s.length))
  const tildeMatch = code.match(/~+/g)
  if (tildeMatch) maxTildes = Math.max(...tildeMatch.map((s) => s.length))

  let fence: string
  if (maxBackticks < 3) fence = '```'
  else if (maxTildes < 3) fence = '~~~'
  else fence = '`'.repeat(maxBackticks + 1)

  return `\n${fence}${lang}\n${code}\n${fence}\n`
}

function preprocessFileBlocks(content: string): string {
  // More flexible regex to match <file> tags with attributes in any order
  const fileTagRegex = /<file\s+([^>]*)>\s*\n?([\s\S]*?)\n?\s*<\/file>/g

  return content.replace(fileTagRegex, (match, attrs, body) => {
    const attrString = attrs as string
    const bodyContent = body as string

    // Extract path attribute
    const pathMatch = /path="([^"]*)"/.exec(attrString)
    const path = pathMatch ? pathMatch[1] : ''

    // Check if this is a replace action
    const isReplace = /action="replace"/.test(attrString)

    if (isReplace) {
      // Extract old and new sections
      const oldMatch = /<old[^>]*>\s*\n?([\s\S]*?)\n?\s*<\/old>/.exec(bodyContent)
      const newMatch = /<new[^>]*>\s*\n?([\s\S]*?)\n?\s*<\/new>/.exec(bodyContent)

      const oldCode = oldMatch ? oldMatch[1] : ''
      const newCode = newMatch ? newMatch[1] : ''

      const combined = `<old>\n${oldCode}\n</old>\n<new>\n${newCode}\n</new>`
      return wrapInFence(combined, `file-replace:${path}`)
    } else {
      // Simple file block
      return wrapInFence(bodyContent, `file:${path}`)
    }
  })
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
  const segments = path.split(/[/\\]/)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const isSyncing = useRef(false)

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

  const renderLines = (code: string) => {
    const lines = code.replace(/\n$/, '').split('\n')
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

  return (
    <div className="md-file-block md-file-replace-block">
      <div className="md-file-header">
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
      </div>
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
            {renderLines(oldCode)}
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
            {renderLines(newCode)}
          </div>
        </div>
      </div>
    </div>
  )
}

function FileBlock({ path, code }: { path: string; code: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const lines = code.replace(/\n$/, '').split('\n')
  const segments = path.split(/[/\\]/)

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore clipboard errors */
    }
  }

  return (
    <div className="md-file-block">
      <div className="md-file-header">
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

interface PreProps {
  children?: ReactNode
  node?: unknown
  [key: string]: unknown
}

interface CodeProps {
  className?: string
  children?: ReactNode
  node?: unknown
  [key: string]: unknown
}

function Markdown({ content }: MarkdownProps): React.JSX.Element {
  const processedContent = preprocessFileBlocks(content)

  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          pre({ children, node: _node, ...props }: PreProps) {
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
                  if (childProps.className.startsWith('language-file:')) {
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
                const oldMatch = codeText.match(/<old>\s*\n?([\s\S]*?)\n?\s*<\/old>/)
                const newMatch = codeText.match(/<new>\s*\n?([\s\S]*?)\n?\s*<\/new>/)
                return (
                  <FileReplaceBlock
                    path={filePath}
                    oldCode={oldMatch ? oldMatch[1] : ''}
                    newCode={newMatch ? newMatch[1] : ''}
                  />
                )
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
          code({ className, children, node: _node, ...props }: CodeProps) {
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
