import React, { memo, useCallback, useRef, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { useSettings } from '../SettingsContext'
import '../styles/Settings.css'

interface SettingsProps {
  onClose: () => void
}

const COLOR_PRESETS: Array<{ label: string; accent: string; bg: string; text: string }> = [
  { label: 'Mocha', accent: '#89b4fa', bg: '#1e1e2e', text: '#cdd6f4' },
  { label: 'Macchiato', accent: '#8aadf4', bg: '#24273a', text: '#cad3f5' },
  { label: 'Frappe', accent: '#8caaee', bg: '#303446', text: '#c6d0f5' },
  { label: 'Latte', accent: '#1e66f5', bg: '#eff1f5', text: '#4c4f69' },
  { label: 'Ember', accent: '#f38ba8', bg: '#1e1e2e', text: '#f5e0dc' },
  { label: 'Forest', accent: '#a6e3a1', bg: '#1e1e2e', text: '#a6e3a1' },
  { label: 'Sunset', accent: '#fab387', bg: '#1e1e2e', text: '#fab387' },
  { label: 'Ocean', accent: '#74c7ec', bg: '#11111b', text: '#89dceb' }
]

const SCALE_PRESETS = [80, 90, 100, 110, 120, 140]

function Settings({ onClose }: SettingsProps): React.JSX.Element {
  const { settings, updateSettings, resetSettings } = useSettings()
  const [localAccent, setLocalAccent] = useState(settings.accentColor)
  const [localBg, setLocalBg] = useState(settings.bgColor)
  const [localText, setLocalText] = useState(settings.textColor)
  const backdropRef = useRef<HTMLDivElement>(null)

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose()
    },
    [onClose]
  )

  const handleAccentChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalAccent(e.target.value)
      updateSettings({ accentColor: e.target.value })
    },
    [updateSettings]
  )

  const handleBgChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalBg(e.target.value)
      updateSettings({ bgColor: e.target.value })
    },
    [updateSettings]
  )

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalText(e.target.value)
      updateSettings({ textColor: e.target.value })
    },
    [updateSettings]
  )

  const handleScaleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateSettings({ scale: Number(e.target.value) })
    },
    [updateSettings]
  )

  const applyPreset = useCallback(
    (preset: (typeof COLOR_PRESETS)[number]) => {
      setLocalAccent(preset.accent)
      setLocalBg(preset.bg)
      setLocalText(preset.text)
      updateSettings({ accentColor: preset.accent, bgColor: preset.bg, textColor: preset.text })
    },
    [updateSettings]
  )

  const handleReset = useCallback(() => {
    resetSettings()
    const defaults = {
      accentColor: '#89b4fa',
      bgColor: '#1e1e2e',
      textColor: '#cdd6f4',
      scale: 100
    }
    setLocalAccent(defaults.accentColor)
    setLocalBg(defaults.bgColor)
    setLocalText(defaults.textColor)
  }, [resetSettings])

  return (
    <div className="settings-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3>Theme Presets</h3>
            <div className="settings-presets">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className="settings-preset-btn"
                  onClick={() => applyPreset(preset)}
                  style={
                    {
                      '--preset-accent': preset.accent,
                      '--preset-bg': preset.bg
                    } as React.CSSProperties
                  }
                >
                  <span className="settings-preset-swatch" style={{ background: preset.accent }} />
                  <span className="settings-preset-label">{preset.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h3>Colors</h3>
            <div className="settings-color-row">
              <label>Accent</label>
              <div className="settings-color-input">
                <input type="color" value={localAccent} onChange={handleAccentChange} />
                <span className="settings-color-hex">{localAccent}</span>
              </div>
            </div>
            <div className="settings-color-row">
              <label>Background</label>
              <div className="settings-color-input">
                <input type="color" value={localBg} onChange={handleBgChange} />
                <span className="settings-color-hex">{localBg}</span>
              </div>
            </div>
            <div className="settings-color-row">
              <label>Text</label>
              <div className="settings-color-input">
                <input type="color" value={localText} onChange={handleTextChange} />
                <span className="settings-color-hex">{localText}</span>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>Scale</h3>
            <div className="settings-scale">
              <input
                type="range"
                min={60}
                max={200}
                step={5}
                value={settings.scale}
                onChange={handleScaleChange}
              />
              <span className="settings-scale-value">{settings.scale}%</span>
            </div>
            <div className="settings-scale-presets">
              {SCALE_PRESETS.map((s) => (
                <button
                  key={s}
                  className={`settings-scale-btn ${settings.scale === s ? 'active' : ''}`}
                  onClick={() => updateSettings({ scale: s })}
                >
                  {s}%
                </button>
              ))}
            </div>
          </section>

          <div className="settings-footer">
            <button className="settings-reset-btn" onClick={handleReset}>
              <RotateCcw size={14} />
              Reset to Default
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(Settings)
