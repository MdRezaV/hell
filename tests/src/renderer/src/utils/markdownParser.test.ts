import { beforeEach, describe, expect, it } from 'vitest'
import {
  getActiveParser,
  listParsers,
  normalizeLineEndings,
  parseReplaceBlock,
  preprocess,
  segmentContent,
  setActiveParser,
  wrapInFence
} from '../../../../../src/renderer/src/utils/markdownParser'

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

  it('handles code with only tildes (no backticks)', () => {
    const code = 'a ~~~ b'
    const out = wrapInFence(code, 'md')
    expect(out).toBe('\n```md\na ~~~ b\n```\n')
  })

  it('handles code with 4 backticks', () => {
    const code = '````'
    const out = wrapInFence(code, 'x')
    expect(out).toContain('`````x')
  })

  it('handles code with 4 tildes and 3 backticks', () => {
    const code = '~~~~ and ```'
    const out = wrapInFence(code, 'x')
    expect(out).toContain('`````x')
  })

  it('handles multiline code', () => {
    const code = 'line1\nline2\nline3'
    const out = wrapInFence(code, 'js')
    expect(out).toBe('\n```js\nline1\nline2\nline3\n```\n')
  })

  it('handles code with trailing newline', () => {
    const code = 'code\n'
    const out = wrapInFence(code, 'js')
    expect(out).toBe('\n```js\ncode\n\n```\n')
  })

  it('handles code with leading newline', () => {
    const code = '\ncode'
    const out = wrapInFence(code, 'js')
    expect(out).toBe('\n```js\n\ncode\n```\n')
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

  it('parses SEARCH/REPLACE with \\r\\n', () => {
    const code = '[SEARCH]\r\nold\r\n[REPLACE]\r\nnew\r\n[END]'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: 'new' })
  })

  it('handles SEARCH/REPLACE with content containing [SEARCH] on its own line in REPLACE', () => {
    const code = '[SEARCH]\nold\n[REPLACE]\n[SEARCH]\nnew\n[END]'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: '[SEARCH]\nnew' })
  })

  it('handles SEARCH/REPLACE with content containing [END] on its own line in SEARCH', () => {
    const code = '[SEARCH]\n[END]\nold\n[REPLACE]\nnew\n[END]'
    const result = parseReplaceBlock(code)
    expect(result).not.toBeNull()
  })

  it('handles very long single-line SEARCH content', () => {
    const longLine = 'x'.repeat(10000)
    const code = `[SEARCH]\n${longLine}\n[REPLACE]\nnew\n[END]`
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: longLine, newCode: 'new' })
  })

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
    const code = '  [SEARCH]   \nold\n  [REPLACE]   \nnew\n  [END]   '
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

  it('treats [END] with trailing text as content', () => {
    const code = '[SEARCH]\nold\n[REPLACE]\nnew\n[END] text'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: 'new\n[END] text' })
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

  it('handles FILE path with spaces (encodes as %20)', () => {
    const input = '[FILE my file.ts]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:my%20file.ts')
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

  it('recognizes FILE marker with leading tabs', () => {
    const input = '\t\t[FILE a.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })

  it('recognizes FILE marker with trailing spaces', () => {
    const input = '[FILE a.ts]   \ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })

  it('recognizes FILE marker with both leading and trailing spaces', () => {
    const input = '   [FILE a.ts]   \ncode\n[END]   '
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
  })

  it('does not match FILE marker without closing bracket', () => {
    const input = '[FILE a.ts\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('does not match [FILE] without path', () => {
    const input = '[FILE]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('[FILE]')
    expect(out).not.toContain('```file:')
  })

  it('does not match [FILE ] with only space', () => {
    const input = '[FILE ]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('[FILE ]')
    expect(out).not.toContain('```file:')
  })

  it('preserves text before FILE block', () => {
    const input = 'Some description\n[FILE a.ts]\ncode\n[END]'
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

  it('handles FILE block at very end of input without [END]', () => {
    const input = '[FILE a.ts]\npartial code'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('partial code')
  })

  it('handles FILE with tab-indented content', () => {
    const input = '[FILE a.ts]\n\tconst x = 1\n\tconst y = 2\n[END]'
    const out = preprocess(input)
    expect(out).toContain('\tconst x = 1')
    expect(out).toContain('\tconst y = 2')
  })

  it('handles FILE block with \\r\\n', () => {
    const input = '[FILE a.ts]\r\nconst x = 1\r\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const x = 1')
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

  it('handles edit FILE block with \\r\\n', () => {
    const input = '[FILE a.ts]\r\n[SEARCH]\r\nold\r\n[REPLACE]\r\nnew\r\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old')
    expect(out).toContain('new')
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

  it('does not match [DELETE FILE] without path', () => {
    const input = '[DELETE FILE]'
    const out = preprocess(input)
    expect(out).toContain('[DELETE FILE]')
    expect(out).not.toContain('file-delete')
  })

  it('recognizes DELETE with leading whitespace', () => {
    const input = '  [DELETE FILE a.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
  })

  it('recognizes DELETE with trailing whitespace', () => {
    const input = '[DELETE FILE a.ts]   '
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

  it('handles DELETE with \\r\\n', () => {
    const input = '[DELETE FILE a.ts]\r\n'
    const out = preprocess(input)
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

  it('recognizes MOVE with trailing whitespace', () => {
    const input = '[MOVE FILE FROM a.ts TO b.ts]   '
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

  it('handles MOVE with \\r\\n', () => {
    const input = '[MOVE FILE FROM a.ts TO b.ts]\r\n'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
  })
})

describe('preprocess — TASK blocks', () => {
  it('converts [TASK id] to a fenced task block', () => {
    const input = '[TASK task-1]\nDo something\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:task-1')
    expect(out).toContain('Do something')
  })

  it('handles TASK with multi-line content', () => {
    const input = '[TASK feature]\nline1\nline2\nline3\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:feature')
    expect(out).toContain('line1\nline2\nline3')
  })

  it('handles empty TASK content', () => {
    const input = '[TASK empty]\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:empty')
  })

  it('preserves blank lines in TASK content', () => {
    const input = '[TASK t]\nline1\n\nline2\n[END]'
    const out = preprocess(input)
    expect(out).toContain('line1\n\nline2')
  })

  it('handles TASK id with spaces', () => {
    const input = '[TASK my task]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:my%20task')
  })

  it('handles TASK id with special characters', () => {
    const input = '[TASK feat/auth-2]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:feat/auth-2')
  })

  it('handles TASK id with numeric values', () => {
    const input = '[TASK 123]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:123')
  })

  it('handles TASK id with dots', () => {
    const input = '[TASK v1.2.3]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:v1.2.3')
  })

  it('trims whitespace around TASK id', () => {
    const input = '[TASK    spaced   ]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:spaced')
  })

  it('terminates at [END]', () => {
    const input = '[TASK t]\ncontent\n[END]\nmore text'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('content')
    expect(out).toContain('more text')
  })

  it('terminates at next FILE marker', () => {
    const input = '[TASK t]\ncontent\n[FILE a.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('content')
    expect(out).toContain('```file:a.ts')
  })

  it('terminates at DELETE marker', () => {
    const input = '[TASK t]\ncontent\n[DELETE FILE a.ts]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('content')
    expect(out).toContain('```file-delete:a.ts')
  })

  it('terminates at MOVE marker', () => {
    const input = '[TASK t]\ncontent\n[MOVE FILE FROM a.ts TO b.ts]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('terminates at COMMIT line', () => {
    const input = '[TASK t]\ncontent\nCOMMIT: done'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('```commit')
  })

  it('terminates at next TASK marker', () => {
    const input = '[TASK a]\ncontentA\n[TASK b]\ncontentB\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:a')
    expect(out).toContain('contentA')
    expect(out).toContain('```task:b')
    expect(out).toContain('contentB')
  })

  it('handles consecutive TASK blocks', () => {
    const input = '[TASK a]\ncontentA\n[END]\n[TASK b]\ncontentB\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:a')
    expect(out).toContain('contentA')
    expect(out).toContain('```task:b')
    expect(out).toContain('contentB')
  })

  it('terminates preceding FILE block', () => {
    const input = '[FILE a.ts]\ncode\n[TASK t]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```task:t')
  })

  it('terminates orphan SEARCH block', () => {
    const input = [
      '[FILE a.ts]',
      'code',
      '[END]',
      '',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      '[TASK t]',
      'content',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```task:t')
  })

  it('ignores TASK inside backtick code fence', () => {
    const input = '```\n[TASK t]\ncontent\n[END]\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('ignores TASK inside tilde code fence', () => {
    const input = '~~~\n[TASK t]\ncontent\n[END]\n~~~\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('recognizes TASK with leading whitespace', () => {
    const input = '  [TASK t]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('content')
  })

  it('recognizes TASK with leading tabs', () => {
    const input = '\t\t[TASK t]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
  })

  it('recognizes TASK with trailing whitespace', () => {
    const input = '[TASK t]   \ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
  })

  it('recognizes [END] with leading whitespace to close TASK', () => {
    const input = '[TASK t]\ncontent\n  [END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('content')
  })

  it('does not match lowercase [task]', () => {
    const input = '[task t]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('[task t]')
    expect(out).not.toContain('```task:')
  })

  it('does not match mixed case [Task]', () => {
    const input = '[Task t]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('[Task t]')
    expect(out).not.toContain('```task:')
  })

  it('does not match [TASK] without id', () => {
    const input = '[TASK]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('[TASK]')
    expect(out).not.toContain('```task:')
  })

  it('does not match [TASK ] with only whitespace id', () => {
    const input = '[TASK ]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('[TASK ]')
    expect(out).not.toContain('```task:')
  })

  it('does not match [TASK without closing bracket', () => {
    const input = '[TASK t\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('[TASK t')
    expect(out).not.toContain('```task:')
  })

  it('ignores TASK with text before', () => {
    const input = 'text [TASK t]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('text [TASK t]')
    expect(out).not.toContain('```task:')
  })

  it('ignores TASK with text after', () => {
    const input = '[TASK t] extra\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('[TASK t] extra')
    expect(out).not.toContain('```task:')
  })

  it('treats [TASK] inside SEARCH content as content', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nold [TASK t] here\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old [TASK t] here')
    expect(out).not.toContain('```task:')
  })

  it('treats [TASK] inside REPLACE content as content', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\nnew [TASK t] here\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('new [TASK t] here')
    expect(out).not.toContain('```task:')
  })

  it('treats [TASK] inside FILE content as content when not alone on line', () => {
    const input = '[FILE a.ts]\nsome [TASK t] text\n[END]'
    const out = preprocess(input)
    expect(out).toContain('some [TASK t] text')
    expect(out).not.toContain('```task:')
  })

  it('treats [SEARCH] inside TASK as content (no special processing)', () => {
    const input = '[TASK t]\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('[SEARCH]')
    expect(out).toContain('old')
    expect(out).toContain('[REPLACE]')
    expect(out).toContain('new')
  })

  it('treats [FILE] inside TASK as content when not alone on line', () => {
    const input = '[TASK t]\nsee [FILE x.ts] here\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('see [FILE x.ts] here')
  })

  it('treats [INCLUDE] inside TASK as content', () => {
    const input = '[TASK t]\n[INCLUDE a.ts]\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('[INCLUDE a.ts]')
    expect(out).not.toContain('file-include')
  })

  it('orphan SEARCH after TASK does not use TASK id as path', () => {
    const input = [
      '[TASK t]',
      'content',
      '[END]',
      '',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).not.toContain('file-replace')
    expect(out).toContain('[SEARCH]')
  })

  it('uses tildes when TASK content contains triple backticks', () => {
    const input = '[TASK t]\n```js\nconst x = 1\n```\n[END]'
    const out = preprocess(input)
    expect(out).toMatch(/~~~task:t/)
    expect(out).toContain('```js')
  })

  it('handles TASK with Windows line endings', () => {
    const input = '[TASK t]\r\ncontent\r\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('content')
  })

  it('handles TASK followed by plain text', () => {
    const input = '[TASK t]\ncontent\n[END]\nSome explanation'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('Some explanation')
  })

  it('preserves text before TASK block', () => {
    const input = 'Some description\n[TASK t]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('Some description')
    expect(out).toContain('```task:t')
  })

  it('handles TASK mixed with other operations', () => {
    const input = [
      'Intro',
      '[TASK plan]',
      'Do the thing',
      '[END]',
      '[FILE a.ts]',
      'code',
      '[END]',
      '[DELETE FILE old.ts]',
      'COMMIT: done'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('Intro')
    expect(out).toContain('```task:plan')
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```file-delete:old.ts')
    expect(out).toContain('```commit')
  })

  it('handles TASK without [END] at EOF', () => {
    const input = '[TASK t]\npartial content'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('partial content')
  })

  it('handles TASK without [END] terminated by FILE marker', () => {
    const input = '[TASK t]\npartial\n[FILE a.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('partial')
    expect(out).toContain('```file:a.ts')
  })

  it('handles TASK with content containing markdown headers', () => {
    const input = '[TASK t]\n# Header\n## Subheader\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('# Header')
    expect(out).toContain('## Subheader')
  })

  it('handles TASK with content containing list items', () => {
    const input = '[TASK t]\n- item 1\n- item 2\n  - nested\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('- item 1')
    expect(out).toContain('  - nested')
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

  it('recognizes COMMIT: with trailing whitespace', () => {
    const input = 'COMMIT: fix bug   '
    const out = preprocess(input)
    expect(out).toContain('```commit')
  })

  it('handles multiple COMMIT lines', () => {
    const input = 'COMMIT: first\nSome text\nCOMMIT: second'
    const out = preprocess(input)
    const matches = out.match(/```commit/g)
    expect(matches?.length).toBe(2)
  })

  it('handles COMMIT with \\r\\n', () => {
    const input = 'COMMIT: fix bug\r\n'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('fix bug')
  })

  it('handles COMMIT with empty message after colon+space', () => {
    const input = 'COMMIT: '
    const out = preprocess(input)
    expect(out).toContain('```commit')
  })

  it('handles COMMIT with multiline-looking message (only first line)', () => {
    const input = 'COMMIT: fix bug\nmore text'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('fix bug')
    expect(out).toContain('more text')
  })

  it('handles COMMIT with special characters in message', () => {
    const input = 'COMMIT: feat: add [FILE] support & <tags>'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('feat: add [FILE] support & <tags>')
  })

  it('handles COMMIT with backticks in message', () => {
    const input = 'COMMIT: fix `parser` bug'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('fix `parser` bug')
  })

  it('handles COMMIT with colon in message', () => {
    const input = 'COMMIT: fix: nested: colons'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('fix: nested: colons')
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
    const input = '[FILE a.ts]\ncode\n[END]\nSome text\nCOMMIT: done'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('Some text')
    expect(out).toContain('```commit')
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

describe('preprocess — orphan SEARCH/REPLACE blocks', () => {
  it('uses last FILE path for orphan SEARCH after FILE block with SEARCH/REPLACE', () => {
    const input = [
      '[FILE a.ts]',
      '[SEARCH]',
      'old1',
      '[REPLACE]',
      'new1',
      '[END]',
      '',
      '[SEARCH]',
      'old2',
      '[REPLACE]',
      'new2',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    const matches = out.match(/```file-replace:a\.ts/g)
    expect(matches?.length).toBe(2)
    expect(out).toContain('old1')
    expect(out).toContain('new1')
    expect(out).toContain('old2')
    expect(out).toContain('new2')
  })

  it('uses last FILE path for orphan SEARCH after plain FILE block', () => {
    const input = [
      '[FILE a.ts]',
      'const x = 1',
      '[END]',
      '',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old')
    expect(out).toContain('new')
  })

  it('handles multiple consecutive orphan SEARCH blocks', () => {
    const input = [
      '[FILE a.ts]',
      'code',
      '[END]',
      '',
      '[SEARCH]',
      'old1',
      '[REPLACE]',
      'new1',
      '[END]',
      '',
      '[SEARCH]',
      'old2',
      '[REPLACE]',
      'new2',
      '[END]',
      '',
      '[SEARCH]',
      'old3',
      '[REPLACE]',
      'new3',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    const matches = out.match(/```file-replace:a\.ts/g)
    expect(matches?.length).toBe(3)
  })

  it('uses the most recent FILE path', () => {
    const input = [
      '[FILE a.ts]',
      'codeA',
      '[END]',
      '[FILE b.ts]',
      'codeB',
      '[END]',
      '',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:b.ts')
    expect(out).not.toContain('```file-replace:a.ts')
  })

  it('treats orphan SEARCH as regular text when no prior FILE block exists', () => {
    const input = '[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).toBe(input)
    expect(out).not.toContain('file-replace')
  })

  it('handles multiple SEARCH/REPLACE pairs in one orphan block', () => {
    const input = [
      '[FILE a.ts]',
      'code',
      '[END]',
      '',
      '[SEARCH]',
      'old1',
      '[REPLACE]',
      'new1',
      '[SEARCH]',
      'old2',
      '[REPLACE]',
      'new2',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    const matches = out.match(/```file-replace:a\.ts/g)
    expect(matches?.length).toBe(2)
    expect(out).toContain('old1')
    expect(out).toContain('new1')
    expect(out).toContain('old2')
    expect(out).toContain('new2')
  })

  it('handles orphan SEARCH without closing [END]', () => {
    const input = ['[FILE a.ts]', 'code', '[END]', '', '[SEARCH]', 'old', '[REPLACE]', 'new'].join(
      '\n'
    )
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old')
    expect(out).toContain('new')
  })

  it('falls back to regular text when orphan SEARCH has no REPLACE', () => {
    const input = ['[FILE a.ts]', 'code', '[END]', '', '[SEARCH]', 'just some text', '[END]'].join(
      '\n'
    )
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
    expect(out).toContain('[SEARCH]')
    expect(out).toContain('just some text')
  })

  it('stops orphan SEARCH at next FILE block', () => {
    const input = [
      '[FILE a.ts]',
      'code',
      '[END]',
      '',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      '[FILE b.ts]',
      'codeB',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('codeB')
  })

  it('stops orphan SEARCH at DELETE marker', () => {
    const input = [
      '[FILE a.ts]',
      'code',
      '[END]',
      '',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      '[DELETE FILE b.ts]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file-delete:b.ts')
  })

  it('stops orphan SEARCH at COMMIT line', () => {
    const input = [
      '[FILE a.ts]',
      'code',
      '[END]',
      '',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      'COMMIT: done'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```commit')
    expect(out).toContain('done')
  })

  it('does not process orphan SEARCH inside code fence', () => {
    const input = [
      '[FILE a.ts]',
      'code',
      '[END]',
      '',
      '```',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      '[END]',
      '```'
    ].join('\n')
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
    expect(out).toContain('[SEARCH]')
  })

  it('handles orphan SEARCH immediately after FILE [END] with no blank line', () => {
    const input = [
      '[FILE a.ts]',
      '[SEARCH]',
      'old1',
      '[REPLACE]',
      'new1',
      '[END]',
      '[SEARCH]',
      'old2',
      '[REPLACE]',
      'new2',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    const matches = out.match(/```file-replace:a\.ts/g)
    expect(matches?.length).toBe(2)
  })

  it('handles text between FILE block and orphan SEARCH', () => {
    const input = [
      '[FILE a.ts]',
      'code',
      '[END]',
      '',
      'Some explanation text here.',
      '',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('Some explanation text here.')
  })

  it('handles empty REPLACE in orphan SEARCH', () => {
    const input = [
      '[FILE a.ts]',
      'code',
      '[END]',
      '',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old')
  })

  it('handles empty SEARCH in orphan block', () => {
    const input = [
      '[FILE a.ts]',
      'code',
      '[END]',
      '',
      '[SEARCH]',
      '[REPLACE]',
      'new',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('new')
  })

  it('handles the LLM scenario with empty SEARCH/REPLACE content', () => {
    const input = [
      '[FILE path/to/file.ts]',
      '[SEARCH]',
      '',
      '[REPLACE]',
      '',
      '[END]',
      '',
      '[SEARCH]',
      '',
      '[REPLACE]',
      '',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    const matches = out.match(/```file-replace:path\/to\/file\.ts/g)
    expect(matches?.length).toBe(2)
  })

  it('handles orphan SEARCH correctly during incremental preprocessing (fast path)', () => {
    const prefix = '[FILE a.ts]\ncode\n[END]\ntrailing text'
    preprocess(prefix)
    const full = prefix + '\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
    const out = preprocess(full)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old')
    expect(out).toContain('new')
  })

  it('orphan SEARCH in suffix uses cached lastFilePath even with new FILE block later', () => {
    const prefix = '[FILE a.ts]\ncode\n[END]\ntrailing'
    preprocess(prefix)
    const full =
      prefix +
      '\n[SEARCH]\nold1\n[REPLACE]\nnew1\n[END]\n[FILE b.ts]\ncodeB\n[END]\n[SEARCH]\nold2\n[REPLACE]\nnew2\n[END]'
    const out = preprocess(full)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('```file-replace:b.ts')
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

describe('segmentContent', () => {
  it('returns single empty segment for empty input', () => {
    expect(segmentContent('')).toEqual([{ content: '', startIndex: 0 }])
  })

  it('returns single segment for plain text', () => {
    expect(segmentContent('hello world')).toEqual([{ content: 'hello world', startIndex: 0 }])
  })

  it('returns single segment for multi-line text with no fences', () => {
    const input = 'line1\nline2\nline3'
    expect(segmentContent(input)).toEqual([{ content: 'line1\nline2\nline3', startIndex: 0 }])
  })

  it('splits after a closed backtick fence', () => {
    const input = 'before\n```js\ncode\n```\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
    expect(segs[0].content).toContain('before')
    expect(segs[0].content).toContain('```js')
    expect(segs[0].content).toContain('code')
    expect(segs[1].content).toBe('after')
  })

  it('splits after a closed tilde fence', () => {
    const input = 'before\n~~~\ncode\n~~~\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
    expect(segs[0].content).toContain('~~~')
    expect(segs[1].content).toBe('after')
  })

  it('handles multiple fenced blocks', () => {
    const input = 'a\n```\ncode1\n```\nb\n```\ncode2\n```\nc'
    const segs = segmentContent(input)
    expect(segs.length).toBe(3)
    expect(segs[0].content).toContain('code1')
    expect(segs[1].content).toContain('code2')
    expect(segs[2].content).toBe('c')
  })

  it('handles fence at start of content', () => {
    const input = '```\ncode\n```\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
    expect(segs[0].content).toContain('code')
    expect(segs[1].content).toBe('after')
  })

  it('keeps fence at end in same segment (no trailing content)', () => {
    const input = 'before\n```\ncode\n```'
    const segs = segmentContent(input)
    expect(segs.length).toBe(1)
    expect(segs[0].content).toContain('before')
    expect(segs[0].content).toContain('code')
  })

  it('keeps unclosed fence in single segment (streaming)', () => {
    const input = 'before\n```\ncode still streaming'
    const segs = segmentContent(input)
    expect(segs.length).toBe(1)
    expect(segs[0].content).toContain('before')
    expect(segs[0].content).toContain('code still streaming')
  })

  it('handles fence with language identifier', () => {
    const input = 'text\n```typescript\nconst x = 1\n```\nmore'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
  })

  it('handles empty fenced block', () => {
    const input = 'before\n```\n```\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
  })

  it('handles nested backticks inside tilde fence', () => {
    const input = 'before\n~~~md\n```code```\n~~~\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
    expect(segs[0].content).toContain('```code```')
  })

  it('does not close backtick fence with tilde', () => {
    const input = '```\ncode\n~~~\nmore code\n```'
    const segs = segmentContent(input)
    expect(segs.length).toBe(1)
    expect(segs[0].content).toContain('~~~')
    expect(segs[0].content).toContain('more code')
  })

  it('requires closing fence to be at least as long as opening', () => {
    const input = '````\n```\n````\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
    expect(segs[1].content).toBe('after')
  })

  it('does not close longer fence with shorter fence', () => {
    const input = '````\ncode\n```\nmore\n````\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
    expect(segs[0].content).toContain('code')
    expect(segs[0].content).toContain('more')
    expect(segs[1].content).toBe('after')
  })

  it('handles fence with up to 3 spaces indent', () => {
    const input = 'before\n ```\ncode\n ```\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
  })

  it('treats fence with 4+ spaces indent as regular text', () => {
    const input = 'before\n    ```\ncode\n    ```\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(1)
  })

  it('handles consecutive fences', () => {
    const input = '```\na\n```\n```\nb\n```\nend'
    const segs = segmentContent(input)
    expect(segs.length).toBe(3)
  })

  it('preserves blank lines in segments', () => {
    const input = 'before\n\n```\ncode\n```\n\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
    expect(segs[0].content).toContain('before\n')
    expect(segs[1].content).toBe('\nafter')
  })

  it('handles content that is only a fence', () => {
    const input = '```\ncode\n```'
    const segs = segmentContent(input)
    expect(segs.length).toBe(1)
    expect(segs[0].content).toContain('code')
  })

  it('handles content with only opening fence (streaming)', () => {
    const input = '```'
    const segs = segmentContent(input)
    expect(segs.length).toBe(1)
  })

  it('handles content with fence language containing special chars', () => {
    const input = '```file:my%20file.ts\ncode\n```\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
    expect(segs[1].content).toBe('after')
  })

  it('handles content with very long fence (5+ backticks)', () => {
    const input = '`````\ncode\n`````\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
    expect(segs[1].content).toBe('after')
  })

  it('handles content with tilde fence of length 4', () => {
    const input = '~~~~\ncode\n~~~~\nafter'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
  })

  it('handles multiple unclosed fences (only first matters)', () => {
    const input = '```\ncode\n```\nmore\n```\nunclosed'
    const segs = segmentContent(input)
    expect(segs.length).toBe(2)
    expect(segs[1].content).toContain('unclosed')
  })
})

describe('preprocess — incremental preprocessing', () => {
  it('produces identical output for identical input across calls', () => {
    const input = '[FILE a.ts]\ncode\n[END]'
    const out1 = preprocess(input)
    const out2 = preprocess(input)
    expect(out1).toBe(out2)
  })

  it('fast path produces same result as fresh preprocess for appended content', () => {
    const prefix = '[FILE a.ts]\ncode\n[END]\ntrailing'
    const full = prefix + '\n[DELETE FILE b.ts]'
    const freshOut = preprocess(full)
    const cachedOut = preprocess(full)
    expect(cachedOut).toBe(freshOut)
  })

  it('handles appended content after a TASK block', () => {
    const prefix = '[TASK t]\ncontent\n[END]\n'
    preprocess(prefix)
    const full = prefix + '[FILE a.ts]\ncode\n[END]'
    const out = preprocess(full)
    expect(out).toContain('```task:t')
    expect(out).toContain('```file:a.ts')
  })

  it('handles appended content after a DELETE marker', () => {
    const prefix = '[DELETE FILE a.ts]\n'
    preprocess(prefix)
    const full = prefix + '[FILE b.ts]\ncode\n[END]'
    const out = preprocess(full)
    expect(out).toContain('```file-delete:a.ts')
    expect(out).toContain('```file:b.ts')
  })

  it('handles appended content after a MOVE marker', () => {
    const prefix = '[MOVE FILE FROM a.ts TO b.ts]\n'
    preprocess(prefix)
    const full = prefix + '[FILE c.ts]\ncode\n[END]'
    const out = preprocess(full)
    expect(out).toContain('```file-move:a.ts->b.ts')
    expect(out).toContain('```file:c.ts')
  })

  it('handles appended content after a COMMIT line', () => {
    const prefix = 'COMMIT: first\n'
    preprocess(prefix)
    const full = prefix + 'COMMIT: second'
    const out = preprocess(full)
    const matches = out.match(/```commit/g)
    expect(matches?.length).toBe(2)
  })

  it('slow path runs when content diverges from cached prefix', () => {
    preprocess('[FILE a.ts]\ncode\n[END]\ntrailing')
    const different = '[FILE b.ts]\nother\n[END]'
    const out = preprocess(different)
    expect(out).toContain('```file:b.ts')
    expect(out).not.toContain('```file:a.ts')
  })

  it('preserves lastFilePath across fast path boundary', () => {
    const prefix = '[FILE a.ts]\ncode\n[END]\ntrailing'
    preprocess(prefix)
    const full = prefix + '\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
    const out = preprocess(full)
    expect(out).toContain('```file-replace:a.ts')
  })

  it('handles single-token append to cached prefix', () => {
    const prefix = '[FILE a.ts]\ncode\n[END]\ntrailing'
    preprocess(prefix)
    const out = preprocess(prefix + 'x')
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('trailingx')
  })
})

describe('preprocess — tag detection hardening', () => {
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

    it('includes text after COMMIT: in message', () => {
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
  })
})

describe('preprocess — INCLUDE inline tags', () => {
  it('converts [INCLUDE path] to inline code marker', () => {
    const input = '[INCLUDE a.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a.ts`')
  })

  it('preserves text before and after [INCLUDE]', () => {
    const input = '1. [INCLUDE path/to/file.ext]. IGNORED TEXT'
    const out = preprocess(input)
    expect(out).toBe('1. `file-include:path/to/file.ext`. IGNORED TEXT')
  })

  it('handles [INCLUDE] at start of line with trailing text', () => {
    const input = '[INCLUDE a.ts] is needed'
    const out = preprocess(input)
    expect(out).toBe('`file-include:a.ts` is needed')
  })

  it('handles [INCLUDE] at end of line', () => {
    const input = 'See [INCLUDE a.ts]'
    const out = preprocess(input)
    expect(out).toBe('See `file-include:a.ts`')
  })

  it('handles multiple [INCLUDE] on the same line', () => {
    const input = '[INCLUDE a.ts] and [INCLUDE b.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a.ts`')
    expect(out).toContain('`file-include:b.ts`')
    expect(out).toBe('`file-include:a.ts` and `file-include:b.ts`')
  })

  it('trims whitespace in path', () => {
    const input = '[INCLUDE   a.ts  ]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a.ts`')
  })

  it('handles path with spaces', () => {
    const input = '[INCLUDE my file.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:my file.ts`')
  })

  it('handles path with special characters', () => {
    const input = '[INCLUDE src/@types/index.d.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:src/@types/index.d.ts`')
  })

  it('handles [INCLUDE] with leading whitespace on line', () => {
    const input = '  [INCLUDE a.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a.ts`')
    expect(out).toBe('  `file-include:a.ts`')
  })

  it('does not match [INCLUDE without closing bracket', () => {
    const input = '[INCLUDE a.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
    expect(out).toBe('[INCLUDE a.ts')
  })

  it('does not match lowercase [include]', () => {
    const input = '[include a.ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
    expect(out).toBe('[include a.ts]')
  })

  it('does not match mixed case [Include]', () => {
    const input = '[Include a.ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
    expect(out).toBe('[Include a.ts]')
  })

  it('does not match [INCLUDE] without path', () => {
    const input = '[INCLUDE]'
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
    expect(out).toBe('[INCLUDE]')
  })

  it('does not match [INCLUDE] with only whitespace path', () => {
    const input = '[INCLUDE   ]'
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
    expect(out).toBe('[INCLUDE   ]')
  })

  it('ignores [INCLUDE] inside FILE block content', () => {
    const input = '[FILE a.ts]\n[INCLUDE b.ts]\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
    expect(out).toContain('[INCLUDE b.ts]')
    expect(out).toContain('```file:a.ts')
  })

  it('ignores [INCLUDE] inside FILE block with surrounding text', () => {
    const input = '[FILE a.ts]\nsome [INCLUDE b.ts] text\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('`file-include:')
    expect(out).toContain('some [INCLUDE b.ts] text')
  })

  it('ignores [INCLUDE] inside SEARCH content', () => {
    const input = '[FILE a.ts]\n[SEARCH]\n[INCLUDE b.ts]\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('`file-include:')
    expect(out).toContain('[INCLUDE b.ts]')
    expect(out).toContain('```file-replace:a.ts')
  })

  it('ignores [INCLUDE] inside REPLACE content', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\n[INCLUDE b.ts]\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('`file-include:')
    expect(out).toContain('[INCLUDE b.ts]')
    expect(out).toContain('```file-replace:a.ts')
  })

  it('ignores [INCLUDE] inside backtick code fence', () => {
    const input = '```\n[INCLUDE a.ts]\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('ignores [INCLUDE] inside tilde code fence', () => {
    const input = '~~~\n[INCLUDE a.ts]\n~~~\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('ignores [INCLUDE] inside code fence with language', () => {
    const input = '```md\n[INCLUDE a.ts]\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('ignores [INCLUDE] inside orphan SEARCH block', () => {
    const input = [
      '[FILE a.ts]',
      'code',
      '[END]',
      '',
      '[SEARCH]',
      '[INCLUDE b.ts]',
      '[REPLACE]',
      'new',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).not.toContain('`file-include:')
  })

  it('processes [INCLUDE] in orphan SEARCH fallback when no REPLACE', () => {
    const input = ['[FILE a.ts]', 'code', '[END]', '', '[SEARCH]', '[INCLUDE b.ts]', '[END]'].join(
      '\n'
    )
    const out = preprocess(input)
    expect(out).toContain('`file-include:b.ts`')
  })

  it('processes [INCLUDE] on lines outside any block', () => {
    const input = 'Some text\n[INCLUDE a.ts]\nMore text'
    const out = preprocess(input)
    expect(out).toContain('Some text')
    expect(out).toContain('`file-include:a.ts`')
    expect(out).toContain('More text')
  })

  it('processes [INCLUDE] between FILE blocks', () => {
    const input = '[FILE a.ts]\ncode\n[END]\n[INCLUDE b.ts]\n[FILE c.ts]\ncode2\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('`file-include:b.ts`')
    expect(out).toContain('```file:c.ts')
  })

  it('processes [INCLUDE] after DELETE marker', () => {
    const input = '[DELETE FILE a.ts]\n[INCLUDE b.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
    expect(out).toContain('`file-include:b.ts`')
  })

  it('processes [INCLUDE] after MOVE marker', () => {
    const input = '[MOVE FILE FROM a.ts TO b.ts]\n[INCLUDE c.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
    expect(out).toContain('`file-include:c.ts`')
  })

  it('processes [INCLUDE] after COMMIT line', () => {
    const input = 'COMMIT: done\n[INCLUDE a.ts]'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('`file-include:a.ts`')
  })

  it('handles [INCLUDE] on same line as surrounding markdown', () => {
    const input = '- [INCLUDE a.ts] — required dependency'
    const out = preprocess(input)
    expect(out).toBe('- `file-include:a.ts` — required dependency')
  })

  it('does not process [INCLUDE] inside COMMIT message', () => {
    const input = 'COMMIT: add [INCLUDE a.ts] support'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('[INCLUDE a.ts]')
    expect(out).not.toContain('`file-include:')
  })

  it('handles multiple [INCLUDE] across multiple lines', () => {
    const input = '[INCLUDE a.ts]\n[INCLUDE b.ts]\n[INCLUDE c.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a.ts`')
    expect(out).toContain('`file-include:b.ts`')
    expect(out).toContain('`file-include:c.ts`')
  })
})

describe('preprocess — file names with brackets [ and ]', () => {
  it('does NOT match [FILE] when path contains [ (ambiguous delimiter)', () => {
    const input = '[FILE my[file].ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
    expect(out).toContain('[FILE my[file].ts]')
  })

  it('does NOT match [FILE] when path contains ] before the real closing bracket', () => {
    const input = '[FILE arr[0].ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
    expect(out).toContain('[FILE arr[0].ts]')
  })

  it('does NOT match [FILE] when path starts with [', () => {
    const input = '[FILE [test].ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('does NOT match [FILE] when path ends with ] before closing bracket', () => {
    const input = '[FILE file].ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('does NOT match [DELETE FILE] when path contains [', () => {
    const input = '[DELETE FILE my[0].ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-delete')
    expect(out).toContain('[DELETE FILE my[0].ts]')
  })

  it('does NOT match [DELETE FILE] when path contains ]', () => {
    const input = '[DELETE FILE arr[0].ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-delete')
  })

  it('does NOT match [MOVE FILE] when FROM path contains [', () => {
    const input = '[MOVE FILE FROM a[1].ts TO b.ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does NOT match [MOVE FILE] when TO path contains ]', () => {
    const input = '[MOVE FILE FROM a.ts TO b[2].ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('matches [INCLUDE] when path contains [', () => {
    const input = '[INCLUDE my[file].ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:my[file].ts`')
  })

  it('matches [INCLUDE] when path contains ]', () => {
    const input = '[INCLUDE arr[0].ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:arr[0].ts`')
  })

  it('does NOT match [TASK] when id contains [', () => {
    const input = '[TASK my[task]]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```task:')
  })

  it('does NOT match [TASK] when id contains ]', () => {
    const input = '[TASK task]1]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```task:')
  })

  it('handles [FILE] where content contains [ and ] (content is fine)', () => {
    const input = '[FILE a.ts]\nconst arr = [1, 2, 3]\nconst x = arr[0]\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const arr = [1, 2, 3]')
    expect(out).toContain('const x = arr[0]')
  })

  it('handles SEARCH/REPLACE content with brackets', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nconst x = arr[0]\n[REPLACE]\nconst x = arr[1]\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('const x = arr[0]')
    expect(out).toContain('const x = arr[1]')
  })

  it('handles [FILE] path with nested brackets that resolve to valid tag', () => {
    const input = '[FILE a.ts]\nconst map = { "[key]": 1 }\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const map = { "[key]": 1 }')
  })

  it('handles multiple [ in FILE content without breaking', () => {
    const input = '[FILE a.ts]\n[[[nested]]]\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('[[[nested]]]')
  })
})

describe('preprocess — file names with special/conflicting characters', () => {
  it('handles FILE path with # (URL fragment char)', () => {
    const input = '[FILE src/file#section.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:src/file#section.ts')
  })

  it('handles FILE path with ? (URL query char)', () => {
    const input = '[FILE file?v=2.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:file?v=2.ts')
  })

  it('handles FILE path with % (URL encoding conflict)', () => {
    const input = '[FILE 100%done.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:100%done.ts')
  })

  it('handles FILE path with backticks', () => {
    const input = '[FILE my`file`.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:my`file`.ts')
  })

  it('handles FILE path with tilde', () => {
    const input = '[FILE ~/home/file.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:~/home/file.ts')
  })

  it('handles FILE path with colon (Windows drive or fence info conflict)', () => {
    const input = '[FILE C:\\Users\\file.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('file:')
    expect(out).toContain('code')
  })

  it('handles FILE path with backslashes (Windows paths)', () => {
    const input = '[FILE src\\components\\App.tsx]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:src\\components\\App.tsx')
  })

  it('handles FILE path with -> (MOVE syntax conflict)', () => {
    const input = '[FILE a->b.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a->b.ts')
  })

  it('handles FILE path that looks like SEARCH keyword', () => {
    const input = '[FILE SEARCH.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:SEARCH.ts')
  })

  it('handles FILE path that looks like REPLACE keyword', () => {
    const input = '[FILE REPLACE.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:REPLACE.ts')
  })

  it('handles FILE path that looks like END keyword', () => {
    const input = '[FILE END.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:END.ts')
  })

  it('handles FILE path with unicode characters', () => {
    const input = '[FILE src/компонент/файл.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:src/компонент/файл.ts')
  })

  it('handles FILE path with emoji', () => {
    const input = '[FILE 🚀rocket.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:🚀rocket.ts')
  })

  it('handles FILE path with dots only', () => {
    const input = '[FILE ...]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:...')
  })

  it('handles FILE path with leading dot (hidden file)', () => {
    const input = '[FILE .env.local]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:.env.local')
  })

  it('handles FILE path with multiple consecutive dots', () => {
    const input = '[FILE file..name.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:file..name.ts')
  })

  it('handles FILE path with parentheses', () => {
    const input = '[FILE src/(group)/page.tsx]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:src/(group)/page.tsx')
  })

  it('handles FILE path with curly braces', () => {
    const input = '[FILE src/{id}/page.tsx]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:src/{id}/page.tsx')
  })

  it('handles FILE path with dollar sign', () => {
    const input = '[FILE src/$lib/utils.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:src/$lib/utils.ts')
  })

  it('handles FILE path with plus sign', () => {
    const input = '[FILE file+name.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:file+name.ts')
  })

  it('handles FILE path with equals sign', () => {
    const input = '[FILE key=value.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:key=value.ts')
  })

  it('handles FILE path with ampersand', () => {
    const input = '[FILE a&b.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a&b.ts')
  })

  it('handles FILE path with semicolon', () => {
    const input = '[FILE file;name.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:file;name.ts')
  })

  it('handles FILE path with comma', () => {
    const input = '[FILE file,name.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:file,name.ts')
  })

  it('handles FILE path with single quotes', () => {
    const input = "[FILE it's.ts]\ncode\n[END]"
    const out = preprocess(input)
    expect(out).toContain("```file:it's.ts")
  })

  it('handles FILE path with double quotes', () => {
    const input = '[FILE say"hello".ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:say"hello".ts')
  })

  it('handles FILE path with exclamation mark', () => {
    const input = '[FILE important!.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:important!.ts')
  })

  it('handles FILE path with pipe character', () => {
    const input = '[FILE a|b.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a|b.ts')
  })

  it('handles FILE path with asterisk (glob)', () => {
    const input = '[FILE *.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:*.ts')
  })

  it('handles very long FILE path', () => {
    const longPath = 'src/' + 'a'.repeat(200) + '/file.ts'
    const input = `[FILE ${longPath}]\ncode\n[END]`
    const out = preprocess(input)
    expect(out).toContain(`\`\`\`file:${longPath}`)
  })

  it('handles FILE path with trailing slash', () => {
    const input = '[FILE src/dir/]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:src/dir/')
  })

  it('handles FILE path with leading slash (absolute)', () => {
    const input = '[FILE /usr/local/file.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:/usr/local/file.ts')
  })

  it('handles FILE path with .. (parent directory)', () => {
    const input = '[FILE ../sibling/file.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:../sibling/file.ts')
  })
})

