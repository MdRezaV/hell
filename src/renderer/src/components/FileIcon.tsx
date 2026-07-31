import { memo } from 'react'
import {
  SiAstro,
  SiBlender,
  SiBun,
  SiC,
  SiClojure,
  SiCplusplus,
  SiCss,
  SiDart,
  SiDeno,
  SiDocker,
  SiDotnet,
  SiElixir,
  SiErlang,
  SiFigma,
  SiFsharp,
  SiGit,
  SiGnubash,
  SiGo,
  SiGodotengine,
  SiGraphql,
  SiHaskell,
  SiHtml5,
  SiJavascript,
  SiJson,
  SiKotlin,
  SiLua,
  SiMarkdown,
  SiNpm,
  SiOcaml,
  SiOpenjdk,
  SiPhp,
  SiPnpm,
  SiPostgresql,
  SiPython,
  SiR,
  SiReact,
  SiRuby,
  SiRust,
  SiSass,
  SiScala,
  SiSharp,
  SiSketch,
  SiSqlite,
  SiSvelte,
  SiSwift,
  SiTypescript,
  SiVim,
  SiVite,
  SiVuedotjs,
  SiWebassembly,
  SiYaml,
  SiYarn
} from 'react-icons/si'
import {
  Archive,
  Database,
  File,
  FileText,
  Image,
  Lock,
  Music,
  Settings,
  Video
} from 'lucide-react'

interface IconConfig {
  Icon: React.ComponentType<{
    size?: number
    className?: string
    style?: React.CSSProperties
  }>
  color: string
}

