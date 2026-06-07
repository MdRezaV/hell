import React, { useState, useRef, useCallback, Children, isValidElement, type ReactNode } from 'react'
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

interface CodeRange {
  start: number
  end: number
}

interface TagInfo {
  start: number
  end: number
  attrs: string
  selfClosing: boolean
}

interface CloseInfo {
  start: number
  end: number
}

interface MatchedBlock {
  open: TagInfo
  close: CloseInfo
  body: string
}

function isPosInRange(pos: number, ranges: CodeRange[]): boolean {
  for (const r of ranges) {
    if (pos >= r.start && pos < r.end) return true
  }
  return false
}

function findCodeRangesSkippingRanges(text: string, skipRanges: CodeRange[]): CodeRange[] {
  const ranges: CodeRange[] = []
  const sorted = [...skipRanges].sort((a, b) => a.start - b.start)
  let pos = 0

  const findSkip = (p: number): CodeRange | undefined =>
    sorted.find((r) => p >= r.start && p < r.end)

  while (pos < text.length) {
    const skip = findSkip(pos)
    if (skip) {
      pos = skip.end
      continue
    }

    const atLineStart = pos === 0 || text[pos - 1] === '\n'
    if (atLineStart) {
      const slice = text.slice(pos)
      const fenceMatch = /^(\s{0,3})(`{3,}|~{3,})/.exec(slice)
      if (fenceMatch) {
        const fenceChar = fenceMatch[2][0]
        const fenceLen = fenceMatch[2].length
        const blockStart = pos
        const openEnd = pos + fenceMatch[0].length
        const lineEnd = text.indexOf('\n', openEnd)
        pos = lineEnd === -1 ? text.length : lineEnd + 1

        let found = false
        while (pos < text.length) {
          const skipInner = findSkip(pos)
          if (skipInner) {
            pos = skipInner.end
            if (pos > 0 && pos < text.length && text[pos - 1] !== '\n') {
              const nextNl = text.indexOf('\n', pos)
              pos = nextNl === -1 ? text.length : nextNl + 1
            }
            continue
          }

          const cLineEnd = text.indexOf('\n', pos)
          const cLineEndPos = cLineEnd === -1 ? text.length : cLineEnd
          const cLine = text.slice(pos, cLineEndPos)

          const closingRe =
            fenceChar === '`'
              ? new RegExp(`^\\s{0,3}\`{${fenceLen},}\\s*$`)
              : new RegExp(`^\\s{0,3}~{${fenceLen},}\\s*$`)

          if (closingRe.test(cLine)) {
            pos = cLineEnd === -1 ? text.length : cLineEnd + 1
            ranges.push({ start: blockStart, end: pos })
            found = true
            break
          }
          pos = cLineEnd === -1 ? text.length : cLineEnd + 1
        }

        if (!found) {
          ranges.push({ start: blockStart, end: text.length })
        }
        continue
      }
    }

    if (text[pos] === '`') {
      let count = 0
      const spanStart = pos
      while (pos < text.length && text[pos] === '`') {
        count++
        pos++
      }

      let foundClosing = false
      while (pos < text.length) {
        const skipInner = findSkip(pos)
        if (skipInner) {
          pos = skipInner.end
          continue
        }

        if (text[pos] === '`') {
          let closingCount = 0
          while (pos < text.length && text[pos] === '`') {
            closingCount++
            pos++
          }
          if (closingCount === count) {
            ranges.push({ start: spanStart, end: pos })
            foundClosing = true
            break
          }
        } else {
          pos++
        }
      }

      if (!foundClosing) {
        /* unclosed inline code span, pos is at end of text */
      }
      continue
    }

    pos++
  }

  return ranges
}

function findTagsInText(
  text: string,
  tagName: string,
  codeRanges: CodeRange[]
): { opens: TagInfo[]; closes: CloseInfo[] } {
  const opens: TagInfo[] = []
  const closes: CloseInfo[] = []

  const tagRe = new RegExp(`<${tagName}([^>]*)>`, 'gi')
  const closeRe = new RegExp(`</${tagName}\\s*>`, 'gi')

  let match: RegExpExecArray | null

  while ((match = tagRe.exec(text)) !== null) {
    if (!isPosInRange(match.index, codeRanges)) {
      const rawAttrs = match[1] || ''
      const selfClosing = /\/\s*$/.test(rawAttrs)
      const attrs = selfClosing ? rawAttrs.replace(/\/\s*$/, '').trim() : rawAttrs.trim()
      opens.push({
        start: match.index,
        end: match.index + match[0].length,
        attrs,
        selfClosing
      })
    }
  }

  while ((match = closeRe.exec(text)) !== null) {
    if (!isPosInRange(match.index, codeRanges)) {
      closes.push({
        start: match.index,
        end: match.index + match[0].length
      })
    }
  }

  opens.sort((a, b) => a.start - b.start)
  closes.sort((a, b) => a.start - b.start)

  return { opens, closes }
}

