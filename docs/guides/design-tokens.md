# Design Tokens Guide

Design tokens are the single source of truth for the visual language of StellarKraal. This guide explains how to use, understand, and extend design tokens.

> **Live reference:** The [Color Palette page](/docs/colors) (accessible from the Admin sidebar → *Color Palette*) shows all semantic tokens as live swatches with their CSS variable names, usage examples, and WCAG contrast ratios. Admin login required.

## Overview

Design tokens are defined in two layers:

1. **Tailwind config** (`frontend/tailwind.config.ts`) — the brand colour palette, font sizes, spacing scale, and border radii are declared under `theme.extend`. Each value is mapped to a CSS custom property (e.g. `--color-primary`) so themes can be swapped at runtime.
2. **CSS custom properties** (`frontend/src/app/globals.css`) — the `:root` block defines the actual values for every `--color-*`, `--font-size-*`, `--spacing-*`, and `--radius-*` variable referenced by the Tailwind config.

On top of these primitives, `frontend/src/lib/design-tokens.ts` exports semantic JavaScript objects (button, text, status, form tokens) that compose the Tailwind classes. Components should consume these tokens rather than hardcoded hex values or ad-hoc class strings.

All colors meet **WCAG 2.1 AA contrast requirements** (4.5:1 for normal text, 3:1 for large text).

## Tailwind Config Tokens

### Brand Colour Palette

The palette is exposed as `colors.brand` and `colors.status`, each backed by a CSS variable:

```typescript
// frontend/tailwind.config.ts (excerpt)
extend: {
  colors: {
    brand: {
      primary: 'var(--color-primary)',
      secondary: 'var(--color-secondary)',
      accent: 'var(--color-accent)',
    },
    status: {
      success: 'var(--color-success)',
      warning: 'var(--color-warning)',
      error: 'var(--color-error)',
    },
  },
}
```

Use these as `bg-brand-primary`, `text-brand-secondary`, `border-status-error`, etc.

### Font Sizes

```typescript
fontSize: {
  h1: 'var(--font-size-h1)',
  h2: 'var(--font-size-h2)',
  h3: 'var(--font-size-h3)',
  h4: 'var(--font-size-h4)',
  body: 'var(--font-size-body)',
  'body-sm': 'var(--font-size-body-sm)',
  caption: 'var(--font-size-caption)',
  label: 'var(--font-size-label)',
}
```

### Spacing Scale

```typescript
spacing: {
  xs: 'var(--spacing-xs)',
  sm: 'var(--spacing-sm)',
  md: 'var(--spacing-md)',
  lg: 'var(--spacing-lg)',
  xl: 'var(--spacing-xl)',
}
```

### Border Radii

```typescript
borderRadius: {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  full: 'var(--radius-full)',
}
```

## CSS Custom Properties

Every Tailwind token resolves to a CSS variable declared in `globals.css`:

```css
:root {
  --color-primary: #6b4423;
  --color-secondary: #b8860b;
  --color-accent: #d4a017;
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-error: #dc2626;

  --font-size-h1: 2.25rem;
  --font-size-h2: 1.875rem;
  --font-size-h3: 1.5rem;
  --font-size-h4: 1.25rem;
  --font-size-body: 1rem;
  --font-size-body-sm: 0.875rem;
  --font-size-caption: 0.75rem;
  --font-size-label: 0.875rem;

  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;

  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 1rem;
  --radius-full: 9999px;
}
```

Rebranding only requires overriding these variables (e.g. in a `[data-theme="dark"]` block) — no component changes needed.

## Color Tokens

### Primary and Secondary Colors

```typescript
import { colors } from '@/lib/design-tokens';

// Primary brand (brown)
colors.primary.bg        // 'bg-brown-600' — primary button background
colors.primary.text      // 'text-cream-50' — text on primary background
colors.primary.hover     // 'hover:bg-brown-700' — hover state
colors.primary.border    // 'border-brown-600' — border color

// Secondary brand (gold)
colors.secondary.bg      // 'bg-gold-600' — secondary button background
colors.secondary.text    // 'text-cream-50' — text on secondary background
colors.secondary.hover   // 'hover:bg-gold-700' — hover state
colors.secondary.border  // 'border-gold-600' — border color
```