const iconMap: Record<string, IconConfig> = {
  js: { Icon: SiJavascript, color: '#F7DF1E' },
  mjs: { Icon: SiJavascript, color: '#F7DF1E' },
  cjs: { Icon: SiJavascript, color: '#F7DF1E' },
  jsx: { Icon: SiReact, color: '#61DAFB' },
  ts: { Icon: SiTypescript, color: '#3178C6' },
  tsx: { Icon: SiReact, color: '#61DAFB' },
  py: { Icon: SiPython, color: '#3776AB' },
  pyw: { Icon: SiPython, color: '#3776AB' },
  cs: { Icon: SiSharp, color: '#239120' },
  csproj: { Icon: SiDotnet, color: '#512BD4' },
  java: { Icon: SiOpenjdk, color: '#437291' },
  go: { Icon: SiGo, color: '#00ADD8' },
  rs: { Icon: SiRust, color: '#DEA584' },
  c: { Icon: SiC, color: '#A8B9CC' },
  h: { Icon: SiC, color: '#A8B9CC' },
  cpp: { Icon: SiCplusplus, color: '#00599C' },
  cc: { Icon: SiCplusplus, color: '#00599C' },
  cxx: { Icon: SiCplusplus, color: '#00599C' },
  hpp: { Icon: SiCplusplus, color: '#00599C' },
  php: { Icon: SiPhp, color: '#777BB4' },
  rb: { Icon: SiRuby, color: '#CC342D' },
  html: { Icon: SiHtml5, color: '#E34F26' },
  htm: { Icon: SiHtml5, color: '#E34F26' },
  css: { Icon: SiCss, color: '#1572B6' },
  scss: { Icon: SiSass, color: '#CC6699' },
  sass: { Icon: SiSass, color: '#CC6699' },
  json: { Icon: SiJson, color: '#000000' },
  jsonc: { Icon: SiJson, color: '#000000' },
  yml: { Icon: SiYaml, color: '#CB171E' },
  yaml: { Icon: SiYaml, color: '#CB171E' },
  md: { Icon: SiMarkdown, color: '#083fa1' },
  mdx: { Icon: SiMarkdown, color: '#083fa1' },
  sh: { Icon: SiGnubash, color: '#4EAA25' },
  bash: { Icon: SiGnubash, color: '#4EAA25' },
  zsh: { Icon: SiGnubash, color: '#4EAA25' },
  fish: { Icon: SiGnubash, color: '#4EAA25' },
  sql: { Icon: SiPostgresql, color: '#336791' },
  db: { Icon: Database, color: '#336791' },
  sqlite: { Icon: SiSqlite, color: '#003B57' },
  swift: { Icon: SiSwift, color: '#F05138' },
  kt: { Icon: SiKotlin, color: '#7F52FF' },
  dart: { Icon: SiDart, color: '#0175C2' },
  lua: { Icon: SiLua, color: '#2C2D72' },
  r: { Icon: SiR, color: '#276DC3' },
  ex: { Icon: SiElixir, color: '#4B275F' },
  exs: { Icon: SiElixir, color: '#4B275F' },
  fs: { Icon: SiFsharp, color: '#b845fc' },
  hs: { Icon: SiHaskell, color: '#5D4F85' },
  clj: { Icon: SiClojure, color: '#5881D8' },
  scala: { Icon: SiScala, color: '#DC322F' },
  erl: { Icon: SiErlang, color: '#A90533' },
  ml: { Icon: SiOcaml, color: '#3BE133' },
  vue: { Icon: SiVuedotjs, color: '#4FC08D' },
  svelte: { Icon: SiSvelte, color: '#FF3E00' },
  graphql: { Icon: SiGraphql, color: '#E10098' },
  gql: { Icon: SiGraphql, color: '#E10098' },
  yarn: { Icon: SiYarn, color: '#2C8EBB' },
  npm: { Icon: SiNpm, color: '#CB3837' },
  pnpm: { Icon: SiPnpm, color: '#F69220' },
  vite: { Icon: SiVite, color: '#646CFF' },
  astro: { Icon: SiAstro, color: '#FF5D01' },
  wasm: { Icon: SiWebassembly, color: '#654FF0' },
  gd: { Icon: SiGodotengine, color: '#478CBF' },
  vim: { Icon: SiVim, color: '#019733' },
  lock: { Icon: Lock, color: '#9ca3af' },
  png: { Icon: Image, color: '#10b981' },
  jpg: { Icon: Image, color: '#10b981' },
  jpeg: { Icon: Image, color: '#10b981' },
  gif: { Icon: Image, color: '#10b981' },
  bmp: { Icon: Image, color: '#10b981' },
  webp: { Icon: Image, color: '#10b981' },
  ico: { Icon: Image, color: '#10b981' },
  svg: { Icon: Image, color: '#f59e0b' },
  mp4: { Icon: Video, color: '#ec4899' },
  mkv: { Icon: Video, color: '#ec4899' },
  avi: { Icon: Video, color: '#ec4899' },
  mov: { Icon: Video, color: '#ec4899' },
  mp3: { Icon: Music, color: '#8b5cf6' },
  wav: { Icon: Music, color: '#8b5cf6' },
  flac: { Icon: Music, color: '#8b5cf6' },
  zip: { Icon: Archive, color: '#f59e0b' },
  rar: { Icon: Archive, color: '#f59e0b' },
  '7z': { Icon: Archive, color: '#f59e0b' },
  tar: { Icon: Archive, color: '#f59e0b' },
  gz: { Icon: Archive, color: '#f59e0b' },
  pdf: { Icon: FileText, color: '#ef4444' },
  txt: { Icon: FileText, color: '#6b7280' },
  env: { Icon: Settings, color: '#ecd53f' },
  ini: { Icon: Settings, color: '#ecd53f' },
  conf: { Icon: Settings, color: '#ecd53f' },
  toml: { Icon: FileText, color: '#9c4221' },
  xml: { Icon: FileText, color: '#f97316' },
  fig: { Icon: SiFigma, color: '#F24E1E' },
  sketch: { Icon: SiSketch, color: '#F7B500' },
  blend: { Icon: SiBlender, color: '#EA7600' }
}

const filenameMap: Record<string, IconConfig> = {
  dockerfile: { Icon: SiDocker, color: '#2496ED' },
  makefile: { Icon: FileText, color: '#a3a3a3' },
  license: { Icon: FileText, color: '#a3a3a3' },
  '.env': { Icon: Settings, color: '#ecd53f' },
  '.gitignore': { Icon: SiGit, color: '#F05032' },
  '.gitattributes': { Icon: SiGit, color: '#F05032' },
  deno: { Icon: SiDeno, color: '#70FFAF' },
  bun: { Icon: SiBun, color: '#FBF0DF' }
}

function getFileIcon(name: string): IconConfig {
  const lowerName = name.toLowerCase()
  if (filenameMap[lowerName]) return filenameMap[lowerName]

  const ext = lowerName.split('.').pop()
  if (ext && iconMap[ext]) return iconMap[ext]

  return { Icon: File, color: 'var(--ctp-subtext0)' }
}

function getLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function getIconColor(color: string): string {
  if (color.startsWith('var(')) return color
  const luminance = getLuminance(color)
  const mixPercent = luminance < 0.1 || luminance > 0.85 ? 55 : 30
  return `color-mix(in srgb, var(--ctp-text) ${mixPercent}%, ${color})`
}

const FileIcon = memo(function FileIcon({ name }: { name: string }) {
  const { Icon, color } = getFileIcon(name)
  return <Icon size={15} style={{ color: getIconColor(color) }} />
})

export default FileIcon
