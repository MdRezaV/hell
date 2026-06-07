import { describe, it, expect } from 'vitest'
import {
  normalizeBody,
  wrapInFence,
  isPosInRange,
  findCodeRangesSkippingRanges,
  findTagsInText,
  matchOpenClose,
  findMatchedBlocks,
  preprocessFileBlocks,
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
    expect(out).toContain('<new>')
    expect(out).toContain('</new>')
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
})
