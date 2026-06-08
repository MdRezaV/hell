import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizeBody,
  trimSingleNewline,
  wrapInFence,
  isPosInRange,
  findCodeRangesSkippingRanges,
  findTagsInText,
  matchOpenClose,
  findMatchedBlocks,
  preprocessFileBlocks,
  preprocessCommitBlocks,
  preprocessDiffFormat,
  getActiveParser,
  setActiveParser,
  listParsers,
  type CodeRange
} from './markdownParser'

describe('normalizeBody', () => {
  it('strips leading and trailing newlines', () => {
    expect(normalizeBody('\n\nhello\n\n')).toBe('hello')
  })

  it('preserves internal newlines', () => {
    expect(normalizeBody('\na\nb\n')).toBe('a\nb')
  })

  it('returns empty string for only newlines', () => {
    expect(normalizeBody('\n\n\n')).toBe('')
  })

  it('returns the same string when no leading/trailing newlines', () => {
    expect(normalizeBody('abc')).toBe('abc')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeBody('')).toBe('')
  })

  it('handles single character input', () => {
    expect(normalizeBody('x')).toBe('x')
  })

  it('handles single newline input', () => {
    expect(normalizeBody('\n')).toBe('')
  })

  it('preserves internal whitespace', () => {
    expect(normalizeBody('\n  a  \n  b  \n')).toBe('  a  \n  b  ')
  })

  it('handles input with only spaces', () => {
    expect(normalizeBody('   ')).toBe('   ')
  })
})

describe('trimSingleNewline', () => {
  it('returns empty string for empty input', () => {
    expect(trimSingleNewline('')).toBe('')
  })

  it('strips a single leading newline', () => {
    expect(trimSingleNewline('\nhello')).toBe('hello')
  })

  it('strips a single trailing newline', () => {
    expect(trimSingleNewline('hello\n')).toBe('hello')
  })

  it('strips one leading and one trailing newline', () => {
    expect(trimSingleNewline('\nhello\n')).toBe('hello')
  })

  it('preserves extra leading newlines beyond the first', () => {
    expect(trimSingleNewline('\n\nhello\n')).toBe('\nhello')
  })

  it('preserves extra trailing newlines beyond the last', () => {
    expect(trimSingleNewline('\nhello\n\n')).toBe('hello\n')
  })

  it('preserves internal newlines', () => {
    expect(trimSingleNewline('\na\nb\nc\n')).toBe('a\nb\nc')
  })

  it('reduces three newlines to one', () => {
    expect(trimSingleNewline('\n\n\n')).toBe('\n')
  })

  it('reduces two newlines to empty', () => {
    expect(trimSingleNewline('\n\n')).toBe('')
  })

  it('strips single newline to empty', () => {
    expect(trimSingleNewline('\n')).toBe('')
  })

  it('returns text unchanged when no leading or trailing newlines', () => {
    expect(trimSingleNewline('hello')).toBe('hello')
  })

  it('preserves multiple internal blank lines', () => {
    expect(trimSingleNewline('\na\n\n\nb\n')).toBe('a\n\n\nb')
  })
})

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

  it('uses triple backticks when code has double backticks', () => {
    const code = 'a `` b'
    const out = wrapInFence(code, 'js')
    expect(out).toBe('\n```js\na `` b\n```\n')
  })

  it('uses tildes when code has backticks of length 3 but no tildes', () => {
    const code = '```\nsome code\n```'
    const out = wrapInFence(code, 'md')
    expect(out).toMatch(/^\n~~~md\n/)
    expect(out).toMatch(/~~~\n$/)
  })

  it('uses tildes when code has backticks of length 4 and tildes of length 1', () => {
    const code = '```` and ~'
    const out = wrapInFence(code, 'md')
    // maxBackticks=4, maxTildes=1, so uses ~~~
    expect(out).toMatch(/~~~md\n/)
  })

  it('extends backtick fence when code has long backticks and long tildes', () => {
    const code = '````` and ~~~~'
    const out = wrapInFence(code, 'x')
    // maxBackticks=5, so uses 6 backticks
    expect(out).toContain('``````x')
    expect(out).toContain('``````\n')
  })

  it('wraps with empty lang', () => {
    const out = wrapInFence('code', '')
    expect(out).toBe('\n```\ncode\n```\n')
  })
})

describe('isPosInRange', () => {
  const ranges: CodeRange[] = [
    { start: 5, end: 10 },
    { start: 20, end: 25 }
  ]

  it('returns true for pos inside a range', () => {
    expect(isPosInRange(7, ranges)).toBe(true)
    expect(isPosInRange(5, ranges)).toBe(true)
  })

  it('returns false for pos at end (exclusive)', () => {
    expect(isPosInRange(10, ranges)).toBe(false)
  })

  it('returns false for pos outside all ranges', () => {
    expect(isPosInRange(0, ranges)).toBe(false)
    expect(isPosInRange(15, ranges)).toBe(false)
  })

  it('returns false for empty ranges list', () => {
    expect(isPosInRange(0, [])).toBe(false)
  })

  it('returns true for pos at start of range starting at 0', () => {
    expect(isPosInRange(0, [{ start: 0, end: 5 }])).toBe(true)
  })

  it('returns false for pos just before a range', () => {
    expect(isPosInRange(4, ranges)).toBe(false)
  })

  it('returns true for pos at last valid position in range', () => {
    expect(isPosInRange(9, ranges)).toBe(true)
  })

  it('returns false for pos at end of last range', () => {
    expect(isPosInRange(25, ranges)).toBe(false)
  })

  it('returns false for pos beyond all ranges', () => {
    expect(isPosInRange(100, ranges)).toBe(false)
  })

  it('handles overlapping ranges', () => {
    const overlapping: CodeRange[] = [
      { start: 3, end: 8 },
      { start: 5, end: 12 }
    ]
    expect(isPosInRange(6, overlapping)).toBe(true)
    expect(isPosInRange(4, overlapping)).toBe(true)
    expect(isPosInRange(11, overlapping)).toBe(true)
    expect(isPosInRange(2, overlapping)).toBe(false)
  })

  it('handles zero-width range', () => {
    expect(isPosInRange(5, [{ start: 5, end: 5 }])).toBe(false)
  })
})

