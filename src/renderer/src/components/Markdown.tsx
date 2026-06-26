import React, { Children, isValidElement, memo, type ReactNode, useMemo } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import '../styles/Markdown.css'
import { getActiveParser, parseReplaceBlock, segmentContent } from '../utils/markdownParser'
import { detectLanguage } from '../utils/markdownLanguages'
import {
  FileBlock,
  FileDeleteBlock,
  FileIncludeAddButton,
  FileMoveBlock,
  FileReplaceBlock,
  TaskBlock
} from './markdown/FileBlocks'

import { CommandBlock, CommitBlock, GenericCodeBlock } from './markdown/CodeBlocks'
import { DeferredHighlightingContext } from './markdown/DeferredHighlighting'
import { ApplyAllBar, ApplyAllProvider } from './markdown/ApplyAll'
import { useWorkspace } from '@renderer/WorkspaceContext'

import { StreamingContext, useIsStreaming } from './markdown/StreamingContext'

interface MarkdownProps {
  content: string
  isStreaming?: boolean
  deferHeavyRendering?: boolean
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

// Defined at module scope so React does not unmount/remount code blocks on every
// render of <Markdown>. This was the primary source of lag during streaming.
const markdownRemarkPlugins = [remarkGfm, remarkBreaks]

function Pre({
  children,
  node: _node
}: React.ComponentPropsWithoutRef<'pre'> & { node?: unknown }): React.JSX.Element {
  void _node
  const isStreaming = useIsStreaming()
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
      return (
        <FileReplaceBlock
          path={filePath}
          oldCode={oldCode}
          newCode={newCode}
          isStreaming={isStreaming}
        />
      )
    }
    if (language === 'file-delete') {
      return <FileDeleteBlock path={filePath} isStreaming={isStreaming} />
    }
    if (language === 'file-move') {
      const arrowIdx = filePath.indexOf('->')
      const oldPath = arrowIdx >= 0 ? filePath.slice(0, arrowIdx) : filePath
      const newPath = arrowIdx >= 0 ? filePath.slice(arrowIdx + 2) : ''
      return <FileMoveBlock oldPath={oldPath} newPath={newPath} />
    }
    return <FileBlock path={filePath} code={codeText} isStreaming={isStreaming} />
  }

  if (language === 'command') {
    return <CommandBlock code={codeText} />
  }
  if (language === 'commit') {
    return <CommitBlock code={codeText} />
  }

  const resolvedLanguage = language || detectLanguage(codeText)

  // Only show label for explicitly-specified or auto-detected (non-text) languages
  const showLangLabel = !language && resolvedLanguage !== 'text'

  return (
    <GenericCodeBlock
      language={resolvedLanguage}
      code={codeText}
      showLangLabel={showLangLabel || !!language}
      isStreaming={isStreaming}
    />
  )
}

const markdownComponents: Components = {
  pre: Pre,
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
  content,
  isStreaming = false
}: {
  content: string
  isStreaming?: boolean
}): React.JSX.Element {
  return (
    <StreamingContext.Provider value={isStreaming}>
      <ReactMarkdown remarkPlugins={markdownRemarkPlugins} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </StreamingContext.Provider>
  )
})

const Markdown = memo(function Markdown({
  content,
  isStreaming = false,
  deferHeavyRendering = false
}: MarkdownProps): React.JSX.Element {
  const processedContent = useMemo(() => getActiveParser().preprocess(content), [content])
  const segments = useMemo(() => segmentContent(processedContent), [processedContent])
  const lastIndex = segments.length - 1
  const { workspace } = useWorkspace()

  return (
    <DeferredHighlightingContext.Provider value={deferHeavyRendering}>
      <ApplyAllProvider key={workspace ?? 'no-workspace'}>
        <div className="md-content">
          {segments.map((segment, i) => (
            <MarkdownSegment
              key={segment.startIndex}
              content={segment.content}
              isStreaming={isStreaming && i === lastIndex}
            />
          ))}
          <ApplyAllBar />
        </div>
      </ApplyAllProvider>
    </DeferredHighlightingContext.Provider>
  )
})

export default Markdown
