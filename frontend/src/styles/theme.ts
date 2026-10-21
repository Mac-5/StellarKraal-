/**
 * Semantic color token system.
 *
 * Central source of truth for colors used across the frontend. Components
 * should reference these semantic tokens (e.g. `tokens.light.primary`) rather
 * than raw color values so that brand updates and dark mode are consistent.
 */

export type ColorMode = 'light' | 'dark';

export interface SemanticColorTokens {
  primary: string;
  secondary: string;
  surface: string;
  error: string;
  warning: string;
  success: string;
  info: string;
}

export interface ColorTokenSet {
  light: SemanticColorTokens;
  dark: SemanticColorTokens;
}

export const colorTokens: ColorTokenSet = {
  light: {
    primary: '#2563eb',
    secondary: '#7c3aed',
    surface: '#ffffff',
    error: '#dc2626',
    warning: '#d97706',
    success: '#16a34a',
    info: '#0891b2',
  },
  dark: {
    primary: '#60a5fa',
    secondary: '#a78bfa',
    surface: '#0f172a',
    error: '#f87171',
    warning: '#fbbf24',
    success: '#4ade80',
    info: '#22d3ee',
  },
};

/** Human-readable labels for the design reference page. */
export const tokenLabels: Record<keyof SemanticColorTokens, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  surface: 'Surface',
  error: 'Error',
  warning: 'Warning',
  success: 'Success',
  info: 'Info',
};

/** Ordered list of token keys, useful for iterating swatches. */
export const tokenKeys: Array<keyof SemanticColorTokens> = [
  'primary',
  'secondary',
  'surface',
  'error',
  'warning',
  'success',
  'info',
];

/**
 * Resolve the semantic token set for a given color mode.
 * Defaults to light mode when no mode is provided.
 */
export function getColorTokens(mode: ColorMode = 'light'): SemanticColorTokens {
  return colorTokens[mode];
}

/**
 * Emit CSS custom properties for the given mode so components can consume
 * tokens via `var(--color-primary)` etc.
 */
export function toCssVariables(mode: ColorMode = 'light'): Record<string, string> {
  const tokens = getColorTokens(mode);
  return tokenKeys.reduce<Record<string, string>>((vars, key) => {
    vars[`--color-${key}`] = tokens[key];
    return vars;
  }, {});
}