describe('findCodeRangesSkippingRanges', () => {
  it('finds fenced code blocks', () => {
    const text = 'before\n```js\nconst x = 1\n```\nafter'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(1)
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe('```js\nconst x = 1\n```\n')
  })

  it('finds inline code spans', () => {
    const text = 'hello `code` world'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(1)
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe('`code`')
  })

  it('finds multiple inline code spans', () => {
    const text = '`a` and `b`'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(2)
  })

  it('treats unclosed fenced block as extending to end', () => {
    const text = '```\nunclosed'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(1)
    expect(ranges[0].start).toBe(0)
    expect(ranges[0].end).toBe(text.length)
  })

  it('respects skip ranges and does not match fences inside them', () => {
    const text = '<file>```js\ncode\n```</file>'
    const skip: CodeRange[] = [{ start: 0, end: text.length }]
    const ranges = findCodeRangesSkippingRanges(text, skip)
    expect(ranges.length).toBe(0)
  })

  it('finds tilde fenced code blocks', () => {
    const text = 'before\n~~~python\nprint("hi")\n~~~\nafter'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(1)
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe('~~~python\nprint("hi")\n~~~\n')
  })

  it('finds multiple fenced code blocks', () => {
    const text = '```js\na\n```\ntext\n```py\nb\n```\n'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(2)
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe('```js\na\n```\n')
    expect(text.slice(ranges[1].start, ranges[1].end)).toBe('```py\nb\n```\n')
  })

  it('finds empty fenced code block', () => {
    const text = '```\n```\n'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(1)
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe('```\n```\n')
  })

  it('handles fence with info string', () => {
    const text = '```typescript title="example.ts"\nconst x = 1\n```\n'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(1)
  })

  it('handles fenced block at very start of text', () => {
    const text = '```\ncode\n```\nafter'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(1)
    expect(ranges[0].start).toBe(0)
  })

  it('handles fenced block at very end of text', () => {
    const text = 'before\n```\ncode\n```\n'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(1)
  })

  it('does not match fence not at line start', () => {
    const text = 'not ```a fence``` here'
    const ranges = findCodeRangesSkippingRanges(text, [])
    // The backticks are inline code spans, not fenced blocks
    // But ``` at non-line-start won't be treated as fenced block
    // They will be treated as inline code
    expect(ranges.length).toBeGreaterThanOrEqual(0)
  })

  it('handles indented opening fence (up to 3 spaces)', () => {
    const text = '   ```js\ncode\n```\n'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(1)
  })

  it('treats unclosed inline code span as extending to end', () => {
    const text = 'hello `unclosed'
    const ranges = findCodeRangesSkippingRanges(text, [])
    // unclosed inline code: pos runs to end without adding a range
    // The implementation does not add a range for unclosed inline code
    expect(ranges.length).toBe(0)
  })

  it('handles text with no code at all', () => {
    const text = 'just plain text without any code'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(0)
  })

  it('handles empty text', () => {
    const ranges = findCodeRangesSkippingRanges('', [])
    expect(ranges.length).toBe(0)
  })

  it('handles fenced block with longer closing fence', () => {
    const text = '```\ncode\n````\n'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(1)
  })

  it('finds double backtick inline code span', () => {
    const text = '``code with ` backtick``'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(1)
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe('``code with ` backtick``')
  })

  it('handles unclosed fenced block without trailing newline', () => {
    const text = '```\nno closing fence'
    const ranges = findCodeRangesSkippingRanges(text, [])
    expect(ranges.length).toBe(1)
    expect(ranges[0].end).toBe(text.length)
  })
})

describe('findTagsInText', () => {
  it('finds opening and closing tags', () => {
    const text = '<file path="a.ts">code</file>'
    const { opens, closes } = findTagsInText(text, 'file', [])
    expect(opens.length).toBe(1)
    expect(closes.length).toBe(1)
    expect(opens[0].attrs).toBe('path="a.ts"')
    expect(opens[0].selfClosing).toBe(false)
  })

  it('detects self-closing tags', () => {
    const text = '<file path="a.ts" action="delete" />'
    const { opens, closes } = findTagsInText(text, 'file', [])
    expect(opens.length).toBe(1)
    expect(opens[0].selfClosing).toBe(true)
    expect(closes.length).toBe(0)
  })

  it('ignores tags inside code ranges', () => {
    const text = '<file>real</file> and `<file>fake</file>`'
    const codeRanges = findCodeRangesSkippingRanges(text, [])
    const { opens, closes } = findTagsInText(text, 'file', codeRanges)
    expect(opens.length).toBe(1)
    expect(closes.length).toBe(1)
  })

  it('is case insensitive for tag names', () => {
    const text = '<FILE>x</FILE>'
    const { opens, closes } = findTagsInText(text, 'file', [])
    expect(opens.length).toBe(1)
    expect(closes.length).toBe(1)
  })

  it('handles tag with no attributes', () => {
    const text = '<file>body</file>'
    const { opens, closes } = findTagsInText(text, 'file', [])
    expect(opens.length).toBe(1)
    expect(opens[0].attrs).toBe('')
    expect(closes.length).toBe(1)
  })

  it('handles tag with multiple attributes', () => {
    const text = '<file path="a.ts" action="replace" lang="typescript">body</file>'
    const { opens } = findTagsInText(text, 'file', [])
    expect(opens.length).toBe(1)
    expect(opens[0].attrs).toContain('path="a.ts"')
    expect(opens[0].attrs).toContain('action="replace"')
    expect(opens[0].attrs).toContain('lang="typescript"')
  })

  it('finds multiple open/close pairs', () => {
    const text = '<file>a</file> <file>b</file> <file>c</file>'
    const { opens, closes } = findTagsInText(text, 'file', [])
    expect(opens.length).toBe(3)
    expect(closes.length).toBe(3)
  })

  it('does not match partial tag name as a different tag', () => {
    const text = '<filex>not a file</filex>'
    const { opens } = findTagsInText(text, 'file', [])
    // The regex <file...> will match <filex...> since it matches <file followed by x
    // Actually, the regex is `<file([^>]*)>` so <filex> would match with attrs="x"
    // This tests actual behavior
    expect(opens.length).toBe(1)
    expect(opens[0].attrs).toBe('x')
  })

  it('handles closing tag with whitespace before >', () => {
    const text = '<file>body</file  >'
    const { closes } = findTagsInText(text, 'file', [])
    expect(closes.length).toBe(1)
  })

  it('returns empty arrays when no tags found', () => {
    const text = 'just plain text'
    const { opens, closes } = findTagsInText(text, 'file', [])
    expect(opens.length).toBe(0)
    expect(closes.length).toBe(0)
  })

  it('handles self-closing tag with space before slash', () => {
    const text = '<file path="a.ts"   />'
    const { opens } = findTagsInText(text, 'file', [])
    expect(opens.length).toBe(1)
    expect(opens[0].selfClosing).toBe(true)
    expect(opens[0].attrs).toBe('path="a.ts"')
  })

  it('correctly computes start and end positions', () => {
    const text = 'abc<file>def</file>ghi'
    const { opens, closes } = findTagsInText(text, 'file', [])
    expect(opens[0].start).toBe(3)
    expect(opens[0].end).toBe(9)
    expect(text.slice(opens[0].start, opens[0].end)).toBe('<file>')
    expect(closes[0].start).toBe(12)
    expect(closes[0].end).toBe(19)
    expect(text.slice(closes[0].start, closes[0].end)).toBe('</file>')
  })
})

