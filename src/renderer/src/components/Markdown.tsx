 
import { useState, Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Play, Check, Copy } from 'lucide-react'

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

function preprocessFileBlocks(content: string): string {
  const fileBlockRegex = /<file\s+path="([^"]+)">\n?([\s\S]*?)\n?<\/file>/g

  return content.replace(fileBlockRegex, (_match, path, code) => {
    const trimmedCode = code as string

    let maxBackticks = 0
    let maxTildes = 0
    const backtickMatch = trimmedCode.match(/`+/g)
    if (backtickMatch) {
      maxBackticks = Math.max(...backtickMatch.map((s: string) => s.length))
    }
    const tildeMatch = trimmedCode.match(/~+/g)
    if (tildeMatch) {
      maxTildes = Math.max(...tildeMatch.map((s: string) => s.length))
    }

    let fence: string
    if (maxBackticks < 3) {
      fence = '```'
    } else if (maxTildes < 3) {
      fence = '~~~'
    } else {
      fence = '`'.repeat(maxBackticks + 1)
    }

    return `\n${fence}file:${path}\n${trimmedCode}\n${fence}\n`
  })
}

function FileBlock({ path, code }: { path: string; code: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const lines = code.replace(/\n$/, '').split('\n')

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
        <span className="md-file-path" title={path}>{path}</span>
        <button
          type="button"
          className="md-file-copy"
          onClick={handleCopy}
          title={copied ? 'Copied' : 'Copy'}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="md-file-code">
        <table className="md-file-lines">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="md-file-line-number">{i + 1}</td>
                <td className="md-file-line-content"><code>{line}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
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