describe('preprocess — DELETE/MOVE/INCLUDE with special characters', () => {
  it('handles DELETE with path containing spaces', () => {
    const input = '[DELETE FILE my file.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:my%20file.ts')
  })

  it('handles DELETE with path containing unicode', () => {
    const input = '[DELETE FILE src/файл.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:src/файл.ts')
  })

  it('handles MOVE with paths containing spaces', () => {
    const input = '[MOVE FILE FROM my file.ts TO new file.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-move:my%20file.ts->new%20file.ts')
  })

  it('handles MOVE with paths containing unicode', () => {
    const input = '[MOVE FILE FROM src/старый.ts TO src/новый.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-move:src/старый.ts->src/новый.ts')
  })

  it('handles INCLUDE with path containing #', () => {
    const input = '[INCLUDE file#section.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:file#section.ts`')
  })

  it('handles INCLUDE with path containing backticks', () => {
    const input = '[INCLUDE my`file`.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:my`file`.ts`')
  })

  it('handles DELETE with path containing -> (MOVE conflict)', () => {
    const input = '[DELETE FILE a->b.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a->b.ts')
  })

  it('handles MOVE where FROM path contains TO as substring', () => {
    const input = '[MOVE FILE FROM TOKEN.ts TO token2.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-move:TOKEN.ts->token2.ts')
  })
})