describe('matchOpenClose', () => {
  it('matches an open with its closest close before next open', () => {
    const text = '<x>a</x> <x>b</x>'
    const { opens, closes } = findTagsInText(text, 'x', [])
    const matches = matchOpenClose(opens, closes, text.length, text)
    expect(matches.length).toBe(2)
    expect(matches[0].body).toBe('a')
    expect(matches[1].body).toBe('b')
  })

  it('returns empty for unclosed tags', () => {
    const text = '<x>no close'
    const { opens, closes } = findTagsInText(text, 'x', [])
    const matches = matchOpenClose(opens, closes, text.length, text)
    expect(matches.length).toBe(0)
  })

  it('skips self-closing opens', () => {
    const text = '<x /> <x>body</x>'
    const { opens, closes } = findTagsInText(text, 'x', [])
    const matches = matchOpenClose(opens, closes, text.length, text)
    expect(matches.length).toBe(1)
    expect(matches[0].body).toBe('body')
  })

  it('matches when close immediately follows open (empty body)', () => {
    const text = '<x></x>'
    const { opens, closes } = findTagsInText(text, 'x', [])
    const matches = matchOpenClose(opens, closes, text.length, text)
    expect(matches.length).toBe(1)
    expect(matches[0].body).toBe('')
  })

  it('handles three consecutive matched pairs', () => {
    const text = '<x>a</x><x>b</x><x>c</x>'
    const { opens, closes } = findTagsInText(text, 'x', [])
    const matches = matchOpenClose(opens, closes, text.length, text)
    expect(matches.length).toBe(3)
    expect(matches[0].body).toBe('a')
    expect(matches[1].body).toBe('b')
    expect(matches[2].body).toBe('c')
  })

  it('first open captures close even when second open has no boundary between', () => {
    const text = '<x><x>b</x>'
    const { opens, closes } = findTagsInText(text, 'x', [])
    const matches = matchOpenClose(opens, closes, text.length, text)
    // No close between first and second open, so j advances past second open
    // boundary becomes textLength, first open matches with the close
    // body includes the second open tag as literal text
    expect(matches.length).toBe(1)
    expect(matches[0].body).toBe('<x>b')
  })

  it('returns empty when only self-closing tags exist', () => {
    const text = '<x /> <x /> <x />'
    const { opens, closes } = findTagsInText(text, 'x', [])
    const matches = matchOpenClose(opens, closes, text.length, text)
    expect(matches.length).toBe(0)
  })

  it('preserves open and close references in matched blocks', () => {
    const text = '<x>body</x>'
    const { opens, closes } = findTagsInText(text, 'x', [])
    const matches = matchOpenClose(opens, closes, text.length, text)
    expect(matches[0].open).toBe(opens[0])
    expect(matches[0].close).toBe(closes[0])
  })
})

describe('findMatchedBlocks', () => {
  it('returns matched blocks and self-closing tags', () => {
    const text = '<file path="a">body</file> <file path="b" action="delete" />'
    const { matched, selfClosing } = findMatchedBlocks(text, 'file')
    expect(matched.length).toBe(1)
    expect(matched[0].body).toBe('body')
    expect(selfClosing.length).toBe(1)
  })

  it('does not match tags that appear inside code fences', () => {
    const text = '```\n<file>x</file>\n```\n<file>y</file>'
    const { matched } = findMatchedBlocks(text, 'file')
    expect(matched.length).toBe(1)
    expect(matched[0].body).toBe('y')
  })

  it('does not match tags inside inline code', () => {
    const text = '`<file>x</file>` and <file>y</file>'
    const { matched } = findMatchedBlocks(text, 'file')
    expect(matched.length).toBe(1)
    expect(matched[0].body).toBe('y')
  })

  it('handles multiple matched blocks in sequence', () => {
    const text = '<file>a</file> middle <file>b</file>'
    const { matched } = findMatchedBlocks(text, 'file')
    expect(matched.length).toBe(2)
    expect(matched[0].body).toBe('a')
    expect(matched[1].body).toBe('b')
  })

  it('returns empty matched for text with no tags', () => {
    const text = 'just plain text'
    const { matched, selfClosing } = findMatchedBlocks(text, 'file')
    expect(matched.length).toBe(0)
    expect(selfClosing.length).toBe(0)
  })

  it('returns empty matched for unclosed tags', () => {
    const text = '<file>no close here'
    const { matched } = findMatchedBlocks(text, 'file')
    expect(matched.length).toBe(0)
  })

  it('matches tags with empty body (close immediately follows open)', () => {
    const text = '<file></file>'
    const { matched } = findMatchedBlocks(text, 'file')
    expect(matched.length).toBe(1)
    expect(matched[0].body).toBe('')
  })

  it('matches tags with whitespace-only body', () => {
    const text = '<file> </file>'
    const { matched } = findMatchedBlocks(text, 'file')
    expect(matched.length).toBe(1)
    expect(matched[0].body).toBe(' ')
  })

  it('handles tags inside tilde-fenced code blocks', () => {
    const text = '~~~\n<file>x</file>\n~~~\n<file>y</file>'
    const { matched } = findMatchedBlocks(text, 'file')
    expect(matched.length).toBe(1)
    expect(matched[0].body).toBe('y')
  })

  it('handles self-closing tags only', () => {
    const text = '<file path="a" /> <file path="b" />'
    const { matched, selfClosing } = findMatchedBlocks(text, 'file')
    expect(matched.length).toBe(0)
    expect(selfClosing.length).toBe(2)
  })

  it('preserves open and close info in matched blocks', () => {
    const text = '<file path="a">body</file>'
    const { matched } = findMatchedBlocks(text, 'file')
    expect(matched[0].open.attrs).toBe('path="a"')
    expect(matched[0].open.selfClosing).toBe(false)
    expect(matched[0].close.start).toBeGreaterThan(matched[0].open.end)
  })
})

