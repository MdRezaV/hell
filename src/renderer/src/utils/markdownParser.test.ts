import { beforeEach, describe, expect, it } from 'vitest'
import {
  getActiveParser,
  listParsers,
  normalizeLineEndings,
  parseReplaceBlock,
  preprocess,
  setActiveParser,
  wrapInFence
} from './markdownParser'

describe('wrapInFence', () => {
  it('uses triple backticks when code has none', () => {
    const out = wrapInFence('console.log(1)', 'js')
    expect(out).toBe('\n```js\nconsole.log(1)\n```\n')
  })

  it('uses tildes when code contains triple backticks', () => {
    const code = 'a ``` b'
    const out = wrapInFence(code, 'md')
    expect(out).toBe('\n~~~md\na ``` b\n~~~\n')
  })

  it('extends backtick fence when both ``` and ~~~ are in code', () => {
    const code = '``` and ~~~ both'
    const out = wrapInFence(code, 'x')
    expect(out).toContain('````x')
    expect(out).toContain('````\n')
  })

  it('handles empty code string', () => {
    const out = wrapInFence('', 'js')
    expect(out).toBe('\n```js\n\n```\n')
  })

  it('uses triple backticks when code has only single backticks', () => {
    const code = 'a `b` c'
    const out = wrapInFence(code, 'js')
    expect(out).toBe('\n```js\na `b` c\n```\n')
  })

  it('wraps with empty lang', () => {
    const out = wrapInFence('code', '')
    expect(out).toBe('\n```\ncode\n```\n')
  })

  it('extends backtick fence when code has long backticks and long tildes', () => {
    const code = '````` and ~~~~'
    const out = wrapInFence(code, 'x')
    expect(out).toContain('``````x')
    expect(out).toContain('``````\n')
  })
})

describe('parseReplaceBlock', () => {
  it('parses a standard SEARCH/REPLACE block', () => {
    const code = '[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: 'new' })
  })

  it('handles multi-line SEARCH and REPLACE', () => {
    const code = '[SEARCH]\na\nb\nc\n[REPLACE]\nx\ny\n[END]'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'a\nb\nc', newCode: 'x\ny' })
  })

  it('handles empty REPLACE (deletion)', () => {
    const code = '[SEARCH]\nold\n[REPLACE]\n[END]'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: '' })
  })

  it('handles empty SEARCH (insertion)', () => {
    const code = '[SEARCH]\n[REPLACE]\nnew\n[END]'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: '', newCode: 'new' })
  })

  it('treats [REPLACE] as content when not alone on line', () => {
    const code = '[SEARCH]\nconst x = "[REPLACE]"\n[REPLACE]\nconst x = "new"\n[END]'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'const x = "[REPLACE]"', newCode: 'const x = "new"' })
  })

  it('returns null when opening marker is missing', () => {
    expect(parseReplaceBlock('just text')).toBeNull()
  })

  it('returns null when separator is missing', () => {
    const code = '[SEARCH]\nold\n[END]'
    expect(parseReplaceBlock(code)).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(parseReplaceBlock('')).toBeNull()
  })

  it('treats [END] as content when not alone on line', () => {
    const code = '[SEARCH]\noriginal\n[REPLACE]\nconst y = "[END]"\nreplaced\n[END]'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'original', newCode: 'const y = "[END]"\nreplaced' })
  })
})

