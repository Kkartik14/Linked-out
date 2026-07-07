---
name: web-accessibility
description: Web accessibility (a11y) for React/Next UI — semantic HTML, ARIA (only when needed), keyboard operability, focus management, accessible forms, images/media, color contrast, and dynamic content announcements. Use WHEN building or reviewing any interactive UI (menus, dialogs, tabs, toasts, custom controls), forms, images, or when asked about a11y/WCAG/ARIA/keyboard/screen-reader support. Includes a review checklist.
---

# Web Accessibility (WCAG 2.2 AA target)

Build to WCAG 2.2 AA. The cheapest accessibility is **native semantic HTML**; reach for ARIA only to fill gaps.

## When to use
- Building interactive components (menus, dialogs, tabs, disclosure, toasts).
- Building or reviewing forms and inputs.
- Adding images, icons, media.
- Any explicit a11y / WCAG / ARIA / keyboard / screen-reader request or review.

## First rule: semantic HTML
- Use the real element: `<button>` for actions, `<a href>` for navigation, `<nav> <main> <header> <footer> <ul>/<li>` for structure, `<h1>–<h6>` in order (one `<h1>` per page, no skipped levels).
- A `<div onClick>` is not a button — it lacks role, focusability, and keyboard activation. Use `<button>`.
- First rule of ARIA: **don't use ARIA if a native element does it**. Bad/wrong ARIA is worse than none.

## Keyboard operability
- Everything usable by mouse must work by keyboard. Native controls are focusable/operable for free.
- Visible focus indicator always (`focus-visible:` ring); never `outline: none` without a replacement.
- Logical tab order (DOM order); avoid positive `tabindex`. `tabindex="0"` to add a custom control to tab order, `tabindex="-1"` for programmatic focus targets.
- Expected keys: Enter/Space activate buttons; Esc closes dialogs/menus; arrow keys move within composite widgets (menus, tabs, listbox).

## Focus management
- Dialogs/modals: move focus into the dialog on open, **trap** focus inside, restore focus to the trigger on close (Radix/shadcn handle this — verify it isn't broken).
- Route changes in SPAs: move focus to the new page heading or a skip target so screen readers announce the change.
- Provide a "Skip to main content" link as the first focusable element.

## ARIA when needed
- Name every control: visible `<label>`, or `aria-label`/`aria-labelledby` for icon-only buttons.
- State: `aria-expanded`, `aria-selected`, `aria-checked`, `aria-current="page"`, `aria-pressed`.
- Relationships: `aria-describedby` for help/error text; `aria-controls` for triggers.
- Hide decorative elements: `aria-hidden="true"` on purely decorative icons; decorative images get empty `alt=""`.
- Follow the WAI-ARIA Authoring Practices (APG) patterns for custom widgets rather than improvising roles.

## Forms
- Every input has a programmatic label (`<label htmlFor>` / shadcn `FormLabel`).
- Errors: set `aria-invalid` and link the message with `aria-describedby`; don't rely on color alone.
- Group related controls with `<fieldset>`/`<legend>` (e.g. radio groups).
- Use correct `type`/`autocomplete`/`inputmode` for better UX and AT support. (See `react-forms-rhf-zod`.)

## Images, icons, media
- Meaningful images: descriptive `alt`. Decorative: `alt=""`. Icon buttons: label the button, not just the icon.
- In this app, anonymous authors: avatar `alt` should read e.g. "Anonymous user" — never leave it empty or use a raw id.
- Video/audio needs captions/transcripts.

## Color & motion
- Contrast: text ≥ 4.5:1 (≥ 3:1 for large text); UI/graphical boundaries ≥ 3:1. OKLCH tokens make this tractable — verify actual pairs.
- Never encode meaning in color alone (add text/icon/pattern).
- Respect `prefers-reduced-motion` — reduce/disable non-essential animation.

## Dynamic content
- Announce async updates with a live region: `aria-live="polite"` (or `role="status"`); errors `aria-live="assertive"`/`role="alert"`. Toasts (sonner) should be in a live region.
- Loading states: give spinners an accessible name or use `aria-busy`.

## Review checklist
- [ ] Keyboard-only pass: reach & operate everything, visible focus, Esc closes overlays.
- [ ] Real semantic elements; headings ordered.
- [ ] All controls/images/inputs have accessible names.
- [ ] Focus moves into & is restored from dialogs; focus trap works.
- [ ] Errors announced and linked; not color-only.
- [ ] Contrast passes AA; reduced-motion honored.
- [ ] Screen-reader smoke test (VoiceOver/NVDA) on key flows.

## Related skills
`shadcn-ui` (Radix provides a11y foundations — verify), `react-forms-rhf-zod`, `tailwind-css` (focus-visible, contrast), `frontend-testing` (axe / role-based queries).
