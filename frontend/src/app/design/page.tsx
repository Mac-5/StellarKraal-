'use client';

import { useEffect, useState } from 'react';

type ColorMode = 'light' | 'dark';

type SemanticToken =
  | 'primary'
  | 'secondary'
  | 'surface'
  | 'error'
  | 'warning'
  | 'success'
  | 'info';

interface TokenDefinition {
  label: string;
  description: string;
  light: string;
  dark: string;
}

/**
 * Central semantic color token config.
 *
 * Components should reference these tokens (via CSS variables such as
 * `var(--color-primary)`) rather than raw color values. Each token exposes
 * a light and dark variant so the same semantic name works in both modes.
 */
export const semanticColorTokens: Record<SemanticToken, TokenDefinition> = {
  primary: {
    label: 'Primary',
    description: 'Primary brand actions, links, and focus states.',
    light: '#2563eb',
    dark: '#60a5fa',
  },
  secondary: {
    label: 'Secondary',
    description: 'Supporting actions and secondary emphasis.',
    light: '#7c3aed',
    dark: '#a78bfa',
  },
  surface: {
    label: 'Surface',
    description: 'Page and card backgrounds.',
    light: '#ffffff',
    dark: '#0f172a',
  },
  error: {
    label: 'Error',
    description: 'Destructive actions and validation failures.',
    light: '#dc2626',
    dark: '#f87171',
  },
  warning: {
    label: 'Warning',
    description: 'Cautionary states that need attention.',
    light: '#d97706',
    dark: '#fbbf24',
  },
  success: {
    label: 'Success',
    description: 'Confirmations and completed states.',
    light: '#16a34a',
    dark: '#4ade80',
  },
  info: {
    label: 'Info',
    description: 'Neutral informational messaging.',
    light: '#0891b2',
    dark: '#22d3ee',
  },
};

const tokenOrder: SemanticToken[] = [
  'primary',
  'secondary',
  'surface',
  'error',
  'warning',
  'success',
  'info',
];

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-16 w-full rounded-md border border-gray-200"
        style={{ backgroundColor: color }}
        aria-label={`${label} swatch`}
      />
      <code className="text-xs text-gray-600">{color}</code>
    </div>
  );
}

export default function DesignReferencePage() {
  const [mode, setMode] = useState<ColorMode>('light');

  useEffect(() => {
    const root = document.documentElement;
    tokenOrder.forEach((token) => {
      root.style.setProperty(
        `--color-${token}`,
        semanticColorTokens[token][mode],
      );
    });
  }, [mode]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Design Reference</h1>
          <p className="mt-1 text-sm text-gray-600">
            Semantic color tokens used across the application. Reference these
            tokens instead of raw color values.
          </p>
        </div>
        <div className="inline-flex rounded-md border border-gray-300 p-1">
          {(['light', 'dark'] as ColorMode[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={`rounded px-3 py-1 text-sm capitalize ${
                mode === option
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700'
              }`}
              aria-pressed={mode === option}
            >
              {option}
            </button>
          ))}
        </div>
      </header>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tokenOrder.map((token) => {
          const definition = semanticColorTokens[token];
          return (
            <article
              key={token}
              className="rounded-lg border border-gray-200 p-4"
            >
              <h2 className="text-base font-medium">{definition.label}</h2>
              <p className="mb-3 mt-1 text-sm text-gray-600">
                {definition.description}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Swatch
                  color={definition.light}
                  label={`${definition.label} light`}
                />
                <Swatch
                  color={definition.dark}
                  label={`${definition.label} dark`}
                />
              </div>
              <code className="mt-3 block text-xs text-gray-500">
                var(--color-{token})
              </code>
            </article>
          );
        })}
      </section>
    </main>
  );
}