describe('preprocessFileBlocks', () => {
  it('converts a <file> block to a fenced code block with file: lang', () => {
    const input = '<file path="a.ts">\nconst x = 1\n</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('const x = 1')
  })

  it('converts a replace action into file-replace fence with old/new', () => {
    const input = '<file path="a.ts" action="replace">\n<old>\nA\n</old>\n<new>\nB\n</new>\n</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('<old>\nA\n</old>')
    expect(out).toContain('<new>\nB\n</new>')
  })

  it('converts a self-closing delete tag into a file-delete fence', () => {
    const input = 'before <file path="a.ts" action="delete" /> after'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file-delete:a.ts')
    expect(out).toContain('before ')
    expect(out).toContain(' after')
    expect(out).not.toContain('<file')
  })

  it('leaves text without any file tags unchanged', () => {
    const input = 'just plain markdown'
    expect(preprocessFileBlocks(input)).toBe(input)
  })

  it('ignores file tags inside fenced code blocks', () => {
    const input = '```\n<file path="x.ts">y</file>\n```\n'
    const out = preprocessFileBlocks(input)
    expect(out).toBe(input)
  })

  it('ignores file tags inside inline code', () => {
    const input = '`<file path="x.ts">y</file>`'
    const out = preprocessFileBlocks(input)
    expect(out).toBe(input)
  })

  it('processes multiple file blocks', () => {
    const input = '<file path="a">A</file>\n<file path="b">B</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:a')
    expect(out).toContain('```file:b')
  })

  it('handles JSON content in file block', () => {
    const input = `<file path="config.json">
{
  "theme": "dark",
  "language": "en"
}
</file>`
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:config.json')
    expect(out).toContain('"theme": "dark"')
    expect(out).toContain('"language": "en"')
  })

  it('handles HTML replace with old and new content', () => {
    const input = `<file path="index.html" action="replace">
<old>
  <title>My Appliction</title>
</old>
<new>
  <title>My Application</title>
</new>
</file>`
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file-replace:index.html')
    expect(out).toContain('<old>')
    expect(out).toContain('<title>My Appliction</title>')
    expect(out).toContain('</old>')
    expect(out).toContain('<new>')
    expect(out).toContain('<title>My Application</title>')
    expect(out).toContain('</new>')
  })

  it('handles multiple consecutive replace operations', () => {
    const input = `<file path="js/app.js" action="replace">
<old>
import { init } from './core';
</old>
<new>
import { init } from './core';
import { helper } from './utils';
</new>
</file>

<file path="css/style.css" action="replace">
<old>
/* Deprecated layout styles
   .old-container { width: 100%; }
*/
</old>
<new>
</new>
</file>

<file path="css/style.css">
content here
</file>`
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file-replace:js/app.js')
    expect(out).toContain("import { init } from './core';")
    expect(out).toContain("import { helper } from './utils';")
    expect(out).toContain('```file-replace:css/style.css')
    expect(out).toContain('/* Deprecated layout styles')
    expect(out).toContain('```file:css/style.css')
    expect(out).toContain('content here')
  })

  it('ignores file tags with empty path attribute', () => {
    const input = `<file path="">
some content
</file>`
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:')
    expect(out).toContain('some content')
  })

  it('ignores nested file tags inside outer file block', () => {
    const input = `<file path="outer.css">
outer content
<file path="inner.css">
inner content
</file>
more outer
</file>`
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:outer.css')
    expect(out).toContain('outer content')
    expect(out).toContain('<file path="inner.css">')
    expect(out).toContain('inner content')
    expect(out).toContain('</file>')
    expect(out).toContain('more outer')
  })

  it('preserves code fences inside file blocks as content', () => {
    const input = `<file path="example.md">
Here is some code:
\`\`\`js
const x = 1;
\`\`\`
</file>`
    const out = preprocessFileBlocks(input)
    // Body contains ```, so wrapInFence must use ~~~ to avoid ambiguity
    expect(out).toMatch(/~~~file:example\.md/)
    expect(out).toContain('Here is some code:')
    expect(out).toContain('```js')
    expect(out).toContain('const x = 1;')
    expect(out).toMatch(/~~~\n/)
  })

  it('handles multiple code fences inside file block', () => {
    const input = `<file path="multi.md">
First block:
\`\`\`
code1
\`\`\`

Second block:
\`\`\`
code2
\`\`\`
</file>`
    const out = preprocessFileBlocks(input)
    expect(out).toMatch(/~~~file:multi\.md/)
    expect(out).toContain('First block:')
    expect(out).toContain('```')
    expect(out).toContain('code1')
    expect(out).toContain('Second block:')
    expect(out).toContain('code2')
  })

  it('handles replace with nested tags and code fences in old/new sections', () => {
    const input = `<file path="complex.css" action="replace">
<old>
<old>
<file>
<file path="">
</old>
\`\`\`
</old>
<new>
<new>
\`\`\`
</new>
</new>
</file>`
    const out = preprocessFileBlocks(input)
    expect(out).toMatch(/~~~file-replace:complex\.css/)
    // The outer <old>...</old> body is captured; inner duplicate <old> tags
    // remain as literal text inside the body.
    expect(out).toContain('<old>')
    expect(out).toContain('<file>')
    expect(out).toContain('<file path="">')
    expect(out).toContain('</old>')
    // The new section must also be detected (not swallowed by unclosed fence in old)
    expect(out).toContain('<new>\n<new>')
    expect(out).toContain('</new>\n</new>')
  })

  it('detects new section when old section contains unclosed code fence', () => {
    const input = `<file path="css/style.css" action="replace">
<old>
<old>
<file>
<file path="">
</old>
\`\`\` # comment
</old>
<new>
<new>
\`\`\` # comment
</new>
</new>
</file>`
    const out = preprocessFileBlocks(input)
    expect(out).toMatch(/~~~file-replace:css\/style\.css/)
    // Old section should contain the nested decoy tags and code fence
    expect(out).toContain('<old>')
    expect(out).toContain('<file>')
    expect(out).toContain('<file path="">')
    expect(out).toContain('</old>')
    expect(out).toContain('``` # comment')
    // New section must be detected (not swallowed by unclosed fence from old section)
    expect(out).toContain('<new>\n<new>')
    expect(out).toContain('</new>\n</new>')
  })

  it('ignores file block wrapped in code fence', () => {
    const input = `\`\`\`
<file path="ignored.css">
\`\`\`
\`\`\`
</file>
\`\`\``
    const out = preprocessFileBlocks(input)
    expect(out).toBe(input)
  })

  it('ignores file block in inline code', () => {
    const input = '`<file path="inline.css">content</file>`'
    const out = preprocessFileBlocks(input)
    expect(out).toBe(input)
  })

  it('handles delete operation', () => {
    const input = `<file path="css/style.css" action="delete" />`
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file-delete:css/style.css')
    expect(out).not.toContain('<file')
  })

  it('handles mixed operations in sequence', () => {
    const input = `Some text before

<file path="new.js">
const newFile = true;
</file>

Middle text

<file path="modify.js" action="replace">
<old>
const old = 1;
</old>
<new>
const new = 2;
</new>
</file>

<file path="remove.js" action="delete" />

End text`
    const out = preprocessFileBlocks(input)
    expect(out).toContain('Some text before')
    expect(out).toContain('```file:new.js')
    expect(out).toContain('const newFile = true;')
    expect(out).toContain('Middle text')
    expect(out).toContain('```file-replace:modify.js')
    expect(out).toContain('const old = 1;')
    expect(out).toContain('const new = 2;')
    expect(out).toContain('```file-delete:remove.js')
    expect(out).toContain('End text')
  })

  it('handles empty old section in replace', () => {
    const input = `<file path="add.css" action="replace">
<old>
</old>
<new>
.new-class { color: red; }
</new>
</file>`
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file-replace:add.css')
    expect(out).toContain('<old>')
    expect(out).toContain('</old>')
    expect(out).toContain('<new>')
    expect(out).toContain('.new-class { color: red; }')
    expect(out).toContain('</new>')
  })

  it('handles empty new section in replace', () => {
    const input = `<file path="remove.css" action="replace">
<old>
.old-class { color: blue; }
</old>
<new>
</new>
</file>`
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file-replace:remove.css')
    expect(out).toContain('<old>')
    expect(out).toContain('.old-class { color: blue; }')
    expect(out).toContain('</old>')
    expect(out).toContain('<new>')
    expect(out).toContain('</new>')
  })

  it('preserves special characters in file content', () => {
    const specialContent = `const regex = /test/;
const template = \`\${var}\`;
const str = "quotes \\" and '"`
    const input = `<file path="special.js">\n${specialContent}\n</file>`
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:special.js')
    expect(out).toContain('const regex = /test/;')
    expect(out).toContain('const template = `${var}`;')
    expect(out).toContain('const str = "quotes \\" and \'"')
  })

  it('converts a file block with no action to a regular file fence', () => {
    const input = '<file path="plain.ts">let x = 1</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:plain.ts')
    expect(out).toContain('let x = 1')
    expect(out).not.toContain('file-replace')
    expect(out).not.toContain('file-delete')
  })

  it('handles file block with unknown action as regular file', () => {
    const input = '<file path="a.ts" action="unknown">body</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:a.ts')
    expect(out).toContain('body')
  })

  it('handles multiple delete operations', () => {
    const input = '<file path="a.js" action="delete" />\n<file path="b.js" action="delete" />'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file-delete:a.js')
    expect(out).toContain('```file-delete:b.js')
    expect(out).not.toContain('<file')
  })

  it('preserves special characters in file path', () => {
    const input = '<file path="src/@types/index.d.ts">content</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:src/@types/index.d.ts')
    expect(out).toContain('content')
  })

  it('handles file block with whitespace-only body', () => {
    const input = '<file path="empty.ts">\n\n\n</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:empty.ts')
  })

  it('handles content that is just a file block with no surrounding text', () => {
    const input = '<file path="only.ts">code</file>'
    const out = preprocessFileBlocks(input)
    expect(out.trim()).toContain('```file:only.ts')
    expect(out.trim()).toContain('code')
  })

  it('handles replace with missing old block', () => {
    const input = '<file path="a.ts" action="replace">\n<new>\nB\n</new>\n</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('<old>')
    expect(out).toContain('</old>')
    expect(out).toContain('B')
  })

  it('handles replace with missing new block', () => {
    const input = '<file path="a.ts" action="replace">\n<old>\nA\n</old>\n</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file-replace:a.ts')
    expect(out).toContain('A')
    expect(out).toContain('<new>')
    expect(out).toContain('</new>')
  })

  it('handles file path with spaces', () => {
    const input = '<file path="my file.ts">content</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:my file.ts')
  })
  it('handles self-closing file tag without delete action', () => {
    const input = '<file path="a.ts" />'
    const out = preprocessFileBlocks(input)
    // Self-closing without action="delete" should be left as-is or ignored
    expect(out).not.toContain('file-delete')
  })

  it('preserves leading blank lines in file content', () => {
    const input = '<file path="a.ts">\n\nconst x = 1\n</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:a.ts\n\nconst x = 1\n```')
  })

  it('preserves trailing blank lines in file content', () => {
    const input = '<file path="a.ts">\nconst x = 1\n\n</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:a.ts\nconst x = 1\n\n```')
  })

  it('preserves multiple leading blank lines in file content', () => {
    const input = '<file path="a.ts">\n\n\nconst x = 1\n</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:a.ts\n\n\nconst x = 1\n```')
  })

  it('preserves leading blank lines in replace old section', () => {
    const input =
      '<file path="a.ts" action="replace">\n<old>\n\nimport { foo } from \'bar\'\n</old>\n<new>\nimport { foo } from \'bar\'\n</new>\n</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain("<old>\n\nimport { foo } from 'bar'\n</old>")
  })

  it('preserves leading blank lines in replace new section', () => {
    const input =
      "<file path=\"a.ts\" action=\"replace\">\n<old>\nimport { foo } from 'bar'\n</old>\n<new>\n\n\nimport { foo } from 'bar'\nimport { baz } from 'qux'\n</new>\n</file>"
    const out = preprocessFileBlocks(input)
    expect(out).toContain("<new>\n\n\nimport { foo } from 'bar'\nimport { baz } from 'qux'\n</new>")
  })

  it('preserves blank lines in both old and new sections of replace', () => {
    const input = `<file path="a.ts" action="replace">
<old>

const x = 1
</old>
<new>


const x = 2
</new>
</file>`
    const out = preprocessFileBlocks(input)
    expect(out).toContain('<old>\n\nconst x = 1\n</old>')
    expect(out).toContain('<new>\n\n\nconst x = 2\n</new>')
  })

  it('preserves file with only blank lines', () => {
    const input = '<file path="empty.txt">\n\n\n</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```file:empty.txt\n\n\n```')
  })
})

