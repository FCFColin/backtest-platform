/* eslint-disable @typescript-eslint/no-require-imports -- CJS 配置文件必须使用 require */
const path = require('path');
const animate = require('tailwindcss-animate');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    path.resolve(__dirname, 'index.html'),
    path.resolve(__dirname, 'packages/frontend/src/**/*.{js,ts,jsx,tsx}'),
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem' },
      screens: { '2xl': '1280px' },
    },
    extend: {
      spacing: {
        15: '3.75rem',
      },
      colors: {
        app: 'hsl(var(--app))',
        surface: 'hsl(var(--surface))',
        elevated: 'hsl(var(--elevated))',
        'input-bg': 'hsl(var(--input-bg))',
        hover: 'hsl(var(--hover))',
        border: {
          DEFAULT: 'hsl(var(--border))',
          subtle: 'hsl(var(--border-subtle))',
          strong: 'hsl(var(--border-strong))',
        },
        fg: {
          DEFAULT: 'hsl(var(--fg))',
          secondary: 'hsl(var(--fg-secondary))',
          tertiary: 'hsl(var(--fg-tertiary))',
          disabled: 'hsl(var(--fg-disabled))',
        },
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          hover: 'hsl(var(--brand-hover))',
          active: 'hsl(var(--brand-active))',
          fg: 'hsl(var(--brand-fg))',
          subtle: 'hsl(var(--brand-subtle) / <alpha-value>)',
          glow: 'hsl(var(--brand-glow) / <alpha-value>)',
        },
        success: 'hsl(var(--success))',
        'success-subtle': 'hsl(var(--success-subtle) / <alpha-value>)',
        danger: 'hsl(var(--danger))',
        'danger-subtle': 'hsl(var(--danger-subtle) / <alpha-value>)',
        warning: 'hsl(var(--warning))',
        'warning-subtle': 'hsl(var(--warning-subtle) / <alpha-value>)',
        'info-subtle': 'hsl(var(--info-subtle) / <alpha-value>)',
        pos: 'hsl(var(--pos))',
        neg: 'hsl(var(--neg))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        'surface-raised': 'hsl(var(--surface-raised))',
        'surface-sunken': 'hsl(var(--surface-sunken))',
        'chart-1': 'hsl(var(--chart-1))',
        'chart-2': 'hsl(var(--chart-2))',
        'chart-3': 'hsl(var(--chart-3))',
        'chart-4': 'hsl(var(--chart-4))',
        'chart-5': 'hsl(var(--chart-5))',
        'chart-6': 'hsl(var(--chart-6))',
        'chart-7': 'hsl(var(--chart-7))',
        'chart-8': 'hsl(var(--chart-8))',
        'chart-grid': 'hsl(var(--chart-grid))',
        'chart-tooltip-bg': 'hsl(var(--chart-tooltip-bg) / <alpha-value>)',
        'sticky-bg': 'hsl(var(--sticky-bg) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Geist Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono Variable', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-xl': ['44px', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '800' }],
        display: ['32px', { lineHeight: '1.15', letterSpacing: '-0.015em', fontWeight: '700' }],
        h1: ['24px', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '700' }],
        h2: ['18px', { lineHeight: '1.35', letterSpacing: '-0.005em', fontWeight: '600' }],
        h3: ['15px', { lineHeight: '1.4', fontWeight: '600' }],
        body: ['14px', { lineHeight: '1.6', fontWeight: '400' }],
        label: ['13px', { lineHeight: '1.4', fontWeight: '500' }],
        'label-tiny': ['11px', { lineHeight: '1.3', letterSpacing: '0.06em', fontWeight: '600' }],
        caption: ['12px', { lineHeight: '1.4', fontWeight: '400' }],
        micro: ['10px', { lineHeight: '1.3', letterSpacing: '0.05em', fontWeight: '500' }],
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
        full: '9999px',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'accordion-up': 'accordion-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [animate],
};
