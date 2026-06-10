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
    const code = '<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: 'new' })
  })

  it('handles multi-line SEARCH and REPLACE', () => {
    const code = '<<<<<<< SEARCH\na\nb\nc\n=======\nx\ny\n>>>>>>> REPLACE'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'a\nb\nc', newCode: 'x\ny' })
  })

  it('handles empty REPLACE (deletion)', () => {
    const code = '<<<<<<< SEARCH\nold\n=======\n>>>>>>> REPLACE'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: '' })
  })

  it('handles empty SEARCH (insertion)', () => {
    const code = '<<<<<<< SEARCH\n=======\nnew\n>>>>>>> REPLACE'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: '', newCode: 'new' })
  })

  it('treats ======= as content when opener is longer', () => {
    const code = '<<<<<<<< SEARCH\nconst x = "======="\n========\nconst x = "new"\n>>>>>>>> REPLACE'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'const x = "======="', newCode: 'const x = "new"' })
  })

  it('returns null when opening marker is missing', () => {
    expect(parseReplaceBlock('just text')).toBeNull()
  })

  it('returns null when separator is missing', () => {
    const code = '<<<<<<< SEARCH\nold\n>>>>>>> REPLACE'
    expect(parseReplaceBlock(code)).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(parseReplaceBlock('')).toBeNull()
  })

  it('handles ======= inside REPLACE when markers are longer', () => {
    const code =
      '<<<<<<<< SEARCH\noriginal\n========\nconst y = "======="\nreplaced\n>>>>>>>> REPLACE'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'original', newCode: 'const y = "======="\nreplaced' })
  })
})

