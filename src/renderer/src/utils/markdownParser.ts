export function normalizeLineEndings(text: string): string {
  if (text.indexOf('\r') === -1) return text
  return text.replace(/\r\n?/g, '\n')
}

export function wrapInFence(code: string, lang: string): string {
  let maxBackticks = 0
  let maxTildes = 0
  const backtickMatch = code.match(/`+/g)
  if (backtickMatch) maxBackticks = Math.max(...backtickMatch.map((s) => s.length))
  const tildeMatch = code.match(/~+/g)
  if (tildeMatch) maxTildes = Math.max(...tildeMatch.map((s) => s.length))

  const structured = lang.includes(':') || lang === 'commit'
  let fence: string
  if (structured) {
    if (maxBackticks < 3) {
      fence = '```'
    } else {
      const lines = code.split('\n')
      const hasInfoFence = lines.some((l) => /^`{3,}[^\s`]/.test(l))
      const hasBareClose = lines.some((l) => /^`{3,}\s*$/.test(l))
      if (maxTildes < 3 && hasInfoFence && hasBareClose) {
        fence = '~~~'
      } else {
        fence = '`'.repeat(Math.max(maxBackticks, maxTildes) + 1)
      }
    }
  } else if (maxBackticks < 3) {
    fence = '```'
  } else if (maxTildes < 3) {
    fence = maxBackticks === 3 ? '~~~' : '`'.repeat(maxBackticks + 1)
  } else {
    fence = '`'.repeat(Math.max(maxBackticks, maxTildes) + 1)
  }

  return `\n${fence}${lang}\n${code}\n${fence}\n`
}

/**
 * Parse the internal file-replace fenced body:
 *   [SEARCH]
 *   (old code)
 *   [REPLACE]
 *   (new code)
 *   [END]
 *
 * Tags must be alone on their line (optional leading/trailing whitespace allowed).
 */
export function parseReplaceBlock(code: string): { oldCode: string; newCode: string } | null {
  const lines = normalizeLineEndings(code).split('\n')
  if (lines.length === 0) return null

  const isSearch = (l: string): boolean => /^\s*\[SEARCH]\s*$/.test(l) || /^@@SEARCH$/.test(l)
  const isWith = (l: string): boolean => /^\s*\[REPLACE]\s*$/.test(l) || /^@@WITH$/.test(l)
  const isEnd = (l: string): boolean => /^\s*\[END]\s*$/.test(l) || /^@@END$/.test(l)

  let i = 0
  while (i < lines.length && !isSearch(lines[i])) {
    i++
  }
  if (i >= lines.length) return null
  i++

  const searchLines: string[] = []
  while (i < lines.length && !isWith(lines[i])) {
    searchLines.push(lines[i])
    i++
  }
  if (i >= lines.length || !isWith(lines[i])) return null
  i++

  const replaceLines: string[] = []
  while (i < lines.length && !isEnd(lines[i])) {
    if (/^\s+@@END\s*$/.test(lines[i])) return null
    if (isSearch(lines[i])) {
      let j = i + 1
      let foundWith = false
      while (j < lines.length && !isEnd(lines[j])) {
        if (isWith(lines[j])) {
          foundWith = true
          break
        }
        j++
      }
      if (foundWith) break
    }
    replaceLines.push(lines[i])
    i++
  }

  return { oldCode: searchLines.join('\n'), newCode: replaceLines.join('\n') }
}

const BLOCK_MARKER_RE =
  /^@@FILE .+$|^@@REPLACE .+$|^@@DELETE .+$|^@@MOVE .+$|^@@TASK\s+.+$|^@@COMMIT .*$/
