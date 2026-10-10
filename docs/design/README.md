# Design — Real Estate Intelligence

Supporting material for the Placa design system and the complete screen layout of `@rei/web`.

| File                                               | Purpose                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| [`direction.md`](./direction.md)                   | How the visual direction was chosen: interview, roll, verdicts       |
| [`screens.md`](./screens.md)                       | Navigation model, screen inventory and system states                 |
| [`content-and-locale.md`](./content-and-locale.md) | Voice, terminology, English and Brazilian Portuguese, number formats |
| [`landing.md`](./landing.md)                       | Landing page: composition, source files, behaviour and status        |
| [`canvas/`](./canvas/)                             | Source of the design canvas: one `.dc.html` file per artboard        |

## Where the design system lives

| Location                             | Content                                                          |
| ------------------------------------ | ---------------------------------------------------------------- |
| `apps/web/DESIGN.md`                 | Normative tokens (YAML front matter) and the rules of the system |
| `apps/web/PRODUCT.md`                | Product truth the design depends on                              |
| `apps/web/src/styles/tokens.css`     | The tokens as CSS custom properties                              |
| `apps/web/src/styles/components.css` | Component styles, mobile-first                                   |
| `apps/web/.impeccable/design.json`   | Sidecar for the Impeccable tooling: ramps, shadows, motion       |
| `apps/web/.impeccable/surfaces/`     | Surface briefs with the direction contracts                      |

`DESIGN.md` is the source of truth. When a token changes, change it there and in `tokens.css`
together.

## Canvas

The navigable canvas is a private Claude artifact:
<https://claude.ai/artifact/CYjuAEiT65NN2Pg76rKUDp>. It has four pages: Mobile (15 artboards),
Desktop (5), Design system (2) and Landing (2). In Play mode the tab bar, the rail and the rows
link the artboards together.

`canvas/project/` holds the same files that were published. Each artboard links `tokens.css` and
`components.css`, which are copies of the files under `apps/web/src/styles/`. The directory is
excluded from Prettier because the artboard format is whitespace-sensitive.

## Status

- `apps/web/src/App.tsx` renders the landing page, which imports `tokens.css`. The application
  screens are not built and `components.css` is not imported yet.
- The application artboards are authored in Brazilian Portuguese; `PlaceEN.dc.html` shows the
  English locale. Each artboard was rendered once in Chromium to measure its height, and six of
  them were looked at; none has been reviewed on the canvas itself.
- Every property, price, statistic and source in the artboards is synthetic.
- Barlow and Barlow Condensed are loaded from Google Fonts in the canvas. The application must
  self-host them before it ships.

## Open decisions

- When authentication lands. Alerts, operations and the review queue wait for it.
- How the V2 dark theme is selected: system preference, a switch, or both.
- The privacy notice has no artboard and no place in the navigation.

Decided by the product owner on 2026-10-09:

- São Paulo is the MVP city.
- The MVP map stays schematic. The tile provider is chosen by ADR with the V2 Map screen.
- Entity resolution merges at 0.90 or above and sends matches from 0.50 up to 0.90 to review. The
  review screen states no number.
- The interface meets WCAG 2.2 level AA. The tokens have not been checked against AA contrast yet.
- A dark theme arrives in V2, once `DESIGN.md` revises its rule against a dark ground. None is
  defined yet.
- A removed listing is never read as a sale.
