/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:        'var(--ink)',
        'ink-2':    'var(--ink-2)',
        'ink-3':    'var(--ink-3)',
        paper:      'var(--paper)',
        surface:    'var(--surface)',
        line:       'var(--line)',
        green:      'var(--green)',
        'green-deep':'var(--green-deep)',
        'green-soft':'var(--green-soft)',
        warn:       'var(--warn)',
        'warn-soft':'var(--warn-soft)',
        success:    'var(--success)',
        danger:     'var(--danger)',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans:    ['"Inter Tight"', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '14px',
        lg: '20px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 0 rgba(20,23,43,.04), 0 8px 24px -12px rgba(20,23,43,.18)',
      },
    },
  },
  plugins: [],
}