describe('preprocess — FILE blocks', () => {
  it('converts --- FILE --- to a fenced file block', () => {
    const input = '--- FILE a.ts ---\nconst x = 1\n======='
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const x = 1')
  })

  it('treats ======= only on its own line as terminator', () => {
    const input = '--- FILE a.ts ---\nHello("=======");\nconst y = 2\n======='
    const out = preprocess(input)
    expect(out).toContain('Hello("=======");')
    expect(out).toContain('const y = 2')
  })

  it('does not terminate on ======= with leading text', () => {
    const input = '--- FILE a.ts ---\nfoo ======= bar\n======='
    const out = preprocess(input)
    expect(out).toContain('foo ======= bar')
  })

  it('does not terminate on ======= with trailing text', () => {
    const input = '--- FILE a.ts ---\n======= trailing\n======='
    const out = preprocess(input)
    expect(out).toContain('======= trailing')
  })

  it('terminates at next FILE marker when no ======= present', () => {
    const input = '--- FILE a.ts ---\ncodeA\n--- FILE b.ts ---\ncodeB\n======='
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('codeA')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('codeB')
  })

  it('terminates at next EDIT marker', () => {
    const input =
      '--- FILE a.ts ---\ncode\n--- EDIT b.ts ---\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```file-replace:b.ts')
  })

  it('terminates at DELETE marker', () => {
    const input = '--- FILE a.ts ---\ncode\n--- DELETE b.ts ---'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```file-delete:b.ts')
  })

  it('terminates at MOVE marker', () => {
    const input = '--- FILE a.ts ---\ncode\n--- MOVE a.ts -> b.ts ---'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('terminates at COMMIT line', () => {
    const input = '--- FILE a.ts ---\ncode\nCOMMIT: done'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('```commit')
  })

  it('handles empty FILE content', () => {
    const input = '--- FILE a.ts ---\n======='
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
  })

  it('preserves blank lines in FILE content', () => {
    const input = '--- FILE a.ts ---\nconst x = 1\n\nconst y = 2\n======='
    const out = preprocess(input)
    expect(out).toContain('const x = 1\n\nconst y = 2')
  })

  it('handles FILE path with spaces', () => {
    const input = '--- FILE my file.ts ---\ncontent\n======='
    const out = preprocess(input)
    expect(out).toContain('```file:my file.ts')
  })

  it('handles FILE path with special characters', () => {
    const input = '--- FILE src/@types/index.d.ts ---\ncontent\n======='
    const out = preprocess(input)
    expect(out).toContain('```file:src/@types/index.d.ts')
  })

  it('uses tildes when FILE content contains triple backticks', () => {
    const input = '--- FILE example.md ---\n```js\nconst x = 1\n```\n======='
    const out = preprocess(input)
    expect(out).toMatch(/~~~file:example\.md/)
    expect(out).toContain('```js')
  })

  it('ignores FILE marker inside a code fence', () => {
    const input = '```\n--- FILE a.ts ---\ncode\n=======\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('ignores FILE marker inside a tilde fence', () => {
    const input = '~~~\n--- FILE a.ts ---\ncode\n=======\n~~~\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('does not match FILE marker with leading whitespace', () => {
    const input = '  --- FILE a.ts ---\ncode\n======='
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('does not match FILE marker without closing ---', () => {
    const input = '--- FILE a.ts\ncode\n======='
    const out = preprocess(input)
    expect(out).not.toContain('```file:')
  })

  it('preserves text before FILE block', () => {
    const input = 'Some description\n\n--- FILE a.ts ---\ncode\n======='
    const out = preprocess(input)
    expect(out).toContain('Some description')
    expect(out).toContain('```file:a.ts')
  })

  it('handles consecutive FILE blocks', () => {
    const input = '--- FILE a.ts ---\ncodeA\n=======\n--- FILE b.ts ---\ncodeB\n======='
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('codeA')
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('codeB')
  })
})

describe('preprocess — EDIT blocks', () => {
  it('converts --- EDIT --- with SEARCH/REPLACE to file-replace block', () => {
    const input = '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('<<<<<<< SEARCH')
    expect(out).toContain('old')
    expect(out).toContain('new')
    expect(out).toContain('>>>>>>> REPLACE')
  })

  it('handles empty REPLACE (delete)', () => {
    const input = '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold code\n=======\n>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old code')
  })

  it('handles empty SEARCH (insert)', () => {
    const input = '--- EDIT a.ts ---\n<<<<<<< SEARCH\n=======\nnew code\n>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('new code')
  })

  it('handles multi-line SEARCH and REPLACE', () => {
    const input =
      '--- EDIT a.ts ---\n<<<<<<< SEARCH\nline1\nline2\nline3\n=======\nnew1\nnew2\n>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('line1\nline2\nline3')
    expect(out).toContain('new1\nnew2')
  })

  it('produces multiple file-replace blocks for multiple SEARCH/REPLACE pairs', () => {
    const input =
      '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold1\n=======\nnew1\n>>>>>>> REPLACE\n<<<<<<< SEARCH\nold2\n=======\nnew2\n>>>>>>> REPLACE'
    const out = preprocess(input)
    const matches = out.match(/```file-replace:a\.ts/g)
    expect(matches?.length).toBe(2)
    expect(out).toContain('old1')
    expect(out).toContain('new1')
    expect(out).toContain('old2')
    expect(out).toContain('new2')
  })

  it('treats ======= inside code as content when not alone on line', () => {
    const input =
      '--- EDIT a.ts ---\n<<<<<<< SEARCH\nHello("=======");\n=======\nHello("========");\n>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('Hello("=======");')
    expect(out).toContain('Hello("========");')
  })

  it('requires separator to match opener length', () => {
    const input =
      '--- EDIT a.ts ---\n<<<<<<<< SEARCH\nconst x = "======="\n========\nconst x = "new"\n>>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('const x = "======="')
    expect(out).toContain('const x = "new"')
  })

  it('treats shorter ======= as content when opener is longer', () => {
    const input =
      '--- EDIT a.ts ---\n<<<<<<<< SEARCH\n=======\nsome text\n========\nnew content\n>>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('=======\nsome text')
    expect(out).toContain('new content')
  })

  it('rejects longer separator than opener', () => {
    const input = '--- EDIT a.ts ---\n<<<<<<< SEARCH\n========\n=======\nnew\n>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('========')
    expect(out).toContain('new')
  })

  it('EDIT block ends at next FILE marker', () => {
    const input =
      '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n--- FILE b.ts ---\ncode\n======='
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file:b.ts')
  })

  it('EDIT block ends at next EDIT marker', () => {
    const input =
      '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n--- EDIT b.ts ---\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file-replace:b.ts')
  })

  it('EDIT block ends at COMMIT line', () => {
    const input =
      '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\nCOMMIT: done'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```commit')
  })

  it('skips non-SEARCH text before the first SEARCH', () => {
    const input =
      '--- EDIT a.ts ---\nSome description\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
  })

  it('stops EDIT block when non-blank non-SEARCH text follows a pair', () => {
    const input =
      '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n\nSome trailing text'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('Some trailing text')
  })

  it('produces no file-replace for EDIT with no SEARCH/REPLACE', () => {
    const input = '--- EDIT a.ts ---\nJust a note\n--- FILE b.ts ---\ncode\n======='
    const out = preprocess(input)
    expect(out).not.toContain('file-replace')
    expect(out).toContain('```file:b.ts')
  })

  it('ignores EDIT marker inside a code fence', () => {
    const input =
      '```\n--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('captures code fences inside SEARCH/REPLACE content', () => {
    const input =
      '--- EDIT a.md ---\n<<<<<<< SEARCH\n```js\nold\n```\n=======\n```js\nnew\n```\n>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('```js\nold\n```')
    expect(out).toContain('```js\nnew\n```')
  })

  it('handles EDIT path with special characters', () => {
    const input =
      '--- EDIT src/components/App.tsx ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:src/components/App.tsx')
  })
})

