# The design system

Everything visual in the app is built from `src/components/ui`. Feature code
imports from `@/components/ui` and nothing else in that folder, so the surface
stays small enough to hold in your head.

## Why this exists

The app had **four** shared primitives and roughly **nine** copies of the same
"label above a value" tile, spread across seven feature files with different
padding, different label letter-spacings and different accent conventions. The
diverging meter bar existed four times with four sets of magic numbers.

The cost was not file count — it was that panels on different pages did not line
up, and that a change to any of it meant finding every copy.

## The primitives

| Export         | What it is                                                          |
| -------------- | ------------------------------------------------------------------- |
| `Panel`        | The standard surface, with title, hint and an action slot           |
| `PanelSection` | A titled group of figures inside a panel                            |
| `PanelBox`     | A bordered inner box, for a sub-panel with its own edge             |
| `Stat`         | Label above a value. Three variants, optional meter and signed hint |
| `StatGrid`     | The responsive grid every group of stats sits in                    |
| `Label`        | The uppercase tracked label                                         |
| `Meter`        | A signed bar, diverging or fill                                     |
| `Pill`         | A small labelled chip                                               |
| `Dot`          | A status dot                                                        |
| `toneForSign`  | Maps a signed number to a tone, with a dead zone                    |

## Tone, never colour

Components take a `Tone` — `"up" | "down" | "neutral" | "muted" | "brand" |
"amber" | "cyan"` — and never a hex value or a raw CSS variable.

```tsx
<Stat
  label={t("economy.tone")}
  value={value}
  tone={toneForSign(economy.tone, 3)}
/>
```

This is what makes theming work. A component hard-coded to `var(--rose)` stops
responding the moment a theme changes its ramp; a tone resolves through
`TONE_COLOR` in every theme.

`toneForSign(value, threshold)` has a **dead zone** on purpose. A drift of
`+0.02%` is not an up move, and colouring it green implies a precision the number
does not carry. Pass the threshold in the same units as your input — `0.05` for
a percentage, `3` for a -100..100 index.

## The three `Stat` variants

All three exist because the app genuinely uses all three, and forcing one onto
the others is what made it inconsistent.

- **`tile`** — bordered, for a page's headline figures
- **`bare`** — no chrome, for a dense group of related numbers
- **`inline`** — label beside the value, for one-line rows

`hintValue` plus `hintTone` covers the commonest shape in the app: a level and its
change, `"24h volume $12.4B +8%"`. `hintTone={null}` prints the hint alone.

## `Meter` has two modes

- **diverging** (default) draws around a centre zero. The only honest way to show
  a signed number — a bar from the left edge cannot tell a rise from a fall
  without the number beside it.
- **fill** measures magnitude against `max`, for values that cannot go negative:
  a coverage ratio, a share of a maximum.

```tsx
<Meter value={drift} tone={toneForSign(drift, 3)} />        {/* signed */}
<Meter value={coverage} diverging={false} tone="brand" />   {/* 0..1 */}
```

## Adding a primitive

Before adding one, check whether it is a **variant** of an existing primitive. A
second component with the same shape and one extra prop is worse than one
component with that prop.

If it is genuinely new:

1. No raw colours. Add a `Tone` and an entry in `TONE_COLOR` if needed.
2. Export it from `index.ts`.
3. Follow the existing density scale — `sm` 13px, `md` 15px, `lg` 19px values;
   10px labels; `0.12em` label tracking; `rounded-[14px]` tiles.
4. It must work in all three themes without a per-theme branch. If one is
   genuinely needed, that is a signal the primitive is too specific.

## What is deliberately not here

No table wrapper — `CoinRowList` already virtualises 100+ rows and a generic
table would have to be told about that. No `Card` — `Panel` is the card. No
form primitives — the trading ticket has its own validation and layout.

The system encodes what the app repeats. Anything used once stays local until it
is used twice.
