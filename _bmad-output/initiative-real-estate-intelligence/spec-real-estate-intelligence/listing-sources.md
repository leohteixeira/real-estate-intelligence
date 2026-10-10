# Listing sources: Real Estate Intelligence

> Companion to `spec-real-estate-intelligence.md`, derived by `bmad-spec` from the owner's
> decisions and from a review of what each source publishes. It lists the sources the owner named
> and the outcome of the review each one needs before its collector is enabled.

## Rule

A source is enabled only after its terms of use, robots policy and licence were read and allow
automated collection. This file holds the review date and the evidence until the source register of
CAP-1 exists in the product. A collector never works around a login wall, a CAPTCHA, a block or a
rate limit.

A robots file that allows a path is not a licence: the terms decide. `Not verified` means no
permission was established, so the source stays disabled.

The review of a source also settles two permissions, each a no until established: whether its
photographs may be fetched to compute fingerprints, and whether its listing text may be shown. The
synthetic dataset allows both.

## Candidates

The city is São Paulo. The owner named open government data and eight listing portals. Reviewed on
9 October 2026. `Enabled` is in use, `Allowed` passed the review and has no collector yet, and
`Disabled` was forbidden or not verified.

| Source                          | Kind                                  | Outcome  | Decided by                                                  |
| ------------------------------- | ------------------------------------- | -------- | ----------------------------------------------------------- |
| Synthetic dataset               | Fixture, labelled `Synthetic data`    | Enabled  | No review needed                                            |
| GeoSampa fiscal blocks and lots | Open data: geometry                   | Allowed  | CC BY-SA 4.0; no fee or access constraint declared          |
| GeoSampa IPTU base              | Open data: cadastral records          | Allowed  | CC BY-SA 4.0; a person downloads the file                   |
| São Paulo ITBI transactions     | Open data: transaction values         | Disabled | Not verified: the page states no licence                    |
| Caixa property list             | Bank-owned listings with asking price | Disabled | Not verified: no terms or licence found                     |
| OLX                             | Listing portal                        | Disabled | Terms forbid web crawling and reuse of listings             |
| QuintoAndar                     | Listing portal                        | Disabled | Terms forbid web scraping                                   |
| Chaves na Mão                   | Listing portal                        | Disabled | Terms forbid bots and scraping tools                        |
| ZAP Imóveis                     | Listing portal                        | Disabled | Not verified: current terms unread; the last read forbid    |
| Viva Real                       | Listing portal                        | Disabled | Not verified: pages unreadable; covered by the ZAP terms    |
| Imovelweb                       | Listing portal                        | Disabled | Not verified: the terms could not be read                   |
| Loft                            | Listing portal                        | Disabled | Not verified: no terms addressed to visitors were found     |
| Mercado Livre                   | Marketplace with a listing section    | Disabled | Not verified: general and developer terms could not be read |

No portal is allowed. Three forbid automated collection in terms that were read; for the other five
no permission was established. Of the open data only GeoSampa states a licence, and it holds
cadastral records and geometry, not listings.

## What the owner decided

Decided on 10 October 2026.

- **Requests.** Written confirmation of reuse is sought first from Caixa, for its property list,
  and from the Secretaria Municipal da Fazenda, for the ITBI transactions. Both stay `Disabled`
  until a written answer allows them; the answer is recorded here with its date. The drafts, in
  Portuguese, are in `/workspace/docs/real-state-intelligence/pedidos-de-reuso.md`.
- **GeoSampa fiscal blocks.** Reference geography for the block layer of the V2 map, when PostGIS
  arrives. Not a listing source; nothing is ingested in the MVP. The decision names the blocks
  only: the lot layer has no use yet.
- **GeoSampa IPTU base.** Not used: the cadastre creates no `Property`.
- **ITBI transactions.** Once allowed, they feed only place figures, by neighborhood or street
  block and period, above a minimum of transactions. A transaction is never attached to a
  property.
- **Licence.** GeoSampa is attributed wherever its data appears and in the privacy notice. Any map
  layer or file that reproduces or transforms its geometry, with the figures drawn on it, is
  published under CC BY-SA 4.0. A listing source that feeds those figures must allow that.

What could still change an outcome:

- written authorization from a portal or from an agency that owns its listings;
- for Mercado Livre, the conditions of its official developer interface, still unread;
- for Chaves na Mão, written confirmation that its assistant endpoint may feed scheduled storage.

## Evidence

Quotes were read through an automated fetch on the review date. Re-read the page before a decision
that depends on its exact wording.

### GeoSampa fiscal blocks and lots

- Service <http://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs> declares no fee and no
  access constraint.
- `quadra_fiscal` holds fiscal sector, block and sub-block codes, an area and a polygon, with no
  person, unit or price field. `lote_cidadao` adds a door number and an address complement, which
  the allowlist drops.
- Licence: Creative Commons Attribution Share-Alike 4.0, stated at
  <https://prefeitura.sp.gov.br/web/licenciamento/w/licen%C3%A7a-para-uso-de-dados-do-geosampa>,
  which adds that the data "não podem ser considerados de DOMINIO PÚBLICO". The owner's reading of
  share-alike is under "What the owner decided".

### GeoSampa IPTU base

- Record
  <https://metadados.geosampa.prefeitura.sp.gov.br/geonetwork/srv/api/records/b971efa1-aad5-42f3-ad28-18f1f4efe270>:
  a CSV series from 1995, updated yearly, with 29 fields in its data dictionary.
- Cadastral attributes and tax reference values per m²; no asking or transaction price and no name
  or CPF field. It holds unit-level fields: taxpayer number, door number, complement, condominium
  number and ideal fraction.
