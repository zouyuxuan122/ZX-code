import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
          elevated: 'var(--bg-elevated)',
          overlay: 'var(--bg-overlay)',
        },
        border: {
          DEFAULT: 'var(--border-default)',
          default: 'var(--border-default)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
          hover: 'var(--border-hover)',
          glow: 'var(--border-glow)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          link: 'var(--text-link)',
        },
        accent: {
          blue: 'var(--accent-blue)',
          'blue-hover': 'var(--accent-blue-hover)',
          green: 'var(--accent-green)',
          orange: 'var(--accent-orange)',
          red: 'var(--accent-red)',
          purple: 'var(--accent-purple)',
          coffee: 'var(--accent-coffee)',
        },
        shadow: {
          sm: 'var(--shadow-sm)',
          md: 'var(--shadow-md)',
          lg: 'var(--shadow-lg)',
          glow: 'var(--shadow-glow)',
          inset: 'var(--shadow-inset)',
        },
        hover: {
          surface: 'var(--hover-surface)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'Segoe UI', 'Microsoft YaHei', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs: ['11px', '1.25'],
        sm: ['12px', '1.5'],
        base: ['13px', '1.5'],
        md: ['14px', '1.5'],
        lg: ['16px', '1.5'],
        xl: ['20px', '1.25'],
        '2xl': ['24px', '1.25'],
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
      transitionDuration: {
        fast: '180ms',
        normal: '280ms',
        slow: '450ms',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-cubic': 'cubic-bezier(0.65, 0, 0.35, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        glow: 'var(--shadow-glow)',
      },
      keyframes: {
        'text-shimmer': {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        'border-glow': {
          '0%, 100%': { borderColor: 'transparent', boxShadow: 'none' },
          '25%': { borderColor: 'var(--accent-blue)', boxShadow: '0 0 6px var(--accent-blue)' },
          '50%': { borderColor: 'var(--accent-purple)', boxShadow: '0 0 10px var(--accent-purple)' },
          '75%': { borderColor: 'var(--accent-blue)', boxShadow: '0 0 6px var(--accent-blue)' },
        },
        'typing-bounce': {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.3' },
          '30%': { transform: 'translateY(-6px)', opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.92) translateY(4px)' },
          '60%': { opacity: '1', transform: 'scale(1.02) translateY(-1px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'rotate-in': {
          from: { opacity: '0', transform: 'rotate(-3deg) scale(0.96)' },
          to: { opacity: '1', transform: 'rotate(0) scale(1)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        'slide-indicator': {
          from: { transform: 'scaleY(0)' },
          to: { transform: 'scaleY(1)' },
        },
        'border-shimmer': {
          '0%, 100%': { borderColor: 'var(--border-default)' },
          '50%': {
            borderColor: 'var(--border-hover)',
            boxShadow: '0 0 16px var(--border-glow)',
          },
        },
      },
      animation: {
        'text-shimmer': 'text-shimmer 3s linear infinite',
        'border-glow': 'border-glow 3s ease-in-out infinite',
        'typing-bounce': 'typing-bounce 1.4s ease-in-out infinite',
        'fade-in-up': 'fade-in-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
        float: 'float 3s cubic-bezier(0.65, 0, 0.35, 1) infinite',
        'pulse-soft': 'pulse-soft 2s cubic-bezier(0.65, 0, 0.35, 1) infinite',
        'pop-in': 'pop-in 280ms cubic-bezier(0.34, 1.4, 0.64, 1) both',
        'rotate-in': 'rotate-in 350ms cubic-bezier(0.34, 1.4, 0.64, 1) both',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.16, 1, 0.3, 1) infinite',
        'slide-indicator': 'slide-indicator 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'border-shimmer': 'border-shimmer 600ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config
