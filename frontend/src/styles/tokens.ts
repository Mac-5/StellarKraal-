/**
 * Semantic color token system.
 *
 * Central source of truth for colors used across the frontend. Components
 * should reference these semantic tokens (via CSS variables or the exported
 * objects) instead of hardcoding raw color values. Each token exposes a
 * light and dark mode variant so themes can be swapped without touching
 * component code.
 */

export type ColorMode = 'light' | 'dark';

export type SemanticColorName =
  | 'primary'
  | 'secondary'
  | 'surface'
  | 'error'
  | 'warning'
  | 'success'
  | 'info';

export interface ColorVariant {
  /** Base color for the token. */
  base: string;
  /** Foreground/text color that is legible on top of `base`. */
  foreground: string;
  /** Subtle background tint derived from the token. */
  subtle: string;
  /** Border color derived from the token. */
  border: string;
}

export type SemanticColorTokens = Record<SemanticColorName, ColorVariant>;

export const lightTokens: SemanticColorTokens = {
  primary: {
    base: '#2563eb',
    foreground: '#ffffff',
    subtle: '#eff6ff',
    border: '#bfdbfe',
  },
  secondary: {
    base: '#7c3aed',
    foreground: '#ffffff',
    subtle: '#f5f3ff',
    border: '#ddd6fe',
  },
  surface: {
    base: '#ffffff',
    foreground: '#111827',
    subtle: '#f9fafb',
    border: '#e5e7eb',
  },
  error: {
    base: '#dc2626',
    foreground: '#ffffff',
    subtle: '#fef2f2',
    border: '#fecaca',
  },
  warning: {
    base: '#d97706',
    foreground: '#ffffff',
    subtle: '#fffbeb',
    border: '#fde68a',
  },
  success: {
    base: '#16a34a',
    foreground: '#ffffff',
    subtle: '#f0fdf4',
    border: '#bbf7d0',
  },
  info: {
    base: '#0891b2',
    foreground: '#ffffff',
    subtle: '#ecfeff',
    border: '#a5f3fc',
  },
};

export const darkTokens: SemanticColorTokens = {
  primary: {
    base: '#3b82f6',
    foreground: '#ffffff',
    subtle: '#1e3a8a',
    border: '#1d4ed8',
  },
  secondary: {
    base: '#a78bfa',
    foreground: '#111827',
    subtle: '#4c1d95',
    border: '#6d28d9',
  },
  surface: {
    base: '#111827',
    foreground: '#f9fafb',
    subtle: '#1f2937',
    border: '#374151',
  },
  error: {
    base: '#f87171',
    foreground: '#111827',
    subtle: '#7f1d1d',
    border: '#b91c1c',
  },
  warning: {
    base: '#fbbf24',
    foreground: '#111827',
    subtle: '#78350f',
    border: '#b45309',
  },
  success: {
    base: '#4ade80',
    foreground: '#111827',
    subtle: '#14532d',
    border: '#15803d',
  },
  info: {
    base: '#22d3ee',
    foreground: '#111827',
    subtle: '#164e63',
    border: '#0e7490',
  },
};

export const colorTokens: Record<ColorMode, SemanticColorTokens> = {
  light: lightTokens,
  dark: darkTokens,
};

export const semanticColorNames: SemanticColorName[] = [
  'primary',
  'secondary',
  'surface',
  'error',
  'warning',
  'success',
  'info',
];

/**
 * Flatten tokens into CSS custom properties for a given mode.
 * Produces variables such as `--color-primary`, `--color-primary-foreground`,
 * `--color-primary-subtle`, and `--color-primary-border`.
 */
export function toCssVariables(mode: ColorMode): Record<string, string> {
  const tokens = colorTokens[mode];
  const vars: Record<string, string> = {};

  for (const name of semanticColorNames) {
    const variant = tokens[name];
    vars[`--color-${name}`] = variant.base;
    vars[`--color-${name}-foreground`] = variant.foreground;
    vars[`--color-${name}-subtle`] = variant.subtle;
    vars[`--color-${name}-border`] = variant.border;
  }

  return vars;
}

/**
 * Serialize the CSS variables for a mode into a declaration block suitable
 * for injecting into a stylesheet or inline style attribute.
 */
export function toCssVariableBlock(mode: ColorMode): string {
  return Object.entries(toCssVariables(mode))
    .map(([key, value]) => `${key}: ${value};`)
    .join(' ');
}