describe('preprocess — edge cases with SEARCH/REPLACE content', () => {
  it('handles SEARCH content that is only whitespace', () => {
    const input = '[FILE a.ts]\n[SEARCH]\n \n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
  })

  it('handles REPLACE content that is only whitespace', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\n \n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
  })

  it('handles SEARCH/REPLACE with content containing COMMIT: on its own line', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nCOMMIT: fake\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('COMMIT: fake')
    expect(out).not.toContain('```commit')
  })

  it('handles SEARCH content with trailing whitespace on lines', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nold   \nline2\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old   ')
  })

  it('handles REPLACE content with leading whitespace on lines', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nold\n[REPLACE]\n   new\nline2\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('   new')
  })

  it('handles SEARCH/REPLACE where old and new are identical', () => {
    const input = '[FILE a.ts]\n[SEARCH]\nsame\n[REPLACE]\nsame\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
  })

  it('handles very large SEARCH/REPLACE content', () => {
    const bigContent = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
    const input = `[FILE a.ts]\n[SEARCH]\n${bigContent}\n[REPLACE]\n${bigContent}\n[END]`
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('line 0')
    expect(out).toContain('line 99')
  })
})

describe('preprocess — edge cases with code fences in content', () => {
  it('handles FILE content with unclosed code fence', () => {
    const input = '[FILE a.md]\n```js\nconst x = 1\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.md')
    expect(out).toContain('```js')
    expect(out).toContain('const x = 1')
  })

  it('handles FILE content with 4-backtick fence', () => {
    const input = '[FILE a.md]\n````\ncode\n````\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.md')
    expect(out).toContain('````')
  })

  it('handles FILE content with mixed fence lengths', () => {
    const input = '[FILE a.md]\n```\na\n```\n````\nb\n````\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.md')
  })

  it('handles SEARCH/REPLACE with tilde fences in content', () => {
    const input = '[FILE a.md]\n[SEARCH]\n~~~\nold\n~~~\n[REPLACE]\n~~~\nnew\n~~~\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.md')
    expect(out).toContain('~~~\nold\n~~~')
    expect(out).toContain('~~~\nnew\n~~~')
  })

  it('handles FILE content that is entirely a code fence', () => {
    const input = '[FILE a.md]\n```\njust code\n```\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.md')
    expect(out).toContain('just code')
  })
})

