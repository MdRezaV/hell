import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import hljs from 'highlight.js/lib/common'

// Register only commonly used languages (PrismLight requires explicit registration).
// This avoids loading the full Prism bundle (~300 languages) and dramatically
// reduces bundle size and highlighting time.
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import scss from 'react-syntax-highlighter/dist/esm/languages/prism/scss'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import markdownLang from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import cLang from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp'
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php'
import ruby from 'react-syntax-highlighter/dist/esm/languages/prism/ruby'
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker'

SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('js', javascript)
SyntaxHighlighter.registerLanguage('mjs', javascript)
SyntaxHighlighter.registerLanguage('cjs', javascript)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('ts', typescript)
SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('html', markup)
SyntaxHighlighter.registerLanguage('htm', markup)
SyntaxHighlighter.registerLanguage('markup', markup)
SyntaxHighlighter.registerLanguage('xml', markup)
SyntaxHighlighter.registerLanguage('svg', markup)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('scss', scss)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('jsonc', json)
SyntaxHighlighter.registerLanguage('yaml', yaml)
SyntaxHighlighter.registerLanguage('yml', yaml)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('py', python)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('sh', bash)
SyntaxHighlighter.registerLanguage('shell', bash)
SyntaxHighlighter.registerLanguage('zsh', bash)
SyntaxHighlighter.registerLanguage('fish', bash)
SyntaxHighlighter.registerLanguage('markdown', markdownLang)
SyntaxHighlighter.registerLanguage('md', markdownLang)
SyntaxHighlighter.registerLanguage('mdx', markdownLang)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('go', go)
SyntaxHighlighter.registerLanguage('rust', rust)
SyntaxHighlighter.registerLanguage('rs', rust)
SyntaxHighlighter.registerLanguage('java', java)
SyntaxHighlighter.registerLanguage('c', cLang)
SyntaxHighlighter.registerLanguage('cpp', cpp)
SyntaxHighlighter.registerLanguage('cc', cpp)
SyntaxHighlighter.registerLanguage('cxx', cpp)
SyntaxHighlighter.registerLanguage('hpp', cpp)
SyntaxHighlighter.registerLanguage('csharp', csharp)
SyntaxHighlighter.registerLanguage('cs', csharp)
SyntaxHighlighter.registerLanguage('php', php)
SyntaxHighlighter.registerLanguage('ruby', ruby)
SyntaxHighlighter.registerLanguage('rb', ruby)
SyntaxHighlighter.registerLanguage('docker', docker)
SyntaxHighlighter.registerLanguage('dockerfile', docker)

// Cache hljs auto-detection results. highlightAuto is very expensive and runs
// on every render for unlabeled code blocks during streaming. The cache prevents
// redundant tokenization of identical code strings.
const autoLanguageCache = new Map<string, string>()
const AUTO_LANG_CACHE_MAX = 512

function codeFingerprint(code: string): string {
  // For short code the full string is a collision-free key.
  // For longer code use length + a hash of the first 256 chars so Map keys
  // stay small and lookups avoid O(code_length) string comparisons.
  if (code.length <= 256) return code
  let h = code.length
  for (let i = 0; i < 256; i++) {
    h = ((h << 5) - h + code.charCodeAt(i)) | 0
  }
  return `${code.length}:${(h >>> 0).toString(36)}`
}

export function detectLanguage(code: string): string {
  // Skip expensive hljs auto-detection for tiny snippets — they are almost
  // always incomplete tokens arriving during streaming.
  if (code.length < 20) return 'text'

  const key = codeFingerprint(code)
  const cached = autoLanguageCache.get(key)
  if (cached !== undefined) return cached

  const sample = code.length > 2048 ? code.slice(0, 2048) : code
  const detected = hljs.highlightAuto(sample).language || 'text'
  autoLanguageCache.set(key, detected)
  if (autoLanguageCache.size > AUTO_LANG_CACHE_MAX) {
    const firstKey = autoLanguageCache.keys().next().value
    if (firstKey !== undefined) autoLanguageCache.delete(firstKey)
  }
  return detected
}

const languageFromPathCache = new Map<string, string>()

export function getLanguageFromPath(filePath: string): string {
  const cached = languageFromPathCache.get(filePath)
  if (cached !== undefined) return cached

  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext) return 'text'

  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    mjs: 'javascript',
    cjs: 'javascript',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    json: 'json',
    jsonc: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    svg: 'svg',
    py: 'python',
    pyw: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'bash',
    ps1: 'powershell',
    bat: 'batch',
    cmd: 'batch',
    md: 'markdown',
    mdx: 'markdown',
    sql: 'sql',
    dockerfile: 'docker',
    lua: 'lua',
    r: 'r',
    swift: 'swift',
    dart: 'dart',
    scala: 'scala',
    clj: 'clojure',
    ex: 'elixir',
    exs: 'elixir',
    erl: 'erlang',
    hs: 'haskell',
    ml: 'ocaml',
    fs: 'fsharp',
    vim: 'vim',
    tex: 'latex',
    ini: 'ini',
    conf: 'ini',
    env: 'ini'
  }

  const result = languageMap[ext] || 'text'
  languageFromPathCache.set(filePath, result)
  return result
}
