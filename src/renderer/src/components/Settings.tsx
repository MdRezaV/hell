import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { type CatppuccinPalette, useSettings } from '../SettingsContext'
import '../styles/Settings.css'

interface SettingsProps {
  onClose: () => void
}

const MOCHA: CatppuccinPalette = {
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

const MACCHIATO: CatppuccinPalette = {
  rosewater: '#f4dbd6',
  flamingo: '#f0c6c6',
  pink: '#f5bde6',
  mauve: '#c6a0f6',
  red: '#ed8796',
  maroon: '#ee99a0',
  peach: '#f5a97f',
  yellow: '#eed49f',
  green: '#a6da95',
  teal: '#8bd5ca',
  sky: '#91d7e3',
  sapphire: '#7dc4e4',
  blue: '#8aadf4',
  lavender: '#b7bdf8',
  text: '#cad3f5',
  subtext1: '#b8c0e0',
  subtext0: '#a5adcb',
  overlay2: '#939ab7',
  overlay1: '#8087a2',
  overlay0: '#6e738d',
  surface2: '#5b6078',
  surface1: '#494d64',
  surface0: '#363a4f',
  base: '#24273a',
  mantle: '#1e2030',
  crust: '#181926'
}

const FRAPPE: CatppuccinPalette = {
  rosewater: '#f2d5cf',
  flamingo: '#eebebe',
  pink: '#f4b8e4',
  mauve: '#ca9ee6',
  red: '#e78284',
  maroon: '#ea999c',
  peach: '#ef9f76',
  yellow: '#e5c890',
  green: '#a6d189',
  teal: '#81c8be',
  sky: '#99d1db',
  sapphire: '#85c1dc',
  blue: '#8caaee',
  lavender: '#babbf1',
  text: '#c6d0f5',
  subtext1: '#b5bfe2',
  subtext0: '#a5adce',
  overlay2: '#949cbb',
  overlay1: '#838ba7',
  overlay0: '#737994',
  surface2: '#626880',
  surface1: '#51576d',
  surface0: '#414559',
  base: '#303446',
  mantle: '#292c3c',
  crust: '#232634'
}

const LATTE: CatppuccinPalette = {
  rosewater: '#dc8a78',
  flamingo: '#dd7878',
  pink: '#ea76cb',
  mauve: '#8839ef',
  red: '#d20f39',
  maroon: '#e64553',
  peach: '#fe640b',
  yellow: '#df8e1d',
  green: '#40a02b',
  teal: '#179299',
  sky: '#04a5e5',
  sapphire: '#209fb5',
  blue: '#1e66f5',
  lavender: '#7287fd',
  text: '#4c4f69',
  subtext1: '#5c5f77',
  subtext0: '#6c6f85',
  overlay2: '#7c7f93',
  overlay1: '#8c8fa1',
  overlay0: '#9ca0b0',
  surface2: '#acb0be',
  surface1: '#bcc0cc',
  surface0: '#ccd0da',
  base: '#eff1f5',
  mantle: '#e6e9ef',
  crust: '#dce0e8'
}

const ONEDARK: CatppuccinPalette = {
  rosewater: '#d19a66',
  flamingo: '#e06c75',
  pink: '#c678dd',
  mauve: '#c678dd',
  red: '#e06c75',
  maroon: '#be5046',
  peach: '#d19a66',
  yellow: '#e5c07b',
  green: '#98c379',
  teal: '#56b6c2',
  sky: '#56b6c2',
  sapphire: '#61afef',
  blue: '#61afef',
  lavender: '#528bff',
  text: '#abb2bf',
  subtext1: '#828997',
  subtext0: '#666d7a',
  overlay2: '#5c6370',
  overlay1: '#4b5263',
  overlay0: '#3e4451',
  surface2: '#3e4451',
  surface1: '#2f343d',
  surface0: '#2c313a',
  base: '#282c34',
  mantle: '#21252b',
  crust: '#1e2127'
}

const DRACULA: CatppuccinPalette = {
  rosewater: '#ffb86c',
  flamingo: '#ff79c6',
  pink: '#ff79c6',
  mauve: '#bd93f9',
  red: '#ff5555',
  maroon: '#d03a3a',
  peach: '#ffb86c',
  yellow: '#f1fa8c',
  green: '#50fa7b',
  teal: '#8be9fd',
  sky: '#8be9fd',
  sapphire: '#6272a4',
  blue: '#bd93f9',
  lavender: '#d6acff',
  text: '#f8f8f2',
  subtext1: '#e2e2dc',
  subtext0: '#bfbfb9',
  overlay2: '#6272a4',
  overlay1: '#56597a',
  overlay0: '#44475a',
  surface2: '#44475a',
  surface1: '#3a3d4c',
  surface0: '#343746',
  base: '#282a36',
  mantle: '#21222c',
  crust: '#191a21'
}

const BLACK: CatppuccinPalette = {
  rosewater: '#ffb86c',
  flamingo: '#ff79c6',
  pink: '#ff79c6',
  mauve: '#bd93f9',
  red: '#ff5555',
  maroon: '#d03a3a',
  peach: '#ffb86c',
  yellow: '#f1fa8c',
  green: '#50fa7b',
  teal: '#8be9fd',
  sky: '#8be9fd',
  sapphire: '#6272a4',
  blue: '#bd93f9',
  lavender: '#d6acff',
  text: '#f8f8f2',
  subtext1: '#e2e2dc',
  subtext0: '#bfbfb9',
  overlay2: '#44445a',
  overlay1: '#333345',
  overlay0: '#252530',
  surface2: '#181822',
  surface1: '#12121a',
  surface0: '#0d0d14',
  base: '#000000',
  mantle: '#050508',
  crust: '#020204'
}

const NORD_DARK: CatppuccinPalette = {
  rosewater: '#d08770',
  flamingo: '#bf616a',
  pink: '#b48ead',
  mauve: '#b48ead',
  red: '#bf616a',
  maroon: '#a34e56',
  peach: '#d08770',
  yellow: '#ebcb8b',
  green: '#a3be8c',
  teal: '#8fbcbb',
  sky: '#88c0d0',
  sapphire: '#81a1c1',
  blue: '#5e81ac',
  lavender: '#81a1c1',
  text: '#eceff4',
  subtext1: '#e5e9f0',
  subtext0: '#d8dee9',
  overlay2: '#4c566a',
  overlay1: '#434c5e',
  overlay0: '#3b4252',
  surface2: '#434c5e',
  surface1: '#3b4252',
  surface0: '#353b49',
  base: '#2e3440',
  mantle: '#2a2f3a',
  crust: '#242933'
}

const NORD_LIGHT: CatppuccinPalette = {
  rosewater: '#d08770',
  flamingo: '#bf616a',
  pink: '#b48ead',
  mauve: '#b48ead',
  red: '#bf616a',
  maroon: '#a34e56',
  peach: '#d08770',
  yellow: '#ebcb8b',
  green: '#a3be8c',
  teal: '#8fbcbb',
  sky: '#88c0d0',
  sapphire: '#81a1c1',
  blue: '#5e81ac',
  lavender: '#81a1c1',
  text: '#2e3440',
  subtext1: '#3b4252',
  subtext0: '#434c5e',
  overlay2: '#4c566a',
  overlay1: '#616e88',
  overlay0: '#7b88a1',
  surface2: '#c8d0e0',
  surface1: '#d8dee9',
  surface0: '#e0e5ee',
  base: '#eceff4',
  mantle: '#e5e9f0',
  crust: '#d8dee9'
}

interface ThemePreset {
  label: string
  accent: string
  bg: string
  text: string
  palette?: CatppuccinPalette
}

const COLOR_PRESETS: ThemePreset[] = [
  { label: 'Mocha', accent: '#89b4fa', bg: '#1e1e2e', text: '#cdd6f4', palette: MOCHA },
  { label: 'Macchiato', accent: '#8aadf4', bg: '#24273a', text: '#cad3f5', palette: MACCHIATO },
  { label: 'Frappe', accent: '#8caaee', bg: '#303446', text: '#c6d0f5', palette: FRAPPE },
  { label: 'Latte', accent: '#1e66f5', bg: '#eff1f5', text: '#4c4f69', palette: LATTE },
  { label: 'One Dark', accent: '#61afef', bg: '#282c34', text: '#abb2bf', palette: ONEDARK },
  { label: 'Dracula', accent: '#bd93f9', bg: '#282a36', text: '#f8f8f2', palette: DRACULA },
  { label: 'Black', accent: '#bd93f9', bg: '#000000', text: '#f8f8f2', palette: BLACK },
  { label: 'Nord Dark', accent: '#88c0d0', bg: '#2e3440', text: '#eceff4', palette: NORD_DARK },
  { label: 'Nord Light', accent: '#5e81ac', bg: '#eceff4', text: '#2e3440', palette: NORD_LIGHT },
  { label: 'Ember', accent: '#f38ba8', bg: '#1e1e2e', text: '#f5e0dc' }
]

const SCALE_PRESETS = [80, 90, 100, 110, 120, 140]

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

function isValidHex(hex: string): boolean {
  return HEX_REGEX.test(hex)
}

function normalizeHex(raw: string): string {
  let v = raw.trim()
  if (v.length > 0 && v[0] !== '#') v = '#' + v
  if (v.length === 4) {
    v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]
  }
  return v.toLowerCase()
}

