import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import log from 'electron-log/renderer'

export interface CatppuccinPalette {
  rosewater: string
  flamingo: string
  pink: string
  mauve: string
  red: string
  maroon: string
  peach: string
  yellow: string
  green: string
  teal: string
  sky: string
  sapphire: string
  blue: string
  lavender: string
  text: string
  subtext1: string
  subtext0: string
  overlay2: string
  overlay1: string
  overlay0: string
  surface2: string
  surface1: string
  surface0: string
  base: string
  mantle: string
  crust: string
}

export interface SettingsState {
  accentColor: string
  bgColor: string
  textColor: string
  scale: number
  palette: CatppuccinPalette | null
  autoCopy: boolean
  whipVolume: number
}

const MOCHA_PALETTE: CatppuccinPalette = {
  rosewater: '#f5e0dc',
  flamingo: '#f2cdcd',
  pink: '#f5c2e7',
  mauve: '#cba6f7',
  red: '#f38ba8',
  maroon: '#eba0ac',
  peach: '#fab387',
  yellow: '#f9e2af',
  green: '#a6e3a1',
  teal: '#94e2d5',
  sky: '#89dceb',
  sapphire: '#74c7ec',
  blue: '#89b4fa',
  lavender: '#b4befe',
  text: '#cdd6f4',
  subtext1: '#bac2de',
  subtext0: '#a6adc8',
  overlay2: '#9399b2',
  overlay1: '#7f849c',
  overlay0: '#6c7086',
  surface2: '#585b70',
  surface1: '#45475a',
  surface0: '#313244',
  base: '#1e1e2e',
  mantle: '#181825',
  crust: '#11111b'
}

const DEFAULT_SETTINGS: SettingsState = {
  accentColor: '#89b4fa',
  bgColor: '#1e1e2e',
  textColor: '#cdd6f4',
  scale: 100,
  palette: MOCHA_PALETTE,
  autoCopy: false,
  whipVolume: 50
}

const STORAGE_KEY = 'hell-settings'

function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS }
}

interface SettingsContextValue {
  settings: SettingsState
  updateSettings: (patch: Partial<SettingsState>) => void
  resetSettings: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

function mix(hex: string, target: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(hex)
  const [r2, g2, b2] = hexToRgb(target)
  return rgbToHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount)
}

function isLight(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5
}