describe('preprocess — FILE blocks', () => {
  it('converts [FILE path] to a fenced file block', () => {
    const input = '[FILE a.ts]\nconst x = 1\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const x = 1')
  })

  it('treats [END] only on its own line as terminator', () => {
    const input = '[FILE a.ts]\nHello("[END]");\nconst y = 2\n[END]'
    const out = preprocess(input)
    expect(out).toContain('Hello("[END]");')
    expect(out).toContain('const y = 2')
  })

  it('does not terminate on [END] with leading text', () => {
    const input = '[FILE a.ts]\nfoo [END] bar\n[END]'
    const out = preprocess(input)
    expect(out).toContain('foo [END] bar')
  })

  it('does not terminate on [END] with trailing text', () => {
    const input = '[FILE a.ts]\n[END] trailing\n[END]'
    const out = preprocess(input)
    expect(out).toContain('[END] trailing')
  })

  it('terminates at next FILE marker when no [END] present', () => {
    const input = '[FILE a.ts]\ncodeA\n[FILE b.ts]\ncodeB\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('codeA')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('codeB')
  })

  it('terminates at next FILE marker with SEARCH content', () => {
    const input = '[FILE a.ts]\ncode\n[FILE b.ts]\n[SEARCH]\nx\n[REPLACE]\ny\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```file-replace:b.ts')
  })

  it('terminates at DELETE marker', () => {
    const input = '[FILE a.ts]\ncode\n[DELETE FILE b.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```file-delete:b.ts')
  })

  it('terminates at MOVE marker', () => {
    const input = '[FILE a.ts]\ncode\n[MOVE FILE FROM a.ts TO b.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('terminates at COMMIT line', () => {
    const input = '[FILE a.ts]\ncode\nCOMMIT: done'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```commit')
  })

  it('handles empty FILE content', () => {
    const input = '[FILE a.ts]\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })

  it('preserves blank lines in FILE content', () => {
    const input = '[FILE a.ts]\nconst x = 1\n\nconst y = 2\n[END]'
    const out = preprocess(input)
    expect(out).toContain('const x = 1\n\nconst y = 2')
  })

  it('handles FILE path with spaces', () => {
    const input = '[FILE my file.ts]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:my file.ts')
  })

  it('handles FILE path with special characters', () => {
    const input = '[FILE src/@types/index.d.ts]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:src/@types/index.d.ts')
  })

  it('uses tildes when FILE content contains triple backticks', () => {
    const input = '[FILE example.md]\n```js\nconst x = 1\n```\n[END]'
    const out = preprocess(input)
    expect(out).toMatch(/~~~file:example\.md/)
    expect(out).toContain('```js')
  })

  it('ignores FILE marker inside a code fence', () => {
    const input = '```\n[FILE a.ts]\ncode\n[END]\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('ignores FILE marker inside a tilde fence', () => {
    const input = '~~~\n[FILE a.ts]\ncode\n[END]\n~~~\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('recognizes FILE marker with leading whitespace', () => {
    const input = '  [FILE a.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
  })

  it('does not match FILE marker without closing bracket', () => {
    const input = '[FILE a.ts\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('preserves text before FILE block', () => {
    const input = 'Some description\n\n[FILE a.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('Some description')
    expect(out).toContain('```file:a.ts')
  })

  it('handles consecutive FILE blocks', () => {
    const input = '[FILE a.ts]\ncodeA\n[END]\n[FILE b.ts]\ncodeB\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('codeA')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('codeB')
  })
})

describe('preprocess — FILE blocks with SEARCH/REPLACE (edits)', () => {
  it('converts [FILE] with SEARCH/REPLACE to file-replace block', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('[SEARCH]')
    expect(out).toContain('old')
    expect(out).toContain('new')
    expect(out).toContain('[END]')
  })

  it('handles empty REPLACE (delete)', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nold code\n[REPLACE]\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old code')
  })

  it('handles empty SEARCH (insert)', () => {
    const input = '[FILE a.ts]\n[SEARCH]\n[REPLACE]\nnew code\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('new code')
  })

  it('handles multi-line SEARCH and REPLACE', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nline1\nline2\nline3\n[REPLACE]\nnew1\nnew2\n[END]'
    const out = preprocess(input)
    expect(out).toContain('line1\nline2\nline3')
    expect(out).toContain('new1\nnew2')
  })

  it('produces multiple file-replace blocks for multiple SEARCH/REPLACE pairs', () => {
    const input =
      '[FILE a.ts]\n[SEARCH]\nold1\n[REPLACE]\nnew1\n[SEARCH]\nold2\n[REPLACE]\nnew2\n[END]'
    const out = preprocess(input)
    const matches = out.match(/```file-replace:a\.ts/g)
    expect(matches?.length).toBe(2)
    expect(out).toContain('old1')
    expect(out).toContain('new1')
    expect(out).toContain('old2')
    expect(out).toContain('new2')
  })

  it('treats [REPLACE] inside code as content when not alone on line', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nHello("[REPLACE]");\n[REPLACE]\nHello("[END]");\n[END]'
    const out = preprocess(input)
    expect(out).toContain('Hello("[REPLACE]");')
    expect(out).toContain('Hello("[END]");')
  })

  it('treats [REPLACE] as content when it has surrounding text', () => {
    const input =
      '[FILE a.ts]\n[SEARCH]\nconst x = " [REPLACE] "\n[REPLACE]\nconst x = "new"\n[END]'
    const out = preprocess(input)
    expect(out).toContain('const x = " [REPLACE] "')
    expect(out).toContain('const x = "new"')
  })

  it('handles [SEARCH] inside content when not alone on line', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nconst x = "[SEARCH]"\n[REPLACE]\nconst x = "new"\n[END]'
    const out = preprocess(input)
    expect(out).toContain('const x = "[SEARCH]"')
    expect(out).toContain('const x = "new"')
  })

  it('edit FILE block ends at next FILE block', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]\n[FILE b.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file:b.ts')
  })

  it('consecutive edit FILE blocks', () => {
    const input =
      '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]\n[FILE b.ts]\n[SEARCH]\nx\n[REPLACE]\ny\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file-replace:b.ts')
  })

  it('edit FILE block followed by COMMIT line', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]\nCOMMIT: done'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```commit')
  })

  it('skips non-SEARCH text before the first SEARCH', () => {
    const input = '[FILE a.ts]\nSome description\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
  })

  it('trailing text after REPLACE is included in new content', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\nnew\nextra\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('new\nextra')
  })

  it('produces no file-replace when FILE has no SEARCH', () => {
    const input = '[FILE a.ts]\nJust a note\n[END]\n[FILE b.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```file:b.ts')
  })

  it('ignores FILE marker with SEARCH inside a code fence', () => {
    const input = '```\n[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('captures code fences inside SEARCH/REPLACE content', () => {
    const input = '[FILE a.md]\n[SEARCH]\n```js\nold\n```\n[REPLACE]\n```js\nnew\n```\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```js\nold\n```')
    expect(out).toContain('```js\nnew\n```')
  })

  it('handles FILE path with special characters', () => {
    const input = '[FILE src/components/App.tsx]\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:src/components/App.tsx')
  })
})