describe('preprocess — DELETE blocks', () => {
  it('converts --- DELETE --- to a file-delete block', () => {
    const input = '--- DELETE a.ts ---'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
  })

  it('handles DELETE with path', () => {
    const input = '--- DELETE src/legacy/old.ts ---'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:src/legacy/old.ts')
  })

  it('handles multiple DELETEs', () => {
    const input = '--- DELETE a.ts ---\n--- DELETE b.ts ---'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
    expect(out).toContain('```file-delete:b.ts')
  })

  it('ignores DELETE inside code fence', () => {
    const input = '```\n--- DELETE a.ts ---\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('does not match DELETE without closing ---', () => {
    const input = '--- DELETE a.ts'
    const out = preprocess(input)
    expect(out).not.toContain('```file-delete')
  })

  it('does not match DELETE with leading whitespace', () => {
    const input = '  --- DELETE a.ts ---'
    const out = preprocess(input)
    expect(out).not.toContain('```file-delete')
  })

  it('preserves surrounding text', () => {
    const input = 'before\n--- DELETE a.ts ---\nafter'
    const out = preprocess(input)
    expect(out).toContain('before')
    expect(out).toContain('after')
    expect(out).toContain('```file-delete:a.ts')
  })
})

describe('preprocess — MOVE blocks', () => {
  it('converts --- MOVE old -> new --- to a file-move block', () => {
    const input = '--- MOVE a.ts -> b.ts ---'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('handles paths with directories', () => {
    const input = '--- MOVE src/old/file.ts -> src/new/file.ts ---'
    const out = preprocess(input)
    expect(out).toContain('```file-move:src/old/file.ts->src/new/file.ts')
  })

  it('handles multiple MOVEs', () => {
    const input = '--- MOVE a.ts -> b.ts ---\n--- MOVE c.ts -> d.ts ---'
    const out = preprocess(input)
    expect(out).toContain('```file-move:a.ts->b.ts')
    expect(out).toContain('```file-move:c.ts->d.ts')
  })

  it('ignores MOVE inside code fence', () => {
    const input = '```\n--- MOVE a.ts -> b.ts ---\n```\n'
    const out = preprocess(input)
    expect(out).toBe(input)
  })

  it('does not match MOVE without closing ---', () => {
    const input = '--- MOVE a.ts -> b.ts'
    const out = preprocess(input)
    expect(out).not.toContain('```file-move')
  })

  it('does not match MOVE without arrow', () => {
    const input = '--- MOVE a.ts b.ts ---'
    const out = preprocess(input)
    expect(out).not.toContain('```file-move')
  })

  it('does not match MOVE with leading whitespace', () => {
    const input = '  --- MOVE a.ts -> b.ts ---'
    const out = preprocess(input)
    expect(out).not.toContain('```file-move')
  })

  it('preserves surrounding text', () => {
    const input = 'before\n--- MOVE a.ts -> b.ts ---\nafter'
    const out = preprocess(input)
    expect(out).toContain('before')
    expect(out).toContain('after')
    expect(out).toContain('```file-move:a.ts->b.ts')
  })

  it('terminates preceding FILE block', () => {
    const input = '--- FILE a.ts ---\ncode\n--- MOVE a.ts -> b.ts ---'
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

  it('does not match COMMIT: with leading whitespace', () => {
    const input = '  COMMIT: indented'
    const out = preprocess(input)
    expect(out).not.toContain('```commit')
  })

  it('handles multiple COMMIT lines', () => {
    const input = 'COMMIT: first\nSome text\nCOMMIT: second'
    const out = preprocess(input)
    const matches = out.match(/```commit/g)
    expect(matches?.length).toBe(2)
  })
})

describe('preprocess — mixed operations', () => {
  it('handles FILE, EDIT, DELETE, MOVE, COMMIT together', () => {
    const input = [
      'Intro text',
      '',
      '--- FILE new.ts ---',
      'export const x = 1',
      '=======',
      '--- EDIT existing.ts ---',
      '<<<<<<< SEARCH',
      'const old = true',
      '=======',
      'const old = false',
      '>>>>>>> REPLACE',
      '--- DELETE legacy.ts ---',
      '--- MOVE a.ts -> b.ts ---',
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
    const input = '--- FILE a.ts ---\ncode\n=======\n\nSome text\nCOMMIT: done'
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('code')
    expect(out).toContain('Some text')
    expect(out).toContain('```commit')
  })

  it('handles EDIT block followed by FILE block', () => {
    const input =
      '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n\n--- FILE b.ts ---\ncode\n======='
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('```file:b.ts')
  })

  it('handles code fence between markers', () => {
    const input = '```js\nconst x = 1\n```\n--- FILE a.ts ---\ncode\n======='
    const out = preprocess(input)
    expect(out).toContain('```js')
    expect(out).toContain('```file:a.ts')
  })

  it('handles ======= inside FILE content that has text around it', () => {
    const input = [
      '--- FILE demo.ts ---',
      'const banner = "=======";',
      'const sep = " ======= ";',
      'console.log(banner, sep)',
      '======='
    ].join('\n')
    const out = preprocess(input)
    expect(out).toContain('const banner = "=======";')
    expect(out).toContain('const sep = " ======= ";')
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

  it('diff parser preprocesses SEARCH/REPLACE format', () => {
    const parser = getActiveParser()
    expect(parser.name).toBe('Search/Replace')
    const out = parser.preprocess('--- FILE a.ts ---\ncode\n=======')
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
    const input = '--- FILE a.ts ---\r\nconst x = 1\r\n======='
    const out = preprocess(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const x = 1')
  })

  it('handles EDIT block with \\r\\n', () => {
    const input = '--- EDIT a.ts ---\r\n<<<<<<< SEARCH\r\nold\r\n=======\r\nnew\r\n>>>>>>> REPLACE'
    const out = preprocess(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('old')
    expect(out).toContain('new')
  })

  it('handles DELETE with \\r\\n', () => {
    const input = '--- DELETE a.ts ---\r\n'
    const out = preprocess(input)
    expect(out).toContain('```file-delete:a.ts')
  })

  it('handles MOVE with \\r\\n', () => {
    const input = '--- MOVE a.ts -> b.ts ---\r\n'
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
    const code = '<<<<<<< SEARCH\r\nold\r\n=======\r\nnew\r\n>>>>>>> REPLACE'
    const result = parseReplaceBlock(code)
    expect(result).toEqual({ oldCode: 'old', newCode: 'new' })
  })
})
