---
name: shadcn-ui
description: shadcn/ui component workflow — installing components via the CLI, composing/customizing them (they live in your repo), theming via CSS variables, dark mode, and the Field/Form primitives for forms. Use WHEN adding UI (dialog, form, table, dropdown, toast/sonner, etc.), running `shadcn add`, editing components under components/ui, theming, or building accessible composite components.
---

# shadcn/ui

shadcn/ui is **not a dependency** — the CLI copies component source into your repo (usually `components/ui/`), so you own and edit it. Built on Radix UI primitives (accessible by default) + Tailwind + `cva` + the `cn()` helper.

## When to use
- Adding a UI primitive/pattern (button, dialog, dropdown, table, form, tabs, toast).
- Running the CLI or editing files in `components/ui/`.
- Theming (CSS variables / OKLCH), dark mode, or component variants.
- Building forms with the shadcn Form/Field components.

## Install & add components
```bash
# once, if not initialized (writes components.json, lib/utils.ts, theme vars)
pnpm dlx shadcn@latest init
# add components (fetches latest source into components/ui/)
pnpm dlx shadcn@latest add button dialog form input sonner
```
- Check `components.json` for framework, aliases, Tailwind version, base color, icon lib before generating code — match the project's existing config.
- If unsure a component exists / its API, search the registry (`shadcn@latest add` lists names) rather than inventing props.
- Optional: shadcn's own Claude skill can be installed with `pnpm dlx skills add shadcn/ui` to give project-aware context.

## Composition & customization
- Components are yours: edit the copied file directly to change behavior/markup; don't wrap-and-fight the library.
- Compose Radix parts: e.g. `Dialog` = `Dialog` + `DialogTrigger` + `DialogContent` + `DialogHeader`/`DialogTitle`/`DialogDescription`. Always include a `DialogTitle` (a11y) even if visually hidden.
- Use `asChild` to merge behavior onto your own element (e.g. wrap a Next `<Link>` in a `Button` via `<Button asChild><Link/></Button>`).
- Extend styles with `cn(...)` and the `className` prop; add new looks via the component's `cva` variants rather than inline overrides everywhere.

## Theming
- Colors are semantic CSS variables (`--background`, `--foreground`, `--primary`, `--muted`, `--destructive`, `--ring`, …) in OKLCH, defined for `:root` and `.dark` in `globals.css`.
- Style with semantic utilities (`bg-primary text-primary-foreground`, `bg-muted`, `text-muted-foreground`) so light/dark just work.
- Change brand look by editing the CSS variables, not individual components.

## Dark mode
Use `next-themes` with the `.dark` class strategy; toggle sets `class` on `<html>`. Wrap the app in a `ThemeProvider` (a Client Component) high in the tree.

## Forms (Field / Form primitives)
The `form` component wires react-hook-form + zod with accessible labels/errors:
```tsx
<Form {...form}>
  <FormField control={form.control} name="title" render={({ field }) => (
    <FormItem>
      <FormLabel>Title</FormLabel>
      <FormControl><Input {...field} /></FormControl>
      <FormMessage />           {/* renders validation error, linked via aria */}
    </FormItem>
  )} />
</Form>
```
Details of the RHF+Zod wiring live in `react-forms-rhf-zod`.

## Toasts
Current shadcn uses **`sonner`** (`import { toast } from "sonner"`, render `<Toaster />` once). The old `toast`/`use-toast` component is deprecated.

## Pitfalls
- Inventing component props/APIs — verify against the installed source or registry.
- Re-adding a component blindly can overwrite local edits; review the diff.
- Dialog/Sheet without an accessible title; icon-only buttons without an `aria-label`.
- Mixing Tailwind v3/v4 theme conventions — match `components.json` and the existing `globals.css`.

## Related skills
`tailwind-css` (theme tokens, cva, cn), `react-forms-rhf-zod` (forms), `web-accessibility` (Radix gives a lot, but verify labels/focus).
