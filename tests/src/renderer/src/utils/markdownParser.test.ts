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
  it('parses a standard SEARCH/WITH block', () => {
    const code = '@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: 'new' })
  })

  it('handles multi-line SEARCH and WITH', () => {
    const code = '@@SEARCH\na\nb\nc\n@@WITH\nx\ny\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'a\nb\nc', newCode: 'x\ny' })
  })

  it('handles empty WITH (deletion)', () => {
    const code = '@@SEARCH\nold\n@@WITH\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: '' })
  })

  it('handles empty SEARCH (insertion)', () => {
    const code = '@@SEARCH\n@@WITH\nnew\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: '', newCode: 'new' })
  })

  it('treats @@WITH as content when not alone on line', () => {
    const code = '@@SEARCH\nconst x = "@@WITH"\n@@WITH\nconst x = "new"\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'const x = "@@WITH"', newCode: 'const x = "new"' })
  })

  it('returns null when opening marker is missing', () => {
    expect(parseReplaceBlock('just text')).toBeNull()
  })

  it('returns null when separator is missing', () => {
    const code = '@@SEARCH\nold\n@@END'
    expect(parseReplaceBlock(code)).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(parseReplaceBlock('')).toBeNull()
  })

  it('treats @@END as content when not alone on line', () => {
    const code = '@@SEARCH\noriginal\n@@WITH\nconst y = "@@END"\nreplaced\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'original', newCode: 'const y = "@@END"\nreplaced' })
  })

  it('parses SEARCH/WITH with \\r\\n', () => {
    const code = '@@SEARCH\r\nold\r\n@@WITH\r\nnew\r\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: 'new' })
  })

  it('handles SEARCH/WITH with content containing @@SEARCH on its own line in WITH', () => {
    const code = '@@SEARCH\nold\n@@WITH\n@@SEARCH\nnew\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: '@@SEARCH\nnew' })
  })

  it('handles SEARCH/WITH with content containing @@END on its own line in SEARCH', () => {
    const code = '@@SEARCH\n@@END\nold\n@@WITH\nnew\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).not.toBeNull()
  })

  it('handles very long single-line SEARCH content', () => {
    const longLine = 'x'.repeat(10000)
    const code = `@@SEARCH\n${longLine}\n@@WITH\nnew\n@@END`
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: longLine, newCode: 'new' })
  })

  it('does NOT parse with leading spaces on @@SEARCH (must be column 0)', () => {
    const code = '  @@SEARCH\nold\n@@WITH\nnew\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toBeNull()
  })

  it('does NOT parse with leading spaces on @@WITH (must be column 0)', () => {
    const code = '@@SEARCH\nold\n  @@WITH\nnew\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toBeNull()
  })

  it('does NOT parse with leading spaces on @@END (must be column 0)', () => {
    const code = '@@SEARCH\nold\n@@WITH\nnew\n  @@END'
    const result = parseReplaceBlock(code)
    expect(result).toBeNull()
  })

  it('returns null when @@SEARCH has surrounding text', () => {
    const code = 'text @@SEARCH\nold\n@@WITH\nnew\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toBeNull()
  })

  it('returns null when @@WITH has surrounding text', () => {
    const code = '@@SEARCH\nold\n@@WITH text\nnew\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toBeNull()
  })

  it('treats @@END with trailing text as content', () => {
    const code = '@@SEARCH\nold\n@@WITH\nnew\n@@END text'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: 'new\n@@END text' })
  })

  it('handles multiple SEARCH/WITH pairs', () => {
    const code = '@@SEARCH\nold1\n@@WITH\nnew1\n@@SEARCH\nold2\n@@WITH\nnew2\n@@END'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old1', newCode: 'new1' })
  })
})

describe('preprocess — @@FILE blocks', () => {
  it('converts @@FILE path to a fenced file block', () => {
    const input = '@@FILE a.ts\nconst x = 1\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const x = 1')
  })

  it('treats @@END only on its own line at column 0 as terminator', () => {
    const input = '@@FILE a.ts\nHello("@@END");\nconst y = 2\n@@END'
    const out = preprocess(input)
    expect(out).toContain('Hello("@@END");')
    expect(out).toContain('const y = 2')
  })

  it('does not terminate on @@END with leading text', () => {
    const input = '@@FILE a.ts\nfoo @@END bar\n@@END'
    const out = preprocess(input)
    expect(out).toContain('foo @@END bar')
  })

  it('does not terminate on @@END with trailing text', () => {
    const input = '@@FILE a.ts\n@@END trailing\n@@END'
    const out = preprocess(input)
    expect(out).toContain('@@END trailing')
  })

  it('does not terminate on @@END with leading whitespace (not column 0)', () => {
    const input = '@@FILE a.ts\n  @@END\n@@END'
    const out = preprocess(input)
    expect(out).toContain('  @@END')
  })

  it('terminates at next @@FILE marker when no @@END present', () => {
    const input = '@@FILE a.ts\ncodeA\n@@FILE b.ts\ncodeB\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('codeA')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('codeB')
  })

  it('terminates at next @@REPLACE marker', () => {
    const input = '@@FILE a.ts\ncode\n@@REPLACE b.ts\n@@SEARCH\nx\n@@WITH\ny\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```file-replace:b.ts')
  })

  it('terminates at @@DELETE marker', () => {
    const input = '@@FILE a.ts\ncode\n@@DELETE b.ts'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```file-delete:b.ts')
  })

  it('terminates at @@MOVE marker', () => {
    const input = '@@FILE a.ts\ncode\n@@MOVE a.ts -> b.ts'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('terminates at @@COMMIT line', () => {
    const input = '@@FILE a.ts\ncode\n@@COMMIT done'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```commit')
  })

  it('handles empty @@FILE content', () => {
    const input = '@@FILE a.ts\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })

  it('preserves blank lines in @@FILE content', () => {
    const input = '@@FILE a.ts\nconst x = 1\n\nconst y = 2\n@@END'
    const out = preprocess(input)
    expect(out).toContain('const x = 1\n\nconst y = 2')
  })

  it('handles @@FILE path with spaces', () => {
    const input = '@@FILE my file.ts\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:my%20file.ts')
  })

  it('handles @@FILE path with special characters', () => {
    const input = '@@FILE src/@types/index.d.ts\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:src/@types/index.d.ts')
  })

  it('uses tildes when @@FILE content contains triple backticks', () => {
    const input = '@@FILE example.md\n```js\nconst x = 1\n```\n@@END'
    const out = preprocess(input)
    expect(out).toMatch(/~~~file:example\.md/)
    expect(out).toContain('```js')
  })

  it('ignores @@FILE marker inside a code fence', () => {
    const input = '```\n@@FILE a.ts\ncode\n@@END\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('ignores @@FILE marker inside a tilde fence', () => {
    const input = '~~~\n@@FILE a.ts\ncode\n@@END\n~~~\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('does NOT recognize @@FILE with leading whitespace (must be column 0)', () => {
    const input = '  @@FILE a.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
    expect(out).toContain('  @@FILE a.ts')
  })

  it('does NOT recognize @@FILE with leading tabs', () => {
    const input = '\t\t@@FILE a.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('recognizes @@FILE with trailing spaces on the header line', () => {
    const input = '@@FILE a.ts   \ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })

  it('does not match @@FILE without path', () => {
    const input = '@@FILE\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('@@FILE')
    expect(out).not.toContain('```file:')
  })

  it('does not match @@FILE with only space after keyword', () => {
    const input = '@@FILE \ncode\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('preserves text before @@FILE block', () => {
    const input = 'Some description\n@@FILE a.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('Some description')
    expect(out).toContain('```file:a.ts')
  })

  it('handles consecutive @@FILE blocks', () => {
    const input = '@@FILE a.ts\ncodeA\n@@END\n@@FILE b.ts\ncodeB\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('codeA')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('codeB')
  })

  it('handles @@FILE block at very end of input without @@END', () => {
    const input = '@@FILE a.ts\npartial code'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('partial code')
  })

  it('handles @@FILE with tab-indented content', () => {
    const input = '@@FILE a.ts\n\tconst x = 1\n\tconst y = 2\n@@END'
    const out = preprocess(input)
    expect(out).toContain('\tconst x = 1')
    expect(out).toContain('\tconst y = 2')
  })

  it('handles @@FILE block with \\r\\n', () => {
    const input = '@@FILE a.ts\r\nconst x = 1\r\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const x = 1')
  })

  it('handles @@FILE content containing @@ in indented positions', () => {
    const input = '@@FILE a.ts\n  @@indented\n\t@@tabbed\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('  @@indented')
    expect(out).toContain('\t@@tabbed')
  })

  it('handles @@FILE content containing @@END in a string', () => {
    const input = '@@FILE a.ts\nconst marker = "@@END"\n@@END'
    const out = preprocess(input)
    expect(out).toContain('const marker = "@@END"')
  })

  it('handles @@FILE content with @@FILE-like text not at column 0', () => {
    const input = '@@FILE a.ts\n  @@FILE b.ts\n  nested\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('  @@FILE b.ts')
    expect(out).not.toContain('```file:b.ts')
  })
})

