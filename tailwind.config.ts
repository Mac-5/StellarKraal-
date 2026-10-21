import type { Config } from "tailwindcss";

/**
 * Design token system for consistent theming.
 *
 * Brand colours, font sizes, spacing, and border radii are defined here and
 * exposed as CSS custom properties (see `:root` in `app/globals.css`).
 * Tailwind `extend` values reference those custom properties so components
 * can use semantic token classes (e.g. `bg-primary`, `text-brand-500`)
 * instead of hardcoded hex values.
 *
 * See docs/guides/design-tokens.md for the full reference.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens mapped to CSS custom properties.
        primary: {
          DEFAULT: "var(--color-primary)",
          foreground: "var(--color-primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          foreground: "var(--color-secondary-foreground)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-accent-foreground)",
        },
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        muted: {
          DEFAULT: "var(--color-muted)",
          foreground: "var(--color-muted-foreground)",
        },
        border: "var(--color-border)",
        ring: "var(--color-ring)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        // Brand palette scale.
        brand: {
          50: "var(--color-brand-50)",
          100: "var(--color-brand-100)",
          200: "var(--color-brand-200)",
          300: "var(--color-brand-300)",
          400: "var(--color-brand-400)",
          500: "var(--color-brand-500)",
          600: "var(--color-brand-600)",
          700: "var(--color-brand-700)",
          800: "var(--color-brand-800)",
          900: "var(--color-brand-900)",
        },
      },
      fontSize: {
        xs: ["var(--font-size-xs)", { lineHeight: "var(--line-height-xs)" }],
        sm: ["var(--font-size-sm)", { lineHeight: "var(--line-height-sm)" }],
        base: ["var(--font-size-base)", { lineHeight: "var(--line-height-base)" }],
        lg: ["var(--font-size-lg)", { lineHeight: "var(--line-height-lg)" }],
        xl: ["var(--font-size-xl)", { lineHeight: "var(--line-height-xl)" }],
        "2xl": ["var(--font-size-2xl)", { lineHeight: "var(--line-height-2xl)" }],
        "3xl": ["var(--font-size-3xl)", { lineHeight: "var(--line-height-3xl)" }],
        "4xl": ["var(--font-size-4xl)", { lineHeight: "var(--line-height-4xl)" }],
      },
      spacing: {
        xs: "var(--space-xs)",
        sm: "var(--space-sm)",
        md: "var(--space-md)",
        lg: "var(--space-lg)",
        xl: "var(--space-xl)",
        "2xl": "var(--space-2xl)",
        "3xl": "var(--space-3xl)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
    },
  },
  plugins: [],
};

export default config;
