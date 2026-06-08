export interface CodeRange {
  start: number
  end: number
}

export interface TagInfo {
  start: number
  end: number
  attrs: string
  selfClosing: boolean
}

export interface CloseInfo {
  start: number
  end: number
}

export interface MatchedBlock {
  open: TagInfo
  close: CloseInfo
  body: string
}

export interface FindBlocksResult {
  matched: MatchedBlock[]
  selfClosing: TagInfo[]
}

export function normalizeBody(text: string): string {
  return text.replace(/^\n+/, '').replace(/\n+$/, '')
}

export function trimSingleNewline(text: string): string {
  let result = text
  if (result.startsWith('\n')) result = result.slice(1)
  if (result.endsWith('\n')) result = result.slice(0, -1)
  return result
}

export function wrapInFence(code: string, lang: string): string {
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

export function isPosInRange(pos: number, ranges: CodeRange[]): boolean {
  for (const r of ranges) {
    if (pos >= r.start && pos < r.end) return true
  }
  return false
}

export function findCodeRangesSkippingRanges(text: string, skipRanges: CodeRange[]): CodeRange[] {
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

export function findTagsInText(
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

export function matchOpenClose(
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
      const hasCloseBetween = closes.some((c) => c.start >= open.end && c.start < nextOpen.start)
      if (hasCloseBetween) break
      j++
    }

    const boundary = j < regularOpens.length ? regularOpens[j].start : textLength

    let bestCloseIdx = -1
    for (let k = 0; k < closes.length; k++) {
      if (closes[k].start >= open.end && closes[k].start < boundary) {
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

export function findMatchedBlocks(
  text: string,
  tagName: string,
  extraSkipRanges?: CodeRange[]
): FindBlocksResult {
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

    const allSkipRanges = extraSkipRanges ? [...blockRanges, ...extraSkipRanges] : blockRanges
    const codeRegions = findCodeRangesSkippingRanges(text, allSkipRanges)

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

export function preprocessCommitBlocks(content: string): string {
  const { matched: commitBlocks } = findMatchedBlocks(content, 'commit')
  // Process in reverse order so positions remain valid
  const sorted = [...commitBlocks].sort((a, b) => b.open.start - a.open.start)
  let result = content
  for (const block of sorted) {
    const body = block.body
    const replacement = wrapInFence(body, 'commit')
    result = result.slice(0, block.open.start) + replacement + result.slice(block.close.end)
  }
  return result
}

export function preprocessFileBlocks(content: string): string {
  // First process commit blocks so that inner file tags become plain text inside a fence
  const withCommits = preprocessCommitBlocks(content)
  const { matched: fileBlocks, selfClosing: selfClosingFiles } = findMatchedBlocks(
    withCommits,
    'file'
  )

  const ops: PreprocessOp[] = fileBlocks.map((b) => ({ kind: 'regular', block: b }))

  const regularRanges: CodeRange[] = fileBlocks.map((b) => ({
    start: b.open.start,
    end: b.close.end
  }))
  const topLevelCode = findCodeRangesSkippingRanges(withCommits, regularRanges)

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

  let result = withCommits
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

        const oldBlockRanges = oldBlocks.map((b) => ({
          start: b.open.start,
          end: b.close.end
        }))
        const { matched: newBlocks } = findMatchedBlocks(body, 'new', oldBlockRanges)

        const oldCode = oldBlocks.length > 0 ? trimSingleNewline(oldBlocks[0].body) : ''
        const newCode = newBlocks.length > 0 ? trimSingleNewline(newBlocks[0].body) : ''

        const combined = `<old>\n${oldCode}\n</old>\n<new>\n${newCode}\n</new>`
        replacement = wrapInFence(combined, `file-replace:${path}`)
      } else {
        replacement = wrapInFence(trimSingleNewline(block.body), `file:${path}`)
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