describe('preprocess — edge cases with mixed line endings and whitespace', () => {
  it('handles mixed \\r\\n and \\n in same input', () => {
    const input = '[FILE a.ts]\r\nline1\nline2\r\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('line1')
    expect(out).toContain('line2')
  })

  it('handles \\r only line endings (old Mac)', () => {
    const input = '[FILE a.ts]\rline1\rline2\r[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })

  it('handles BOM at start of input', () => {
    const input = '\uFEFF[FILE a.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('code')
  })

  it('handles null bytes in content', () => {
    const input = '[FILE a.ts]\ncode\x00more\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })
})

describe('preprocess — edge cases with multiple operations interleaved', () => {
  it('handles FILE, TASK, FILE, DELETE, MOVE, COMMIT in sequence', () => {
    const input = [
      '[FILE a.ts]',
      'codeA',
      '[END]',
      '[TASK plan]',
      'do stuff',
      '[END]',
      '[FILE b.ts]',
      'codeB',
      '[END]',
      '[DELETE FILE old.ts]',
      '[MOVE FILE FROM x.ts TO y.ts]',
      'COMMIT: all done'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```task:plan')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('```file-delete:old.ts')
    expect(out).toContain('```file-move:x.ts->y.ts')
    expect(out).toContain('```commit')
  })

  it('handles orphan SEARCH between FILE blocks', () => {
    const input = [
      '[FILE a.ts]',
      'code',
      '[END]',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      '[END]',
      '[FILE b.ts]',
      'code2',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file:b.ts')
  })

  it('handles TASK immediately followed by FILE without blank line', () => {
    const input = '[TASK t]\ncontent\n[END]\n[FILE a.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```task:t')
    expect(out).toContain('```file:a.ts')
  })

  it('handles DELETE immediately followed by MOVE without blank line', () => {
    const input = '[DELETE FILE a.ts]\n[MOVE FILE FROM b.ts TO c.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
    expect(out).toContain('```file-move:b.ts->c.ts')
  })

  it('handles text, FILE, text, FILE, text pattern', () => {
    const input = 'intro\n[FILE a.ts]\ncode1\n[END]\nmiddle\n[FILE b.ts]\ncode2\n[END]\noutro'
    const out = preprocess(input)
    expect(out).toContain('intro')
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('middle')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('outro')
  })
})

describe('preprocess — edge cases with fence-like content in markers', () => {
  it('handles FILE content that starts with ```', () => {
    const input = '[FILE a.ts]\n```not a fence\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```not a fence')
  })

  it('handles FILE content that starts with ~~~', () => {
    const input = '[FILE a.ts]\n~~~not a fence\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('~~~not a fence')
  })

  it('handles FILE content with ``` on its own line mid-content', () => {
    const input = '[FILE a.ts]\nline1\n```\nline3\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('line1')
    expect(out).toContain('line3')
  })

  it('uses tildes for FILE block when content has both ``` and ~~~', () => {
    const input = '[FILE a.md]\n```\ncode\n```\n~~~\nmore\n~~~\n[END]'
    const out = preprocess(input)
    expect(out).toContain('file:a.md')
    expect(out).toContain('```')
    expect(out).toContain('~~~')
  })
})

describe('preprocess — regression: FILE path encoding edge cases', () => {
  it('encodes multiple spaces in FILE path', () => {
    const input = '[FILE my  file  name.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('my%20%20file%20%20name.ts')
  })

  it('does not double-encode already-encoded paths', () => {
    const input = '[FILE my%20file.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('%2520')
  })

  it('handles FILE path with tab character', () => {
    const input = '[FILE my\tfile.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('file:')
    expect(out).toContain('code')
  })
})

describe('preprocess — edge cases: markers at boundaries', () => {
  it('handles FILE marker as very first characters of input', () => {
    const input = '[FILE a.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })

  it('handles FILE marker as very last characters of input', () => {
    const input = 'text\n[FILE a.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })

  it('handles DELETE as entire input', () => {
    const input = '[DELETE FILE a.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
  })

  it('handles MOVE as entire input', () => {
    const input = '[MOVE FILE FROM a.ts TO b.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('handles COMMIT as entire input', () => {
    const input = 'COMMIT: done'
    const out = preprocess(input)
    expect(out).toContain('```commit')
  })

  it('handles INCLUDE as entire input', () => {
    const input = '[INCLUDE a.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a.ts`')
  })

  it('handles single newline as input', () => {
    expect(preprocess('\n')).toBe('\n')
  })

  it('handles only whitespace as input', () => {
    expect(preprocess('   \n  ')).toBe('   \n  ')
  })
})

describe('preprocess — edge cases: SEARCH/REPLACE with FILE-like paths', () => {
  it('handles edit FILE with path containing spaces', () => {
    const input = '[FILE my file.ts]\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:my%20file.ts')
  })

  it('handles edit FILE with path containing @', () => {
    const input = '[FILE @scope/package.ts]\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:@scope/package.ts')
  })

  it('handles edit FILE with path containing dots', () => {
    const input = '[FILE file.test.spec.ts]\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:file.test.spec.ts')
  })

  it('handles orphan SEARCH after FILE with special path', () => {
    const input = [
      '[FILE src/@types/index.d.ts]',
      'code',
      '[END]',
      '',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:src/@types/index.d.ts')
  })
})

describe('preprocess — edge cases: nested/recursive-looking structures', () => {
  it('handles FILE content that looks like a complete FILE block', () => {
    const input = '[FILE outer.ts]\n[FILE inner.ts]\ninner code\n[END]\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:outer.ts')
    expect(out).toContain('```file:inner.ts')
  })

  it('handles FILE content with [SEARCH]/[REPLACE] that are NOT alone on line', () => {
    const input = '[FILE a.ts]\nconst x = "[SEARCH]"\nconst y = "[REPLACE]"\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const x = "[SEARCH]"')
    expect(out).toContain('const y = "[REPLACE]"')
    expect(out).not.toContain('file-replace')
  })

  it('handles FILE content with all marker keywords on one line', () => {
    const input = '[FILE a.ts]\n[SEARCH] [REPLACE] [END] [FILE b.ts] [DELETE FILE c.ts]\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('[SEARCH] [REPLACE] [END] [FILE b.ts] [DELETE FILE c.ts]')
  })
})

describe('preprocess — ] in file names: INCLUDE matches last ] as closing bracket', () => {
  it('matches [INCLUDE] when ] is the first char of path', () => {
    const input = '[INCLUDE ]file.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:]file.ts`')
  })

  it('matches [INCLUDE] when ] is the last char before closing bracket', () => {
    const input = '[INCLUDE file]]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:file]`')
  })

  it('matches [INCLUDE] with multiple ] in path', () => {
    const input = '[INCLUDE a]b]c.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a]b]c.ts`')
  })

  it('matches [INCLUDE] with ] followed by extension', () => {
    const input = '[INCLUDE component].tsx]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:component].tsx`')
  })

  it('matches [INCLUDE] with array-index-style ] in path', () => {
    const input = '[INCLUDE items[0].ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:items[0].ts`')
  })

  it('matches [INCLUDE] when path is only ]', () => {
    const input = '[INCLUDE ]]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:]`')
  })

  it('matches [INCLUDE] with ] and surrounding text', () => {
    const input = 'See [INCLUDE arr].ts] for details'
    const out = preprocess(input)
    expect(out).toContain('`file-include:arr].ts`')
    expect(out).toContain('for details')
  })

  it('matches [INCLUDE] with ] in directory portion', () => {
    const input = '[INCLUDE src/[id]/page.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:src/[id]/page.ts`')
  })

  it('matches [INCLUDE] with ] in filename and [ in directory', () => {
    const input = '[INCLUDE [scope]/file].ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:[scope]/file].ts`')
  })

  it('matches both [INCLUDE] tags when first has ] in path on same line', () => {
    const input = '[INCLUDE bad].ts] and [INCLUDE good.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:bad].ts`')
    expect(out).toContain('`file-include:good.ts`')
  })

  it('matches [INCLUDE] with ] immediately after INCLUDE keyword', () => {
    const input = '[INCLUDE ]path.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:]path.ts`')
  })

  it('matches [INCLUDE] with consecutive ]] in path', () => {
    const input = '[INCLUDE file]].ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:file]].ts`')
  })

  it('matches [INCLUDE] with ] at multiple positions', () => {
    const input = '[INCLUDE a]b]c]d.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a]b]c]d.ts`')
  })
})

