export type TokenKind = 'string' | 'comment' | 'identifier' | 'number' | 'symbol'

export interface Token {
  kind: TokenKind
  value: string
  start: number
  end: number
}

export interface Tokenized {
  tokens: Token[]
  precedingWs: string[]
}

export interface LooseMatch {
  start: number
  end: number
  /**
   * True when the same token sequence also matches elsewhere in the file.
   * Callers that apply an edit at `start`/`end` should treat this as a signal
   * to refuse rather than silently picking the first occurrence — the file's
   * real target may be a different one.
   */
  ambiguous: boolean
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

function isIdentStart(ch: string): boolean {
  return (
    (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$' || ch === '@'
  )
}

function isIdentCont(ch: string): boolean {
  return isIdentStart(ch) || (ch >= '0' && ch <= '9')
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

export function tokenize(source: string): Tokenized {
  const tokens: Token[] = []
  const precedingWs: string[] = []
  let pos = 0
  let lastEnd = 0
  const len = source.length

  function push(kind: TokenKind, value: string, start: number, end: number): void {
    tokens.push({ kind, value, start, end })
    precedingWs.push(source.slice(lastEnd, start))
    lastEnd = end
  }

  function skipWs(): void {
    while (pos < len && isWhitespace(source[pos])) pos++
  }

  function tokenizeString(): void {
    const quotePos = pos
    const quote = source[pos]
    pos++
    while (pos < len) {
      const c = source[pos]
      if (c === '\\' && pos + 1 < len) {
        pos += 2
      } else if (c === quote) {
        pos++
        break
      } else {
        pos++
      }
    }
    push('string', source.slice(quotePos, pos), quotePos, pos)
  }

  function tokenizeTemplateLiteral(): void {
    let chunkStart = pos
    pos++
    while (pos < len) {
      const c = source[pos]
      if (c === '\\' && pos + 1 < len) {
        pos += 2
      } else if (c === '`') {
        pos++
        push('string', source.slice(chunkStart, pos), chunkStart, pos)
        return
      } else if (c === '$' && pos + 1 < len && source[pos + 1] === '{') {
        const chunkEnd = pos + 2
        push('string', source.slice(chunkStart, chunkEnd), chunkStart, chunkEnd)
        pos = chunkEnd
        tokenizeRegion(true)
        if (pos < len && source[pos] === '}') {
          const closeStart = pos
          pos++
          push('symbol', '}', closeStart, pos)
        }
        chunkStart = pos
      } else {
        pos++
      }
    }
    if (pos > chunkStart) {
      push('string', source.slice(chunkStart, pos), chunkStart, pos)
    }
  }

  function tokenizeFString(prefixStart: number, isRaw: boolean): void {
    const quote = source[pos]
    let chunkStart = prefixStart
    pos++
    while (pos < len) {
      const c = source[pos]
      if (!isRaw && c === '\\' && pos + 1 < len) {
        pos += 2
      } else if (c === quote) {
        pos++
        push('string', source.slice(chunkStart, pos), chunkStart, pos)
        return
      } else if (c === '{' && !(pos + 1 < len && source[pos + 1] === '{')) {
        const chunkEnd = pos + 1
        push('string', source.slice(chunkStart, chunkEnd), chunkStart, chunkEnd)
        pos = chunkEnd
        tokenizeRegion(true)
        if (pos < len && source[pos] === '}') {
          const closeStart = pos
          pos++
          push('symbol', '}', closeStart, pos)
        }
        chunkStart = pos
      } else if (c === '{' && pos + 1 < len && source[pos + 1] === '{') {
        pos += 2
      } else if (c === '}' && pos + 1 < len && source[pos + 1] === '}') {
        pos += 2
      } else {
        pos++
      }
    }
    if (pos > chunkStart) {
      push('string', source.slice(chunkStart, pos), chunkStart, pos)
    }
  }

  function tokenizeRegion(stopAtCloseBrace: boolean): void {
    let braceDepth = 0
    while (pos < len) {
      skipWs()
      if (pos >= len) break
      const ch = source[pos]
      if (stopAtCloseBrace && ch === '}' && braceDepth === 0) break

      const start = pos

      if (ch === '"' || ch === "'") {
        tokenizeString()
      } else if (ch === '`') {
        tokenizeTemplateLiteral()
      } else if (ch === '/' && pos + 1 < len && source[pos + 1] === '/') {
        pos += 2
        while (pos < len && source[pos] !== '\n') pos++
        push('comment', source.slice(start, pos), start, pos)
      } else if (ch === '/' && pos + 1 < len && source[pos + 1] === '*') {
        pos += 2
        while (pos < len) {
          if (source[pos] === '*' && pos + 1 < len && source[pos + 1] === '/') {
            pos += 2
            break
          }
          pos++
        }
        push('comment', source.slice(start, pos), start, pos)
      } else if (isIdentStart(ch)) {
        pos++
        while (pos < len && isIdentCont(source[pos])) pos++
        const identValue = source.slice(start, pos)
        const lowerIdent = identValue.toLowerCase()
        if (
          (lowerIdent === 'f' || lowerIdent === 'rf' || lowerIdent === 'fr') &&
          pos < len &&
          (source[pos] === '"' || source[pos] === "'")
        ) {
          const isRaw = lowerIdent === 'rf' || lowerIdent === 'fr'
          tokenizeFString(start, isRaw)
        } else {
          push('identifier', identValue, start, pos)
        }
      } else if (isDigit(ch) || (ch === '.' && pos + 1 < len && isDigit(source[pos + 1]))) {
        while (pos < len && isDigit(source[pos])) pos++
        if (pos < len && source[pos] === '.') {
          pos++
          while (pos < len && isDigit(source[pos])) pos++
        }
        push('number', source.slice(start, pos), start, pos)
      } else if (ch === '{') {
        braceDepth++
        pos++
        push('symbol', '{', start, pos)
      } else if (ch === '}') {
        braceDepth--
        pos++
        push('symbol', '}', start, pos)
      } else {
        pos++
        push('symbol', ch, start, pos)
      }
    }
  }

  tokenizeRegion(false)

  return { tokens, precedingWs }
}

function requiresWhitespaceBetween(a: Token, b: Token): boolean {
  return (
    (a.kind === 'identifier' || a.kind === 'number') &&
    (b.kind === 'identifier' || b.kind === 'number')
  )
}

function matchesAt(file: Tokenized, old: Tokenized, offset: number): boolean {
  for (let j = 0; j < old.tokens.length; j++) {
    const ft = file.tokens[offset + j]
    const ot = old.tokens[j]

    if (ft.kind !== ot.kind) return false
    if (ft.value !== ot.value) return false

    if (j > 0) {
      const prevFt = file.tokens[offset + j - 1]
      const ws = file.precedingWs[offset + j]
      if (requiresWhitespaceBetween(prevFt, ft) && ws.length === 0) {
        return false
      }
    }
  }
  return true
}

export function findLooseMatch(fileContent: string, oldCode: string): LooseMatch | null {
  const file = tokenize(fileContent)
  const old = tokenize(oldCode)

  if (old.tokens.length === 0) return null
  if (old.tokens.length > file.tokens.length) return null

  let first: LooseMatch | null = null

  for (let i = 0; i <= file.tokens.length - old.tokens.length; i++) {
    if (matchesAt(file, old, i)) {
      if (!first) {
        first = {
          start: file.tokens[i].start,
          end: file.tokens[i + old.tokens.length - 1].end,
          ambiguous: false
        }
      } else {
        first.ambiguous = true
        break
      }
    }
  }

  return first
}