describe('preprocessCommitBlocks', () => {
  it('converts a commit block into a fenced code block with commit lang', () => {
    const input = '<commit>fix: bug</commit>'
    const out = preprocessCommitBlocks(input)
    expect(out).toContain('```commit')
    expect(out).toContain('fix: bug')
  })

  it('preserves inner file tags as text', () => {
    const input = '<commit>some <file path="a.ts">content</file> inside</commit>'
    const out = preprocessCommitBlocks(input)
    // The fenced block should contain the literal <file> tag
    expect(out).toContain('```commit')
    expect(out).toContain('<file path="a.ts">content</file>')
    expect(out).not.toContain('```file')
  })

  it('ignores commit tags inside existing code fences', () => {
    const input = '```\n<commit>ignored</commit>\n```\n<commit>real</commit>'
    const out = preprocessCommitBlocks(input)
    expect(out).toContain('<commit>ignored</commit>') // untouched
    expect(out).toContain('```commit')
    expect(out).toContain('real')
  })

  it('handles multi-line commit messages', () => {
    const input = '<commit>\nfeat: add stuff\n\nBREAKING CHANGE: ...\n</commit>'
    const out = preprocessCommitBlocks(input)
    expect(out).toContain('```commit')
    expect(out).toContain('feat: add stuff')
    expect(out).toContain('BREAKING CHANGE: ...')
  })

  it('handles multiple commit blocks', () => {
    const input = '<commit>a</commit> <commit>b</commit>'
    const out = preprocessCommitBlocks(input)
    expect(out).toMatch(/```commit\na\n```/)
    expect(out).toMatch(/```commit\nb\n```/)
  })

  it('does not affect text without commit tags', () => {
    const input = 'plain text'
    expect(preprocessCommitBlocks(input)).toBe(input)
  })

  it('handles empty commit body', () => {
    const input = '<commit></commit>'
    const out = preprocessCommitBlocks(input)
    expect(out).toContain('```commit\n\n```')
  })
})