interface ColorFieldProps {
  label: string
  colorValue: string
  hexValue: string
  onPickerChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onHexChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onHexBlur: () => void
}

const ColorField = memo(function ColorField({
  label,
  colorValue,
  hexValue,
  onPickerChange,
  onHexChange,
  onHexBlur
}: ColorFieldProps): React.JSX.Element {
  return (
    <div className="settings-color-row">
      <label>{label}</label>
      <div className="settings-color-input">
        <input type="color" value={colorValue} onChange={onPickerChange} />
        <input
          type="text"
          className="settings-hex-input"
          value={hexValue}
          onChange={onHexChange}
          onBlur={onHexBlur}
          maxLength={7}
          spellCheck={false}
        />
      </div>
    </div>
  )
})

const SECTIONS = ['Appearance'] as const
type Section = (typeof SECTIONS)[number]

function Settings({ onClose }: SettingsProps): React.JSX.Element {
  const { settings, updateSettings, resetSettings } = useSettings()
  const [accentHex, setAccentHex] = useState(settings.accentColor)
  const [bgHex, setBgHex] = useState(settings.bgColor)
  const [textHex, setTextHex] = useState(settings.textColor)
  const [activeSection, setActiveSection] = useState<Section>('Appearance')
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose()
    },
    [onClose]
  )

  const handlePickerChange = useCallback(
    (prop: 'accentColor' | 'bgColor' | 'textColor', hexSetter: (v: string) => void) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        hexSetter(e.target.value)
        updateSettings({ [prop]: e.target.value, palette: null })
      },
    [updateSettings]
  )

  const handleHexInput = useCallback(
    (prop: 'accentColor' | 'bgColor' | 'textColor', hexSetter: (v: string) => void) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value
        hexSetter(raw)
        const normalized = normalizeHex(raw)
        if (isValidHex(normalized)) {
          updateSettings({ [prop]: normalized, palette: null })
        }
      },
    [updateSettings]
  )

  const handleHexBlur = useCallback(
    (
      prop: 'accentColor' | 'bgColor' | 'textColor',
      hexSetter: (v: string) => void,
      raw: string
    ) => {
      const normalized = normalizeHex(raw)
      if (isValidHex(normalized)) {
        hexSetter(normalized)
        updateSettings({ [prop]: normalized, palette: null })
      } else {
        hexSetter(settings[prop])
      }
    },
    [settings, updateSettings]
  )

  const handleScaleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateSettings({ scale: Number(e.target.value) })
    },
    [updateSettings]
  )

  const applyPreset = useCallback(
    (preset: ThemePreset) => {
      setAccentHex(preset.accent)
      setBgHex(preset.bg)
      setTextHex(preset.text)
      updateSettings({
        accentColor: preset.accent,
        bgColor: preset.bg,
        textColor: preset.text,
        palette: preset.palette
      })
    },
    [updateSettings]
  )

  const handleReset = useCallback(() => {
    resetSettings()
    setAccentHex(MOCHA.blue)
    setBgHex(MOCHA.base)
    setTextHex(MOCHA.text)
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

        <div className="settings-layout">
          <nav className="settings-nav">
            {SECTIONS.map((section) => (
              <button
                key={section}
                className={`settings-nav-item ${activeSection === section ? 'active' : ''}`}
                onClick={() => setActiveSection(section)}
              >
                {section}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {activeSection === 'Appearance' && (
              <>
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
                        <span
                          className="settings-preset-swatch"
                          style={{ background: preset.accent }}
                        />
                        <span className="settings-preset-label">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="settings-section">
                  <h3>Colors</h3>
                  <ColorField
                    label="Accent"
                    colorValue={accentHex}
                    hexValue={accentHex}
                    onPickerChange={handlePickerChange('accentColor', setAccentHex)}
                    onHexChange={handleHexInput('accentColor', setAccentHex)}
                    onHexBlur={() => handleHexBlur('accentColor', setAccentHex, accentHex)}
                  />
                  <ColorField
                    label="Background"
                    colorValue={bgHex}
                    hexValue={bgHex}
                    onPickerChange={handlePickerChange('bgColor', setBgHex)}
                    onHexChange={handleHexInput('bgColor', setBgHex)}
                    onHexBlur={() => handleHexBlur('bgColor', setBgHex, bgHex)}
                  />
                  <ColorField
                    label="Text"
                    colorValue={textHex}
                    hexValue={textHex}
                    onPickerChange={handlePickerChange('textColor', setTextHex)}
                    onHexChange={handleHexInput('textColor', setTextHex)}
                    onHexBlur={() => handleHexBlur('textColor', setTextHex, textHex)}
                  />
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
              </>
            )}
          </div>
        </div>

        <div className="settings-footer">
          <button className="settings-reset-btn" onClick={handleReset}>
            <RotateCcw size={14} />
            Reset to Default
          </button>
          <button className="settings-ok-btn" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(Settings)
