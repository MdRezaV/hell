import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fsp } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtemp, rm } from 'fs/promises'
import ignore from 'ignore'
import {
  type FileNode,
  formatTreeText,
  type IgnoreRule,
  isBinaryFile,
  isEntryIgnored,
  loadIgnoreRules,
  mergeIgnoreRules,
  readDirTree
} from '../../../src/main/fsUtils'

describe('formatTreeText', () => {
  it('formats empty node list', () => {
    expect(formatTreeText([])).toBe('')
  })

  it('formats flat file list', () => {
    const nodes: FileNode[] = [
      { name: 'a.ts', path: '/x/a.ts', type: 'file' },
      { name: 'b.ts', path: '/x/b.ts', type: 'file' }
    ]
    const out = formatTreeText(nodes)
    expect(out).toBe('a.ts\nb.ts\n')
  })

  it('formats nested directories', () => {
    const nodes: FileNode[] = [
      {
        name: 'src',
        path: '/x/src',
        type: 'directory',
        children: [
          { name: 'index.ts', path: '/x/src/index.ts', type: 'file' },
          {
            name: 'utils',
            path: '/x/src/utils',
            type: 'directory',
            children: [{ name: 'a.ts', path: '/x/src/utils/a.ts', type: 'file' }]
          }
        ]
      }
    ]
    const out = formatTreeText(nodes)
    expect(out).toContain('src/')
    expect(out).toContain('  index.ts')
    expect(out).toContain('  utils/')
    expect(out).toContain('    a.ts')
  })

  it('does not recurse into empty directory children', () => {
    const nodes: FileNode[] = [{ name: 'empty', path: '/x/empty', type: 'directory', children: [] }]
    const out = formatTreeText(nodes)
    expect(out).toBe('empty/\n')
  })
})

describe('mergeIgnoreRules', () => {
  it('returns empty ignore when no rules', () => {
    const ig = mergeIgnoreRules([])
    expect(ig.ignores('foo.txt')).toBe(false)
  })

  it('merges patterns from multiple rules', () => {
    const rules: IgnoreRule[] = [
      { dir: '/a', ig: ignore().add('*.log'), patterns: '*.log' },
      { dir: '/b', ig: ignore().add('node_modules'), patterns: 'node_modules' }
    ]
    const ig = mergeIgnoreRules(rules)
    expect(ig.ignores('a.log')).toBe(true)
    expect(ig.ignores('node_modules')).toBe(true)
    expect(ig.ignores('src/index.ts')).toBe(false)
  })
})

describe('isEntryIgnored', () => {
  const baseDir = '/project'

  it('returns true for ignored file', () => {
    const ig = ignore().add('*.log')
    expect(isEntryIgnored('/project/debug.log', false, ig, baseDir)).toBe(true)
  })

  it('returns true for ignored directory (trailing slash)', () => {
    const ig = ignore().add('dist/')
    expect(isEntryIgnored('/project/dist', true, ig, baseDir)).toBe(true)
  })

  it('returns false for non-ignored entry', () => {
    const ig = ignore().add('*.log')
    expect(isEntryIgnored('/project/src/index.ts', false, ig, baseDir)).toBe(false)
  })

  it('returns false when path is outside baseDir', () => {
    const ig = ignore().add('*')
    expect(isEntryIgnored('/other/file.ts', false, ig, baseDir)).toBe(false)
  })

  it('returns false when relative path is empty', () => {
    const ig = ignore().add('*')
    expect(isEntryIgnored('/project', false, ig, baseDir)).toBe(false)
  })

  it('ignores nested file using forward-slash pattern', () => {
    const ig = ignore().add('src/secret.ts')
    expect(isEntryIgnored('/project/src/secret.ts', false, ig, baseDir)).toBe(true)
    expect(isEntryIgnored('/project/src/other.ts', false, ig, baseDir)).toBe(false)
  })
})