const FILE_END_RE = /^\s*\[END]\s*$|^@@END$/
const SEARCH_RE = /^\s*\[SEARCH]\s*$|^@@SEARCH$/
const REPLACE_RE = /^\s*\[REPLACE]\s*$|^@@WITH$/
function processAtIncludeInline(line: string): string {
  const re = /@@INCLUDE\s+/g
  let result = ''
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    result += line.slice(lastIndex, m.index)
    const restStart = m.index + m[0].length

    const nextInclude = line.indexOf('@@INCLUDE', restStart)
    const segment = nextInclude !== -1 ? line.slice(restStart, nextInclude) : line.slice(restStart)
    const trimmed = segment.trimEnd()

    if (!trimmed) {
      lastIndex = restStart
      continue
    }

    const tokens = trimmed.split(/\s+/)
    const lastToken = tokens[tokens.length - 1].replace(/\.$/, '')
    const hasExtension = /\.\w+$/.test(lastToken)

    let path: string
    let trailing: string
    if (hasExtension && tokens.length > 1) {
      path = trimmed
      if (path.endsWith('.')) {
        path = path.slice(0, -1)
        trailing = '.' + segment.slice(trimmed.length)
      } else {
        trailing = segment.slice(trimmed.length)
      }
    } else {
      const firstSpace = trimmed.search(/\s/)
      if (firstSpace === -1) {
        path = trimmed
        trailing = segment.slice(trimmed.length)
      } else {
        path = trimmed.slice(0, firstSpace)
        trailing = trimmed.slice(firstSpace) + segment.slice(trimmed.length)
      }
      if (path.endsWith('.')) {
        path = path.slice(0, -1)
        trailing = '.' + trailing
      }
    }

    if (!path) {
      lastIndex = restStart
      continue
    }

    result += `\`file-include:${path}\`${trailing}`
    lastIndex = nextInclude !== -1 ? nextInclude : line.length
  }
  result += line.slice(lastIndex)
  return result
}

function processIncludeInline(line: string): string {
  const INCLUDE_START = /\[INCLUDE\s+/g
  const starts: Array<{ index: number; contentStart: number }> = []
  let m: RegExpExecArray | null
  while ((m = INCLUDE_START.exec(line)) !== null) {
    starts.push({ index: m.index, contentStart: m.index + m[0].length })
  }

  if (starts.length === 0) return line

  let result = ''
  let pos = 0

  for (let i = 0; i < starts.length; i++) {
    const { index, contentStart } = starts[i]
    result += line.slice(pos, index)

    const searchEnd = i + 1 < starts.length ? starts[i + 1].index : line.length
    const closingBracket = line.lastIndexOf(']', searchEnd - 1)

    if (closingBracket < contentStart) {
      result += line.slice(index, searchEnd)
      pos = searchEnd
      continue
    }

    const path = line.slice(contentStart, closingBracket).trim()
    if (!path) {
      result += line.slice(index, closingBracket + 1)
      pos = closingBracket + 1
      continue
    }

    result += `\`file-include:${path}\``
    pos = closingBracket + 1
  }

  result += line.slice(pos)
  return result
}

function safePath(path: string): string {
  return (
    path
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, '')
      .replace(/\\/g, '/')
      .replace(/\s/g, '%20')
  )
}