describe('preprocess — DELETE blocks', () => {
  it('converts [DELETE FILE path] to a file-delete block', () => {
    const input = '[DELETE FILE a.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
  })

  it('handles DELETE with path', () => {
    const input = '[DELETE FILE src/legacy/old.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:src/legacy/old.ts')
  })

  it('handles multiple DELETEs', () => {
    const input = '[DELETE FILE a.ts]\n[DELETE FILE b.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
    expect(out).toContain('```file-delete:b.ts')
  })

  it('ignores DELETE inside code fence', () => {
    const input = '```\n[DELETE FILE a.ts]\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('does not match DELETE without closing bracket', () => {
    const input = '[DELETE FILE a.ts'
    const out = preprocess(input)
    expect(out).not.toContain('```file-delete')
  })

  it('recognizes DELETE with leading whitespace', () => {
    const input = '  [DELETE FILE a.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
  })

  it('preserves surrounding text', () => {
    const input = 'before\n[DELETE FILE a.ts]\nafter'
    const out = preprocess(input)
    expect(out).toContain('before')
    expect(out).toContain('after')
    expect(out).toContain('```file-delete:a.ts')
  })
})

describe('preprocess — MOVE blocks', () => {
  it('converts [MOVE FILE FROM old TO new] to a file-move block', () => {
    const input = '[MOVE FILE FROM a.ts TO b.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('handles paths with directories', () => {
    const input = '[MOVE FILE FROM src/old/file.ts TO src/new/file.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-move:src/old/file.ts->src/new/file.ts')
  })

  it('handles multiple MOVEs', () => {
    const input = '[MOVE FILE FROM a.ts TO b.ts]\n[MOVE FILE FROM c.ts TO d.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
    expect(out).toContain('```file-move:c.ts->d.ts')
  })

  it('ignores MOVE inside code fence', () => {
    const input = '```\n[MOVE FILE FROM a.ts TO b.ts]\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('does not match MOVE without closing bracket', () => {
    const input = '[MOVE FILE FROM a.ts TO b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('```file-move')
  })

  it('does not match MOVE without TO keyword', () => {
    const input = '[MOVE FILE FROM a.ts b.ts]'
    const out = preprocess(input)
    expect(out).not.toContain('```file-move')
  })

  it('recognizes MOVE with leading whitespace', () => {
    const input = '  [MOVE FILE FROM a.ts TO b.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('preserves surrounding text', () => {
    const input = 'before\n[MOVE FILE FROM a.ts TO b.ts]\nafter'
    const out = preprocess(input)
    expect(out).toContain('before')
    expect(out).toContain('after')
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('terminates preceding FILE block', () => {
    const input = '[FILE a.ts]\ncode\n[MOVE FILE FROM a.ts TO b.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```file-move:a.ts->b.ts')
  })
})