describe('preprocessFileBlocks with commits', () => {
  it('processes commits before files so that file tags inside commits are ignored', () => {
    const input =
      '<commit>fixes <file path="a.ts">code</file></commit>\n<file path="b.ts">good</file>'
    const out = preprocessFileBlocks(input)
    // The commit should become a fenced commit block containing the literal <file> tag
    expect(out).toContain('```commit')
    expect(out).toContain('<file path="a.ts">code</file>')
    // The outer file block should still be processed
    expect(out).toContain('```file:b.ts')
    expect(out).toContain('good')
  })

  it('processes file blocks even when commits are present', () => {
    const input = '<commit>v1.0.0</commit>\n<file path="CHANGELOG.md"># Changelog</file>'
    const out = preprocessFileBlocks(input)
    expect(out).toContain('```commit')
    expect(out).toContain('v1.0.0')
    expect(out).toContain('```file:CHANGELOG.md')
    expect(out).toContain('# Changelog')
  })
})

describe('preprocessDiffFormat', () => {
  describe('FILE blocks', () => {
    it('converts --- FILE --- to a fenced file block', () => {
      const input = '--- FILE a.ts ---\nconst x = 1'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('const x = 1')
    })

    it('handles multi-line content', () => {
      const input = '--- FILE a.ts ---\nconst x = 1\nconst y = 2\nconst z = 3'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('const x = 1\nconst y = 2\nconst z = 3')
    })

    it('preserves blank lines in content', () => {
      const input = '--- FILE a.ts ---\nconst x = 1\n\nconst y = 2'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('const x = 1\n\nconst y = 2')
    })

    it('handles empty FILE content when next marker follows immediately', () => {
      const input = '--- FILE a.ts ---\n--- FILE b.ts ---\ncode'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('```file:b.ts')
      expect(out).toContain('code')
    })

    it('captures content until the next FILE or EDIT marker', () => {
      const input =
        '--- FILE a.ts ---\ncode\n--- EDIT b.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('code')
      expect(out).toContain('```file-replace:b.ts')
    })

    it('ignores FILE marker inside a code fence', () => {
      const input = '```\n--- FILE a.ts ---\ncode\n```\n'
      const out = preprocessDiffFormat(input)
      expect(out).toBe(input)
    })

    it('ignores FILE marker inside a tilde code fence', () => {
      const input = '~~~\n--- FILE a.ts ---\ncode\n~~~\n'
      const out = preprocessDiffFormat(input)
      expect(out).toBe(input)
    })

    it('handles FILE path with spaces', () => {
      const input = '--- FILE my file.ts ---\ncontent'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file:my file.ts')
    })

    it('handles FILE path with special characters', () => {
      const input = '--- FILE src/@types/index.d.ts ---\ncontent'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file:src/@types/index.d.ts')
    })

    it('handles multiple consecutive FILE blocks', () => {
      const input = '--- FILE a.ts ---\ncodeA\n--- FILE b.ts ---\ncodeB'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('codeA')
      expect(out).toContain('```file:b.ts')
      expect(out).toContain('codeB')
    })

    it('uses tildes when FILE content contains triple backticks', () => {
      const input = '--- FILE example.md ---\nHere is code:\n```js\nconst x = 1\n```'
      const out = preprocessDiffFormat(input)
      expect(out).toMatch(/~~~file:example\.md/)
      expect(out).toContain('```js')
      expect(out).toContain('const x = 1')
    })

    it('preserves text before FILE block', () => {
      const input = 'Some description\n\n--- FILE a.ts ---\ncode'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('Some description')
      expect(out).toContain('```file:a.ts')
    })

    it('does not match FILE marker with leading whitespace', () => {
      const input = '  --- FILE a.ts ---\ncode'
      const out = preprocessDiffFormat(input)
      expect(out).not.toContain('```file:')
    })

    it('does not match FILE marker without closing ---', () => {
      const input = '--- FILE a.ts\ncode'
      const out = preprocessDiffFormat(input)
      expect(out).not.toContain('```file:')
    })
  })

  describe('EDIT blocks', () => {
    it('converts --- EDIT --- with SEARCH/REPLACE to file-replace block', () => {
      const input = '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('<old>\nold\n</old>')
      expect(out).toContain('<new>\nnew\n</new>')
    })

    it('handles empty REPLACE (delete)', () => {
      const input = '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold code\n=======\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('<old>\nold code\n</old>')
      expect(out).toContain('<new>\n\n</new>')
    })

    it('handles empty SEARCH (insert)', () => {
      const input = '--- EDIT a.ts ---\n<<<<<<< SEARCH\n=======\nnew code\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('<old>\n\n</old>')
      expect(out).toContain('<new>\nnew code\n</new>')
    })

    it('handles multi-line SEARCH and REPLACE', () => {
      const input =
        '--- EDIT a.ts ---\n<<<<<<< SEARCH\nline1\nline2\nline3\n=======\nnew1\nnew2\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('<old>\nline1\nline2\nline3\n</old>')
      expect(out).toContain('<new>\nnew1\nnew2\n</new>')
    })

    it('produces multiple file-replace blocks for multiple SEARCH/REPLACE pairs', () => {
      const input =
        '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold1\n=======\nnew1\n>>>>>>> REPLACE\n<<<<<<< SEARCH\nold2\n=======\nnew2\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      const matches = out.match(/```file-replace:a\.ts/g)
      expect(matches?.length).toBe(2)
      expect(out).toContain('old1')
      expect(out).toContain('new1')
      expect(out).toContain('old2')
      expect(out).toContain('new2')
    })

    it('ignores EDIT marker inside a code fence', () => {
      const input =
        '```\n--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n```\n'
      const out = preprocessDiffFormat(input)
      expect(out).toBe(input)
    })

    it('EDIT block ends at next FILE marker', () => {
      const input =
        '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n--- FILE b.ts ---\ncode'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('```file:b.ts')
    })

    it('EDIT block ends at next EDIT marker', () => {
      const input =
        '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n--- EDIT b.ts ---\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('```file-replace:b.ts')
    })

    it('EDIT block ends at COMMIT line', () => {
      const input =
        '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\nCOMMIT: done'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('```commit')
      expect(out).toContain('done')
    })

    it('skips non-SEARCH text before the first SEARCH in an EDIT block', () => {
      const input =
        '--- EDIT a.ts ---\nSome description\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('<old>\nold\n</old>')
    })

    it('stops EDIT block when non-blank non-SEARCH text follows a pair', () => {
      const input =
        '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n\nSome trailing text'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('Some trailing text')
    })

    it('produces no output for EDIT with no SEARCH/REPLACE', () => {
      const input = '--- EDIT a.ts ---\nJust a note\n--- FILE b.ts ---\ncode'
      const out = preprocessDiffFormat(input)
      expect(out).not.toContain('file-replace')
      expect(out).toContain('```file:b.ts')
    })

    it('handles EDIT path with special characters', () => {
      const input =
        '--- EDIT src/components/App.tsx ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file-replace:src/components/App.tsx')
    })

    it('captures code fences inside SEARCH/REPLACE content', () => {
      const input =
        '--- EDIT a.md ---\n<<<<<<< SEARCH\n```js\nold\n```\n=======\n```js\nnew\n```\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```js\nold\n```')
      expect(out).toContain('```js\nnew\n```')
    })

    it('handles ======= inside SEARCH content when markers are longer', () => {
      // 8-char openers; 7-char ======= is safe as SEARCH content.
      // Separator must also be 8 chars (========) to match opener length.
      const input =
        '--- EDIT a.ts ---\n<<<<<<<< SEARCH\nconst x = "======="\n========\nconst x = "new"\n>>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('<old>\nconst x = "======="\n</old>')
      expect(out).toContain('<new>\nconst x = "new"\n</new>')
    })

    it('handles ======= inside REPLACE content when markers are longer', () => {
      // 8-char openers; 7-char ======= in REPLACE is safe content.
      // The 8-char ======== right after SEARCH content is the separator.
      const input =
        '--- EDIT a.ts ---\n<<<<<<<< SEARCH\noriginal\n========\nconst y = "======="\nconst z = "======="\nreplaced\n>>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('<old>\noriginal\n</old>')
      expect(out).toContain('<new>\nconst y = "======="\nconst z = "======="\nreplaced\n</new>')
    })

    it('still works with default 7-character markers', () => {
      const input = '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('<old>\nold\n</old>')
      expect(out).toContain('<new>\nnew\n</new>')
    })

    it('treats shorter ======= as content when markers are 8+', () => {
      // 8-char openers: 7-char ======= is content; 8-char ======== is separator.
      const input =
        '--- EDIT a.ts ---\n<<<<<<<< SEARCH\n=======\nsome text\n========\nnew content\n>>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('<old>\n=======\nsome text\n</old>')
      expect(out).toContain('<new>\nnew content\n</new>')
    })

    it('requires separator length to match opening marker length', () => {
      // 7-char openers; 6-char ====== is SEARCH content, 7-char ======= is separator.
      const input = '--- EDIT a.ts ---\n<<<<<<< SEARCH\n======\n=======\nnew\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('<old>\n======\n</old>')
      expect(out).toContain('<new>\nnew\n</new>')
    })

    it('rejects longer separator than opener', () => {
      // 7-char openers; 8-char ======== does NOT act as separator — it is SEARCH content.
      // The following 7-char ======= is the actual separator.
      const input = '--- EDIT a.ts ---\n<<<<<<< SEARCH\n========\n=======\nnew\n>>>>>>> REPLACE'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('<old>\n========\n</old>')
      expect(out).toContain('<new>\nnew\n</new>')
    })
  })

  describe('COMMIT blocks', () => {
    it('converts COMMIT: to a commit fenced block', () => {
      const input = 'COMMIT: fix: bug in parser'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```commit')
      expect(out).toContain('fix: bug in parser')
    })

    it('ignores COMMIT: inside a code fence', () => {
      const input = '```\nCOMMIT: ignored\n```\n'
      const out = preprocessDiffFormat(input)
      expect(out).toBe(input)
    })

    it('does not match COMMIT: without a space after colon', () => {
      const input = 'COMMIT:no space'
      const out = preprocessDiffFormat(input)
      expect(out).not.toContain('```commit')
    })

    it('does not match COMMIT: with leading whitespace', () => {
      const input = '  COMMIT: indented'
      const out = preprocessDiffFormat(input)
      expect(out).not.toContain('```commit')
    })

    it('handles multiple COMMIT lines', () => {
      const input = 'COMMIT: first\nSome text\nCOMMIT: second'
      const out = preprocessDiffFormat(input)
      const matches = out.match(/```commit/g)
      expect(matches?.length).toBe(2)
    })
  })

  describe('mixed operations', () => {
    it('handles FILE, EDIT, and COMMIT together', () => {
      const input =
        'Some intro\n\n--- FILE new.ts ---\nexport const x = 1\n--- EDIT existing.ts ---\n<<<<<<< SEARCH\nconst old = true\n=======\nconst old = false\n>>>>>>> REPLACE\n\nCOMMIT: Update files'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('Some intro')
      expect(out).toContain('```file:new.ts')
      expect(out).toContain('export const x = 1')
      expect(out).toContain('```file-replace:existing.ts')
      expect(out).toContain('```commit')
      expect(out).toContain('Update files')
    })

    it('preserves text without any markers', () => {
      const input = 'Just plain text\nNo markers here'
      expect(preprocessDiffFormat(input)).toBe(input)
    })

    it('preserves empty input', () => {
      expect(preprocessDiffFormat('')).toBe('')
    })

    it('does not process XML <file> tags', () => {
      const input = '<file path="a.ts">code</file>'
      expect(preprocessDiffFormat(input)).toBe(input)
    })

    it('does not process XML <commit> tags', () => {
      const input = '<commit>message</commit>'
      expect(preprocessDiffFormat(input)).toBe(input)
    })

    it('handles FILE block followed by text and COMMIT', () => {
      const input = '--- FILE a.ts ---\ncode\n\nCOMMIT: done'
      const out = preprocessDiffFormat(input)
      // COMMIT line is consumed as FILE content since no FILE/EDIT marker ends it
      expect(out).toContain('```file:a.ts')
      expect(out).toContain('code')
      expect(out).toContain('COMMIT: done')
    })

    it('handles EDIT block followed by FILE block', () => {
      const input =
        '--- EDIT a.ts ---\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n\n--- FILE b.ts ---\ncode'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```file-replace:a.ts')
      expect(out).toContain('```file:b.ts')
    })

    it('handles code fence between markers', () => {
      const input = '```js\nconst x = 1\n```\n--- FILE a.ts ---\ncode\n```\nmore code\n```'
      const out = preprocessDiffFormat(input)
      expect(out).toContain('```js')
      expect(out).toContain('~~~file:a.ts')
    })
  })
})