describe('preprocess — ] in file names: FILE does not match last ]', () => {
  it('does NOT match [FILE] when path has ] before real closing bracket', () => {
    const input = '[FILE component].tsx]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
    expect(out).toContain('[FILE component].tsx]')
  })

  it('does NOT match [FILE] when ] is last char before closing bracket', () => {
    const input = '[FILE file]]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('does NOT match [FILE] with ] in directory segment', () => {
    const input = '[FILE src/[slug]/page.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('does NOT match [FILE] with multiple ] in path', () => {
    const input = '[FILE a]b]c.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('does NOT match [FILE] when path is just ]', () => {
    const input = '[FILE ]]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('does NOT match [FILE] with ] followed by dot extension', () => {
    const input = '[FILE arr].ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('still processes FILE content with ] inside the body', () => {
    const input = '[FILE valid.ts]\nconst x = arr]\nconst y = obj["key]"]\n[END]'
    const out = preprocess(input)
    expect(out).toContain('```file:valid.ts')
    expect(out).toContain('const x = arr]')
    expect(out).toContain('const y = obj["key]"]')
  })
})

describe('preprocess — ] in file names: DELETE does not match last ]', () => {
  it('does NOT match [DELETE FILE] when path has ] before closing bracket', () => {
    const input = '[DELETE FILE component].tsx]'
    const out = preprocess(input)
    expect(out).not.toContain('file-delete')
    expect(out).toContain('[DELETE FILE component].tsx]')
  })

  it('does NOT match [DELETE FILE] when ] is last char before closing bracket', () => {
    const input = '[DELETE FILE file]]'
    const out = preprocess(input)
    expect(out).not.toContain('file-delete')
  })

  it('does NOT match [DELETE FILE] with ] in directory', () => {
    const input = '[DELETE FILE src/[id]/old.ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-delete')
  })

  it('does NOT match [DELETE FILE] with multiple ]', () => {
    const input = '[DELETE FILE a]b]c.ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-delete')
  })
})