function matchOpenClose(
  opens: TagInfo[],
  closes: CloseInfo[],
  textLength: number,
  text: string
): MatchedBlock[] {
  const matched: MatchedBlock[] = []
  const regularOpens = opens.filter((o) => !o.selfClosing)
  let i = 0

  while (i < regularOpens.length) {
    const open = regularOpens[i]

    let j = i + 1
    while (j < regularOpens.length) {
      const nextOpen = regularOpens[j]
      const hasCloseBetween = closes.some((c) => c.start > open.end && c.start < nextOpen.start)
      if (hasCloseBetween) break
      j++
    }

    const boundary = j < regularOpens.length ? regularOpens[j].start : textLength

    let bestCloseIdx = -1
    for (let k = 0; k < closes.length; k++) {
      if (closes[k].start > open.end && closes[k].start < boundary) {
        bestCloseIdx = k
      }
    }

    if (bestCloseIdx >= 0) {
      matched.push({
        open,
        close: closes[bestCloseIdx],
        body: text.slice(open.end, closes[bestCloseIdx].start)
      })
      i = j
    } else {
      i++
    }
  }

  return matched
}

interface FindBlocksResult {
  matched: MatchedBlock[]
  selfClosing: TagInfo[]
}

function findMatchedBlocks(text: string, tagName: string): FindBlocksResult {
  const { opens: allOpens, closes: allCloses } = findTagsInText(text, tagName, [])
  const selfClosing = allOpens.filter((o) => o.selfClosing)
  let activeOpens = allOpens.filter((o) => !o.selfClosing)
  let activeCloses = [...allCloses]
  let finalMatches: MatchedBlock[] = []

  for (;;) {
    const matches = matchOpenClose(activeOpens, activeCloses, text.length, text)
    if (matches.length === 0) break

    const blockRanges: CodeRange[] = matches.map((m) => ({
      start: m.open.start,
      end: m.close.end
    }))

    const codeRegions = findCodeRangesSkippingRanges(text, blockRanges)

    const removedOpens = new Set<number>()
    const removedCloses = new Set<number>()

    for (const m of matches) {
      if (isPosInRange(m.open.start, codeRegions) || isPosInRange(m.close.start, codeRegions)) {
        removedOpens.add(m.open.start)
        removedCloses.add(m.close.start)
      }
    }

    if (removedOpens.size === 0) {
      finalMatches = matches
      break
    }

    activeOpens = activeOpens.filter((o) => !removedOpens.has(o.start))
    activeCloses = activeCloses.filter((c) => !removedCloses.has(c.start))
  }

  return { matched: finalMatches, selfClosing }
}

type PreprocessOp =
  | { kind: 'regular'; block: MatchedBlock }
  | { kind: 'delete'; start: number; end: number; attrs: string }

function preprocessFileBlocks(content: string): string {
  const { matched: fileBlocks, selfClosing: selfClosingFiles } = findMatchedBlocks(content, 'file')

  const ops: PreprocessOp[] = fileBlocks.map((b) => ({ kind: 'regular', block: b }))

  const regularRanges: CodeRange[] = fileBlocks.map((b) => ({
    start: b.open.start,
    end: b.close.end
  }))
  const topLevelCode = findCodeRangesSkippingRanges(content, regularRanges)

  for (const sc of selfClosingFiles) {
    if (fileBlocks.some((fb) => sc.start >= fb.open.start && sc.end <= fb.close.end)) continue
    if (isPosInRange(sc.start, topLevelCode)) continue
    if (/action="delete"/.test(sc.attrs)) {
      ops.push({ kind: 'delete', start: sc.start, end: sc.end, attrs: sc.attrs })
    }
  }

  ops.sort((a, b) => {
    const aStart = a.kind === 'regular' ? a.block.open.start : a.start
    const bStart = b.kind === 'regular' ? b.block.open.start : b.start
    return bStart - aStart
  })

  let result = content
  for (const op of ops) {
    if (op.kind === 'regular') {
      const block = op.block
      const attrString = block.open.attrs

      const pathMatch = /path="([^"]*)"/.exec(attrString)
      const path = pathMatch ? pathMatch[1] : ''
      const isReplace = /action="replace"/.test(attrString)

      let replacement: string

      if (isReplace) {
        const body = block.body
        const { matched: oldBlocks } = findMatchedBlocks(body, 'old')
        const { matched: newBlocks } = findMatchedBlocks(body, 'new')

        const oldCode = oldBlocks.length > 0 ? oldBlocks[0].body : ''
        const newCode = newBlocks.length > 0 ? newBlocks[0].body : ''

        const combined = `<old>\n${oldCode}\n</old>\n<new>\n${newCode}\n</new>`
        replacement = wrapInFence(combined, `file-replace:${path}`)
      } else {
        replacement = wrapInFence(block.body, `file:${path}`)
      }

      result = result.slice(0, block.open.start) + replacement + result.slice(block.close.end)
    } else {
      const pathMatch = /path="([^"]*)"/.exec(op.attrs)
      const path = pathMatch ? pathMatch[1] : ''
      const replacement = wrapInFence('', `file-delete:${path}`)
      result = result.slice(0, op.start) + replacement + result.slice(op.end)
    }
  }

  return result
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

  const renderLines = (code: string): React.JSX.Element => {
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

function FileDeleteBlock({ path }: { path: string }): React.JSX.Element {
  const segments = path.split(/[/\\]/)
  return (
    <div className="md-file-block md-file-delete-block">
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
        <span className="md-file-delete-label">Deleted</span>
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
                const oldCode = oldBlocks.length > 0 ? oldBlocks[0].body : ''
                const newCode = newBlocks.length > 0 ? newBlocks[0].body : ''
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
