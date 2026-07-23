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

function applySettings(s: SettingsState): void {
  const root = document.documentElement
  root.style.setProperty('--color-accent', s.accentColor)
  root.style.setProperty('--color-accent-hover', s.accentColor + 'cc')
  root.style.setProperty('--color-background', s.bgColor)
  root.style.setProperty('--color-background-soft', s.bgColor + 'ee')
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