function isCodeFenceOpen(line: string): { char: string; len: number } | null {
  const m = /^(\s{0,3})(`{3,}|~{3,})/.exec(line)
  if (!m) return null
  return { char: m[2][0], len: m[2].length }
}

function isCodeFenceClose(line: string, fenceChar: string, fenceLen: number): boolean {
  const re =
    fenceChar === '`'
      ? new RegExp(`^\\s{0,3}\`{${fenceLen},}\\s*$`)
      : new RegExp(`^\\s{0,3}~{${fenceLen},}\\s*$`)
  return re.test(line)
}

function parseSearchReplacePairs(lines: string[]): Array<{ old: string; new: string }> {
  const pairs: Array<{ old: string; new: string }> = []
  let i = 0

  while (i < lines.length) {
    if (SEARCH_RE.test(lines[i])) {
      i++
      const searchLines: string[] = []
      while (i < lines.length && !REPLACE_RE.test(lines[i]) && !FILE_END_RE.test(lines[i])) {
        searchLines.push(lines[i])
        i++
      }

      // Only create a pair when a valid [REPLACE] tag was actually found.
      // If [END] (or EOF) is reached first, this [SEARCH] was incomplete —
      // discard it so the caller can fall back to a regular file block.
      if (i < lines.length && REPLACE_RE.test(lines[i])) {
        i++
        const replaceLines: string[] = []
        while (i < lines.length && !FILE_END_RE.test(lines[i]) && !SEARCH_RE.test(lines[i])) {
          replaceLines.push(lines[i])
          i++
        }
        pairs.push({ old: searchLines.join('\n'), new: replaceLines.join('\n') })
      }
    } else {
      i++
    }
  }

  return pairs
}

/**
 * Preprocess the bracket format into fenced markdown blocks that
 * the Markdown renderer understands:
 *
 *   [FILE path]              -> ```file:path
 *   (content)                   (content)
 *   [END]                     ```
 *
 *   [FILE path]              -> ```file-replace:path
 *   [SEARCH]                    [SEARCH]
 *   (old)                       (old)
 *   [REPLACE]                   [REPLACE]
 *   (new)                       (new)
 *   [END]                       [END]
 *                               ```
 *
 *   [DELETE FILE path]       -> ```file-delete:path```
 *   [MOVE FILE FROM a TO b]  -> ```file-move:a->b```
 *   COMMIT: msg              -> ```commit\nmsg\n```
 *
 * Tags must be alone on their line (optional leading/trailing whitespace allowed).
 * Tags with surrounding text are treated as content.
 */
function preprocessImpl(
  content: string,
  initialLastFilePath = ''
): { result: string; lastFilePath: string } {
  const lines = normalizeLineEndings(content).split('\n')
  const result: string[] = []
  let i = 0
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0
  let lastFilePath = initialLastFilePath

  while (i < lines.length) {
    const line = lines[i]

    // Track existing code fences so we never interpret markers inside them.
    if (!inFence) {
      const open = isCodeFenceOpen(line)
      if (open) {
        inFence = true
        fenceChar = open.char
        fenceLen = open.len
        result.push(line)
        i++
        continue
      }
    } else {
      if (isCodeFenceClose(line, fenceChar, fenceLen)) {
        inFence = false
      }
      result.push(line)
      i++
      continue
    }

    // @@FILE path
    const atFileMatch = /^@@FILE (.+)$/.exec(line)
    if (atFileMatch) {
      const path = atFileMatch[1].trim()
      lastFilePath = path
      i++
      const contentLines: string[] = []
      while (i < lines.length && !/^@@END$/.test(lines[i])) {
        if (BLOCK_MARKER_RE.test(lines[i])) break
        contentLines.push(lines[i])
        i++
      }
      if (i < lines.length && /^@@END$/.test(lines[i])) i++
      const code = contentLines.join('\n')
      const fenced = wrapInFence(code, `file:${safePath(path)}`)
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      continue
    }

    // @@REPLACE path
    const atReplaceMatch = /^@@REPLACE (.+)$/.exec(line)
    if (atReplaceMatch) {
      const path = atReplaceMatch[1].trim()
      lastFilePath = path
      i++
      const contentLines: string[] = []
      while (i < lines.length && !/^@@END$/.test(lines[i])) {
        if (
          /^@@FILE /.test(lines[i]) ||
          /^@@REPLACE /.test(lines[i]) ||
          /^@@DELETE /.test(lines[i]) ||
          /^@@MOVE /.test(lines[i]) ||
          /^@@TASK\s/.test(lines[i])
        )
          break
        contentLines.push(lines[i])
        i++
      }
      if (i < lines.length && /^@@END$/.test(lines[i])) i++
      const pairs = parseSearchReplacePairs(contentLines)
      if (pairs.length > 0) {
        for (const pair of pairs) {
          const combined = `[SEARCH]\n${pair.old}\n[REPLACE]\n${pair.new}\n[END]`
          const fenced = wrapInFence(combined, `file-replace:${safePath(path)}`)
          result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
        }
      } else {
        const code = contentLines.join('\n')
        const fenced = wrapInFence(code, `file:${safePath(path)}`)
        result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      }
      continue
    }

    // @@DELETE path
    const atDeleteMatch = /^@@DELETE (.+)$/.exec(line)
    if (atDeleteMatch) {
      const path = atDeleteMatch[1].trim()
      const fenced = wrapInFence('', `file-delete:${safePath(path)}`)
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      i++
      continue
    }

    // @@MOVE old -> new
    const atMoveMatch = /^@@MOVE (.+?) -> (.+)$/.exec(line)
    if (atMoveMatch) {
      const oldPath = atMoveMatch[1].trim()
      const newPath = atMoveMatch[2].trim()
      const safeSrc = oldPath
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1f\x7f]/g, '')
        .replace(/\\/g, '/')
        .replace(/ -> /g, '\x00')
        .replace(/\s/g, '%20')
        // eslint-disable-next-line no-control-regex
        .replace(/\x00/g, ' -> ')
      const safeDest = newPath
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1f\x7f]/g, '')
        .replace(/\\/g, '/')
        .replace(/ -> /g, '\x00')
        .replace(/\s/g, '%20')
        // eslint-disable-next-line no-control-regex
        .replace(/\x00/g, ' -> ')
      const fenced = wrapInFence('', `file-move:${safeSrc}->${safeDest}`)
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      i++
      continue
    }

    // @@TASK id
    const atTaskMatch = /^@@TASK\s+(.+)$/.exec(line)
    if (atTaskMatch) {
      const taskId = atTaskMatch[1].trim()
      i++
      const contentLines: string[] = []
      while (i < lines.length && !/^@@END$/.test(lines[i])) {
        if (BLOCK_MARKER_RE.test(lines[i])) break
        contentLines.push(lines[i])
        i++
      }
      if (i < lines.length && /^@@END$/.test(lines[i])) i++
      const code = contentLines.join('\n')
      const fenced = wrapInFence(code, `task:${safePath(taskId)}`)
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      continue
    }

    // @@COMMIT message
    const atCommitMatch = /^@@COMMIT (.*)$/.exec(line)
    if (atCommitMatch) {
      const message = atCommitMatch[1].trim()
      const fenced = wrapInFence(message, 'commit')
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      i++
      continue
    }

    // Orphan @@SEARCH / [SEARCH] block outside any @@FILE/@@REPLACE
    if (SEARCH_RE.test(line)) {
      const contentLines: string[] = [line]
      i++
      while (i < lines.length && !FILE_END_RE.test(lines[i]) && !BLOCK_MARKER_RE.test(lines[i])) {
        contentLines.push(lines[i])
        i++
      }
      if (i < lines.length && FILE_END_RE.test(lines[i])) {
        contentLines.push(lines[i])
        i++
      }
      const pairs = parseSearchReplacePairs(contentLines)
      if (pairs.length > 0 && lastFilePath) {
        for (const pair of pairs) {
          const combined = `[SEARCH]\n${pair.old}\n[REPLACE]\n${pair.new}\n[END]`
          const fenced = wrapInFence(combined, `file-replace:${safePath(lastFilePath)}`)
          result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
        }
      } else {
        for (const l of contentLines) {
          result.push(l)
        }
      }
      continue
    }

    result.push(processAtIncludeInline(processIncludeInline(line)))
    i++
  }

  return { result: result.join('\n'), lastFilePath }
}

