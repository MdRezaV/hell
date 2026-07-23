import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export interface SettingsState {
  accentColor: string
  bgColor: string
  textColor: string
  scale: number
}

const DEFAULT_SETTINGS: SettingsState = {
  accentColor: '#89b4fa',
  bgColor: '#1e1e2e',
  textColor: '#cdd6f4',
  scale: 100
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
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
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

function applySettings(s: SettingsState): void {
  const root = document.documentElement
  const light = isLight(s.bgColor)
  const surfaceTarget = light ? '#000000' : '#ffffff'

  const surface0 = mix(s.bgColor, surfaceTarget, 0.05)
  const surface1 = mix(s.bgColor, surfaceTarget, 0.1)
  const surface2 = mix(s.bgColor, surfaceTarget, 0.16)
  const mute = mix(s.bgColor, '#000000', light ? 0.06 : 0.25)

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
  root.style.setProperty('font-size', `${(13 * s.scale) / 100}px`)
}

export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<SettingsState>(loadSettings)

  useEffect(() => {
    applySettings(settings)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
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