describe('preprocess — ] in file names: MOVE does not match last ]', () => {
  it('does NOT match [MOVE FILE] when FROM path has ]', () => {
    const input = '[MOVE FILE FROM arr].ts TO b.ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does NOT match [MOVE FILE] when TO path has ]', () => {
    const input = '[MOVE FILE FROM a.ts TO arr].ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does NOT match [MOVE FILE] when both paths have ]', () => {
    const input = '[MOVE FILE FROM a].ts TO b].ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does NOT match [MOVE FILE] when FROM path ends with ] before closing', () => {
    const input = '[MOVE FILE FROM file]] TO b.ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does NOT match [MOVE FILE] when TO path ends with ] before closing', () => {
    const input = '[MOVE FILE FROM a.ts TO file]]'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })
})

describe('preprocess — ] in file names: TASK does not match last ]', () => {
  it('does NOT match [TASK] when id has ] before closing bracket', () => {
    const input = '[TASK task]1]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```task:')
  })

  it('does NOT match [TASK] when id ends with ] before closing bracket', () => {
    const input = '[TASK mytask]]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```task:')
  })

  it('does NOT match [TASK] when id has ] in the middle', () => {
    const input = '[TASK fe]at]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```task:')
  })

  it('does NOT match [TASK] when id is only ]', () => {
    const input = '[TASK ]]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```task:')
  })
})

