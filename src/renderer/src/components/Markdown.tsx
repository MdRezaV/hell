import React, { memo, useMemo } from 'react'

import '../styles/Markdown.css'
import { getActiveParser, segmentContent } from '../utils/markdownParser'
import { ApplyAllBar, ApplyAllProvider } from './markdown/ApplyAllContext'
import { MarkdownSegment } from './markdown/MarkdownComponents'

interface MarkdownProps {
  content: string
}

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