export interface Segment {
  content: string
  startIndex: number
}

/**
 * Split preprocessed markdown into segments at code-fence boundaries.
 * Each segment is rendered by an independent, memoized ReactMarkdown
 * instance so that during streaming only the last (active) segment
 * re-parses — eliminating the O(N²) cost of re-parsing the entire
 * accumulated document on every token.
 *
 * Returns segments with stable `startIndex` keys (character offset in
 * the original content) to prevent React from unmounting/remounting
 * segments when fence boundaries shift during streaming.
 */
export function segmentContent(content: string): Segment[] {
  if (!content) return [{ content: '', startIndex: 0 }]

  const lines = content.split('\n')
  const segments: Segment[] = []
  let segStartLine = 0
  let segStartChar = 0
  let charPos = 0
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (!inFence) {
      const m = /^(\s{0,3})(`{3,}|~{3,})/.exec(line)
      if (m) {
        inFence = true
        fenceChar = m[2][0]
        fenceLen = m[2].length
      }
    } else {
      const closeRe =
        fenceChar === '`'
          ? new RegExp(`^\\s{0,3}\`{${fenceLen},}\\s*$`)
          : new RegExp(`^\\s{0,3}~{${fenceLen},}\\s*$`)
      if (closeRe.test(line)) {
        inFence = false
        // Only split here if the next non-empty line is NOT another fence
        // open. This keeps consecutive fenced blocks (e.g. multiple @@FILE
        // blocks) in the same segment, preventing orphaned closing fences
        // from being misinterpreted as paragraph content by remark-breaks.
        let nextNonEmpty = i + 1
        while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === '') {
          nextNonEmpty++
        }
        const nextOpensFence =
          nextNonEmpty < lines.length && /^(\s{0,3})(`{3,}|~{3,})/.test(lines[nextNonEmpty])
        if (!nextOpensFence && nextNonEmpty < lines.length) {
          const segContent = lines.slice(segStartLine, i + 1).join('\n')
          segments.push({ content: segContent, startIndex: segStartChar })
          segStartLine = i + 1
          segStartChar = charPos + line.length + 1
        }
      }
    }

    charPos += line.length + 1
  }

  if (segStartLine < lines.length) {
    const segContent = lines.slice(segStartLine).join('\n')
    segments.push({ content: segContent, startIndex: segStartChar })
  }

  return segments.length > 0 ? segments : [{ content: '', startIndex: 0 }]
}

export interface MarkdownParser {
  id: string
  name: string
  preprocess: (content: string) => string
}

/**
 * Character position immediately after the last "safe" boundary in raw
 * (pre-preprocessing) content. Safe = no open code fence and no open
 * [FILE …]…[END] block, so the prefix can be preprocessed independently.
 */
function _findLastSafeBoundary(content: string): number {
  const lines = content.split('\n')
  let lastSafeEnd = 0
  let charPos = 0
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0
  let inFileBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (!inFence && !inFileBlock) {
      if (/^@@FILE .+$/.test(line) || /^@@REPLACE .+$/.test(line) || /^@@TASK\s+.+$/.test(line)) {
        inFileBlock = true
      } else {
        const m = /^(\s{0,3})(`{3,}|~{3,})/.exec(line)
        if (m) {
          inFence = true
          fenceChar = m[2][0]
          fenceLen = m[2].length
        }
      }
    } else if (inFileBlock) {
      if (/^@@END$/.test(line)) {
        inFileBlock = false
        lastSafeEnd = charPos + line.length + 1
      }
    } else {
      const closeRe =
        fenceChar === '`'
          ? new RegExp(`^\\s{0,3}\`{${fenceLen},}\\s*$`)
          : new RegExp(`^\\s{0,3}~{${fenceLen},}\\s*$`)
      if (closeRe.test(line)) {
        inFence = false
        lastSafeEnd = charPos + line.length + 1
      }
    }

    charPos += line.length + 1
  }

  return lastSafeEnd
}