describe('preprocess — @@REPLACE blocks (edits)', () => {
  it('converts @@REPLACE with @@SEARCH/@@WITH to file-replace block', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old')
    expect(out).toContain('new')
  })

  it('handles empty @@WITH (delete)', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold code\n@@WITH\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old code')
  })

  it('handles empty @@SEARCH (insert)', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\n@@WITH\nnew code\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('new code')
  })

  it('handles multi-line @@SEARCH and @@WITH', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nline1\nline2\nline3\n@@WITH\nnew1\nnew2\n@@END'
    const out = preprocess(input)
    expect(out).toContain('line1\nline2\nline3')
    expect(out).toContain('new1\nnew2')
  })

  it('produces multiple file-replace blocks for multiple @@SEARCH/@@WITH pairs', () => {
    const input =
      '@@REPLACE a.ts\n@@SEARCH\nold1\n@@WITH\nnew1\n@@SEARCH\nold2\n@@WITH\nnew2\n@@END'
    const out = preprocess(input)
    const matches = out.match(/```file-replace:a\.ts/g)
    expect(matches?.length).toBe(2)
    expect(out).toContain('old1')
    expect(out).toContain('new1')
    expect(out).toContain('old2')
    expect(out).toContain('new2')
  })

  it('treats @@WITH inside code as content when not alone on line', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nHello("@@WITH");\n@@WITH\nHello("@@END");\n@@END'
    const out = preprocess(input)
    expect(out).toContain('Hello("@@WITH");')
    expect(out).toContain('Hello("@@END");')
  })

  it('treats @@WITH as content when it has surrounding text', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nconst x = " @@WITH "\n@@WITH\nconst x = "new"\n@@END'
    const out = preprocess(input)
    expect(out).toContain('const x = " @@WITH "')
    expect(out).toContain('const x = "new"')
  })

  it('handles @@SEARCH inside content when not alone on line', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nconst x = "@@SEARCH"\n@@WITH\nconst x = "new"\n@@END'
    const out = preprocess(input)
    expect(out).toContain('const x = "@@SEARCH"')
    expect(out).toContain('const x = "new"')
  })

  it('@@REPLACE block ends at next @@FILE block', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END\n@@FILE b.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file:b.ts')
  })

  it('consecutive @@REPLACE blocks', () => {
    const input =
      '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END\n@@REPLACE b.ts\n@@SEARCH\nx\n@@WITH\ny\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file-replace:b.ts')
  })

  it('@@REPLACE block followed by @@COMMIT line', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END\n@@COMMIT done'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```commit')
  })

  it('skips non-@@SEARCH text before the first @@SEARCH', () => {
    const input = '@@REPLACE a.ts\nSome description\n@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
  })

  it('trailing text after @@WITH is included in new content', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\nnew\nextra\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('new\nextra')
  })

  it('produces no file-replace when @@REPLACE has no @@SEARCH', () => {
    const input = '@@REPLACE a.ts\nJust a note\n@@END\n@@FILE b.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
    expect(out).toContain('```file:b.ts')
  })

  it('ignores @@REPLACE marker inside a code fence', () => {
    const input = '```\n@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('captures code fences inside @@SEARCH/@@WITH content', () => {
    const input = '@@REPLACE a.md\n@@SEARCH\n```js\nold\n```\n@@WITH\n```js\nnew\n```\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```js\nold\n```')
    expect(out).toContain('```js\nnew\n```')
  })

  it('handles @@REPLACE block with \\r\\n', () => {
    const input = '@@REPLACE a.ts\r\n@@SEARCH\r\nold\r\n@@WITH\r\nnew\r\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old')
    expect(out).toContain('new')
  })

  it('does NOT recognize @@REPLACE with leading whitespace', () => {
    const input = '  @@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
  })

  it('does NOT recognize @@SEARCH with leading whitespace inside @@REPLACE', () => {
    const input = '@@REPLACE a.ts\n  @@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
  })

  it('does NOT recognize @@WITH with leading whitespace inside @@REPLACE', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold\n  @@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
  })

  it('handles @@REPLACE path with spaces', () => {
    const input = '@@REPLACE my file.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:my%20file.ts')
  })

  it('handles @@REPLACE path with special characters', () => {
    const input = '@@REPLACE src/@types/index.d.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:src/@types/index.d.ts')
  })
})

describe('preprocess — @@DELETE blocks', () => {
  it('converts @@DELETE path to a file-delete block', () => {
    const input = '@@DELETE a.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
  })

  it('handles @@DELETE with nested path', () => {
    const input = '@@DELETE src/legacy/old.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:src/legacy/old.ts')
  })

  it('handles multiple @@DELETEs', () => {
    const input = '@@DELETE a.ts\n@@DELETE b.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
    expect(out).toContain('```file-delete:b.ts')
  })

  it('ignores @@DELETE inside code fence', () => {
    const input = '```\n@@DELETE a.ts\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('does not match @@DELETE without path', () => {
    const input = '@@DELETE'
    const out = preprocess(input)
    expect(out).toContain('@@DELETE')
    expect(out).not.toContain('file-delete')
  })

  it('does not match @@DELETE with only space', () => {
    const input = '@@DELETE '
    const out = preprocess(input)
    expect(out).not.toContain('file-delete')
  })

  it('does NOT recognize @@DELETE with leading whitespace', () => {
    const input = '  @@DELETE a.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-delete')
    expect(out).toContain('  @@DELETE a.ts')
  })

  it('recognizes @@DELETE with trailing whitespace', () => {
    const input = '@@DELETE a.ts   '
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
  })

  it('preserves surrounding text', () => {
    const input = 'before\n@@DELETE a.ts\nafter'
    const out = preprocess(input)
    expect(out).toContain('before')
    expect(out).toContain('after')
    expect(out).toContain('```file-delete:a.ts')
  })

  it('handles @@DELETE with \\r\\n', () => {
    const input = '@@DELETE a.ts\r\n'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
  })

  it('handles @@DELETE with path containing spaces', () => {
    const input = '@@DELETE my file.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:my%20file.ts')
  })

  it('handles @@DELETE with path containing unicode', () => {
    const input = '@@DELETE src/файл.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:src/файл.ts')
  })

  it('handles @@DELETE with path containing -> (MOVE conflict)', () => {
    const input = '@@DELETE a->b.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a->b.ts')
  })
})

