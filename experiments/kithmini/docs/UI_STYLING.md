# Shared Tailwind styles

Tailwind CSS 4 is installed through `@tailwindcss/postcss` in
`frontend/postcss.config.mjs`, with `@import "tailwindcss"` in `app/globals.css`.
No custom colour palette, font or spacing scale overrides are configured.
Official setup: https://tailwindcss.com/docs/installation/framework-guides/nextjs

## One change for every primary button

Open `frontend/components/ui/button.tsx`. All buttons use `Button`, and the
mask download link uses its `buttonStyles` function. The shared primary variant is:

```tsx
primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
```

To change every **primary** action to green, edit this single line:

```tsx
primary: 'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500',
```

The header's selected navigation, Generate mask, selected preview, report picker
and mask download link all inherit it. Secondary/ghost buttons intentionally have
separate variants; change their entries in the same file if needed. The shared
base styles in `buttonStyles` control radius, padding, text size and disabled/focus
behaviour for **all** variants. Don't duplicate button colours in individual pages.

Usage:
```tsx
<Button onClick={save}>Save</Button>
<Button variant="secondary" onClick={cancel}>Cancel</Button>
<a className={buttonStyles('primary')} href={url} download>Download</a>
```

`components/ui/card.tsx` is the single place for repeated panel border, background,
shadow and padding. `lib/api.ts` owns network calls and API types; the page owns
screen state. Tailwind uses literal class strings, so no dynamically constructed
colour names are needed.

Default Tailwind is a set of design primitives, not a complete team design system.
Agree on the same Tailwind major version and copy/import the shared components
into the common group frontend when integrating. No other group component was
available for this review. The standalone Next.js page can be moved under the
common application's route once its routing/layout convention is decided.