describe('preprocess — ] in file names: combined with [ (both brackets)', () => {
  it('matches [INCLUDE] with both [ and ] in path', () => {
    const input = '[INCLUDE [id]/file].ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:[id]/file].ts`')
  })

  it('does NOT match [FILE] with both [ and ] in path', () => {
    const input = '[FILE src/[slug]/page].tsx]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('does NOT match [DELETE FILE] with both [ and ] in path', () => {
    const input = '[DELETE FILE [scope]/pkg].ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-delete')
  })

  it('does NOT match [MOVE FILE] with [ and ] in FROM path', () => {
    const input = '[MOVE FILE FROM [old]/file].ts TO new.ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does NOT match [TASK] with both [ and ] in id', () => {
    const input = '[TASK [feat]/task]1]\ncontent\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```task:')
  })
})

describe('preprocess — ] in file names: valid paths still work after ] rejection', () => {
  it('processes both [INCLUDE] tags when first has ] in path on separate lines', () => {
    const input = '[INCLUDE bad].ts]\n[INCLUDE good.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:bad].ts`')
    expect(out).toContain('`file-include:good.ts`')
  })

  it('processes valid [FILE] after invalid ] path FILE', () => {
    const input = '[FILE bad].ts]\ncode\n[END]\n[FILE good.ts]\ncode2\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:bad')
    expect(out).toContain('```file:good.ts')
    expect(out).toContain('code2')
  })

  it('processes valid [DELETE FILE] after invalid ] path DELETE', () => {
    const input = '[DELETE FILE bad].ts]\n[DELETE FILE good.ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-delete:bad')
    expect(out).toContain('```file-delete:good.ts')
  })

  it('handles ] in FILE content without affecting subsequent markers', () => {
    const input = '[FILE a.ts]\nconst x = arr[0]\nconst y = obj["]"]\n[END]\n[DELETE FILE b.ts]'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const x = arr[0]')
    expect(out).toContain('```file-delete:b.ts')
  })

  it('handles ] in SEARCH/REPLACE content without affecting subsequent markers', () => {
    const input = [
      '[FILE a.ts]',
      '[SEARCH]',
      'const x = arr[0]',
      '[REPLACE]',
      'const x = arr[1]',
      '[END]',
      '[INCLUDE b.ts]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('`file-include:b.ts`')
  })
})