let _incRawPrefix = ''
let _incRawPrefixLen = 0
let _incProcessedPrefix = ''
let _incLastFilePath = ''

export function resetPreprocessCache(): void {
  _incRawPrefix = ''
  _incRawPrefixLen = 0
  _incProcessedPrefix = ''
  _incLastFilePath = ''
}

export function preprocess(content: string): string {
  const normalized = content.indexOf('\r') === -1 ? content : normalizeLineEndings(content)

  // Fast path: content extends the cached prefix — only preprocess the suffix.
  // A single O(prefix) slice comparison confirms the prefix is intact.
  // This runs once per new-token batch, not per character, keeping the
  // amortised cost O(1) per token.
  if (
    _incRawPrefixLen > 0 &&
    normalized.length >= _incRawPrefixLen &&
    normalized.slice(0, _incRawPrefixLen) === _incRawPrefix
  ) {
    const suffix = normalized.slice(_incRawPrefixLen)
    if (!suffix) return _incProcessedPrefix
    return _incProcessedPrefix + preprocessImpl(suffix, _incLastFilePath).result
  }

  // Slow path: full preprocessing
  const { result } = preprocessImpl(normalized)

  // Cache at the last safe boundary so subsequent appends hit the fast path
  const safeEnd = _findLastSafeBoundary(normalized)
  if (safeEnd > 0 && safeEnd < normalized.length) {
    _incRawPrefix = normalized.slice(0, safeEnd)
    _incRawPrefixLen = safeEnd
    const prefixResult = preprocessImpl(_incRawPrefix)
    _incProcessedPrefix = prefixResult.result
    _incLastFilePath = prefixResult.lastFilePath
  } else {
    _incRawPrefix = ''
    _incRawPrefixLen = 0
    _incProcessedPrefix = ''
    _incLastFilePath = ''
  }

  return result
}

export const diffParser: MarkdownParser = {
  id: 'diff',
  name: 'Search/Replace',
  preprocess
}

const parsers = new Map<string, MarkdownParser>()
let activeParserId = 'diff'

parsers.set(diffParser.id, diffParser)

export function getActiveParser(): MarkdownParser {
  return parsers.get(activeParserId)!
}

export function setActiveParser(id: string): void {
  if (!parsers.has(id)) throw new Error(`Unknown parser: ${id}`)
  activeParserId = id
}

export function listParsers(): MarkdownParser[] {
  return Array.from(parsers.values())
}
