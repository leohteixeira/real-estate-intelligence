---
version: 1
slug: 'src-landing-landingpage-tsx'
primary_target: 'src/landing/LandingPage.tsx'
related_targets: ['src/landing/CityScene.ts', 'src/landing/landing.css', 'src/landing/copy.ts']
---

# Surface brief — landing page

- **Scope:** the public landing page of `@rei/web`, rendered by `src/landing/LandingPage.tsx`.
- **Visitor mode:** Persuade.
- **Audience and job:** the same four audiences as the application, addressed one at a time:
  brokers and analysts, buyers and investors, portfolio evaluators, data operators. Each must
  recognize their own question within one scroll stop and understand what the product answers.
- **Primary action:** open the demo. Until `VITE_DEMO_URL` is set the page says the demo is not
  published and offers the tour instead; it never links to a demo that does not exist.
- **Constraints:** bilingual with an in-page switch (pt-BR default, English), BRL, synthetic data
  only, no photography, no figure calculated in the browser, readable without WebGL and with
  reduced motion.
- **Anti-goals:** listing portal, AI chatbot, generic SaaS dashboard, trading terminal.
- **Unresolved:** public demo address, repository visibility, self-hosted fonts.

## Direction contract

THESIS: The page is a descent through a city drawn as price relief. The visitor reads the market
from the city down to one street block, and each stop on the way belongs to one audience.

OWN-WORLD: Placa, unchanged. Enamel blue is the ground of the whole journey, porcelain and white
carry the two reading sections, wayfinding yellow marks only the block and the stop the visitor is
on, zone colours appear only when the scene shows zones.

STORY: City, the offer and the action. Zone, the analyst's series. Neighborhood, the buyer's
comparables. Street block, three listings resolved into one property. Plan view, the operator's
collectors. Then a run record, the four rules, and the honest state of the project.

FIRST VIEWPORT: The headline, one paragraph that says what the product does, the primary action
and the legend that explains the relief, over the city itself with its plate standing on the
selected block.

SIGNATURE: one WebGL scene carries the whole journey. Block height is the median asking price per
square meter; the plate re-signs itself at each stop; the selected block splits into three slabs
when three listings become one property; the relief flattens into a plan when collectors appear.

FORM: scroll-keyed descent over a sticky scene, composition chosen directly by the product owner
("city in relief").

FINISH: reviewed in two batched rounds on desktop and phone without WebGL; the scene itself was
not rendered in the build environment and is unreviewed.
