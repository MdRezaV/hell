export function normalizeLineEndings(text: string): string {
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
 */
export function parseReplaceBlock(code: string): { oldCode: string; newCode: string } | null {
  const lines = normalizeLineEndings(code).split('\n')
  if (lines.length === 0) return null

  let i = 0
  while (i < lines.length && !/^\[SEARCH\]\s*$/.test(lines[i])) {
    i++
  }
  if (i >= lines.length) return null
  i++

  const searchLines: string[] = []
  while (i < lines.length && !/^\[REPLACE\]\s*$/.test(lines[i])) {
    searchLines.push(lines[i])
    i++
  }
  if (i >= lines.length) return null
  i++

  const replaceLines: string[] = []
  while (i < lines.length && !/^\[END\]\s*$/.test(lines[i])) {
    replaceLines.push(lines[i])
    i++
  }

  return { oldCode: searchLines.join('\n'), newCode: replaceLines.join('\n') }
}

const BLOCK_MARKER_RE =
  /^\[FILE .+\]$|^\[DELETE FILE .+\]$|^\[MOVE FILE FROM .+ TO .+\]$|^COMMIT: .+$/
const FILE_END_RE = /^\[END\]\s*$/
const SEARCH_RE = /^\[SEARCH\]\s*$/
const REPLACE_RE = /^\[REPLACE\]\s*$/

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
      while (i < lines.length && !REPLACE_RE.test(lines[i])) {
        searchLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      const replaceLines: string[] = []
      while (i < lines.length && !FILE_END_RE.test(lines[i]) && !SEARCH_RE.test(lines[i])) {
        replaceLines.push(lines[i])
        i++
      }
      pairs.push({ old: searchLines.join('\n'), new: replaceLines.join('\n') })
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
 */
export function preprocess(content: string): string {
  const lines = normalizeLineEndings(content).split('\n')
  const result: string[] = []
  let i = 0
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0

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
    const fileMatch = /^\[FILE (.+)\]$/.exec(line)
    if (fileMatch) {
      const path = fileMatch[1].trim()
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
        for (const pair of pairs) {
          const combined = `[SEARCH]\n${pair.old}\n[REPLACE]\n${pair.new}\n[END]`
          const fenced = wrapInFence(combined, `file-replace:${path}`)
          result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
        }
      } else {
        const code = contentLines.join('\n')
        const fenced = wrapInFence(code, `file:${path}`)
        result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      }
      continue
    }

    // [DELETE FILE path]
    const deleteMatch = /^\[DELETE FILE (.+)\]$/.exec(line)
    if (deleteMatch) {
      const path = deleteMatch[1].trim()
      const fenced = wrapInFence('', `file-delete:${path}`)
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      i++
      continue
    }

    // [MOVE FILE FROM old TO new]
    const moveMatch = /^\[MOVE FILE FROM (.+?) TO (.+)\]$/.exec(line)
    if (moveMatch) {
      const oldPath = moveMatch[1].trim()
      const newPath = moveMatch[2].trim()
      const fenced = wrapInFence('', `file-move:${oldPath}->${newPath}`)
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      i++
      continue
    }

    // COMMIT: message
    const commitMatch = /^COMMIT: (.+)$/.exec(line)
    if (commitMatch) {
      const message = commitMatch[1]
      const fenced = wrapInFence(message, 'commit')
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      i++
      continue
    }

    result.push(line)
    i++
  }

  return result.join('\n')
}

export interface MarkdownParser {
  id: string
  name: string
  preprocess: (content: string) => string
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