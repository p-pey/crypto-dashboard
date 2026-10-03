# Themes

Four, cycled with the button in the header. Persisted in a `theme` cookie for a
year, so it survives a reload without a flash.

|              | Key     | Character                                                |
| ------------ | ------- | -------------------------------------------------------- |
| **Pearl**    | `light` | Light, opaque, the default                               |
| **Obsidian** | `dark`  | Dark, opaque, the most legible of the three dark options |
| **Glass**    | `glass` | Frosted panels over a lit aurora                         |
| **Mixer**    | `mixer` | Near-black, cinematic, violet bloom                      |

## Order, and why

```
Pearl → Obsidian → Glass → Mixer
```

Mixer is **last on purpose**. It is the most expressive and the least legible for
a dense table — the bloom behind the content trades contrast for atmosphere. The
three readable themes come first so the cycling button never lands you somewhere
unreadable without warning.

## Mixer

Microsoft's streaming platform, shut down in 2020 (its successor, Stream, lasted
to 2022). It was known for a near-black room lit by large soft violet and magenta
orbs, with content floating in it rather than boxed inside it.

What that became here:

- **`--bg-base: #07060d`** — darker than Obsidian. The floor should read as a void.
- **Near-opaque surfaces.** Glass uses alpha tints because a frosted panel _is_
  the effect. Here the background is the design, so a panel you can see through
  stops being a panel and becomes haze.
- **A violet brand ramp** (`#8b5cf6` / `#a78bfa`) — pushed far enough to be
  recognisable rather than a generic dark-mode purple.
- **Louder glow.** `--glow-1` at 0.55 alpha against Glass's 0.42, magenta on the
  right as well as violet on the left, because there are no frosted panels to
  sit on and calm it down.
- **Bigger orbs.** `scale: 1.35` and 0.85 opacity, applied as a CSS transform
  rather than new keyframes, so the OS `prefers-reduced-motion` rule above still
  stops them.
- **Violet card lift.** `.panel-hover` blooms violet rather than neutral.

## Adding a theme

1. A `[data-theme="<key>"]` block in `globals.css` defining every token the other
   three define. Missing one shows up as a colour from the wrong theme.
2. The key in `Themes` in `src/constants/constants.ts`. `THEME_ORDER` controls
   the cycling order.
3. A palette in `COLORS` in `src/styles/colors.ts`.

That is all. `layout.tsx` writes `data-theme={theme}` generically and treats
anything that is not `light` as `color-scheme: dark`, so no wiring is needed.

### Resolved, not alpha, in `colors.ts`

antd's `ConfigProvider` composites its own tokens and cannot blend against a
backdrop it cannot see. A translucent value in `COLORS` renders as a washed grey
box sitting next to a correctly-styled card. So `COLORS` holds the **resolved**
colour — what the alpha tint composites to over the backdrop — while
`globals.css` keeps the alpha. `glass` and `mixer` both do this; `dark` gets away
without it because its surfaces are opaque anyway.

### One extra token

`glass` adds `--glass-sheen`, the lit top edge that makes frosted panels read as
glass. `mixer` does not need it: its panels are opaque, so there is no edge to
catch light.

## Reduced motion and transparency

Both are honoured globally, not per theme:

- `prefers-reduced-motion: reduce` stops the orbs and the aurora drift.
- `prefers-reduced-transparency: reduce` drops the Glass frosting to a solid
  fill. Mixer's surfaces are already opaque, so it is unaffected.