describe('preprocess — @@MOVE blocks', () => {
  it('converts @@MOVE old -> new to a file-move block', () => {
    const input = '@@MOVE a.ts -> b.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('handles paths with directories', () => {
    const input = '@@MOVE src/old/file.ts -> src/new/file.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-move:src/old/file.ts->src/new/file.ts')
  })

  it('handles multiple @@MOVEs', () => {
    const input = '@@MOVE a.ts -> b.ts\n@@MOVE c.ts -> d.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
    expect(out).toContain('```file-move:c.ts->d.ts')
  })

  it('ignores @@MOVE inside code fence', () => {
    const input = '```\n@@MOVE a.ts -> b.ts\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('does not match @@MOVE without -> separator', () => {
    const input = '@@MOVE a.ts b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does not match @@MOVE without path', () => {
    const input = '@@MOVE'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does not match @@MOVE with only ->', () => {
    const input = '@@MOVE  -> '
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does NOT recognize @@MOVE with leading whitespace', () => {
    const input = '  @@MOVE a.ts -> b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('recognizes @@MOVE with trailing whitespace', () => {
    const input = '@@MOVE a.ts -> b.ts   '
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('preserves surrounding text', () => {
    const input = 'before\n@@MOVE a.ts -> b.ts\nafter'
    const out = preprocess(input)
    expect(out).toContain('before')
    expect(out).toContain('after')
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('terminates preceding @@FILE block', () => {
    const input = '@@FILE a.ts\ncode\n@@MOVE a.ts -> b.ts'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('handles @@MOVE with \\r\\n', () => {
    const input = '@@MOVE a.ts -> b.ts\r\n'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('handles @@MOVE with paths containing spaces', () => {
    const input = '@@MOVE my file.ts -> new file.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-move:my%20file.ts->new%20file.ts')
  })

  it('handles @@MOVE with paths containing unicode', () => {
    const input = '@@MOVE src/старый.ts -> src/новый.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-move:src/старый.ts->src/новый.ts')
  })

  it('handles @@MOVE where source path contains -> as substring (splits on first)', () => {
    const input = '@@MOVE a->b.ts -> c.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a->b.ts->c.ts')
  })

  it('handles @@MOVE with " -> " appearing in destination (splits on first)', () => {
    const input = '@@MOVE a.ts -> b -> c.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b -> c.ts')
  })

  it('does not match @@MOVE with -> without spaces', () => {
    const input = '@@MOVE a.ts->b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does not match @@MOVE with only one space around arrow', () => {
    const input = '@@MOVE a.ts ->b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does not match @@MOVE with only one space around arrow (other side)', () => {
    const input = '@@MOVE a.ts-> b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })
})

describe('preprocess — @@TASK blocks', () => {
  it('converts @@TASK number to a fenced task block', () => {
    const input = '@@TASK 1\nFiles: src/main.ts\nDescription: Do something\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('Files: src/main.ts')
    expect(out).toContain('Description: Do something')
  })

  it('handles @@TASK with multi-line content', () => {
    const input = '@@TASK 1\nFiles: a.ts, b.ts\nDescription: line1\nline2\nline3\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('line1\nline2\nline3')
  })

  it('handles empty @@TASK content', () => {
    const input = '@@TASK 1\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
  })

  it('preserves blank lines in @@TASK content', () => {
    const input = '@@TASK 1\nFiles: a.ts\n\nDescription: line1\n\nline2\n@@END'
    const out = preprocess(input)
    expect(out).toContain('line1\n\nline2')
  })

  it('handles @@TASK id with spaces', () => {
    const input = '@@TASK my task\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:my%20task')
  })

  it('handles @@TASK id with special characters', () => {
    const input = '@@TASK feat/auth-2\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:feat/auth-2')
  })

  it('handles @@TASK id with numeric values', () => {
    const input = '@@TASK 123\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:123')
  })

  it('handles @@TASK id with dots', () => {
    const input = '@@TASK v1.2.3\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:v1.2.3')
  })

  it('trims whitespace around @@TASK id', () => {
    const input = '@@TASK    spaced   \ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:spaced')
  })

  it('terminates at @@END', () => {
    const input = '@@TASK 1\ncontent\n@@END\nmore text'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('content')
    expect(out).toContain('more text')
  })

  it('terminates at next @@FILE marker', () => {
    const input = '@@TASK 1\ncontent\n@@FILE a.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('content')
    expect(out).toContain('```file:a.ts')
  })

  it('terminates at @@DELETE marker', () => {
    const input = '@@TASK 1\ncontent\n@@DELETE a.ts'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('content')
    expect(out).toContain('```file-delete:a.ts')
  })

  it('terminates at @@MOVE marker', () => {
    const input = '@@TASK 1\ncontent\n@@MOVE a.ts -> b.ts'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('terminates at @@COMMIT line', () => {
    const input = '@@TASK 1\ncontent\n@@COMMIT done'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('```commit')
  })

  it('terminates at next @@TASK marker', () => {
    const input = '@@TASK 1\ncontentA\n@@TASK 2\ncontentB\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('contentA')
    expect(out).toContain('```task:2')
    expect(out).toContain('contentB')
  })

  it('handles consecutive @@TASK blocks', () => {
    const input = '@@TASK 1\ncontentA\n@@END\n@@TASK 2\ncontentB\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('contentA')
    expect(out).toContain('```task:2')
    expect(out).toContain('contentB')
  })

  it('terminates preceding @@FILE block', () => {
    const input = '@@FILE a.ts\ncode\n@@TASK 1\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```task:1')
  })

  it('ignores @@TASK inside backtick code fence', () => {
    const input = '```\n@@TASK 1\ncontent\n@@END\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('ignores @@TASK inside tilde code fence', () => {
    const input = '~~~\n@@TASK 1\ncontent\n@@END\n~~~\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('does NOT recognize @@TASK with leading whitespace', () => {
    const input = '  @@TASK 1\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('```task:')
  })

  it('does NOT recognize @@TASK with leading tabs', () => {
    const input = '\t\t@@TASK 1\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('```task:')
  })

  it('recognizes @@TASK with trailing whitespace', () => {
    const input = '@@TASK 1   \ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
  })

  it('recognizes @@END with no leading whitespace to close @@TASK', () => {
    const input = '@@TASK 1\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('content')
  })

  it('does NOT close @@TASK with indented @@END', () => {
    const input = '@@TASK 1\ncontent\n  @@END\n@@END'
    const out = preprocess(input)
    expect(out).toContain('  @@END')
  })

  it('does not match lowercase @@task', () => {
    const input = '@@task 1\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('@@task 1')
    expect(out).not.toContain('```task:')
  })

  it('does not match mixed case @@Task', () => {
    const input = '@@Task 1\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('@@Task 1')
    expect(out).not.toContain('```task:')
  })

  it('does not match @@TASK without id', () => {
    const input = '@@TASK\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('@@TASK')
    expect(out).not.toContain('```task:')
  })

  it('does not match @@TASK with only whitespace id', () => {
    const input = '@@TASK \ncontent\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('```task:')
  })

  it('ignores @@TASK with text before on same line', () => {
    const input = 'text @@TASK 1\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('text @@TASK 1')
    expect(out).not.toContain('```task:')
  })

  it('treats @@TASK inside @@SEARCH content as content', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold @@TASK 1 here\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old @@TASK 1 here')
    expect(out).not.toContain('```task:')
  })

  it('treats @@TASK inside @@WITH content as content', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\nnew @@TASK 1 here\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('new @@TASK 1 here')
    expect(out).not.toContain('```task:')
  })

  it('treats @@TASK inside @@FILE content as content when not at column 0', () => {
    const input = '@@FILE a.ts\nsome @@TASK 1 text\n@@END'
    const out = preprocess(input)
    expect(out).toContain('some @@TASK 1 text')
    expect(out).not.toContain('```task:')
  })

  it('treats @@SEARCH inside @@TASK as content (no special processing)', () => {
    const input = '@@TASK 1\n@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('@@SEARCH')
    expect(out).toContain('old')
    expect(out).toContain('@@WITH')
    expect(out).toContain('new')
  })

  it('uses tildes when @@TASK content contains triple backticks', () => {
    const input = '@@TASK 1\n```js\nconst x = 1\n```\n@@END'
    const out = preprocess(input)
    expect(out).toMatch(/~~~task:1/)
    expect(out).toContain('```js')
  })

  it('handles @@TASK with Windows line endings', () => {
    const input = '@@TASK 1\r\ncontent\r\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('content')
  })

  it('handles @@TASK followed by plain text', () => {
    const input = '@@TASK 1\ncontent\n@@END\nSome explanation'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('Some explanation')
  })

  it('preserves text before @@TASK block', () => {
    const input = 'Some description\n@@TASK 1\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('Some description')
    expect(out).toContain('```task:1')
  })

  it('handles @@TASK mixed with other operations', () => {
    const input = [
      'Intro',
      '@@TASK 1',
      'Files: a.ts',
      'Description: Do the thing',
      '@@END',
      '@@FILE a.ts',
      'code',
      '@@END',
      '@@DELETE old.ts',
      '@@COMMIT done'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('Intro')
    expect(out).toContain('```task:1')
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```file-delete:old.ts')
    expect(out).toContain('```commit')
  })

  it('handles @@TASK without @@END at EOF', () => {
    const input = '@@TASK 1\npartial content'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('partial content')
  })

  it('handles @@TASK without @@END terminated by @@FILE marker', () => {
    const input = '@@TASK 1\npartial\n@@FILE a.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('partial')
    expect(out).toContain('```file:a.ts')
  })

  it('handles @@TASK with content containing markdown headers', () => {
    const input = '@@TASK 1\n# Header\n## Subheader\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('# Header')
    expect(out).toContain('## Subheader')
  })

  it('handles @@TASK with content containing list items', () => {
    const input = '@@TASK 1\n- item 1\n- item 2\n  - nested\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('- item 1')
    expect(out).toContain('  - nested')
  })
})

describe('preprocess — @@COMMIT lines', () => {
  it('converts @@COMMIT to a commit fenced block', () => {
    const input = '@@COMMIT fix: bug in parser'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('fix: bug in parser')
  })

  it('ignores @@COMMIT inside a code fence', () => {
    const input = '```\n@@COMMIT ignored\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('does not match @@COMMIT without a space after keyword', () => {
    const input = '@@COMMITno space'
    const out = preprocess(input)
    expect(out).not.toContain('```commit')
  })

  it('does NOT recognize @@COMMIT with leading whitespace', () => {
    const input = '  @@COMMIT indented'
    const out = preprocess(input)
    expect(out).not.toContain('```commit')
  })

  it('recognizes @@COMMIT with trailing whitespace', () => {
    const input = '@@COMMIT fix bug   '
    const out = preprocess(input)
    expect(out).toContain('```commit')
  })

  it('handles multiple @@COMMIT lines', () => {
    const input = '@@COMMIT first\nSome text\n@@COMMIT second'
    const out = preprocess(input)
    const matches = out.match(/```commit/g)
    expect(matches?.length).toBe(2)
  })

  it('handles @@COMMIT with \\r\\n', () => {
    const input = '@@COMMIT fix bug\r\n'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('fix bug')
  })

  it('handles @@COMMIT with empty message after space', () => {
    const input = '@@COMMIT '
    const out = preprocess(input)
    expect(out).toContain('```commit')
  })

  it('handles @@COMMIT with multiline-looking message (only first line)', () => {
    const input = '@@COMMIT fix bug\nmore text'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('fix bug')
    expect(out).toContain('more text')
  })

  it('handles @@COMMIT with special characters in message', () => {
    const input = '@@COMMIT feat: add @@FILE support & <tags>'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('feat: add @@FILE support & <tags>')
  })

  it('handles @@COMMIT with backticks in message', () => {
    const input = '@@COMMIT fix `parser` bug'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('fix `parser` bug')
  })

  it('handles @@COMMIT with colon in message', () => {
    const input = '@@COMMIT fix: nested: colons'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('fix: nested: colons')
  })

  it('does not match lowercase @@commit', () => {
    const input = '@@commit fix bug'
    const out = preprocess(input)
    expect(out).not.toContain('```commit')
  })
})

describe('preprocess — @@INCLUDE lines', () => {
  it('converts @@INCLUDE path to inline code marker', () => {
    const input = '@@INCLUDE a.ts'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a.ts`')
  })

  it('preserves text before and after @@INCLUDE', () => {
    const input = '1. @@INCLUDE path/to/file.ext. IGNORED TEXT'
    const out = preprocess(input)
    expect(out).toBe('1. `file-include:path/to/file.ext`. IGNORED TEXT')
  })

  it('handles @@INCLUDE at start of line with trailing text', () => {
    const input = '@@INCLUDE a.ts is needed'
    const out = preprocess(input)
    expect(out).toBe('`file-include:a.ts` is needed')
  })

  it('handles @@INCLUDE at end of line', () => {
    const input = 'See @@INCLUDE a.ts'
    const out = preprocess(input)
    expect(out).toBe('See `file-include:a.ts`')
  })

  it('handles multiple @@INCLUDE on the same line', () => {
    const input = '@@INCLUDE a.ts and @@INCLUDE b.ts'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a.ts`')
    expect(out).toContain('`file-include:b.ts`')
    expect(out).toBe('`file-include:a.ts` and `file-include:b.ts`')
  })

  it('trims whitespace in path', () => {
    const input = '@@INCLUDE   a.ts  '
    const out = preprocess(input)
    expect(out).toContain('`file-include:a.ts`')
  })

  it('handles path with spaces', () => {
    const input = '@@INCLUDE my file.ts'
    const out = preprocess(input)
    expect(out).toContain('`file-include:my file.ts`')
  })

  it('handles path with special characters', () => {
    const input = '@@INCLUDE src/@types/index.d.ts'
    const out = preprocess(input)
    expect(out).toContain('`file-include:src/@types/index.d.ts`')
  })

  it('handles @@INCLUDE with leading whitespace on line', () => {
    const input = '  @@INCLUDE a.ts'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a.ts`')
    expect(out).toBe('  `file-include:a.ts`')
  })

  it('does not match @@INCLUDE without path', () => {
    const input = '@@INCLUDE'
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
    expect(out).toBe('@@INCLUDE')
  })

  it('does not match @@INCLUDE with only whitespace path', () => {
    const input = '@@INCLUDE   '
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
  })

  it('does not match lowercase @@include', () => {
    const input = '@@include a.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
    expect(out).toBe('@@include a.ts')
  })

  it('does not match mixed case @@Include', () => {
    const input = '@@Include a.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
    expect(out).toBe('@@Include a.ts')
  })

  it('ignores @@INCLUDE inside @@FILE block content', () => {
    const input = '@@FILE a.ts\n@@INCLUDE b.ts\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
    expect(out).toContain('@@INCLUDE b.ts')
    expect(out).toContain('```file:a.ts')
  })

  it('ignores @@INCLUDE inside @@FILE block with surrounding text', () => {
    const input = '@@FILE a.ts\nsome @@INCLUDE b.ts text\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('`file-include:')
    expect(out).toContain('some @@INCLUDE b.ts text')
  })

  it('ignores @@INCLUDE inside @@SEARCH content', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\n@@INCLUDE b.ts\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('`file-include:')
    expect(out).toContain('@@INCLUDE b.ts')
    expect(out).toContain('```file-replace:a.ts')
  })

  it('ignores @@INCLUDE inside @@WITH content', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\n@@INCLUDE b.ts\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('`file-include:')
    expect(out).toContain('@@INCLUDE b.ts')
    expect(out).toContain('```file-replace:a.ts')
  })

  it('ignores @@INCLUDE inside backtick code fence', () => {
    const input = '```\n@@INCLUDE a.ts\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('ignores @@INCLUDE inside tilde code fence', () => {
    const input = '~~~\n@@INCLUDE a.ts\n~~~\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('processes @@INCLUDE on lines outside any block', () => {
    const input = 'Some text\n@@INCLUDE a.ts\nMore text'
    const out = preprocess(input)
    expect(out).toContain('Some text')
    expect(out).toContain('`file-include:a.ts`')
    expect(out).toContain('More text')
  })

  it('processes @@INCLUDE between @@FILE blocks', () => {
    const input = '@@FILE a.ts\ncode\n@@END\n@@INCLUDE b.ts\n@@FILE c.ts\ncode2\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('`file-include:b.ts`')
    expect(out).toContain('```file:c.ts')
  })

  it('processes @@INCLUDE after @@DELETE marker', () => {
    const input = '@@DELETE a.ts\n@@INCLUDE b.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
    expect(out).toContain('`file-include:b.ts`')
  })

  it('processes @@INCLUDE after @@MOVE marker', () => {
    const input = '@@MOVE a.ts -> b.ts\n@@INCLUDE c.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
    expect(out).toContain('`file-include:c.ts`')
  })

  it('processes @@INCLUDE after @@COMMIT line', () => {
    const input = '@@COMMIT done\n@@INCLUDE a.ts'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('`file-include:a.ts`')
  })

  it('handles @@INCLUDE on same line as surrounding markdown', () => {
    const input = '- @@INCLUDE a.ts — required dependency'
    const out = preprocess(input)
    expect(out).toBe('- `file-include:a.ts` — required dependency')
  })

  it('does not process @@INCLUDE inside @@COMMIT message', () => {
    const input = '@@COMMIT add @@INCLUDE a.ts support'
    const out = preprocess(input)
    expect(out).toContain('```commit')
    expect(out).toContain('@@INCLUDE a.ts')
    expect(out).not.toContain('`file-include:')
  })

  it('handles multiple @@INCLUDE across multiple lines', () => {
    const input = '@@INCLUDE a.ts\n@@INCLUDE b.ts\n@@INCLUDE c.ts'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a.ts`')
    expect(out).toContain('`file-include:b.ts`')
    expect(out).toContain('`file-include:c.ts`')
  })

  it('handles @@INCLUDE with path containing brackets', () => {
    const input = '@@INCLUDE src/[id]/page.ts'
    const out = preprocess(input)
    expect(out).toContain('`file-include:src/[id]/page.ts`')
  })

  it('handles @@INCLUDE with path containing #', () => {
    const input = '@@INCLUDE file#section.ts'
    const out = preprocess(input)
    expect(out).toContain('`file-include:file#section.ts`')
  })
})

describe('preprocess — mixed operations', () => {
  it('handles @@FILE, @@REPLACE, @@DELETE, @@MOVE, @@COMMIT together', () => {
    const input = [
      'Intro text',
      '',
      '@@FILE new.ts',
      'export const x = 1',
      '@@END',
      '@@REPLACE existing.ts',
      '@@SEARCH',
      'const old = true',
      '@@WITH',
      'const old = false',
      '@@END',
      '@@DELETE legacy.ts',
      '@@MOVE a.ts -> b.ts',
      '',
      '@@COMMIT update files'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('Intro text')
    expect(out).toContain('```file:new.ts')
    expect(out).toContain('export const x = 1')
    expect(out).toContain('```file-replace:existing.ts')
    expect(out).toContain('```file-delete:legacy.ts')
    expect(out).toContain('```file-move:a.ts->b.ts')
    expect(out).toContain('```commit')
    expect(out).toContain('update files')
  })

  it('preserves plain text with no markers', () => {
    const input = 'Just plain text\nNo markers here'
    expect(preprocess(input)).toBe(input)
  })

  it('preserves empty input', () => {
    expect(preprocess('')).toBe('')
  })

  it('does not process old bracket-style tags', () => {
    const input = '[FILE a.ts]\ncode\n[END]'
    expect(preprocess(input)).toBe(input)
  })

  it('handles @@FILE block followed by text and @@COMMIT', () => {
    const input = '@@FILE a.ts\ncode\n@@END\nSome text\n@@COMMIT done'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('Some text')
    expect(out).toContain('```commit')
  })

  it('handles code fence between markers', () => {
    const input = '```js\nconst x = 1\n```\n@@FILE a.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```js')
    expect(out).toContain('```file:a.ts')
  })

  it('handles @@END inside @@FILE content that has text around it', () => {
    const input = [
      '@@FILE demo.ts',
      'const banner = "@@END";',
      'const sep = " @@END ";',
      'console.log(banner, sep)',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('const banner = "@@END";')
    expect(out).toContain('const sep = " @@END ";')
    expect(out).toContain('console.log(banner, sep)')
  })
})

describe('preprocess — orphan @@SEARCH/@@WITH blocks', () => {
  it('uses last @@FILE path for orphan @@SEARCH after @@FILE block', () => {
    const input = [
      '@@FILE a.ts',
      'code',
      '@@END',
      '',
      '@@SEARCH',
      'old',
      '@@WITH',
      'new',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old')
    expect(out).toContain('new')
  })

  it('uses last @@REPLACE path for orphan @@SEARCH after @@REPLACE block', () => {
    const input = [
      '@@REPLACE a.ts',
      '@@SEARCH',
      'old1',
      '@@WITH',
      'new1',
      '@@END',
      '',
      '@@SEARCH',
      'old2',
      '@@WITH',
      'new2',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    const matches = out.match(/```file-replace:a\.ts/g)
    expect(matches?.length).toBe(2)
  })

  it('handles multiple consecutive orphan @@SEARCH blocks', () => {
    const input = [
      '@@FILE a.ts',
      'code',
      '@@END',
      '',
      '@@SEARCH',
      'old1',
      '@@WITH',
      'new1',
      '@@END',
      '',
      '@@SEARCH',
      'old2',
      '@@WITH',
      'new2',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    const matches = out.match(/```file-replace:a\.ts/g)
    expect(matches?.length).toBe(2)
  })

  it('uses the most recent @@FILE path', () => {
    const input = [
      '@@FILE a.ts',
      'codeA',
      '@@END',
      '@@FILE b.ts',
      'codeB',
      '@@END',
      '',
      '@@SEARCH',
      'old',
      '@@WITH',
      'new',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:b.ts')
    expect(out).not.toContain('```file-replace:a.ts')
  })

  it('treats orphan @@SEARCH as regular text when no prior @@FILE/@@REPLACE block exists', () => {
    const input = '@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toBe(input)
    expect(out).not.toContain('file-replace')
  })

  it('handles multiple @@SEARCH/@@WITH pairs in one orphan block', () => {
    const input = [
      '@@FILE a.ts',
      'code',
      '@@END',
      '',
      '@@SEARCH',
      'old1',
      '@@WITH',
      'new1',
      '@@SEARCH',
      'old2',
      '@@WITH',
      'new2',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    const matches = out.match(/```file-replace:a\.ts/g)
    expect(matches?.length).toBe(2)
  })

  it('handles orphan @@SEARCH without closing @@END', () => {
    const input = ['@@FILE a.ts', 'code', '@@END', '', '@@SEARCH', 'old', '@@WITH', 'new'].join(
      '\n'
    )
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old')
    expect(out).toContain('new')
  })

  it('falls back to regular text when orphan @@SEARCH has no @@WITH', () => {
    const input = ['@@FILE a.ts', 'code', '@@END', '', '@@SEARCH', 'just some text', '@@END'].join(
      '\n'
    )
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
    expect(out).toContain('@@SEARCH')
    expect(out).toContain('just some text')
  })

  it('stops orphan @@SEARCH at next @@FILE block', () => {
    const input = [
      '@@FILE a.ts',
      'code',
      '@@END',
      '',
      '@@SEARCH',
      'old',
      '@@WITH',
      'new',
      '@@FILE b.ts',
      'codeB',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('codeB')
  })

  it('stops orphan @@SEARCH at @@DELETE marker', () => {
    const input = [
      '@@FILE a.ts',
      'code',
      '@@END',
      '',
      '@@SEARCH',
      'old',
      '@@WITH',
      'new',
      '@@DELETE b.ts'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file-delete:b.ts')
  })

  it('stops orphan @@SEARCH at @@COMMIT line', () => {
    const input = [
      '@@FILE a.ts',
      'code',
      '@@END',
      '',
      '@@SEARCH',
      'old',
      '@@WITH',
      'new',
      '@@COMMIT done'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```commit')
    expect(out).toContain('done')
  })

  it('does not process orphan @@SEARCH inside code fence', () => {
    const input = [
      '@@FILE a.ts',
      'code',
      '@@END',
      '',
      '```',
      '@@SEARCH',
      'old',
      '@@WITH',
      'new',
      '@@END',
      '```'
    ].join('\n')
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
    expect(out).toContain('@@SEARCH')
  })

  it('handles orphan @@SEARCH immediately after @@FILE @@END with no blank line', () => {
    const input = [
      '@@FILE a.ts',
      'code',
      '@@END',
      '@@SEARCH',
      'old',
      '@@WITH',
      'new',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
  })

  it('handles text between @@FILE block and orphan @@SEARCH', () => {
    const input = [
      '@@FILE a.ts',
      'code',
      '@@END',
      '',
      'Some explanation text here.',
      '',
      '@@SEARCH',
      'old',
      '@@WITH',
      'new',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('Some explanation text here.')
  })

  it('handles empty @@WITH in orphan @@SEARCH', () => {
    const input = ['@@FILE a.ts', 'code', '@@END', '', '@@SEARCH', 'old', '@@WITH', '@@END'].join(
      '\n'
    )
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old')
  })

  it('handles empty @@SEARCH in orphan block', () => {
    const input = ['@@FILE a.ts', 'code', '@@END', '', '@@SEARCH', '@@WITH', 'new', '@@END'].join(
      '\n'
    )
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('new')
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

  it('diff parser preprocesses @@ format', () => {
    const parser = getActiveParser()
    expect(parser.name).toBe('Search/Replace')
    const out = parser.preprocess('@@FILE a.ts\ncode\n@@END')
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
    const input = '@@FILE a.ts\ncode\n@@END'
    const out1 = preprocess(input)
    const out2 = preprocess(input)
    expect(out1).toBe(out2)
  })

  it('fast path produces same result as fresh preprocess for appended content', () => {
    const prefix = '@@FILE a.ts\ncode\n@@END\ntrailing'
    const full = prefix + '\n@@DELETE b.ts'
    const freshOut = preprocess(full)
    const cachedOut = preprocess(full)
    expect(cachedOut).toBe(freshOut)
  })

  it('handles appended content after a @@TASK block', () => {
    const prefix = '@@TASK 1\ncontent\n@@END\n'
    preprocess(prefix)
    const full = prefix + '@@FILE a.ts\ncode\n@@END'
    const out = preprocess(full)
    expect(out).toContain('```task:1')
    expect(out).toContain('```file:a.ts')
  })

  it('handles appended content after a @@DELETE marker', () => {
    const prefix = '@@DELETE a.ts\n'
    preprocess(prefix)
    const full = prefix + '@@FILE b.ts\ncode\n@@END'
    const out = preprocess(full)
    expect(out).toContain('```file-delete:a.ts')
    expect(out).toContain('```file:b.ts')
  })

  it('handles appended content after a @@MOVE marker', () => {
    const prefix = '@@MOVE a.ts -> b.ts\n'
    preprocess(prefix)
    const full = prefix + '@@FILE c.ts\ncode\n@@END'
    const out = preprocess(full)
    expect(out).toContain('```file-move:a.ts->b.ts')
    expect(out).toContain('```file:c.ts')
  })

  it('handles appended content after a @@COMMIT line', () => {
    const prefix = '@@COMMIT first\n'
    preprocess(prefix)
    const full = prefix + '@@COMMIT second'
    const out = preprocess(full)
    const matches = out.match(/```commit/g)
    expect(matches?.length).toBe(2)
  })

  it('slow path runs when content diverges from cached prefix', () => {
    preprocess('@@FILE a.ts\ncode\n@@END\ntrailing')
    const different = '@@FILE b.ts\nother\n@@END'
    const out = preprocess(different)
    expect(out).toContain('```file:b.ts')
    expect(out).not.toContain('```file:a.ts')
  })

  it('preserves lastFilePath across fast path boundary', () => {
    const prefix = '@@FILE a.ts\ncode\n@@END\ntrailing'
    preprocess(prefix)
    const full = prefix + '\n@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(full)
    expect(out).toContain('```file-replace:a.ts')
  })

  it('handles single-token append to cached prefix', () => {
    const prefix = '@@FILE a.ts\ncode\n@@END\ntrailing'
    preprocess(prefix)
    const out = preprocess(prefix + 'x')
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('trailingx')
  })
})

describe('preprocess — tag detection hardening', () => {
  describe('@@ tags with surrounding text are treated as content', () => {
    it('ignores @@SEARCH with text before it', () => {
      const input = '@@REPLACE a.ts\nsome text @@SEARCH\nold\n@@WITH\nnew\n@@END'
      const out = preprocess(input)
      expect(out).toContain('some text @@SEARCH')
      expect(out).not.toContain('file-replace')
    })

    it('ignores @@SEARCH with text after it', () => {
      const input = '@@REPLACE a.ts\n@@SEARCH some text\nold\n@@WITH\nnew\n@@END'
      const out = preprocess(input)
      expect(out).toContain('@@SEARCH some text')
      expect(out).not.toContain('file-replace')
    })

    it('ignores @@WITH with text before it', () => {
      const input = '@@REPLACE a.ts\n@@SEARCH\nold\ntext @@WITH\nnew\n@@END'
      const out = preprocess(input)
      expect(out).toContain('old\ntext @@WITH')
    })

    it('ignores @@WITH with text after it', () => {
      const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH text\nnew\n@@END'
      const out = preprocess(input)
      expect(out).toContain('old')
    })

    it('ignores @@END with text before it', () => {
      const input = '@@FILE a.ts\nconst x = 1\ntext @@END'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('const x = 1')
      expect(out).toContain('text @@END')
    })

    it('ignores @@END with text after it', () => {
      const input = '@@FILE a.ts\nconst x = 1\n@@END text'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('const x = 1')
      expect(out).toContain('@@END text')
    })

    it('ignores @@FILE with text before it', () => {
      const input = 'some text @@FILE a.ts\ncode\n@@END'
      const out = preprocess(input)
      expect(out).toContain('some text @@FILE a.ts')
      expect(out).not.toContain('```file:')
    })

    it('ignores @@DELETE with text before it', () => {
      const input = 'text @@DELETE a.ts'
      const out = preprocess(input)
      expect(out).toContain('text @@DELETE a.ts')
      expect(out).not.toContain('file-delete')
    })

    it('ignores @@MOVE with text before it', () => {
      const input = 'text @@MOVE a.ts -> b.ts'
      const out = preprocess(input)
      expect(out).toContain('text @@MOVE a.ts -> b.ts')
      expect(out).not.toContain('file-move')
    })

    it('ignores @@COMMIT with text before it', () => {
      const input = 'text @@COMMIT fix bug'
      const out = preprocess(input)
      expect(out).toContain('text @@COMMIT fix bug')
      expect(out).not.toContain('```commit')
    })

    it('includes text after @@COMMIT in message', () => {
      const input = '@@COMMIT fix bug extra'
      const out = preprocess(input)
      expect(out).toContain('```commit')
      expect(out).toContain('fix bug extra')
    })
  })

  describe('extra/duplicate @@ tags', () => {
    it('treats second @@SEARCH as content when inside search section', () => {
      const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@SEARCH\n@@WITH\nnew\n@@END'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old\n@@SEARCH')
      expect(out).toContain('new')
    })

    it('treats @@WITH inside search section as content when not alone on line', () => {
      const input = '@@REPLACE a.ts\n@@SEARCH\nold @@WITH here\n@@WITH\nnew\n@@END'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old @@WITH here')
    })

    it('treats @@END inside search section as content when not alone on line', () => {
      const input = '@@REPLACE a.ts\n@@SEARCH\nold @@END here\n@@WITH\nnew\n@@END'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old @@END here')
    })

    it('treats extra @@WITH inside replace section as content', () => {
      const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@WITH\n@@END'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('new\n@@WITH')
    })

    it('handles multiple valid @@SEARCH/@@WITH pairs with extras mixed in', () => {
      const input =
        '@@REPLACE a.ts\n@@SEARCH\nold1\n@@WITH\nnew1\n@@SEARCH\n@@SEARCH\nold2\n@@WITH\nnew2\n@@END'
      const out = preprocess(input)
      const matches = out.match(/```file-replace:a\.ts/g)
      expect(matches?.length).toBe(2)
      expect(out).toContain('@@SEARCH\nold2')
    })
  })

  describe('out-of-context @@ tags', () => {
    it('treats @@WITH outside @@REPLACE block as regular text', () => {
      const input = 'some text\n@@WITH\nmore text'
      const out = preprocess(input)
      expect(out).toBe(input)
    })

    it('treats @@END outside any block as regular text', () => {
      const input = 'some text\n@@END\nmore text'
      const out = preprocess(input)
      expect(out).toBe(input)
    })

    it('treats standalone @@SEARCH as regular text', () => {
      const input = 'before\n@@SEARCH\nafter'
      const out = preprocess(input)
      expect(out).toBe(input)
    })

    it('treats standalone @@END as regular text', () => {
      const input = 'before\n@@END\nafter'
      const out = preprocess(input)
      expect(out).toBe(input)
    })

    it('handles @@SEARCH before any @@FILE block', () => {
      const input = '@@SEARCH\nignored\n@@FILE a.ts\ncode\n@@END'
      const out = preprocess(input)
      expect(out).toContain('@@SEARCH')
      expect(out).toContain('ignored')
      expect(out).toContain('```file:a.ts')
    })

    it('handles @@END after @@FILE block is closed', () => {
      const input = '@@FILE a.ts\ncode\n@@END\n@@END'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('code')
      const endMatches = out.match(/@@END/g)
      expect(endMatches?.length).toBe(1)
    })
  })

  describe('@@FILE inside content sections', () => {
    it('treats @@FILE inside search content as content (not a new block)', () => {
      const input = '@@REPLACE a.ts\n@@SEARCH\nold @@FILE b.ts here\n@@WITH\nnew\n@@END'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old @@FILE b.ts here')
    })

    it('treats @@FILE inside replace content as content', () => {
      const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\nnew @@FILE b.ts here\n@@END'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('new @@FILE b.ts here')
    })

    it('terminates @@FILE content when @@FILE appears alone at column 0', () => {
      const input = '@@FILE a.ts\ncodeA\n@@FILE b.ts\ncodeB\n@@END'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('codeA')
      expect(out).toContain('```file:b.ts')
      expect(out).toContain('codeB')
    })

    it('treats @@DELETE inside search content as content', () => {
      const input = '@@REPLACE a.ts\n@@SEARCH\nold @@DELETE b.ts\n@@WITH\nnew\n@@END'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old @@DELETE b.ts')
    })

    it('treats @@MOVE inside search content as content', () => {
      const input = '@@REPLACE a.ts\n@@SEARCH\nold @@MOVE x.ts -> y.ts\n@@WITH\nnew\n@@END'
      const out = preprocess(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('old @@MOVE x.ts -> y.ts')
    })
  })

  describe('case sensitivity', () => {
    it('does not match lowercase @@search', () => {
      const input = '@@REPLACE a.ts\n@@search\nold\n@@WITH\nnew\n@@END'
      const out = preprocess(input)
      expect(out).toContain('@@search')
      expect(out).not.toContain('file-replace')
    })

    it('does not match lowercase @@with', () => {
      const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@with\nnew\n@@END'
      const out = preprocess(input)
      expect(out).not.toContain('file-replace')
    })

    it('does not match lowercase @@end', () => {
      const input = '@@FILE a.ts\ncode\n@@end'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('code')
      expect(out).toContain('@@end')
    })

    it('does not match lowercase @@file', () => {
      const input = '@@file a.ts\ncode\n@@END'
      const out = preprocess(input)
      expect(out).toContain('@@file a.ts')
      expect(out).not.toContain('```file:')
    })

    it('does not match lowercase @@delete', () => {
      const input = '@@delete a.ts'
      const out = preprocess(input)
      expect(out).toContain('@@delete a.ts')
      expect(out).not.toContain('file-delete')
    })

    it('does not match lowercase @@move', () => {
      const input = '@@move a.ts -> b.ts'
      const out = preprocess(input)
      expect(out).toContain('@@move a.ts -> b.ts')
      expect(out).not.toContain('file-move')
    })

    it('does not match lowercase @@commit', () => {
      const input = '@@commit fix bug'
      const out = preprocess(input)
      expect(out).toContain('@@commit fix bug')
      expect(out).not.toContain('```commit')
    })

    it('does not match mixed case @@Search', () => {
      const input = '@@REPLACE a.ts\n@@Search\nold\n@@WITH\nnew\n@@END'
      const out = preprocess(input)
      expect(out).not.toContain('file-replace')
    })

    it('does not match mixed case @@File', () => {
      const input = '@@File a.ts\ncode\n@@END'
      const out = preprocess(input)
      expect(out).not.toContain('```file:')
    })
  })

  describe('incomplete/malformed @@ tags', () => {
    it('does not match @@SEARCH without newline after', () => {
      const input = '@@REPLACE a.ts\n@@SEARCHold\n@@WITH\nnew\n@@END'
      const out = preprocess(input)
      expect(out).not.toContain('file-replace')
    })

    it('does not match @@END without being alone on line', () => {
      const input = '@@FILE a.ts\ncode\n@@END extra'
      const out = preprocess(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('@@END extra')
    })

    it('does not match @@ with no keyword', () => {
      const input = '@@\ncode\n@@END'
      const out = preprocess(input)
      expect(out).toContain('@@')
    })

    it('does not match @@FILE with no space before path', () => {
      const input = '@@FILEa.ts\ncode\n@@END'
      const out = preprocess(input)
      expect(out).not.toContain('```file:')
    })
  })
})

describe('preprocess — @@FILE with special/conflicting characters in path', () => {
  it('handles @@FILE path with # (URL fragment char)', () => {
    const input = '@@FILE src/file#section.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:src/file#section.ts')
  })

  it('handles @@FILE path with ? (URL query char)', () => {
    const input = '@@FILE file?v=2.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:file?v=2.ts')
  })

  it('handles @@FILE path with % (URL encoding conflict)', () => {
    const input = '@@FILE 100%done.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:100%done.ts')
  })

  it('handles @@FILE path with backticks', () => {
    const input = '@@FILE my`file`.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:my`file`.ts')
  })

  it('handles @@FILE path with tilde', () => {
    const input = '@@FILE ~/home/file.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:~/home/file.ts')
  })

  it('handles @@FILE path with backslashes (Windows paths)', () => {
    const input = '@@FILE src\\components\\App.tsx\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:src/components/App.tsx')
  })

  it('handles @@FILE path with -> (MOVE syntax conflict)', () => {
    const input = '@@FILE a->b.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a->b.ts')
  })

  it('handles @@FILE path that looks like SEARCH keyword', () => {
    const input = '@@FILE SEARCH.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:SEARCH.ts')
  })

  it('handles @@FILE path that looks like WITH keyword', () => {
    const input = '@@FILE WITH.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:WITH.ts')
  })

  it('handles @@FILE path that looks like END keyword', () => {
    const input = '@@FILE END.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:END.ts')
  })

  it('handles @@FILE path with unicode characters', () => {
    const input = '@@FILE src/компонент/файл.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:src/компонент/файл.ts')
  })

  it('handles @@FILE path with emoji', () => {
    const input = '@@FILE 🚀rocket.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:🚀rocket.ts')
  })

  it('handles @@FILE path with dots only', () => {
    const input = '@@FILE ...\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:...')
  })

  it('handles @@FILE path with leading dot (hidden file)', () => {
    const input = '@@FILE .env.local\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:.env.local')
  })

  it('handles @@FILE path with parentheses', () => {
    const input = '@@FILE src/(group)/page.tsx\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:src/(group)/page.tsx')
  })

  it('handles @@FILE path with curly braces', () => {
    const input = '@@FILE src/{id}/page.tsx\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:src/{id}/page.tsx')
  })

  it('handles @@FILE path with dollar sign', () => {
    const input = '@@FILE src/$lib/utils.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:src/$lib/utils.ts')
  })

  it('handles @@FILE path with brackets', () => {
    const input = '@@FILE src/[id]/page.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:src/[id]/page.ts')
  })

  it('handles @@FILE path with single quotes', () => {
    const input = "@@FILE it's.ts\ncode\n@@END"
    const out = preprocess(input)
    expect(out).toContain("```file:it's.ts")
  })

  it('handles @@FILE path with double quotes', () => {
    const input = '@@FILE say"hello".ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:say"hello".ts')
  })

  it('handles @@FILE path with pipe character', () => {
    const input = '@@FILE a|b.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a|b.ts')
  })

  it('handles @@FILE path with asterisk (glob)', () => {
    const input = '@@FILE *.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:*.ts')
  })

  it('handles very long @@FILE path', () => {
    const longPath = 'src/' + 'a'.repeat(200) + '/file.ts'
    const input = `@@FILE ${longPath}\ncode\n@@END`
    const out = preprocess(input)
    expect(out).toContain(`\`\`\`file:${longPath}`)
  })

  it('handles @@FILE path with trailing slash', () => {
    const input = '@@FILE src/dir/\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:src/dir/')
  })

  it('handles @@FILE path with leading slash (absolute)', () => {
    const input = '@@FILE /usr/local/file.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:/usr/local/file.ts')
  })

  it('handles @@FILE path with .. (parent directory)', () => {
    const input = '@@FILE ../sibling/file.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:../sibling/file.ts')
  })

  it('handles @@FILE path with spaces (multiple)', () => {
    const input = '@@FILE my  file  name.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('my%20%20file%20%20name.ts')
  })
})

