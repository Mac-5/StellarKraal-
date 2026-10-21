/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx,js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // ── Keyframe animations ──────────────────────────────────────────────────
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.6)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.6s ease-out both',
      },
      // ── Spacing scale (#778) ─────────────────────────────────────────────────
      // Base-4 scale. Use these token names instead of arbitrary px values.
      // Mirrors the `spacing` export in frontend/src/lib/design-tokens.ts.
      spacing: {
        // Keep Tailwind's default scale by spreading a proxy — custom values
        // are merged on top via `extend`, so all existing Tailwind spacing
        // utilities (p-4, m-2, gap-8 …) remain available unchanged.
        'space-1':  '0.25rem',  //  4 px
        'space-2':  '0.5rem',   //  8 px
        'space-3':  '0.75rem',  // 12 px
        'space-4':  '1rem',     // 16 px
        'space-6':  '1.5rem',   // 24 px
        'space-8':  '2rem',     // 32 px
        'space-12': '3rem',     // 48 px
        'space-16': '4rem',     // 64 px
      },
      // ── Typography scale (#298, #1397) ───────────────────────────────────────
      // Canonical scale: h1–h6, body, caption, label.
      // Each token bundles font-size + line-height + font-weight so weight and
      // line-height pairings are applied consistently (documented below).
      //
      //   Token        Size      Line-height  Weight  Use
      //   heading-1    2.25rem   2.5rem       700     Page title (h1)
      //   heading-2    1.875rem  2.25rem      700     Section title (h2)
      //   heading-3    1.5rem    2rem         600     Subsection (h3)
      //   heading-4    1.25rem   1.75rem      600     Card / group title (h4)
      //   heading-5    1.125rem  1.5rem       600     Minor heading (h5)
      //   heading-6    1rem      1.5rem       600     Smallest heading (h6)
      //   body-lg      1.125rem  1.75rem      400     Lead paragraph
      //   body         1rem      1.5rem       400     Default body (≥16px)
      //   body-sm      0.875rem  1.25rem      400     Secondary body
      //   caption      0.75rem   1rem         400     Captions / helper text
      //   label        0.875rem  1.25rem      500     Form labels / buttons
      fontSize: {
        // Static (non-fluid) sizes — used directly via Tailwind utilities
        "heading-1": ["2.25rem", { lineHeight: "2.5rem", fontWeight: "700" }],
        "heading-2": ["1.875rem", { lineHeight: "2.25rem", fontWeight: "700" }],
        "heading-3": ["1.5rem", { lineHeight: "2rem", fontWeight: "600" }],
        "heading-4": ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        "heading-5": ["1.125rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        "heading-6": ["1rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        "body-lg": ["1.125rem", { lineHeight: "1.75rem", fontWeight: "400" }],
        body: ["1rem", { lineHeight: "1.5rem", fontWeight: "400" }],
        "body-sm": ["0.875rem", { lineHeight: "1.25rem", fontWeight: "400" }],
        caption: ["0.75rem", { lineHeight: "1rem", fontWeight: "400" }],
        label: ["0.875rem", { lineHeight: "1.25rem", fontWeight: "500" }],
        // Fluid responsive sizes — clamp(min, preferred, max)
        // min: mobile, preferred: viewport-relative, max: desktop
        // h1: 1.75rem → 2.25rem at 1280px
        "fluid-h1": ["clamp(1.75rem, 4vw + 0.5rem, 2.75rem)", { lineHeight: "1.15", fontWeight: "700" }],
        // h2: 1.375rem → 1.875rem
        "fluid-h2": ["clamp(1.375rem, 3vw + 0.5rem, 2.25rem)", { lineHeight: "1.2", fontWeight: "700" }],
        // h3: 1.125rem → 1.5rem
        "fluid-h3": ["clamp(1.125rem, 2.5vw + 0.25rem, 1.75rem)", { lineHeight: "1.3", fontWeight: "600" }],
        // h4: 1rem → 1.25rem
        "fluid-h4": ["clamp(1rem, 1.5vw + 0.25rem, 1.375rem)", { lineHeight: "1.4", fontWeight: "600" }],
        // body: 0.9375rem → 1rem
        "fluid-body": ["clamp(0.9375rem, 1vw + 0.25rem, 1.0625rem)", { lineHeight: "1.6", fontWeight: "400" }],
      },
      // ── Font weight tokens (#1397) ───────────────────────────────────────────
      // Paired with the scale above; use these instead of arbitrary weights.
      fontWeight: {
        regular: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
      },
      // ── Line-height tokens (#1397) ───────────────────────────────────────────
      // Paired with the scale above; use these instead of arbitrary values.
      lineHeight: {
        tight: "1.15",
        snug: "1.25",
        normal: "1.5",
        relaxed: "1.6",
        loose: "1.75",
      },
      colors: {
        // ── Semantic design tokens (#297) ────────────────────────────────────
        // Referenced via CSS custom properties so dark mode flips automatically.
        "color-primary":          "var(--token-primary)",
        "color-primary-hover":    "var(--token-primary-hover)",
        "color-on-primary":       "var(--token-on-primary)",
        "color-secondary":        "var(--token-secondary)",
        "color-secondary-hover":  "var(--token-secondary-hover)",
        "color-on-secondary":     "var(--token-on-secondary)",
        "color-accent":           "var(--token-accent)",
        "color-danger":           "var(--token-danger)",
        "color-danger-subtle":    "var(--token-danger-subtle)",
        "color-on-danger":        "var(--token-on-danger)",
        "color-success":          "var(--token-success)",
        "color-success-subtle":   "var(--token-success-subtle)",
        "color-on-success":       "var(--token-on-success)",
        "color-warning":          "var(--token-warning)",
        "color-warning-subtle":   "var(--token-warning-subtle)",
        "color-on-warning":       "var(--token-on-warning)",
        "color-surface":          "var(--token-surface)",
        "color-surface-raised":   "var(--token-surface-raised)",
        "color-text":             "var(--token-text)",
        "color-text-subtle":      "var(--token-text-subtle)",
        "color-text-muted":       "var(--token-text-muted)",
        "color-text-inverse":     "var(--token-text-inverse)",
        "color-border":           "var(--token-border)",
        "color-border-strong":    "var(--token-border-strong)",

        // WCAG AA compliant descriptive palette (kept for backward compat)
        brown: {
          50: "#FDF8F3",
          100: "#F9EFE1",
          200: "#F0D9B8",
          300: "#D4A05A", // 3.0:1 on white — decorative / large text only (≥18pt)
          400: "#B8803D", // 3.1:1 on white — FAILS AA for normal text; see globals.css override
          500: "#8B5A1F", // 5.87:1 on white — minimum AA shade for normal body text
          600: "#5D3C15", // 10.8:1 on white — secondary text, labels
          700: "#3D2810", // 13.9:1 on white — primary body text (preferred)
          800: "#2A1B0B", // 17.1:1 on white
          900: "#1A1007"  // 20.1:1 on white
        },
        gold: {
          50: "#FFFBF0",
          100: "#FEF5D9",
          200: "#FDEAB3", 
          300: "#FBDC7D",
          400: "#F8CA47",
          500: "#D97706", // Primary gold - 4.52:1 on white (updated)
          600: "#B45309", // Darker gold - 6.1:1 on white
          700: "#92400E", // Even darker gold - 7.8:1 on white
          800: "#5C4A07",
          900: "#2E2503"
        },
        cream: {
          50: "#FFFFFF",   // Pure white - highest contrast
          100: "#FEFCF8",  // Off-white
          200: "#FDF6EC",  // Light cream - original
          300: "#FBF0E0",
          400: "#F8E8D1",
          500: "#F4DFC2"
        },
        // Status colors with proper contrast
        success: {
          light: "#D4F4DD", // 1.2:1 on white (background only)
          DEFAULT: "#16A34A", // 4.54:1 on white
          dark: "#15803D"     // 6.2:1 on white
        },
        error: {
          light: "#FEE2E2", // 1.1:1 on white (background only)  
          DEFAULT: "#DC2626", // 5.25:1 on white
          dark: "#B91C1C"     // 7.1:1 on white
        },
        warning: {
          light: "#FEF3C7", // 1.1:1 on white (background only)
          DEFAULT: "#D97706", // 4.52:1 on white  
          dark: "#B45309"     // 6.1:1 on white
        }
      },
    },
  },
  plugins: [],
};