describe('preprocess — COMMIT lines', () => {
  it('converts COMMIT: to a commit fenced block', () => {
    const input = 'COMMIT: fix: bug in parser'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('fix: bug in parser')
  })

  it('ignores COMMIT: inside a code fence', () => {
    const input = '```\nCOMMIT: ignored\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('does not match COMMIT: without a space after colon', () => {
    const input = 'COMMIT:no space'
    const out = preprocess(input)
    expect(out).not.toContain('```commit')
  })

  it('recognizes COMMIT: with leading whitespace', () => {
    const input = '  COMMIT: indented'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('indented')
  })

  it('handles multiple COMMIT lines', () => {
    const input = 'COMMIT: first\nSome text\nCOMMIT: second'
    const out = preprocess(input)
    const matches = out.match(/```commit/g)
    expect(matches?.length).toBe(2)
  })
})

describe('preprocess — mixed operations', () => {
  it('handles FILE, edit FILE, DELETE, MOVE, COMMIT together', () => {
    const input = [
      'Intro text',
      '',
      '[FILE new.ts]',
      'export const x = 1',
      '[END]',
      '[FILE existing.ts]',
      '[SEARCH]',
      'const old = true',
      '[REPLACE]',
      'const old = false',
      '[END]',
      '[DELETE FILE legacy.ts]',
      '[MOVE FILE FROM a.ts TO b.ts]',
      '',
      'COMMIT: Update files'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('Intro text')
    expect(out).toContain('```file:new.ts')
    expect(out).toContain('export const x = 1')
    expect(out).toContain('```file-replace:existing.ts')
    expect(out).toContain('```file-delete:legacy.ts')
    expect(out).toContain('```file-move:a.ts->b.ts')
    expect(out).toContain('```commit')
    expect(out).toContain('Update files')
  })

  it('preserves plain text with no markers', () => {
    const input = 'Just plain text\nNo markers here'
    expect(preprocess(input)).toBe(input)
  })

  it('preserves empty input', () => {
    expect(preprocess('')).toBe('')
  })

  it('does not process XML-style tags (no longer supported)', () => {
    const input = '<file path="a.ts">code</file>'
    expect(preprocess(input)).toBe(input)
  })

  it('handles FILE block followed by text and COMMIT', () => {
    const input = '[FILE a.ts]\ncode\n[END]\n\nSome text\nCOMMIT: done'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('Some text')
    expect(out).toContain('```commit')
  })

  it('handles edit FILE block followed by regular FILE block', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]\n\n[FILE b.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file:b.ts')
  })

  it('handles code fence between markers', () => {
    const input = '```js\nconst x = 1\n```\n[FILE a.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```js')
    expect(out).toContain('```file:a.ts')
  })

  it('handles [END] inside FILE content that has text around it', () => {
    const input = [
      '[FILE demo.ts]',
      'const banner = "[END]";',
      'const sep = " [END] ";',
      'console.log(banner, sep)',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('const banner = "[END]";')
    expect(out).toContain('const sep = " [END] ";')
    expect(out).toContain('console.log(banner, sep)')
  })
})

describe('parser registry', () => {
  beforeEach(() => {
    setActiveParser('diff')
  })

  it('defaults to the diff parser', () => {
    expect(getActiveParser().id).toBe('diff')
  })

  it('lists only the diff parser', () => {
    const all = listParsers()
    expect(all.length).toBe(1)
    expect(all[0].id).toBe('diff')
  })

  it('diff parser preprocesses bracket format', () => {
    const parser = getActiveParser()
    expect(parser.name).toBe('Search/Replace')
    const out = parser.preprocess('[FILE a.ts]\ncode\n[END]')
    expect(out).toContain('```file:a.ts')
  })

  it('can reset active parser to diff', () => {
    setActiveParser('diff')
    expect(getActiveParser().id).toBe('diff')
  })

  it('throws on unknown parser id', () => {
    expect(() => setActiveParser('unknown')).toThrow('Unknown parser: unknown')
  })

  it('throws when trying to select removed xml parser', () => {
    expect(() => setActiveParser('xml')).toThrow('Unknown parser: xml')
  })
})

describe('normalizeLineEndings', () => {
  it('converts \\r\\n to \\n', () => {
    expect(normalizeLineEndings('a\r\nb\r\nc')).toBe('a\nb\nc')
  })

  it('converts standalone \\r to \\n', () => {
    expect(normalizeLineEndings('a\rb\rc')).toBe('a\nb\nc')
  })

  it('leaves \\n unchanged', () => {
    expect(normalizeLineEndings('a\nb\nc')).toBe('a\nb\nc')
  })

  it('handles empty string', () => {
    expect(normalizeLineEndings('')).toBe('')
  })

  it('handles mixed line endings', () => {
    expect(normalizeLineEndings('a\r\nb\rc\nd')).toBe('a\nb\nc\nd')
  })
})

