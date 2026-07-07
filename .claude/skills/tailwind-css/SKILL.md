---
name: tailwind-css
description: Tailwind CSS v4 styling — CSS-first @theme config, design tokens, responsive & dark mode, the cn() class-merge helper, and maintainable utility patterns. Use WHEN writing className utilities, setting up or editing the Tailwind v4 theme (@theme / CSS variables), building responsive or dark-mode layouts, extracting variants (cva), or cleaning up class-soup / arbitrary values.
---

# Tailwind CSS v4

Utility-first styling. v4 is **CSS-first**: configuration lives in your CSS via `@theme`, not (primarily) in `tailwind.config.js`.

## When to use
- Writing/refactoring `className` utilities.
- Configuring the theme, colors, spacing, fonts (design tokens).
- Responsive, dark-mode, or state-variant styling.
- Deciding between utilities, `@apply`, and component variants.

## v4 setup (CSS-first)
```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.62 0.19 265);
  --color-brand-fg: oklch(0.98 0 0);
  --radius: 0.625rem;
  --font-sans: "Inter", system-ui, sans-serif;
}
```
- Import with `@import "tailwindcss";` (replaces the old three `@tailwind` directives).
- Theme tokens defined in `@theme` become both CSS variables (`var(--color-brand)`) and utilities (`bg-brand`, `text-brand-fg`, `rounded-[--radius]`).
- Prefer **OKLCH** colors for perceptually even shades and easy dark-mode variants (this is what shadcn/ui uses).
- Content/source files are auto-detected in v4; no `content` array needed for most setups.

## Core conventions
- Mobile-first: base utilities apply to all sizes; add `sm: md: lg: xl:` for larger breakpoints.
- State variants: `hover: focus-visible: active: disabled: aria-[expanded]: data-[state=open]:`.
- Use `focus-visible:` (not `focus:`) for keyboard focus rings; never remove focus outlines without a visible replacement (see `web-accessibility`).
- Spacing/layout: prefer `flex`/`grid` + `gap-*` over margins for consistent rhythm.

## Dark mode
shadcn/ui uses the `.dark` class strategy with semantic tokens. Define light values on `:root` and dark on `.dark`, reference via semantic utilities:
```css
:root { --background: oklch(1 0 0); --foreground: oklch(0.15 0 0); }
.dark { --background: oklch(0.15 0 0); --foreground: oklch(0.98 0 0); }
```
Then use `bg-background text-foreground` — components stay theme-agnostic. Toggle by adding/removing `dark` on `<html>` (e.g. via `next-themes`).

## cn() helper (merge + conditional classes)
Standard in shadcn projects — resolves conflicting utilities correctly:
```ts
// lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```
```tsx
<div className={cn("rounded-md p-4", isActive && "bg-brand", className)} />
```
`twMerge` ensures a later `p-2` overrides an earlier `p-4` instead of both landing in the class list.

## Variants with cva (class-variance-authority)
For components with multiple looks, don't hand-branch classNames — declare variants:
```ts
import { cva } from "class-variance-authority";
const button = cva("inline-flex items-center rounded-md font-medium", {
  variants: {
    variant: { primary: "bg-brand text-brand-fg", ghost: "hover:bg-muted" },
    size: { sm: "h-8 px-3 text-sm", md: "h-10 px-4" },
  },
  defaultVariants: { variant: "primary", size: "md" },
});
```

## Pitfalls
- Class soup / long arbitrary-value chains (`w-[327px]`) — prefer theme tokens; reach for arbitrary values only for genuine one-offs.
- Overusing `@apply` — it recreates CSS abstraction; prefer utilities in markup or a `cva` component.
- Dynamic class names built by string concatenation (`` `text-${color}-500` ``) can't be detected — use full class names or a lookup map / `cva`.
- Removing focus rings for aesthetics (accessibility regression).

## Related skills
`shadcn-ui` (components built on Tailwind), `web-accessibility` (focus/contrast), `react-server-client-components`.
