# Landing page

The landing page is the Persuade surface of the Placa world. It explains the product to each of the
four audiences by walking down a city drawn as price relief.

## Composition

One WebGL scene (three.js) stays pinned behind the first part of the page while five stops scroll
over it. The camera follows the scroll position.

| Stop         | Scene                                                        | Audience             | Proof shown                                      |
| ------------ | ------------------------------------------------------------ | -------------------- | ------------------------------------------------ |
| City         | Whole city; block height is the median asking price per m²   | Everyone             | Headline, offer, primary action, legend          |
| Zone         | Blocks take their zone colour                                | Brokers and analysts | Zone median with sample, sources and date        |
| Neighborhood | Camera descends; the rest of the city dims                   | Buyers and investors | One asking price against the neighborhood median |
| Street block | The selected block splits into three slabs                   | Portfolio evaluators | Three listings resolved as one property          |
| Collectors   | Relief flattens into a plan; pulses travel along the avenues | Data operators       | Last collection run, counted                     |

After the descent the page turns light for two reading sections, a natural-language run shown as a
record and the four rules the product keeps, and closes on an enamel band with the action and the
state of the project.

The place plate stands on the selected block and re-signs itself at each stop. Wayfinding yellow
marks that block and the current stop in the stop list, and nothing else.

## Source

| File                                   | Content                                                             |
| -------------------------------------- | ------------------------------------------------------------------- |
| `apps/web/src/landing/LandingPage.tsx` | Page structure, language switch, scroll progress                    |
| `apps/web/src/landing/CityScene.ts`    | The three.js scene; framework-free, loaded as its own chunk         |
| `apps/web/src/landing/cityLayout.ts`   | Deterministic synthetic city: grid, zones, prices, heights (tested) |
| `apps/web/src/landing/copy.ts`         | English and Brazilian Portuguese copy, locale number formatting     |
| `apps/web/src/landing/landing.css`     | Styles, built on `apps/web/src/styles/tokens.css`                   |

The surface brief and direction contract are in
`apps/web/.impeccable/surfaces/src-landing-landingpage-tsx.md`.

## Where to see it

- Live page with the three.js scene, private Claude artifact:
  <https://claude.ai/artifact/9Ps2b3vLy4qUAUECNPKcyD>. It is the production build of `apps/web`
  inlined into one file.
- Storyboards on the design canvas, page "Landing": `LandingDesktop.dc.html` and
  `LandingMobile.dc.html` under `canvas/project/`. They are static. Each stop sits on a still
  (`landing-d-*.svg`, `landing-m-*.svg`) drawn from `cityLayout.ts` with the same camera positions
  as the scene, by a flat-shaded painter that only approximates the WebGL lighting.

## Behaviour

- **Language.** Brazilian Portuguese by default, with an in-page switch to English. The choice is
  remembered in the browser when storage is available.
- **Primary action.** "Open the demo" links to `VITE_DEMO_URL`. While that variable is empty the
  page states that the demo is not published and offers the tour instead. `VITE_REPOSITORY_URL`
  adds a source-code link in the closing band. Both accept only `http` and `https` addresses.
- **No WebGL.** The scene is replaced by a flat street grid and every word stays readable.
- **Reduced motion.** The camera stops swaying and jumps to each position instead of easing.
- **Phone.** The copy at each stop is a sheet that slides over the scene; the stop list shows the
  name of the current stop only.
- **Data.** Every figure is a fixed synthetic illustration marked "Synthetic data". The browser
  formats numbers for the locale and calculates nothing; the relief is a made-up price field.

## Status

- Lint, type checking, unit tests and the production build pass.
- Layout, both languages and the no-WebGL fallback were reviewed on desktop (1440 px) and phone
  (390 px) screenshots.
- The WebGL scene has not been seen rendered: the development container cannot create a WebGL
  context. Camera framing and occlusion were checked on stills drawn from the same data and camera
  positions, which says nothing about real lighting, motion or performance. Review it in a real
  browser before publishing.
- No public demo exists yet, so `VITE_DEMO_URL` is empty.
- Barlow and Barlow Condensed load from Google Fonts. Self-host them before the page ships.
- The footer is one line of text. It gains the link to the privacy notice before the page ships.
