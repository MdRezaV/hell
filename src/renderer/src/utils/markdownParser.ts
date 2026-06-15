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

  let fence: string
  if (maxBackticks < 3) fence = '```'
  else if (maxTildes < 3) fence = '~~~'
  else fence = '`'.repeat(maxBackticks + 1)

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

  let i = 0
  while (i < lines.length && !/^\s*\[SEARCH]\s*$/.test(lines[i])) {
    i++
  }
  if (i >= lines.length) return null
  i++

  const searchLines: string[] = []
  while (i < lines.length && !/^\s*\[REPLACE]\s*$/.test(lines[i])) {
    searchLines.push(lines[i])
    i++
  }
  if (i >= lines.length) return null
  i++

  const replaceLines: string[] = []
  while (i < lines.length && !/^\s*\[END]\s*$/.test(lines[i])) {
    replaceLines.push(lines[i])
    i++
  }

  return { oldCode: searchLines.join('\n'), newCode: replaceLines.join('\n') }
}

const BLOCK_MARKER_RE =
  /^\s*\[FILE .+]\s*$|^\s*\[DELETE FILE .+]\s*$|^\s*\[MOVE FILE FROM .+ TO .+]\s*$|^\s*\[TASK\s+[^\]]+]\s*$|^\s*COMMIT: .+\s*$/
const FILE_END_RE = /^\s*\[END]\s*$/
const SEARCH_RE = /^\s*\[SEARCH]\s*$/
const REPLACE_RE = /^\s*\[REPLACE]\s*$/
const INCLUDE_INLINE_RE = /\[INCLUDE\s+([^\]]+)]/g

function processIncludeInline(line: string): string {
  return line.replace(INCLUDE_INLINE_RE, (match, path) => {
    const trimmed = path.trim()
    if (!trimmed) return match
    return `\`file-include:${trimmed}\``
  })
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

    // [FILE path]
    const fileMatch = /^\s*\[FILE (.+)]\s*$/.exec(line)
    if (fileMatch) {
      const path = fileMatch[1].trim()
      lastFilePath = path
      i++
      const contentLines: string[] = []
      while (i < lines.length) {
        if (FILE_END_RE.test(lines[i])) {
          i++
          break
        }
        if (BLOCK_MARKER_RE.test(lines[i])) break
        contentLines.push(lines[i])
        i++
      }

      const hasSearch = contentLines.some((l) => SEARCH_RE.test(l))

      if (hasSearch) {
        const pairs = parseSearchReplacePairs(contentLines)
        if (pairs.length > 0) {
          for (const pair of pairs) {
            const combined = `[SEARCH]\n${pair.old}\n[REPLACE]\n${pair.new}\n[END]`
            const fenced = wrapInFence(combined, `file-replace:${path}`)
            result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
          }
        } else {
          const hasReplaceLiteral = contentLines.some((l) => l.includes('[REPLACE]'))
          if (hasReplaceLiteral) {
            const searchContent: string[] = []
            let j = 0
            while (j < contentLines.length && !SEARCH_RE.test(contentLines[j])) j++
            j++
            while (j < contentLines.length) {
              searchContent.push(contentLines[j])
              j++
            }
            const combined = `[SEARCH]\n${searchContent.join('\n')}\n[REPLACE]\n\n[END]`
            const fenced = wrapInFence(combined, `file-replace:${path}`)
            result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
          } else {
            const code = contentLines.join('\n')
            const fenced = wrapInFence(code, `file:${path}`)
            result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
          }
        }
      } else {
        const code = contentLines.join('\n')
        const fenced = wrapInFence(code, `file:${path}`)
        result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      }
      continue
    }

    // [DELETE FILE path]
    const deleteMatch = /^\s*\[DELETE FILE (.+)]\s*$/.exec(line)
    if (deleteMatch) {
      const path = deleteMatch[1].trim()
      const fenced = wrapInFence('', `file-delete:${path}`)
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      i++
      continue
    }

    // [MOVE FILE FROM old TO new]
    const moveMatch = /^\s*\[MOVE FILE FROM (.+?) TO (.+)]\s*$/.exec(line)
    if (moveMatch) {
      const oldPath = moveMatch[1].trim()
      const newPath = moveMatch[2].trim()
      const fenced = wrapInFence('', `file-move:${oldPath}->${newPath}`)
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      i++
      continue
    }

    // [TASK id]
    const taskMatch = /^\s*\[TASK\s+([^\]]+)]\s*$/.exec(line)
    if (taskMatch) {
      const taskId = taskMatch[1].trim()
      i++
      const contentLines: string[] = []
      while (i < lines.length) {
        if (FILE_END_RE.test(lines[i])) {
          i++
          break
        }
        if (BLOCK_MARKER_RE.test(lines[i])) break
        contentLines.push(lines[i])
        i++
      }
      const code = contentLines.join('\n')
      const fenced = wrapInFence(code, `task:${taskId}`)
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      continue
    }

    // COMMIT: message
    const commitMatch = /^\s*COMMIT: (.+)\s*$/.exec(line)
    if (commitMatch) {
      const message = commitMatch[1].trim()
      const fenced = wrapInFence(message, 'commit')
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      i++
      continue
    }

    // Orphan [SEARCH] outside any [FILE] block — reuse the most recent FILE path
    if (lastFilePath && SEARCH_RE.test(line)) {
      const startIdx = i
      const contentLines: string[] = [line]
      i++
      while (i < lines.length) {
        if (FILE_END_RE.test(lines[i])) {
          i++
          break
        }
        if (BLOCK_MARKER_RE.test(lines[i])) break
        contentLines.push(lines[i])
        i++
      }

      const pairs = parseSearchReplacePairs(contentLines)
      if (pairs.length > 0) {
        for (const pair of pairs) {
          const combined = `[SEARCH]\n${pair.old}\n[REPLACE]\n${pair.new}\n[END]`
          const fenced = wrapInFence(combined, `file-replace:${lastFilePath}`)
          result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
        }
      } else {
        for (let k = startIdx; k < i; k++) {
          result.push(processIncludeInline(lines[k]))
        }
      }
      continue
    }

    result.push(processIncludeInline(line))
    i++
  }

  return { result: result.join('\n'), lastFilePath }
}

