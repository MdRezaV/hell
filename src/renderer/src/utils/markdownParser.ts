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
 *   <<<<<<< SEARCH
 *   (old code)
 *   =======
 *   (new code)
 *   >>>>>>> REPLACE
 *
 * The separator length must match the opening marker length so that
 * `=======` strings inside code (e.g. `Hello("=======")`) are treated as
 * content rather than separators.
 */
export function parseReplaceBlock(code: string): { oldCode: string; newCode: string } | null {
  const lines = code.split('\n')
  if (lines.length === 0) return null

  const searchOpen = /^(<+)\s+SEARCH\s*$/.exec(lines[0])
  if (!searchOpen) return null

  const markerLen = searchOpen[1].length
  const sepRe = new RegExp(`^={${markerLen}}\\s*$`)
  const closeRe = new RegExp(`^>{${markerLen}}\\s+REPLACE\\s*$`)

  let i = 1
  const searchLines: string[] = []
  while (i < lines.length && !sepRe.test(lines[i])) {
    searchLines.push(lines[i])
    i++
  }
  if (i >= lines.length) return null
  i++ // skip separator

  const replaceLines: string[] = []
  while (i < lines.length && !closeRe.test(lines[i])) {
    replaceLines.push(lines[i])
    i++
  }

  return { oldCode: searchLines.join('\n'), newCode: replaceLines.join('\n') }
}

const MARKER_RE = /^--- (FILE|EDIT|DELETE|MOVE) .+ ---$/
const COMMIT_RE = /^COMMIT: .+$/
const FILE_TERMINATOR_RE = /^=======\s*$/

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

/**
 * Preprocess the Search/Replace format into fenced markdown blocks that
 * the Markdown renderer understands:
 *
 *   --- FILE path ---        -> ```file:path
 *   (content)                   (content)
 *   =======                   ```
 *
 *   --- EDIT path ---       -> ```file-replace:path
 *   <<<<<<< SEARCH            <<<<<<< SEARCH
 *   (old)                     (old)
 *   =======                   =======
 *   (new)                     (new)
 *   >>>>>>> REPLACE           >>>>>>> REPLACE
 *                             ```
 *
 *   --- DELETE path ---     -> ```file-delete:path```
 *   --- MOVE a -> b ---     -> ```file-move:a->b```
 *   COMMIT: msg             -> ```commit\nmsg\n```
 */
export function preprocess(content: string): string {
  const lines = content.split('\n')
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

    // --- FILE path ---
    const fileMatch = /^--- FILE (.+) ---$/.exec(line)
    if (fileMatch) {
      const path = fileMatch[1].trim()
      i++
      const contentLines: string[] = []
      while (i < lines.length) {
        if (FILE_TERMINATOR_RE.test(lines[i])) {
          i++
          break
        }
        if (MARKER_RE.test(lines[i])) break
        if (COMMIT_RE.test(lines[i])) break
        contentLines.push(lines[i])
        i++
      }
      const code = contentLines.join('\n')
      const fenced = wrapInFence(code, `file:${path}`)
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      continue
    }

    // --- EDIT path ---
    const editMatch = /^--- EDIT (.+) ---$/.exec(line)
    if (editMatch) {
      const path = editMatch[1].trim()
      i++
      const pairs: Array<{ old: string; new: string }> = []

      while (i < lines.length) {
        if (MARKER_RE.test(lines[i])) break
        if (COMMIT_RE.test(lines[i])) break

        const searchOpen = /^(<+)\s+SEARCH\s*$/.exec(lines[i])
        if (searchOpen) {
          const markerLen = searchOpen[1].length
          const sepRe = new RegExp(`^={${markerLen}}\\s*$`)
          const closeRe = new RegExp(`^>{${markerLen}}\\s+REPLACE\\s*$`)
          i++
          const searchLines: string[] = []
          while (i < lines.length && !sepRe.test(lines[i])) {
            searchLines.push(lines[i])
            i++
          }
          if (i < lines.length) i++ // skip separator
          const replaceLines: string[] = []
          while (i < lines.length && !closeRe.test(lines[i])) {
            replaceLines.push(lines[i])
            i++
          }
          if (i < lines.length) i++ // skip close
          pairs.push({ old: searchLines.join('\n'), new: replaceLines.join('\n') })
        } else {
          if (lines[i].trim() !== '' && pairs.length > 0) break
          i++
        }
      }

      for (const pair of pairs) {
        const combined = `<<<<<<< SEARCH\n${pair.old}\n=======\n${pair.new}\n>>>>>>> REPLACE`
        const fenced = wrapInFence(combined, `file-replace:${path}`)
        result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      }
      continue
    }

    // --- DELETE path ---
    const deleteMatch = /^--- DELETE (.+) ---$/.exec(line)
    if (deleteMatch) {
      const path = deleteMatch[1].trim()
      const fenced = wrapInFence('', `file-delete:${path}`)
      result.push(fenced.replace(/^\n/, '').replace(/\n$/, ''))
      i++
      continue
    }

    // --- MOVE old -> new ---
    const moveMatch = /^--- MOVE (.+?) -> (.+) ---$/.exec(line)
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
