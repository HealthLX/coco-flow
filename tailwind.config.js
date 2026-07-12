/** Wraps a channel-triplet custom property so Tailwind's `/opacity` modifiers still work. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Existing literal palette — kept so every current class keeps working unchanged.
        coco: {
          red: '#c0392b',
          'red-hover': '#96281b',
          navy: '#0d1b2a',
          'navy-light': '#1a2e42',
          magenta: '#E60073',
          log: '#1e2d3d',
        },

        // Token-backed palette — theme-aware, opacity-capable.
        brand: {
          DEFAULT: token('brand'),
          hover: token('brand-hover'),
          fg: token('brand-fg'),
        },
        accent: token('accent'),
        navy: {
          DEFAULT: token('navy'),
          2: token('navy-2'),
        },

        bg: token('bg'),
        surface: {
          DEFAULT: token('surface'),
          2: token('surface-2'),
          3: token('surface-3'),
        },
        line: {
          DEFAULT: token('border'),
          strong: token('border-strong'),
        },
        fg: {
          DEFAULT: token('fg'),
          body: token('fg-body'),
          muted: token('fg-muted'),
          subtle: token('fg-subtle'),
        },

        ok: { DEFAULT: token('ok'), bg: token('ok-bg'), border: token('ok-border') },
        warn: { DEFAULT: token('warn'), bg: token('warn-bg'), border: token('warn-border') },
        err: { DEFAULT: token('err'), bg: token('err-bg'), border: token('err-border') },

        canonical: {
          DEFAULT: token('canonical'),
          bg: token('canonical-bg'),
          border: token('canonical-border'),
        },
        fhir: { DEFAULT: token('fhir'), bg: token('fhir-bg'), border: token('fhir-border') },
        xsd: { DEFAULT: token('xsd'), bg: token('xsd-bg'), border: token('xsd-border') },
        xslt: { DEFAULT: token('xslt'), bg: token('xslt-bg'), border: token('xslt-border') },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Fira Code"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
      transitionTimingFunction: {
        flow: 'var(--ease)',
      },
      keyframes: {
        // The pipeline rail's travelling-data effect: a marching dashed stroke.
        'flow-dash': {
          to: { strokeDashoffset: '-24' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0.45)' },
          '100%': { boxShadow: '0 0 0 12px rgb(var(--accent) / 0)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        // A packet of data crossing the edge between two stages.
        'flow-packet': {
          '0%': { left: '0%', opacity: '0' },
          '15%': { opacity: '1' },
          '85%': { opacity: '1' },
          '100%': { left: '100%', opacity: '0' },
        },
      },
      animation: {
        'flow-dash': 'flow-dash 1s linear infinite',
        'pulse-ring': 'pulse-ring 1.6s var(--ease) infinite',
        'fade-up': 'fade-up var(--dur) var(--ease) both',
        'flow-packet': 'flow-packet 1.4s var(--ease) infinite',
      },
    },
  },
  plugins: [],
}