describe('filesystem-backed helpers', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'hell-fsutils-'))
  })

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  describe('isBinaryFile', () => {
    it('returns false for known text extension without reading file', async () => {
      const p = join(tmp, 'code.ts')
      // File contains null bytes but extension is whitelisted
      await fsp.writeFile(p, Buffer.from([0x00, 0x01, 0x61]))
      expect(await isBinaryFile(p)).toBe(false)
    })

    it('returns true when file contains null bytes and extension is unknown', async () => {
      const p = join(tmp, 'data.bin')
      await fsp.writeFile(p, Buffer.from([0x61, 0x62, 0x00, 0x63]))
      expect(await isBinaryFile(p)).toBe(true)
    })

    it('returns false for plain text content with unknown extension', async () => {
      const p = join(tmp, 'readme.unknownext')
      await fsp.writeFile(p, 'hello world\nno nulls here')
      expect(await isBinaryFile(p)).toBe(false)
    })

    it('returns false when file cannot be read', async () => {
      const p = join(tmp, 'does-not-exist.xyz')
      expect(await isBinaryFile(p)).toBe(false)
    })
  })

  describe('loadIgnoreRules', () => {
    it('adds .git pattern at root even without ignore files', async () => {
      const rules = await loadIgnoreRules(tmp, [], true)
      expect(rules).toHaveLength(1)
      expect(rules[0].patterns).toContain('.git')
      expect(rules[0].ig.ignores('.git')).toBe(true)
    })

    it('does not add .git pattern when not root', async () => {
      const rules = await loadIgnoreRules(tmp, [], false)
      expect(rules).toHaveLength(0)
    })

    it('reads .gitignore content', async () => {
      await fsp.writeFile(join(tmp, '.gitignore'), 'node_modules\n*.log')
      const rules = await loadIgnoreRules(tmp, [], false)
      expect(rules).toHaveLength(1)
      expect(rules[0].ig.ignores('node_modules')).toBe(true)
      expect(rules[0].ig.ignores('debug.log')).toBe(true)
    })

    it('reads .hellignore content', async () => {
      await fsp.writeFile(join(tmp, '.hellignore'), 'secret/')
      const rules = await loadIgnoreRules(tmp, [], false)
      expect(rules).toHaveLength(1)
      expect(rules[0].ig.ignores('secret/')).toBe(true)
    })

    it('combines .gitignore and .hellignore into one rule', async () => {
      await fsp.writeFile(join(tmp, '.gitignore'), '*.log')
      await fsp.writeFile(join(tmp, '.hellignore'), '*.tmp')
      const rules = await loadIgnoreRules(tmp, [], false)
      expect(rules).toHaveLength(1)
      expect(rules[0].ig.ignores('a.log')).toBe(true)
      expect(rules[0].ig.ignores('b.tmp')).toBe(true)
    })

    it('preserves parent rules', async () => {
      const parent: IgnoreRule[] = [
        { dir: '/parent', ig: ignore().add('*.bak'), patterns: '*.bak' }
      ]
      const rules = await loadIgnoreRules(tmp, parent, false)
      expect(rules).toHaveLength(1)
      expect(rules[0]).toBe(parent[0])
    })
  })

  describe('readDirTree', () => {
    it('reads files and directories', async () => {
      await fsp.mkdir(join(tmp, 'sub'))
      await fsp.writeFile(join(tmp, 'a.ts'), 'x')
      await fsp.writeFile(join(tmp, 'sub', 'b.ts'), 'y')

      const tree = await readDirTree(tmp, [], true, tmp)
      const names = tree.map((n) => n.name).sort()
      expect(names).toEqual(['a.ts', 'sub'])
      const sub = tree.find((n) => n.name === 'sub')
      expect(sub?.type).toBe('directory')
      expect(sub?.children?.map((c) => c.name)).toEqual(['b.ts'])
    })

    it('respects .gitignore rules', async () => {
      await fsp.writeFile(join(tmp, '.gitignore'), 'ignored.txt\nskip/')
      await fsp.writeFile(join(tmp, 'keep.txt'), 'k')
      await fsp.writeFile(join(tmp, 'ignored.txt'), 'i')
      await fsp.mkdir(join(tmp, 'skip'))
      await fsp.writeFile(join(tmp, 'skip', 'inner.txt'), 'x')

      const tree = await readDirTree(tmp, [], true, tmp)
      const names = tree.map((n) => n.name)
      expect(names).toContain('keep.txt')
      expect(names).not.toContain('ignored.txt')
      expect(names).not.toContain('skip')
    })

    it('marks binary files via isBinary flag', async () => {
      await fsp.writeFile(join(tmp, 'text.md'), '# hi')
      await fsp.writeFile(join(tmp, 'image.png'), Buffer.from([0x89, 0x50, 0x00, 0x00]))

      const tree = await readDirTree(tmp, [], true, tmp)
      const md = tree.find((n) => n.name === 'text.md')
      const png = tree.find((n) => n.name === 'image.png')
      expect(md?.isBinary).toBe(false)
      expect(png?.isBinary).toBe(true)
    })

    it('returns empty array when directory does not exist', async () => {
      const tree = await readDirTree(join(tmp, 'nope'), [], true, tmp)
      expect(tree).toEqual([])
    })
  })
})