- Licence: the same CC BY-SA 4.0; municipal decree 56.932/2016 allows "o “download” e a
  reutilização dos dados sem necessidade de autorização prévia".
- The download interface answered the review with a CAPTCHA. A collector does not work around it:
  a person downloads the file and ingestion reads it from disk.

### São Paulo ITBI transactions

- Page <https://prefeitura.sp.gov.br/web/fazenda/w/acesso_a_informacao/31501>: one spreadsheet per
  year from 2006, updated monthly, latest month August 2026.
- 28 columns, among them the transaction value declared by the taxpayer, the transaction date, the
  city's reference value, areas and IPTU use. No name or CPF: the city states that "não são
  disponibilizados os nomes ou razões sociais dos transmitentes e adquirentes de imóveis".
- Its unit-level fields (cadastral number, door number, complement, registry office, registration
  number, ideal fraction) are dropped before anything is stored.
- The page states no licence. Robots allows the page and the file host.

### Caixa property list

- <https://venda-imoveis.caixa.gov.br/sistema/download-lista.asp> offers one CSV per state. The São
  Paulo file, generated on 9 October 2026, held 2,687 properties, 466 of them in the city.
- 12 columns, among them asking price, appraisal value, address, description and sale modality. No
  person field; most addresses carry a door number and a unit marker, which the allowlist drops.
- No licence or terms of use were found.

### Request channels

- Caixa: a search result on <https://www.caixa.gov.br/acesso-a-informacao/Paginas/sic.aspx> says
  that access-to-information requests go through the federal platform Fala.BR,
  <https://falabr.cgu.gov.br/>. The Caixa page itself did not open (redirect loop).
- City of São Paulo: <https://esic.prefeitura.sp.gov.br/> is the city's electronic system for
  registering information requests; a request names the body that holds the information.
- Both were read on 10 October 2026.

### Other open data

- Banco Central publishes aggregated market series under ODbL; no São Paulo city series was
  confirmed.
- The federal portal `dados.gov.br` and the state portal could not be read.

### OLX

- Terms updated on 27 February 2025, read from
  <https://ajuda.olx.com.br/public/Termos_e_Condicoes_de_Uso_OLX_27022025_727855f932.pdf>. Clause
  9.2 forbids, without prior and express authorization, to "Realizar web crawling no Site,
  reproduzir, exibir, copiar […] qualquer dos elementos protegidos" and to use "textos, imagens,
  anúncios e qualquer outro elemento incluído ou disponível no Site" elsewhere without written
  authorization.
- Robots was not read: the site answered HTTP 403.
- Its developer interface serves an advertiser's own listings
  (<https://developers.olx.com.br/anuncio/home.html>); nothing reads the public listings.

### ZAP Imóveis and Viva Real

- Both belong to Grupo OLX and share the ZAP+ terms, which reach "qualquer interessado em anúncios
  de imóveis, anunciante ou não" (clause 3).
- The current terms, updated on 17 August 2026
  (<https://ajuda.zapimoveis.com.br/s/article/termos-e-condicoes-gerais-de-uso-zap>), could not be
  opened. The version of 14 February 2025, clause 9.1, forbids without prior authorization to
  "Utilizar robôs nos websites em que utilizar o ZAP+ para reproduzir, exibir, copiar,
  transformar, modificar […] qualquer dos elementos protegidos".
- Robots and the Viva Real terms page were not read: the sites answered HTTP 403.
- Feeds exist for agencies to publish (<https://developers.grupozap.com/feeds/integration.html>);
  nothing reads the public listings.

### QuintoAndar

- Terms, <https://www.quintoandar.com.br/termos>, last changed on 8 January 2026, section 4: "É
  proibido usar a plataforma para fins ilegais (como lavagem de dinheiro), se passar por outra
  pessoa ou tentar extrair dados (web scraping) e copiar nosso conteúdo."
- That page is a summary of a longer document the review could not open.
- Robots allows listing and search pages, except `/busca` and some query variants.
- No interface for reading listings was found. <https://mkt.quintoandar.com.br/dados/> offers
  aggregate files and states no licence.

### Chaves na Mão

- Terms, <https://www.chavesnamao.com.br/termos-de-uso/>, undated, forbidden conduct: "Uso de bots,
  scripts automatizados, ferramentas de raspagem ou qualquer sistema que simule acesso humano para
  criar contas, publicar anúncios, coletar dados ou interagir com a plataforma de forma
  automatizada, seja para uso pessoal ou comercial."
- Robots allows listing and search pages without a query string and declares `ai-train=no`.
- The site publishes an endpoint for assistants that answer a person's search, described at
  <https://www.chavesnamao.com.br/.well-known/mcp/server-card.json>: no authentication, 60 requests
  per minute per address, results cited by listing URL. It states nothing about scheduled collection
  or storage.

### Imovelweb

- Robots, <https://www.imovelweb.com.br/robots.txt>, allows most listing and search pages.
- The site answered the review with HTTP 403 and its help centre with 401, so the terms were not
  read. An unconfirmed search result points to a clause against crawlers and scrapers.

### Loft

- Robots, <https://loft.com.br/robots.txt>, blocks only `/health_check` and `/explorar*`.
- The only terms found, <https://loft.com.br/institucional/termos-e-condicoes-de-uso>, are a
  partner contract that forbids partners to scrape "Conteúdo LOFT" without consent. No terms
  addressed to visitors were found, so nothing grants permission.

### Mercado Livre

- Robots, <https://imoveis.mercadolivre.com.br/robots.txt>, allows listing detail pages, blocks
  paging and filter variants, and closes the site to the named bots of AI providers.
- The general terms, the developer terms and the interface documentation answered HTTP 403, and
  unauthenticated calls to the interface were refused, so no terms were read.