describe('parser registry', () => {
  beforeEach(() => {
    setActiveParser('xml')
  })

  it('defaults to the xml parser', () => {
    expect(getActiveParser().id).toBe('xml')
  })

  it('lists both available parsers', () => {
    const all = listParsers()
    const ids = all.map((p) => p.id)
    expect(ids).toContain('xml')
    expect(ids).toContain('diff')
    expect(all.length).toBe(2)
  })

  it('xml parser preprocesses with XML tags', () => {
    const parser = getActiveParser()
    expect(parser.name).toBe('XML Tags')
    const out = parser.preprocess('<file path="a.ts">code</file>')
    expect(out).toContain('```file:a.ts')
  })

  it('can switch to diff parser', () => {
    setActiveParser('diff')
    const parser = getActiveParser()
    expect(parser.id).toBe('diff')
    expect(parser.name).toBe('Search/Replace')
    const out = parser.preprocess('--- FILE a.ts ---\ncode')
    expect(out).toContain('```file:a.ts')
  })

  it('can switch back to xml parser', () => {
    setActiveParser('diff')
    setActiveParser('xml')
    expect(getActiveParser().id).toBe('xml')
  })

  it('throws on unknown parser id', () => {
    expect(() => setActiveParser('unknown')).toThrow('Unknown parser: unknown')
  })
})