**Usage in components:**

```tsx
<button className={`${colors.primary.bg} ${colors.primary.text} ${colors.primary.hover}`}>
  Click me
</button>
```

### Text Colors

All text colors are WCAG AA compliant:

```typescript
colors.text.primary      // 'text-brown-700' — 13.9:1 contrast on white
colors.text.secondary    // 'text-brown-600' — 10.8:1 contrast on white
colors.text.muted        // 'text-brown-500' — 5.87:1 contrast on white
colors.text.inverse      // 'text-cream-50' — high contrast on dark backgrounds
```

**When to use:**

- **Primary**: Main body text, headings on light backgrounds
- **Secondary**: Subtext, metadata, supporting information
- **Muted**: Disabled text, helper text, less emphasized content
- **Inverse**: Text on dark backgrounds, overlays

### Background Colors

```typescript
colors.background.primary    // 'bg-cream-50' — page background (pure white)
colors.background.secondary  // 'bg-cream-200' — light sections
colors.background.card       // 'bg-cream-50' — card backgrounds
colors.background.overlay    // 'bg-brown-900/80' — modal/dialog overlays
```

### Interactive States

```typescript
colors.interactive.default   // 'bg-brown-600 text-cream-50' — default button
colors.interactive.hover     // 'hover:bg-brown-700' — hover state
colors.interactive.focus     // 'focus:ring-2 focus:ring-brown-600 focus:ring-offset-2' — focus ring
colors.interactive.disabled  // 'disabled:bg-brown-300 disabled:text-brown-600' — disabled state
```

**Usage:**

```tsx
<button className={colors.interactive.default}>
  Normal button
</button>

<button disabled className={`${colors.interactive.default} ${colors.interactive.disabled}`}>
  Disabled button
</button>
```

### Status Colors

Status colors communicate state to users:

```typescript
colors.status.success.bg       // 'bg-success-light' — light green background
colors.status.success.text     // 'text-success-dark' — dark green text
colors.status.success.border   // 'border-success' — green border

colors.status.error.bg         // 'bg-error-light' — light red background
colors.status.error.text       // 'text-error-dark' — dark red text
colors.status.error.border     // 'border-error' — red border

colors.status.warning.bg       // 'bg-warning-light' — light orange background
colors.status.warning.text     // 'text-warning-dark' — dark orange text
colors.status.warning.border   // 'border-warning' — orange border
```

**Usage in alerts:**

```tsx
<div className={colors.status.success.bg}>
  <p className={colors.status.success.text}>Loan approved!</p>
</div>
```

### Form Colors

```typescript
colors.form.input        // 'border-brown-500 focus:border-brown-600 focus:ring-brown-600'
colors.form.label        // 'text-brown-700' — label text
colors.form.placeholder  // 'placeholder-brown-500' — placeholder text
colors.form.error        // 'border-error text-error-dark' — error state
```

**Usage:**

```tsx
<label className={colors.form.label}>
  Collateral Value
</label>
<input
  type="number"
  placeholder="Amount in stroops"
  className={isError ? colors.form.error : colors.form.input}
  aria-invalid={isError}
/>
```

## Typography Tokens

Typography tokens define heading, body, and caption styles:

```typescript
import { typography } from '@/lib/design-tokens';

typography.heading.h1    // 'text-h1' — large page headings
typography.heading.h2    // 'text-h2' — section headings
typography.heading.h3    // 'text-h3' — subsection headings
typography.heading.h4    // 'text-h4' — smaller headings

typography.body.default  // 'text-body' — normal paragraph text
typography.body.sm       // 'text-body-sm' — small text

typography.caption       // 'text-caption' — captions, metadata
typography.label         // 'text-label' — form labels
```

