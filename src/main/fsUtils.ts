import { join, relative } from 'path'
import { promises as fsp } from 'fs'
import ignore, { type Ignore } from 'ignore'
import pLimit from 'p-limit'
import { log } from './logger'

const limit = pLimit(50)

export interface IgnoreRule {
  dir: string
  ig: Ignore
  patterns: string
}

const TEXT_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'sass',
  'md',
  'mdx',
  'txt',
  'xml',
  'svg',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'c',
  'cpp',
  'cc',
  'cxx',
  'h',
  'hpp',
  'cs',
  'php',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'cmd',
  'sql',
  'toml',
  'ini',
  'conf',
  'env',
  'gitignore',
  'editorconfig',
  'lua',
  'r',
  'swift',
  'dart',
  'scala',
  'clj',
  'erl',
  'ex',
  'exs',
  'hs',
  'ml',
  'fs',
  'vim',
  'tex',
  'vue',
  'svelte',
  'graphql',
  'gql',
  'prisma',
  'proto',
  'lock',
  'mod',
  'sum'
])

const binaryCheckCache = new Map<string, boolean>()
const BINARY_CACHE_MAX = 1024

export async function isBinaryFile(filePath: string): Promise<boolean> {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (ext && TEXT_EXTENSIONS.has(ext)) return false
  const cached = binaryCheckCache.get(filePath)
  if (cached !== undefined) return cached
  try {
    const fd = await fsp.open(filePath, 'r')
    const buffer = Buffer.alloc(8192)
    const { bytesRead } = await fd.read(buffer, 0, 8192, 0)
    await fd.close()
    let isBin = false
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        isBin = true
        break
      }
    }
    if (binaryCheckCache.size >= BINARY_CACHE_MAX) {
      const firstKey = binaryCheckCache.keys().next().value
      if (firstKey !== undefined) binaryCheckCache.delete(firstKey)
    }
    binaryCheckCache.set(filePath, isBin)
    return isBin
  } catch (e) {
    log.error(`Failed to check if file is binary: ${filePath}`, e)
    return false
  }
}

export async function loadIgnoreRules(
  dir: string,
  parentRules: IgnoreRule[],
  isRoot: boolean
): Promise<IgnoreRule[]> {
  const rules = [...parentRules]
  const patterns: string[] = []
  if (isRoot) {
    patterns.push('.git')
  }
  for (const ignoreFile of ['.gitignore', '.hellignore']) {
    try {
      const content = await fsp.readFile(join(dir, ignoreFile), 'utf-8')
      patterns.push(content)
    } catch {
      // ignore file doesn't exist
    }
  }
  if (patterns.length > 0) {
    const combined = patterns.join('\n')
    rules.push({ dir, ig: ignore().add(combined), patterns: combined })
  }
  return rules
}

export function mergeIgnoreRules(rules: IgnoreRule[]): Ignore {
  if (rules.length === 0) return ignore()
  const allPatterns = rules.map((r) => r.patterns).join('\n')
  return ignore().add(allPatterns)
}

export function isEntryIgnored(
  entryPath: string,
  isDirectory: boolean,
  ig: Ignore,
  baseDir: string
): boolean {
  const rel = relative(baseDir, entryPath).replace(/\\/g, '/')
  if (!rel || rel.startsWith('..')) return false
  const testPath = isDirectory ? `${rel}/` : rel
  return ig.ignores(testPath)
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  isBinary?: boolean
  isHell?: boolean
}

export async function readDirTree(
  path: string,
  parentRules: IgnoreRule[],
  isRoot: boolean,
  rootDir: string = path
): Promise<FileNode[]> {
  const currentRules = await loadIgnoreRules(path, parentRules, isRoot)
  const mergedIg = mergeIgnoreRules(currentRules)
  try {
    const entries = await fsp.readdir(path, { withFileTypes: true })
    const filtered = entries.filter((entry) => {
      const fullPath = join(path, entry.name)
      const rel = relative(rootDir, fullPath).replace(/\\/g, '/')
      if (!rel || rel.startsWith('..')) return true
      const testPath = entry.isDirectory() ? `${rel}/` : rel
      return !mergedIg.ignores(testPath)
    })

    const promises = filtered.map((entry) => {
      const fullPath = join(path, entry.name)
      if (entry.isDirectory()) {
        return readDirTree(fullPath, currentRules, false, rootDir).then(
          (children) =>
            ({
              name: entry.name,
              path: fullPath,
              type: 'directory' as const,
              children
            }) as FileNode
        )
      }
      return limit(async () => {
        const bin = await isBinaryFile(fullPath)
        const isHell = entry.name === 'HELL.md'
        return {
          name: entry.name,
          path: fullPath,
          type: 'file' as const,
          isBinary: bin || isHell,
          isHell
        } as FileNode
      })
    })

    return await Promise.all(promises)
  } catch (e) {
    log.error(`Failed to read directory tree at ${path}:`, e)
    return []
  }
}

export function formatTreeText(rootName: string, nodes: FileNode[]): string {
  let result = `- ${rootName}/\n`
  const walk = (list: FileNode[], indent: string): void => {
    for (const node of list) {
      if (node.type === 'directory') {
        result += `${indent}- ${node.name}/\n`
        if (node.children && node.children.length > 0) {
          walk(node.children, indent + '  ')
        }
      } else {
        result += `${indent}- ${node.name}\n`
      }
    }
  }
  walk(nodes, '  ')
  return result
}
