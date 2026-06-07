import { useState, Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Play, Check } from 'lucide-react'

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
  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children, node: _node, ...props }: PreProps) {
            let language = ''
            let codeText = ''

            Children.forEach(children, (child) => {
              if (isValidElement(child)) {
                const childProps = child.props as {
                  className?: string
                  children?: ReactNode
                }
                if (childProps.className) {
                  const match = /language-(\w+)/.exec(childProps.className)
                  if (match) language = match[1]
                }
                codeText = extractText(childProps.children).replace(/\n$/, '')
              }
            })

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
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default Markdown