/**
 * Split preprocessed markdown into segments at code-fence boundaries.
 * Each segment is rendered by an independent, memoized ReactMarkdown
 * instance so that during streaming only the last (active) segment
 * re-parses — eliminating the O(N²) cost of re-parsing the entire
 * accumulated document on every token.
 */
export function segmentContent(content: string): string[] {
  if (!content) return ['']

  const lines = content.split('\n')
  const segments: string[] = []
  let segStart = 0
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
        if (i < lines.length - 1) {
          segments.push(lines.slice(segStart, i + 1).join('\n'))
          segStart = i + 1
        }
      }
    }
  }

  if (segStart < lines.length) {
    segments.push(lines.slice(segStart).join('\n'))
  }

  return segments.length > 0 ? segments : ['']
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
  let inOrphanSearch = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (!inFence && !inFileBlock && !inOrphanSearch) {
      if (/^\s*\[FILE .+]\s*$/.test(line) || /^\s*\[TASK\s+[^\]]+]\s*$/.test(line)) {
        inFileBlock = true
      } else if (/^\s*\[SEARCH]\s*$/.test(line)) {
        inOrphanSearch = true
      } else {
        const m = /^(\s{0,3})(`{3,}|~{3,})/.exec(line)
        if (m) {
          inFence = true
          fenceChar = m[2][0]
          fenceLen = m[2].length
        }
      }
    } else if (inFileBlock || inOrphanSearch) {
      if (/^\s*\[END]\s*$/.test(line)) {
        inFileBlock = false
        inOrphanSearch = false
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
let _incProcessedPrefix = ''
let _incLastFilePath = ''

export function preprocess(content: string): string {
  const normalized = content.indexOf('\r') === -1 ? content : normalizeLineEndings(content)

  // Fast path: content extends the cached prefix — only preprocess the suffix.
  // During streaming this is the hot path and drops preprocessing from O(N) to
  // O(suffix_length) per token.
  if (_incRawPrefix.length > 0 && normalized.startsWith(_incRawPrefix)) {
    const suffix = normalized.slice(_incRawPrefix.length)
    if (!suffix) return _incProcessedPrefix
    return _incProcessedPrefix + preprocessImpl(suffix, _incLastFilePath).result
  }

  // Slow path: full preprocessing
  const { result } = preprocessImpl(normalized)

  // Cache at the last safe boundary so subsequent appends hit the fast path
  const safeEnd = _findLastSafeBoundary(normalized)
  if (safeEnd > 0 && safeEnd < normalized.length) {
    _incRawPrefix = normalized.slice(0, safeEnd)
    const prefixResult = preprocessImpl(_incRawPrefix)
    _incProcessedPrefix = prefixResult.result
    _incLastFilePath = prefixResult.lastFilePath
  } else {
    _incRawPrefix = ''
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
