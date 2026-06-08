/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ctp: {
          rosewater: 'var(--ctp-rosewater)',
          flamingo: 'var(--ctp-flamingo)',
          pink: 'var(--ctp-pink)',
          mauve: 'var(--ctp-mauve)',
          red: 'var(--ctp-red)',
          maroon: 'var(--ctp-maroon)',
          peach: 'var(--ctp-peach)',
          yellow: 'var(--ctp-yellow)',
          green: 'var(--ctp-green)',
          teal: 'var(--ctp-teal)',
          sky: 'var(--ctp-sky)',
          sapphire: 'var(--ctp-sapphire)',
          blue: 'var(--ctp-blue)',
          lavender: 'var(--ctp-lavender)',
          text: 'var(--ctp-text)',
          subtext1: 'var(--ctp-subtext1)',
          subtext0: 'var(--ctp-subtext0)',
          overlay2: 'var(--ctp-overlay2)',
          overlay1: 'var(--ctp-overlay1)',
          overlay0: 'var(--ctp-overlay0)',
          surface2: 'var(--ctp-surface2)',
          surface1: 'var(--ctp-surface1)',
          surface0: 'var(--ctp-surface0)',
          base: 'var(--ctp-base)',
          mantle: 'var(--ctp-mantle)',
          crust: 'var(--ctp-crust)'
        },
        background: {
          DEFAULT: 'var(--color-background)',
          soft: 'var(--color-background-soft)',
          mute: 'var(--color-background-mute)'
        },
        surface: {
          0: 'var(--color-surface-0)',
          1: 'var(--color-surface-1)',
          2: 'var(--color-surface-2)'
        },
        border: {
          DEFAULT: 'var(--color-border)',
          subtle: 'var(--color-border-subtle)',
          accent: 'var(--color-border-accent)'
        },
        text: {
          DEFAULT: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          subtle: 'var(--color-text-subtle)',
          faint: 'var(--color-text-faint)'
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          text: 'var(--color-accent-text)'
        },
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)'
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        round: 'var(--radius-round)'
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)'
      },
      transitionDuration: {
        fast: 'var(--transition-fast)',
        normal: 'var(--transition-normal)',
        slow: 'var(--transition-slow)'
      },
      fontFamily: {
        mono: [
          "'JetBrains Mono'",
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace'
        ]
      },
      fontSize: {
        10: ['10px', { lineHeight: '1.4' }],
        11: ['11px', { lineHeight: '1.4' }],
        12: ['12px', { lineHeight: '1.4' }],
        13: ['13px', { lineHeight: '1.5' }]
      },
      animation: {
        'typing-bounce': 'typingBounce 1.4s infinite ease-in-out both',
        'fade-in': 'fadeIn 0.2s ease',
        'menu-fade-in': 'menuFadeIn 0.12s ease',
        spin: 'spin 1s linear infinite'
      },
      keyframes: {
        typingBounce: {
          '0%, 80%, 100%': { transform: 'scale(0.6)', opacity: '0.4' },
          '40%': { transform: 'scale(1)', opacity: '1' }
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        menuFadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none'
          }
        }
      })
    }
  ]
}
