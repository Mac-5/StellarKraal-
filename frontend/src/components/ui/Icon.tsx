import { forwardRef } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<IconSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

export interface IconProps extends Omit<LucideProps, 'size' | 'aria-label'> {
  /** The lucide-react icon component to render. */
  icon: LucideIcon;
  /** Named size token; enforces consistent sizing across the app. */
  size?: IconSize;
  /**
   * Accessible label. Required unless the icon is purely decorative
   * (in which case pass `decorative` and it will be hidden from AT).
   */
  label?: string;
  /** Mark the icon as decorative so it is hidden from assistive tech. */
  decorative?: boolean;
}

/**
 * Shared Icon wrapper — the single entry point for rendering icons.
 *
 * Usage guidelines:
 * - Always import icons from `lucide-react` and render them through this
 *   component; do not use ad-hoc inline SVGs or other icon libraries.
 * - Use the named `size` tokens (xs/sm/md/lg/xl) instead of raw pixel sizes
 *   so stroke weight and dimensions stay consistent.
 * - Provide a `label` for meaningful icons (buttons, links). For purely
 *   decorative icons next to visible text, pass `decorative` instead.
 */
export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { icon: IconComponent, size = 'md', label, decorative = false, ...rest },
  ref,
) {
  const dimension = SIZE_MAP[size];
  const a11yProps = decorative
    ? { 'aria-hidden': true as const, focusable: false as const }
    : { role: 'img' as const, 'aria-label': label };

  return (
    <IconComponent
      ref={ref}
      size={dimension}
      strokeWidth={2}
      {...a11yProps}
      {...rest}
    />
  );
});

export default Icon;