describe('preprocess — Windows line endings', () => {
  it('handles FILE block with \\r\\n', () => {
    const input = '[FILE a.ts]\r\nconst x = 1\r\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const x = 1')
  })

  it('handles edit FILE block with \\r\\n', () => {
    const input = '[FILE a.ts]\r\n[SEARCH]\r\nold\r\n[REPLACE]\r\nnew\r\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old')
    expect(out).toContain('new')
  })

  it('handles DELETE with \\r\\n', () => {
    const input = '[DELETE FILE a.ts]\r\n'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
  })

  it('handles MOVE with \\r\\n', () => {
    const input = '[MOVE FILE FROM a.ts TO b.ts]\r\n'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('handles COMMIT with \\r\\n', () => {
    const input = 'COMMIT: fix bug\r\n'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('fix bug')
  })
})

describe('parseReplaceBlock — Windows line endings', () => {
  it('parses SEARCH/REPLACE with \\r\\n', () => {
    const code = '[SEARCH]\r\nold\r\n[REPLACE]\r\nnew\r\n[END]'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: 'new' })
  })
})

describe('tag detection hardening', () => {
  describe('leading/trailing whitespace on tags', () => {
    it('recognizes [FILE] with leading spaces', () => {
      const input = '  [FILE a.ts]\nconst x = 1\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('const x = 1')
    })

    it('recognizes [FILE] with leading tabs', () => {
      const input = '\t\t[FILE a.ts]\nconst x = 1\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
    })

    it('recognizes [FILE] with trailing spaces', () => {
      const input = '[FILE a.ts]   \nconst x = 1\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
    })

    it('recognizes [FILE] with both leading and trailing spaces', () => {
      const input = '   [FILE a.ts]   \nconst x = 1\n   [END]   '
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('const x = 1')
    })

    it('recognizes [END] with leading spaces', () => {
      const input = '[FILE a.ts]\nconst x = 1\n   [END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('const x = 1')
    })

    it('recognizes [END] with trailing spaces', () => {
      const input = '[FILE a.ts]\nconst x = 1\n[END]   '
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
    })

    it('recognizes [SEARCH] with leading spaces', () => {
      const input = '[FILE a.ts]\n   [SEARCH]\nold\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old')
      expect(out).toContain('new')
    })

    it('recognizes [SEARCH] with trailing spaces', () => {
      const input = '[FILE a.ts]\n[SEARCH]   \nold\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
    })

    it('recognizes [SEARCH] with both leading and trailing spaces', () => {
      const input = '[FILE a.ts]\n   [SEARCH]   \nold\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
    })

    it('recognizes [REPLACE] with leading spaces', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold\n   [REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old')
      expect(out).toContain('new')
    })

    it('recognizes [REPLACE] with trailing spaces', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]   \nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
    })

    it('recognizes [DELETE FILE] with leading spaces', () => {
      const input = '   [DELETE FILE a.ts]'
      const out = preprocess(input)
      expect(out).toContain('```file-delete:a.ts')
    })

    it('recognizes [DELETE FILE] with trailing spaces', () => {
      const input = '[DELETE FILE a.ts]   '
      const out = preprocess(input)
      expect(out).toContain('```file-delete:a.ts')
    })

    it('recognizes [MOVE FILE] with leading spaces', () => {
      const input = '   [MOVE FILE FROM a.ts TO b.ts]'
      const out = preprocess(input)
      expect(out).toContain('```file-move:a.ts->b.ts')
    })

    it('recognizes [MOVE FILE] with trailing spaces', () => {
      const input = '[MOVE FILE FROM a.ts TO b.ts]   '
      const out = preprocess(input)
      expect(out).toContain('```file-move:a.ts->b.ts')
    })

    it('recognizes COMMIT: with leading spaces', () => {
      const input = '   COMMIT: fix bug'
      const out = preprocess(input)
      expect(out).toContain('```commit')
      expect(out).toContain('fix bug')
    })

    it('recognizes COMMIT: with trailing spaces', () => {
      const input = 'COMMIT: fix bug   '
      const out = preprocess(input)
      expect(out).toContain('```commit')
    })
  })

  describe('tags with surrounding text are treated as content', () => {
    it('ignores [SEARCH] with text before it', () => {
      const input = '[FILE a.ts]\nsome text [SEARCH]\nold\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('some text [SEARCH]')
      expect(out).not.toContain('file-replace')
    })

    it('ignores [SEARCH] with text after it', () => {
      const input = '[FILE a.ts]\n[SEARCH] some text\nold\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('[SEARCH] some text')
      expect(out).not.toContain('file-replace')
    })

    it('ignores [SEARCH] with text before and after', () => {
      const input = '[FILE a.ts]\nbefore [SEARCH] after\nold\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('before [SEARCH] after')
      expect(out).not.toContain('file-replace')
    })

    it('ignores [REPLACE] with text before it', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold\ntext [REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old\ntext [REPLACE]')
    })

    it('ignores [REPLACE] with text after it', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE] text\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old')
    })

    it('ignores [END] with text before it', () => {
      const input = '[FILE a.ts]\nconst x = 1\ntext [END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('const x = 1')
      expect(out).toContain('text [END]')
    })

    it('ignores [END] with text after it', () => {
      const input = '[FILE a.ts]\nconst x = 1\n[END] text'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('const x = 1')
      expect(out).toContain('[END] text')
    })

    it('ignores [FILE] with text before it', () => {
      const input = 'some text [FILE a.ts]\ncode\n[END]'
      const out = preprocess(input)
      expect(out).toContain('some text [FILE a.ts]')
      expect(out).not.toContain('```file:')
    })

    it('ignores [FILE] with text after it', () => {
      const input = '[FILE a.ts] extra\ncode\n[END]'
      const out = preprocess(input)
      expect(out).toContain('[FILE a.ts] extra')
      expect(out).not.toContain('```file:')
    })

    it('ignores [DELETE FILE] with text before it', () => {
      const input = 'text [DELETE FILE a.ts]'
      const out = preprocess(input)
      expect(out).toContain('text [DELETE FILE a.ts]')
      expect(out).not.toContain('file-delete')
    })

    it('ignores [DELETE FILE] with text after it', () => {
      const input = '[DELETE FILE a.ts] text'
      const out = preprocess(input)
      expect(out).toContain('[DELETE FILE a.ts] text')
      expect(out).not.toContain('file-delete')
    })

    it('ignores [MOVE FILE] with text before it', () => {
      const input = 'text [MOVE FILE FROM a.ts TO b.ts]'
      const out = preprocess(input)
      expect(out).toContain('text [MOVE FILE FROM a.ts TO b.ts]')
      expect(out).not.toContain('file-move')
    })

    it('ignores [MOVE FILE] with text after it', () => {
      const input = '[MOVE FILE FROM a.ts TO b.ts] text'
      const out = preprocess(input)
      expect(out).toContain('[MOVE FILE FROM a.ts TO b.ts] text')
      expect(out).not.toContain('file-move')
    })

    it('ignores COMMIT: with text before it', () => {
      const input = 'text COMMIT: fix bug'
      const out = preprocess(input)
      expect(out).toContain('text COMMIT: fix bug')
      expect(out).not.toContain('```commit')
    })

    it('ignores COMMIT: with text after it', () => {
      const input = 'COMMIT: fix bug extra'
      const out = preprocess(input)
      expect(out).toContain('```commit')
      expect(out).toContain('fix bug extra')
    })
  })

  describe('extra/duplicate tags', () => {
    it('treats second [SEARCH] as content when inside search section', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold\n[SEARCH]\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old\n[SEARCH]')
      expect(out).toContain('new')
    })

    it('treats second [SEARCH] as content when multiple appear consecutively', () => {
      const input = '[FILE a.ts]\n[SEARCH]\n[SEARCH]\n[SEARCH]\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('[SEARCH]\n[SEARCH]')
    })

    it('treats [REPLACE] inside search section as content', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold [REPLACE] here\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old [REPLACE] here')
    })

    it('treats [END] inside search section as content', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold [END] here\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old [END] here')
    })

    it('treats extra [REPLACE] inside replace section as content', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\nnew\n[REPLACE]\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('new\n[REPLACE]')
    })

    it('treats extra [END] inside replace section as content', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\nnew [END] here\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('new [END] here')
    })

    it('handles multiple valid SEARCH/REPLACE pairs with extras mixed in', () => {
      const input =
        '[FILE a.ts]\n[SEARCH]\nold1\n[REPLACE]\nnew1\n[SEARCH]\n[SEARCH]\nold2\n[REPLACE]\nnew2\n[END]'
      const out = preprocess(input)
      const matches = out.match(/```file-replace:a\.ts/g)
      expect(matches?.length).toBe(2)
      expect(out).toContain('[SEARCH]\nold2')
    })
  })

  describe('out-of-context tags', () => {
    it('treats [SEARCH] outside [FILE] block as regular text', () => {
      const input = '[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toBe(input)
      expect(out).not.toContain('file-replace')
    })

    it('treats [REPLACE] outside [FILE] block as regular text', () => {
      const input = 'some text\n[REPLACE]\nmore text'
      const out = preprocess(input)
      expect(out).toBe(input)
    })

    it('treats [END] outside [FILE] block as regular text', () => {
      const input = 'some text\n[END]\nmore text'
      const out = preprocess(input)
      expect(out).toBe(input)
    })

    it('treats standalone [SEARCH] as regular text', () => {
      const input = 'before\n[SEARCH]\nafter'
      const out = preprocess(input)
      expect(out).toBe(input)
    })

    it('treats standalone [END] as regular text', () => {
      const input = 'before\n[END]\nafter'
      const out = preprocess(input)
      expect(out).toBe(input)
    })

    it('handles [SEARCH] before any [FILE] block', () => {
      const input = '[SEARCH]\nignored\n[FILE a.ts]\ncode\n[END]'
      const out = preprocess(input)
      expect(out).toContain('[SEARCH]')
      expect(out).toContain('ignored')
      expect(out).toContain('```file:a.ts')
    })

    it('handles [END] after [FILE] block is closed', () => {
      const input = '[FILE a.ts]\ncode\n[END]\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('code')
      const endMatches = out.match(/\[END]/g)
      expect(endMatches?.length).toBe(1)
    })
  })

  describe('[FILE] inside content sections', () => {
    it('treats [FILE] inside search content as content (not a new block)', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold [FILE b.ts] here\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old [FILE b.ts] here')
    })

    it('treats [FILE] inside replace content as content', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\nnew [FILE b.ts] here\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('new [FILE b.ts] here')
    })

    it('terminates FILE content when [FILE] appears alone on a line', () => {
      const input = '[FILE a.ts]\ncodeA\n[FILE b.ts]\ncodeB\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('codeA')
      expect(out).toContain('```file:b.ts')
      expect(out).toContain('codeB')
    })

    it('treats [DELETE FILE] inside search content as content', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold [DELETE FILE b.ts]\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old [DELETE FILE b.ts]')
    })

    it('treats [MOVE FILE] inside search content as content', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold [MOVE FILE FROM x TO y]\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old [MOVE FILE FROM x TO y]')
    })
  })

  describe('case sensitivity', () => {
    it('does not match lowercase [search]', () => {
      const input = '[FILE a.ts]\n[search]\nold\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('[search]')
      expect(out).not.toContain('file-replace')
    })

    it('falls back to file block when only lowercase [replace] is present (no valid [REPLACE])', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold\n[replace]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('[SEARCH]')
      expect(out).toContain('[replace]')
      expect(out).not.toContain('file-replace')
    })

    it('does not match lowercase [end]', () => {
      const input = '[FILE a.ts]\ncode\n[end]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('code')
      expect(out).toContain('[end]')
    })

    it('does not match lowercase [file]', () => {
      const input = '[file a.ts]\ncode\n[END]'
      const out = preprocess(input)
      expect(out).toContain('[file a.ts]')
      expect(out).not.toContain('```file:')
    })

    it('does not match lowercase [delete file]', () => {
      const input = '[delete file a.ts]'
      const out = preprocess(input)
      expect(out).toContain('[delete file a.ts]')
      expect(out).not.toContain('file-delete')
    })

    it('does not match lowercase [move file]', () => {
      const input = '[move file from a.ts to b.ts]'
      const out = preprocess(input)
      expect(out).toContain('[move file from a.ts to b.ts]')
      expect(out).not.toContain('file-move')
    })

    it('does not match lowercase commit:', () => {
      const input = 'commit: fix bug'
      const out = preprocess(input)
      expect(out).toContain('commit: fix bug')
      expect(out).not.toContain('```commit')
    })

    it('does not match mixed case [Search]', () => {
      const input = '[FILE a.ts]\n[Search]\nold\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).not.toContain('file-replace')
    })
  })

  describe('incomplete/malformed tags', () => {
    it('does not match [FILE] without closing bracket', () => {
      const input = '[FILE a.ts\ncode\n[END]'
      const out = preprocess(input)
      expect(out).toContain('[FILE a.ts')
      expect(out).not.toContain('```file:')
    })

    it('does not match [FILE without path', () => {
      const input = '[FILE]\ncode\n[END]'
      const out = preprocess(input)
      expect(out).toContain('[FILE]')
      expect(out).not.toContain('```file:')
    })

    it('does not match [DELETE FILE] without closing bracket', () => {
      const input = '[DELETE FILE a.ts'
      const out = preprocess(input)
      expect(out).toContain('[DELETE FILE a.ts')
      expect(out).not.toContain('file-delete')
    })

    it('does not match [DELETE FILE] without path', () => {
      const input = '[DELETE FILE]'
      const out = preprocess(input)
      expect(out).toContain('[DELETE FILE]')
      expect(out).not.toContain('file-delete')
    })

    it('does not match [MOVE FILE] without TO keyword', () => {
      const input = '[MOVE FILE FROM a.ts b.ts]'
      const out = preprocess(input)
      expect(out).toContain('[MOVE FILE FROM a.ts b.ts]')
      expect(out).not.toContain('file-move')
    })

    it('does not match [MOVE FILE] without closing bracket', () => {
      const input = '[MOVE FILE FROM a.ts TO b.ts'
      const out = preprocess(input)
      expect(out).toContain('[MOVE FILE FROM a.ts TO b.ts')
      expect(out).not.toContain('file-move')
    })

    it('does not match [SEARCH without closing bracket', () => {
      const input = '[FILE a.ts]\n[SEARCH\nold\n[REPLACE]\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('[SEARCH')
      expect(out).not.toContain('file-replace')
    })

    it('does not match [REPLACE without closing bracket', () => {
      const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE\nnew\n[END]'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('[SEARCH]')
      expect(out).toContain('[REPLACE')
      expect(out).not.toContain('file-replace')
    })

    it('does not match [END without closing bracket', () => {
      const input = '[FILE a.ts]\ncode\n[END'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('[END')
    })

    it('does not match empty brackets []', () => {
      const input = '[]\ncode\n[]'
      const out = preprocess(input)
      expect(out).toBe(input)
    })

    it('does not match [FILE ] with only space', () => {
      const input = '[FILE ]\ncode\n[END]'
      const out = preprocess(input)
      expect(out).toContain('[FILE ]')
      expect(out).not.toContain('```file:')
    })
  })

  describe('tags inside code fences are never processed', () => {
    it('ignores all tags inside backtick fence', () => {
      const input = '```\n[FILE a.ts]\n[SEARCH]\n[REPLACE]\n[END]\n[DELETE FILE b.ts]\n```\n'
      const out = preprocess(input)
      expect(out).toBe(input)
    })

    it('ignores all tags inside tilde fence', () => {
      const input = '~~~\n[FILE a.ts]\n[SEARCH]\n[REPLACE]\n[END]\n[MOVE FILE FROM a TO b]\n~~~\n'
      const out = preprocess(input)
      expect(out).toBe(input)
    })

    it('ignores COMMIT inside code fence', () => {
      const input = '```\nCOMMIT: should be ignored\n```\n'
      const out = preprocess(input)
      expect(out).toBe(input)
    })
  })

  describe('parseReplaceBlock with whitespace-tolerant tags', () => {
    it('parses with leading spaces on all tags', () => {
      const code = '  [SEARCH]\nold\n  [REPLACE]\nnew\n  [END]'
      const result = parseReplaceBlock(code)
      expect(result).toEqual({ oldCode: 'old', newCode: 'new' })
    })

    it('parses with trailing spaces on all tags', () => {
      const code = '[SEARCH]   \nold\n[REPLACE]   \nnew\n[END]   '
      const result = parseReplaceBlock(code)
      expect(result).toEqual({ oldCode: 'old', newCode: 'new' })
    })

    it('parses with mixed whitespace on tags', () => {
      const code = '  [SEARCH]  \nold\n   [REPLACE]\nnew\n[END]   '
      const result = parseReplaceBlock(code)
      expect(result).toEqual({ oldCode: 'old', newCode: 'new' })
    })

    it('returns null when [SEARCH] has surrounding text', () => {
      const code = 'text [SEARCH]\nold\n[REPLACE]\nnew\n[END]'
      const result = parseReplaceBlock(code)
      expect(result).toBeNull()
    })

    it('returns null when [REPLACE] has surrounding text', () => {
      const code = '[SEARCH]\nold\n[REPLACE] text\nnew\n[END]'
      const result = parseReplaceBlock(code)
      expect(result).toBeNull()
    })

    it('returns null when [END] has surrounding text', () => {
      const code = '[SEARCH]\nold\n[REPLACE]\nnew\n[END] text'
      const result = parseReplaceBlock(code)
      expect(result).toEqual({ oldCode: 'old', newCode: 'new\n[END] text' })
    })
  })
})