**Usage:**

```tsx
<h1 className={typography.heading.h1}>Welcome to StellarKraal</h1>
<p className={typography.body.default}>Get started by connecting your wallet.</p>
<p className={typography.caption}>Powered by Stellar</p>
```

## Utility Functions

### `getContrastPair(background: 'light' | 'dark')`

Returns a contrast-compliant text and background color pair:

```typescript
import { getContrastPair } from '@/lib/design-tokens';

// For light backgrounds
const light = getContrastPair('light');
// { bg: 'bg-cream-50', text: 'text-brown-700' }

// For dark backgrounds
const dark = getContrastPair('dark');
// { bg: 'bg-brown-700', text: 'text-cream-50' }
```

**Usage in dynamic components:**

```tsx
function Card({ isDark }: { isDark: boolean }) {
  const { bg, text } = getContrastPair(isDark ? 'dark' : 'light');
  return <div className={`${bg} ${text} p-4`}>Content</div>;
}
```

### `healthColor(value: number): string`

Returns an RGB hex color based on loan health factor:

```typescript
import { healthColor } from '@/lib/design-tokens';

healthColor(15000)  // '#16A34A' — success (green), 4.54:1 contrast
healthColor(10000)  // '#D97706' — warning (orange), 4.52:1 contrast
healthColor(5000)   // '#DC2626' — error (red), 5.25:1 contrast
```

**Thresholds:**

- ≥ 15,000: Success (green)
- ≥ 10,000: Warning (orange)
- < 10,000: Error (red)

**Usage:**

```tsx
function HealthIndicator({ loanId }: { loanId: string }) {
  const loan = getLoan(loanId);
  const color = healthColor(loan.healthFactor);
  
  return (
    <div
      className="w-4 h-4 rounded-full"
      style={{ backgroundColor: color }}
      title={`Health factor: ${loan.healthFactor}`}
    />
  );
}
```

## Light and Dark Mode Support

All design tokens automatically support light and dark themes through CSS variables and Tailwind's built-in `dark:` prefix.

### Example: Light/Dark Mode Toggle

```tsx
function ComponentWithModeSupport() {
  return (
    <div className={`
      ${colors.background.primary}
      dark:bg-brown-800
      ${colors.text.primary}
      dark:text-cream-50
      p-4
    `}>
      Content adapts to light and dark mode
    </div>
  );
}
```

### Verification

Always verify WCAG AA compliance when adding new color pairs:

- Use [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- Ensure **4.5:1 ratio** for normal text
- Ensure **3:1 ratio** for large text (18pt or 14pt bold+)
- Test with [WAVE Browser Extension](https://wave.webaim.org/extension/) or similar

## Adding a New Token

### 1. Define the CSS custom property

Add the variable to the `:root` block in `frontend/src/app/globals.css`:

```css
:root {
  --color-info: #2563eb;
}
```

### 2. Map it in `tailwind.config.ts`

Reference the variable under `theme.extend` so Tailwind generates utilities:

```typescript
extend: {
  colors: {
    status: {
      info: 'var(--color-info)',
    },
  },
}
```

### 3. Expose a semantic token in `design-tokens.ts`

```typescript
export const colors = {
  status: {
    info: {
      bg: 'bg-status-info/10',
      text: 'text-status-info',
      border: 'border-status-info',
    },
  },
};
```

### 4. Document it

Add the new token to this guide with its CSS variable name, Tailwind class, and contrast ratio.

## Migration Checklist

When touching a component, replace hardcoded values with tokens:

- [ ] Hex colours (`#6b4423`) → `bg-brand-primary` / `text-brand-primary`
- [ ] Arbitrary font sizes (`text-[18px]`) → `text-h4` / `text-body`
- [ ] Arbitrary spacing (`p-[13px]`) → `p-md` / `gap-lg`
- [ ] Arbitrary radii (`rounded-[6px]`) → `rounded-md`
