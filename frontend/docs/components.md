# Component Documentation

This document describes shared UI components and their usage guidelines.

## Icon

All icons in the app come from a single library: [`lucide-react`](https://lucide.dev/). Do not add icons from other libraries and do not hand-roll ad-hoc inline SVGs.

Icons are rendered through the shared `Icon` component (`frontend/src/components/Icon.tsx`), which enforces consistent sizing and accessibility.

### Usage

```tsx
import { Icon } from "@/components/Icon";
import { Trash2 } from "lucide-react";

<Icon icon={Trash2} label="Delete loan" />
```

### Guidelines

- **Single source:** import icon components only from `lucide-react`. If an icon is missing, pick the closest lucide equivalent rather than introducing another library or an inline SVG.
- **Always use `Icon`:** never render a lucide icon directly in a component. Wrap it in `Icon` so sizing and accessibility stay consistent.
- **Sizing:** `Icon` defaults to a consistent size (`size="md"`). Use the `size` prop (`sm` | `md` | `lg`) instead of passing arbitrary pixel values.
- **Accessibility:** `label` is required and becomes the icon's `aria-label`. For purely decorative icons that sit next to visible text, pass `decorative` so the icon is hidden from assistive tech (`aria-hidden`).
- **Color:** icons inherit `currentColor`; style them via the surrounding text/`className` rather than hard-coding fill or stroke colors.
- **Stroke weight:** keep the library default stroke width; do not override it per icon.

### Props

| Prop        | Type                     | Default | Description                                                        |
| ----------- | ------------------------ | ------- | ------------------------------------------------------------------ |
| `icon`      | `LucideIcon`             | —       | The lucide icon component to render.                               |
| `label`     | `string`                 | —       | Accessible label (`aria-label`). Required unless `decorative`.     |
| `decorative`| `boolean`                | `false` | Hide from assistive tech when the icon is purely decorative.       |
| `size`      | `"sm" \| "md" \| "lg"`   | `"md"`  | Enforced icon size.                                                |
| `className` | `string`                 | —       | Additional classes (e.g. spacing, color via `currentColor`).       |