describe('preprocess — ] in file names: edge cases with whitespace and ]', () => {
  it('matches [INCLUDE] with space then ] in path', () => {
    const input = '[INCLUDE file ].ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:file ].ts`')
  })

  it('matches [INCLUDE] with ] then space in path', () => {
    const input = '[INCLUDE file] .ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:file] .ts`')
  })

  it('does NOT match [FILE] with ] and trailing space before closing bracket', () => {
    const input = '[FILE file] ]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('matches [INCLUDE] with tab before ]', () => {
    const input = '[INCLUDE file\t].ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:file\t].ts`')
  })
})

describe('preprocess — ] in file names: interaction with other special chars', () => {
  it('matches [INCLUDE] with ] and # in path', () => {
    const input = '[INCLUDE file]#section.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:file]#section.ts`')
  })

  it('matches [INCLUDE] with ] and backtick in path', () => {
    const input = '[INCLUDE file]`name`.ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:file]`name`.ts`')
  })

  it('does NOT match [FILE] with ] and -> in path', () => {
    const input = '[FILE a]->b.ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('matches [INCLUDE] with ] and unicode in path', () => {
    const input = '[INCLUDE файл].ts]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:файл].ts`')
  })

  it('does NOT match [FILE] with ] and spaces in path', () => {
    const input = '[FILE my file].ts]\ncode\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })
})

describe('preprocess — ] in file names: ] at line boundaries', () => {
  it('does NOT match [INCLUDE] when ] is on next line (multiline path attempt)', () => {
    const input = '[INCLUDE file\n].ts]'
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
    expect(out).toContain('[INCLUDE file')
  })

  it('handles ] as the only content between INCLUDE and closing bracket', () => {
    const input = '[INCLUDE ]]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:]`')
  })

  it('handles ]] at end of INCLUDE (path is ] then closing ])', () => {
    const input = '[INCLUDE ]]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:]`')
  })

  it('handles ]]] at end of INCLUDE', () => {
    const input = '[INCLUDE ]]]'
    const out = preprocess(input)
    expect(out).toContain('`file-include:]]`')
  })
})

describe('preprocess — ] in file names: SEARCH/REPLACE with ] in FILE path', () => {
  it('does NOT create file-replace when FILE path has ]', () => {
    const input = '[FILE arr[0].ts]\n[SEARCH]\nold\n[REPLACE]\nnew\n[END]'
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
    expect(out).not.toContain('```file:')
  })

  it('does NOT create file-replace for orphan SEARCH after FILE with ] in path', () => {
    const input = [
      '[FILE bad].ts]',
      'code',
      '[END]',
      '',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
  })

  it('orphan SEARCH after valid FILE still works when earlier FILE had ] in path', () => {
    const input = [
      '[FILE bad].ts]',
      'ignored',
      '[FILE good.ts]',
      'code',
      '[END]',
      '',
      '[SEARCH]',
      'old',
      '[REPLACE]',
      'new',
      '[END]'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file:good.ts')
    expect(out).toContain('```file-replace:good.ts')
  })
})