describe('preprocess — edge cases with @@SEARCH/@@WITH content', () => {
  it('handles @@SEARCH content that is only whitespace', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\n \n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
  })

  it('handles @@WITH content that is only whitespace', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\n \n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
  })

  it('handles @@SEARCH/@@WITH with content containing @@COMMIT on its own line', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\n@@COMMIT fake\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('@@COMMIT fake')
    expect(out).not.toContain('```commit')
  })

  it('handles @@SEARCH content with trailing whitespace on lines', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold   \nline2\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old   ')
  })

  it('handles @@WITH content with leading whitespace on lines', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\n   new\nline2\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('   new')
  })

  it('handles @@SEARCH/@@WITH where old and new are identical', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nsame\n@@WITH\nsame\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
  })

  it('handles very large @@SEARCH/@@WITH content', () => {
    const bigContent = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
    const input = `@@REPLACE a.ts\n@@SEARCH\n${bigContent}\n@@WITH\n${bigContent}\n@@END`
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('line 0')
    expect(out).toContain('line 99')
  })
})

describe('preprocess — edge cases with code fences in content', () => {
  it('handles @@FILE content with unclosed code fence', () => {
    const input = '@@FILE a.md\n```js\nconst x = 1\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.md')
    expect(out).toContain('```js')
    expect(out).toContain('const x = 1')
  })

  it('handles @@FILE content with 4-backtick fence', () => {
    const input = '@@FILE a.md\n````\ncode\n````\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.md')
    expect(out).toContain('````')
  })

  it('handles @@FILE content with mixed fence lengths', () => {
    const input = '@@FILE a.md\n```\na\n```\n````\nb\n````\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.md')
  })

  it('handles @@SEARCH/@@WITH with tilde fences in content', () => {
    const input = '@@REPLACE a.md\n@@SEARCH\n~~~\nold\n~~~\n@@WITH\n~~~\nnew\n~~~\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.md')
    expect(out).toContain('~~~\nold\n~~~')
    expect(out).toContain('~~~\nnew\n~~~')
  })

  it('handles @@FILE content that is entirely a code fence', () => {
    const input = '@@FILE a.md\n```\njust code\n```\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.md')
    expect(out).toContain('just code')
  })
})