function darkenForLight(hex: string, light: boolean): string {
  if (!light) return hex
  return mix(hex, '#000000', 0.35)
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function applySettings(s: SettingsState): void {
  const root = document.documentElement

  if (s.palette) {
    const p = s.palette
    root.style.setProperty('--ctp-rosewater', p.rosewater)
    root.style.setProperty('--ctp-flamingo', p.flamingo)
    root.style.setProperty('--ctp-pink', p.pink)
    root.style.setProperty('--ctp-mauve', p.mauve)
    root.style.setProperty('--ctp-red', p.red)
    root.style.setProperty('--ctp-maroon', p.maroon)
    root.style.setProperty('--ctp-peach', p.peach)
    root.style.setProperty('--ctp-yellow', p.yellow)
    root.style.setProperty('--ctp-green', p.green)
    root.style.setProperty('--ctp-teal', p.teal)
    root.style.setProperty('--ctp-sky', p.sky)
    root.style.setProperty('--ctp-sapphire', p.sapphire)
    root.style.setProperty('--ctp-blue', p.blue)
    root.style.setProperty('--ctp-lavender', p.lavender)
    root.style.setProperty('--ctp-text', p.text)
    root.style.setProperty('--ctp-subtext1', p.subtext1)
    root.style.setProperty('--ctp-subtext0', p.subtext0)
    root.style.setProperty('--ctp-overlay2', p.overlay2)
    root.style.setProperty('--ctp-overlay1', p.overlay1)
    root.style.setProperty('--ctp-overlay0', p.overlay0)
    root.style.setProperty('--ctp-surface2', p.surface2)
    root.style.setProperty('--ctp-surface1', p.surface1)
    root.style.setProperty('--ctp-surface0', p.surface0)
    root.style.setProperty('--ctp-base', p.base)
    root.style.setProperty('--ctp-mantle', p.mantle)
    root.style.setProperty('--ctp-crust', p.crust)

    root.style.setProperty('--color-accent', p.blue)
    root.style.setProperty('--color-accent-hover', p.lavender)
    root.style.setProperty('--color-accent-text', p.crust)
    root.style.setProperty('--color-background', p.base)
    root.style.setProperty('--color-background-soft', p.mantle)
    root.style.setProperty('--color-background-mute', p.crust)
    root.style.setProperty('--color-surface-0', p.surface0)
    root.style.setProperty('--color-surface-1', p.surface1)
    root.style.setProperty('--color-surface-2', p.surface2)
    root.style.setProperty('--color-border', p.surface1)
    root.style.setProperty('--color-border-subtle', p.surface0)
    root.style.setProperty('--color-border-accent', p.lavender)
    root.style.setProperty('--color-text', p.text)
    root.style.setProperty('--color-text-secondary', p.subtext1)
    root.style.setProperty('--color-text-muted', p.subtext0)
    root.style.setProperty('--color-text-subtle', p.overlay1)
    root.style.setProperty('--color-text-faint', p.overlay0)
    root.style.setProperty('--color-success', p.green)
    root.style.setProperty('--color-warning', p.yellow)
    root.style.setProperty('--color-error', p.red)
    root.style.setProperty('--color-info', p.sky)
    root.style.setProperty('--color-selection', hexToRgba(p.overlay2, 0.25))
    root.style.setProperty('--color-selection-text', p.text)
    root.style.setProperty('--focus-ring', p.blue)
  } else {
    const light = isLight(s.bgColor)
    const surfaceTarget = light ? '#000000' : '#ffffff'

    const surface0 = mix(s.bgColor, surfaceTarget, 0.05)
    const surface1 = mix(s.bgColor, surfaceTarget, 0.1)
    const surface2 = mix(s.bgColor, surfaceTarget, 0.16)
    const mute = mix(s.bgColor, '#000000', light ? 0.06 : 0.25)

    root.style.setProperty('--ctp-red', darkenForLight('#f38ba8', light))
    root.style.setProperty('--ctp-green', darkenForLight('#a6e3a1', light))
    root.style.setProperty('--ctp-yellow', darkenForLight('#f9e2af', light))
    root.style.setProperty('--ctp-mauve', darkenForLight('#cba6f7', light))
    root.style.setProperty('--ctp-peach', darkenForLight('#fab387', light))
    root.style.setProperty('--ctp-teal', darkenForLight('#94e2d5', light))
    root.style.setProperty('--ctp-sky', darkenForLight('#89dceb', light))
    root.style.setProperty('--ctp-sapphire', darkenForLight('#74c7ec', light))
    root.style.setProperty('--ctp-blue', s.accentColor)
    root.style.setProperty('--ctp-lavender', mix(s.accentColor, '#ffffff', light ? 0.1 : 0.3))
    root.style.setProperty('--ctp-rosewater', darkenForLight('#f5e0dc', light))
    root.style.setProperty('--ctp-flamingo', darkenForLight('#f2cdcd', light))
    root.style.setProperty('--ctp-pink', darkenForLight('#f5c2e7', light))
    root.style.setProperty('--ctp-maroon', darkenForLight('#eba0ac', light))
    root.style.setProperty('--ctp-text', s.textColor)
    root.style.setProperty('--ctp-subtext1', mix(s.textColor, s.bgColor, 0.15))
    root.style.setProperty('--ctp-subtext0', mix(s.textColor, s.bgColor, 0.3))
    root.style.setProperty('--ctp-overlay2', mix(s.textColor, s.bgColor, 0.45))
    root.style.setProperty('--ctp-overlay1', mix(s.textColor, s.bgColor, 0.55))
    root.style.setProperty('--ctp-overlay0', mix(s.textColor, s.bgColor, 0.65))
    root.style.setProperty('--ctp-surface2', surface2)
    root.style.setProperty('--ctp-surface1', surface1)
    root.style.setProperty('--ctp-surface0', surface0)
    root.style.setProperty('--ctp-base', s.bgColor)
    root.style.setProperty('--ctp-mantle', mix(s.bgColor, surfaceTarget, 0.03))
    root.style.setProperty('--ctp-crust', mute)

    root.style.setProperty('--color-accent', s.accentColor)
    root.style.setProperty('--color-accent-hover', s.accentColor + 'cc')
    root.style.setProperty('--color-background', s.bgColor)
    root.style.setProperty('--color-background-soft', mix(s.bgColor, surfaceTarget, 0.03))
    root.style.setProperty('--color-background-mute', mute)
    root.style.setProperty('--color-surface-0', surface0)
    root.style.setProperty('--color-surface-1', surface1)
    root.style.setProperty('--color-surface-2', surface2)
    root.style.setProperty('--color-border', surface1)
    root.style.setProperty('--color-border-subtle', surface0)
    root.style.setProperty('--color-text', s.textColor)
    root.style.setProperty('--color-text-secondary', s.textColor + 'cc')
    root.style.setProperty('--color-text-muted', mix(s.textColor, s.bgColor, 0.3))
    root.style.setProperty('--color-text-subtle', mix(s.textColor, s.bgColor, 0.55))
    root.style.setProperty('--color-text-faint', mix(s.textColor, s.bgColor, 0.65))
    root.style.setProperty('--color-accent-text', isLight(s.accentColor) ? '#1e1e2e' : '#ffffff')
    root.style.setProperty(
      '--color-border-accent',
      mix(s.accentColor, '#ffffff', light ? 0.1 : 0.3)
    )
    root.style.setProperty('--color-success', darkenForLight('#a6e3a1', light))
    root.style.setProperty('--color-warning', darkenForLight('#f9e2af', light))
    root.style.setProperty('--color-error', darkenForLight('#f38ba8', light))
    root.style.setProperty('--color-info', darkenForLight('#89dceb', light))
    root.style.setProperty('--color-selection', hexToRgba(mix(s.textColor, s.bgColor, 0.45), 0.25))
    root.style.setProperty('--color-selection-text', s.textColor)
    root.style.setProperty('--focus-ring', s.accentColor)
  }

  root.style.setProperty('font-size', `${(13 * s.scale) / 100}px`)
}

export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<SettingsState>(loadSettings)
  const ipcLoadedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    window.electron.ipcRenderer
      .invoke('settings:load')
      .then((saved: SettingsState | null) => {
        if (cancelled) return
        ipcLoadedRef.current = true
        if (saved) {
          setSettings((prev) => ({ ...prev, ...saved }))
        }
      })
      .catch((e) => {
        ipcLoadedRef.current = true
        log.error('Failed to load settings from main process:', e)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    applySettings(settings)
    if (!ipcLoadedRef.current) return
    const json = JSON.stringify(settings)
    try {
      localStorage.setItem(STORAGE_KEY, json)
    } catch (e) {
      log.error('Failed to persist settings to localStorage:', e)
    }
    window.electron.ipcRenderer.invoke('settings:save', json).catch((e) => {
      log.error('Failed to persist settings to main process:', e)
    })
  }, [settings])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        setSettings((prev) => ({
          ...prev,
          scale: Math.min(200, prev.scale + 5)
        }))
      } else if (e.key === '-') {
        e.preventDefault()
        setSettings((prev) => ({
          ...prev,
          scale: Math.max(60, prev.scale - 5)
        }))
      } else if (e.key === '0') {
        e.preventDefault()
        setSettings((prev) => ({ ...prev, scale: 100 }))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const updateSettings = useCallback((patch: Partial<SettingsState>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS })
  }, [])

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, updateSettings, resetSettings }),
    [settings, updateSettings, resetSettings]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}