describe('preprocess — edge cases with mixed line endings and whitespace', () => {
  it('handles mixed \\r\\n and \\n in same input', () => {
    const input = '@@FILE a.ts\r\nline1\nline2\r\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('line1')
    expect(out).toContain('line2')
  })

  it('handles \\r only line endings (old Mac)', () => {
    const input = '@@FILE a.ts\rline1\rline2\r@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })

  it('handles BOM at start of input', () => {
    const input = '\uFEFF@@FILE a.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('code')
  })

  it('handles null bytes in content', () => {
    const input = '@@FILE a.ts\ncode\x00more\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })
})

describe('preprocess — edge cases with multiple operations interleaved', () => {
  it('handles @@FILE, @@TASK, @@FILE, @@DELETE, @@MOVE, @@COMMIT in sequence', () => {
    const input = [
      '@@FILE a.ts',
      'codeA',
      '@@END',
      '@@TASK 1',
      'Files: a.ts',
      'Description: do stuff',
      '@@END',
      '@@FILE b.ts',
      'codeB',
      '@@END',
      '@@DELETE old.ts',
      '@@MOVE x.ts -> y.ts',
      '@@COMMIT all done'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```task:1')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('```file-delete:old.ts')
    expect(out).toContain('```file-move:x.ts->y.ts')
    expect(out).toContain('```commit')
  })

  it('handles orphan @@SEARCH between @@FILE blocks', () => {
    const input = [
      '@@FILE a.ts',
      'code',
      '@@END',
      '@@SEARCH',
      'old',
      '@@WITH',
      'new',
      '@@END',
      '@@FILE b.ts',
      'code2',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file:b.ts')
  })

  it('handles @@TASK immediately followed by @@FILE without blank line', () => {
    const input = '@@TASK 1\ncontent\n@@END\n@@FILE a.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('```file:a.ts')
  })

  it('handles @@DELETE immediately followed by @@MOVE without blank line', () => {
    const input = '@@DELETE a.ts\n@@MOVE b.ts -> c.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
    expect(out).toContain('```file-move:b.ts->c.ts')
  })

  it('handles text, @@FILE, text, @@FILE, text pattern', () => {
    const input = 'intro\n@@FILE a.ts\ncode1\n@@END\nmiddle\n@@FILE b.ts\ncode2\n@@END\noutro'
    const out = preprocess(input)
    expect(out).toContain('intro')
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('middle')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('outro')
  })
})

describe('preprocess — edge cases with fence-like content in markers', () => {
  it('handles @@FILE content that starts with ```', () => {
    const input = '@@FILE a.ts\n```not a fence\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```not a fence')
  })

  it('handles @@FILE content that starts with ~~~', () => {
    const input = '@@FILE a.ts\n~~~not a fence\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('~~~not a fence')
  })

  it('handles @@FILE content with ``` on its own line mid-content', () => {
    const input = '@@FILE a.ts\nline1\n```\nline3\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('line1')
    expect(out).toContain('line3')
  })

  it('uses tildes for @@FILE block when content has both ``` and ~~~', () => {
    const input = '@@FILE a.md\n```\ncode\n```\n~~~\nmore\n~~~\n@@END'
    const out = preprocess(input)
    expect(out).toContain('file:a.md')
    expect(out).toContain('```')
    expect(out).toContain('~~~')
  })
})

describe('preprocess — edge cases: markers at boundaries', () => {
  it('handles @@FILE marker as very first characters of input', () => {
    const input = '@@FILE a.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })

  it('handles @@FILE marker as very last characters of input', () => {
    const input = 'text\n@@FILE a.ts'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })

  it('handles @@DELETE as entire input', () => {
    const input = '@@DELETE a.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
  })

  it('handles @@MOVE as entire input', () => {
    const input = '@@MOVE a.ts -> b.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('handles @@COMMIT as entire input', () => {
    const input = '@@COMMIT done'
    const out = preprocess(input)
    expect(out).toContain('```commit')
  })

  it('handles @@INCLUDE as entire input', () => {
    const input = '@@INCLUDE a.ts'
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

describe('preprocess — edge cases: @@REPLACE with special paths', () => {
  it('handles @@REPLACE with path containing spaces', () => {
    const input = '@@REPLACE my file.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:my%20file.ts')
  })

  it('handles @@REPLACE with path containing @', () => {
    const input = '@@REPLACE @scope/package.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:@scope/package.ts')
  })

  it('handles @@REPLACE with path containing dots', () => {
    const input = '@@REPLACE file.test.spec.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:file.test.spec.ts')
  })

  it('handles orphan @@SEARCH after @@FILE with special path', () => {
    const input = [
      '@@FILE src/@types/index.d.ts',
      'code',
      '@@END',
      '',
      '@@SEARCH',
      'old',
      '@@WITH',
      'new',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```file-replace:src/@types/index.d.ts')
  })
})

describe('preprocess — edge cases: nested/recursive-looking structures', () => {
  it('handles @@FILE content that looks like a complete @@FILE block (indented)', () => {
    const input = '@@FILE outer.ts\n  @@FILE inner.ts\n  inner code\n  @@END\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:outer.ts')
    expect(out).toContain('  @@FILE inner.ts')
    expect(out).not.toContain('```file:inner.ts')
  })

  it('handles @@FILE content with @@SEARCH/@@WITH that are NOT alone on line', () => {
    const input = '@@FILE a.ts\nconst x = "@@SEARCH"\nconst y = "@@WITH"\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const x = "@@SEARCH"')
    expect(out).toContain('const y = "@@WITH"')
    expect(out).not.toContain('file-replace')
  })

  it('handles @@FILE content with all marker keywords on one line', () => {
    const input = '@@FILE a.ts\n@@SEARCH @@WITH @@END @@FILE b.ts @@DELETE c.ts\n@@END'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('@@SEARCH @@WITH @@END @@FILE b.ts @@DELETE c.ts')
  })
})

describe('preprocess — @@ column 0 enforcement', () => {
  it('does NOT match @@FILE indented with 1 space', () => {
    const input = ' @@FILE a.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('does NOT match @@REPLACE indented with 1 space', () => {
    const input = ' @@REPLACE a.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
  })

  it('does NOT match @@DELETE indented with 1 space', () => {
    const input = ' @@DELETE a.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-delete')
  })

  it('does NOT match @@MOVE indented with 1 space', () => {
    const input = ' @@MOVE a.ts -> b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does NOT match @@COMMIT indented with 1 space', () => {
    const input = ' @@COMMIT done'
    const out = preprocess(input)
    expect(out).not.toContain('```commit')
  })

  it('does NOT match @@TASK indented with 1 space', () => {
    const input = ' @@TASK 1\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('```task:')
  })

  it('does NOT match @@END indented with 1 space (does not close block)', () => {
    const input = '@@FILE a.ts\ncode\n @@END\n@@END'
    const out = preprocess(input)
    expect(out).toContain(' @@END')
    expect(out).toContain('code')
  })

  it('does NOT match @@SEARCH indented inside @@REPLACE', () => {
    const input = '@@REPLACE a.ts\n @@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
  })

  it('does NOT match @@WITH indented inside @@REPLACE', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold\n @@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
  })

  it('@@INCLUDE is allowed with leading whitespace (inline replacement)', () => {
    const input = '  @@INCLUDE a.ts'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a.ts`')
  })
})

describe('preprocess — @@END strictness', () => {
  it('@@END must be exactly @@END at column 0', () => {
    const input = '@@FILE a.ts\ncode\n@@END '
    const out = preprocess(input)
    expect(out).toContain('@@END ')
  })

  it('@@END with trailing tab is not a terminator', () => {
    const input = '@@FILE a.ts\ncode\n@@END\t'
    const out = preprocess(input)
    expect(out).toContain('@@END\t')
  })

  it('@@END followed by text on same line is not a terminator', () => {
    const input = '@@FILE a.ts\ncode\n@@END extra'
    const out = preprocess(input)
    expect(out).toContain('@@END extra')
  })

  it('@@END preceded by space is not a terminator', () => {
    const input = '@@FILE a.ts\ncode\n @@END'
    const out = preprocess(input)
    expect(out).toContain(' @@END')
  })

  it('@@END preceded by tab is not a terminator', () => {
    const input = '@@FILE a.ts\ncode\n\t@@END'
    const out = preprocess(input)
    expect(out).toContain('\t@@END')
  })

  it('@@ENDFILE is not a terminator', () => {
    const input = '@@FILE a.ts\ncode\n@@ENDFILE\n@@END'
    const out = preprocess(input)
    expect(out).toContain('@@ENDFILE')
  })

  it('@@ENDER is not a terminator', () => {
    const input = '@@FILE a.ts\ncode\n@@ENDER\n@@END'
    const out = preprocess(input)
    expect(out).toContain('@@ENDER')
  })
})

describe('preprocess — @@ keyword boundary enforcement', () => {
  it('@@FILEX is not recognized as @@FILE', () => {
    const input = '@@FILEX a.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('@@REPLACEMENT is not recognized as @@REPLACE', () => {
    const input = '@@REPLACEMENT a.ts\n@@SEARCH\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
  })

  it('@@DELETED is not recognized as @@DELETE', () => {
    const input = '@@DELETED a.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-delete')
  })

  it('@@MOVED is not recognized as @@MOVE', () => {
    const input = '@@MOVED a.ts -> b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('@@COMMITTED is not recognized as @@COMMIT', () => {
    const input = '@@COMMITTED done'
    const out = preprocess(input)
    expect(out).not.toContain('```commit')
  })

  it('@@INCLUDED is not recognized as @@INCLUDE', () => {
    const input = '@@INCLUDED a.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-include')
  })

  it('@@TASKS is not recognized as @@TASK', () => {
    const input = '@@TASKS 1\ncontent\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('```task:')
  })

  it('@@SEARCHING is not recognized as @@SEARCH', () => {
    const input = '@@REPLACE a.ts\n@@SEARCHING\nold\n@@WITH\nnew\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
  })

  it('@@WITHIN is not recognized as @@WITH', () => {
    const input = '@@REPLACE a.ts\n@@SEARCH\nold\n@@WITHIN\nnew\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
  })
})

describe('preprocess — full example from spec', () => {
  it('handles the complete example response', () => {
    const input = [
      "I'll create the config, patch the utility, remove the legacy module, and rename the stylesheet.",
      '',
      '@@FILE config.json',
      '{',
      '  "theme": "dark",',
      '  "language": "en"',
      '}',
      '@@END',
      '',
      '@@REPLACE src/utils.ts',
      '@@SEARCH',
      "import { init } from './core'",
      '@@WITH',
      "import { init } from './core'",
      "import { helper } from './utils'",
      '@@END',
      '',
      '@@DELETE src/legacy.js',
      '',
      '@@MOVE css/style.css -> css/main.css',
      '',
      '@@COMMIT add config, patch imports, remove legacy, rename stylesheet'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain("I'll create the config")
    expect(out).toContain('```file:config.json')
    expect(out).toContain('"theme": "dark"')
    expect(out).toContain('```file-replace:src/utils.ts')
    expect(out).toContain("import { init } from './core'")
    expect(out).toContain("import { helper } from './utils'")
    expect(out).toContain('```file-delete:src/legacy.js')
    expect(out).toContain('```file-move:css/style.css->css/main.css')
    expect(out).toContain('```commit')
    expect(out).toContain('add config, patch imports, remove legacy, rename stylesheet')
  })
})

describe('preprocess — @@TASK with Files/Description format', () => {
  it('handles @@TASK with Files and Description lines', () => {
    const input = [
      '@@TASK 1',
      'Files: src/main.ts, src/utils.ts, src/types.ts',
      'Description: Create the parser module with a line-scanning loop.',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('Files: src/main.ts, src/utils.ts, src/types.ts')
    expect(out).toContain('Description: Create the parser module with a line-scanning loop.')
  })

  it('handles multiple @@TASK blocks with sequential numbering', () => {
    const input = [
      '@@TASK 1',
      'Files: src/types.ts',
      'Description: Define the ParsedOperation interface.',
      '@@END',
      '',
      '@@TASK 2',
      'Files: src/types.ts, src/parser.ts',
      'Description: Implement the line scanner in src/parser.ts.',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('```task:2')
    expect(out).toContain('Define the ParsedOperation interface.')
    expect(out).toContain('Implement the line scanner in src/parser.ts.')
  })

  it('handles @@TASK with multi-line Description', () => {
    const input = [
      '@@TASK 1',
      'Files: src/main.ts',
      'Description: Create the parser module.',
      'Handle missing @@END gracefully.',
      'Fall back to the next top-level header.',
      '@@END'
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('```task:1')
    expect(out).toContain('Handle missing @@END gracefully.')
    expect(out).toContain('Fall back to the next top-level header.')
  })
})

describe('preprocess — @@MOVE edge cases with " -> " separator', () => {
  it('handles @@MOVE with multiple " -> " (splits on first)', () => {
    const input = '@@MOVE a -> b -> c.ts'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a->b -> c.ts')
  })

  it('handles @@MOVE with " -> " in directory name', () => {
    const input = '@@MOVE src/old -> new/file.ts -> dest/file.ts'
    const out = preprocess(input)
    expect(out).toContain('file-move:')
  })

  it('does not match @@MOVE with no spaces around ->', () => {
    const input = '@@MOVE a.ts->b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does not match @@MOVE with single space before ->', () => {
    const input = '@@MOVE a.ts ->b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('does not match @@MOVE with single space after ->', () => {
    const input = '@@MOVE a.ts-> b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('handles @@MOVE with unicode arrow-like characters (not matched)', () => {
    const input = '@@MOVE a.ts → b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('handles @@MOVE with empty source', () => {
    const input = '@@MOVE  -> b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })

  it('handles @@MOVE with empty destination', () => {
    const input = '@@MOVE a.ts -> '
    const out = preprocess(input)
    expect(out).not.toContain('file-move')
  })
})

describe('preprocess — @@INCLUDE edge cases', () => {
  it('handles @@INCLUDE with path containing " -> "', () => {
    const input = '@@INCLUDE a -> b.ts'
    const out = preprocess(input)
    expect(out).toContain('`file-include:a -> b.ts`')
  })

  it('handles @@INCLUDE with path containing @@', () => {
    const input = '@@INCLUDE src/@@types/index.ts'
    const out = preprocess(input)
    expect(out).toContain('`file-include:src/@@types/index.ts`')
  })

  it('handles @@INCLUDE mid-sentence', () => {
    const input = 'Please provide @@INCLUDE src/main.ts so I can proceed.'
    const out = preprocess(input)
    expect(out).toContain('`file-include:src/main.ts`')
    expect(out).toContain('Please provide')
    expect(out).toContain('so I can proceed.')
  })
})

describe('preprocess — regression: @@FILE path encoding edge cases', () => {
  it('encodes multiple spaces in @@FILE path', () => {
    const input = '@@FILE my  file  name.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('my%20%20file%20%20name.ts')
  })

  it('does not double-encode already-encoded paths', () => {
    const input = '@@FILE my%20file.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).not.toContain('%2520')
  })

  it('handles @@FILE path with tab character', () => {
    const input = '@@FILE my\tfile.ts\ncode\n@@END'
    const out = preprocess(input)
    expect(out).toContain('file:')
    expect(out).toContain('code')
  })
})
