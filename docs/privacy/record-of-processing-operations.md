# Record of processing operations

- **Version:** 1
- **Status:** accepted as an engineering baseline; real processing remains disabled
- **Date:** 2026-10-10
- **Accepted by:** the agent on the owner's behalf, 2026-10-10, under D-019
- **Scope:** CAP-28, local synthetic operations and the conditional real-data design

This reference inventory is paired with the
[legitimate-interest assessment](legitimate-interest-assessment.md). Acceptance records delegated
document acceptance, not a personal or legal signature, source authorization, legal approval,
production evidence or proof of anonymization. The
[collection epic](../../_bmad-output/initiative-real-estate-intelligence/epic-collection/epic-collection.md)
records D-019. The external append-only decision log remains owned by the meta-workspace.

## Controller and responsibility

The product owner, a natural person, is the controller and decides purpose, source enablement,
retention, suppliers, access and rights handling. No legal identity or contact e-mail has been
supplied for publication in this record. The owner must supply and verify both through the future
public-notice mechanism before real collection. An agent acts under delegated engineering
authority; it is not a separate controller or a substitute for the controller's responsibilities.

The specification's small-size-controller model is an operating assumption. Eligibility and any
regulatory relaxation require evidence; this inventory claims no statutory exemption. Its coverage
uses the [ANPD processing-record model announcement](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-modelo-de-registro-simplificado-de-operacoes-com-dados-pessoais-para-agentes-de-tratamento-de-pequeno-porte-atpp)
as a coverage aid, without asserting eligibility for simplified obligations.

For potentially identifiable data, the proposed basis is legitimate interest, assessed per
operation below. The [LGPD](https://planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
requires attention to purpose, necessity, transparency, rights, records and security; public
availability does not itself establish unrestricted reuse. This is the product's engineering
interpretation, not legal advice, a RIPD, an ANPD approval or a compliance certificate.

## State and data boundary

As of this version, checked-in synthetic fixtures and isolated local campaigns exercise the
source register, collection, delivery, audit, snapshot lifecycle and reparse. A real-shaped local
privacy fixture tests the disabled storage design; it is not acquired from a real source.
No real listing source is enabled. No production deployment, VPS access or production verification
is evidenced here. Historical foundation paragraphs in the specification are not evidence that
the subsequently implemented collection components are absent.

The [frozen source review](../../_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/listing-sources.md)
remains authoritative: no portal is allowed; Caixa listings and ITBI transactions await written
publisher permission. GeoSampa fiscal blocks are V2 reference geography, not an MVP listing
source; its IPTU base is unused. ITBI, if later allowed, feeds only place figures above a minimum
transaction count and is never attached to a property. These future uses need their own updated
inventory and assessment before activation.

Under [ADR 0015](../../specs/adrs/0015-handling-of-collected-data.md), real listings may retain only
property type, asking price, area, bedrooms, bathrooms, parking spaces, features, source-published
location without unit or complement, dates, source and source URL, advertiser type, legal-entity
agency name, masked description and permitted image fingerprints. Names, contacts, individual
CRECI numbers and photographs are prohibited. Unknown fields are dropped or rejected. The current
canonical projection is narrower than this ceiling; it is not authority to add location fields.

Natural-person advertisers, owners, occupants, agents and people incidentally mentioned or shown
may be affected. Fetching, receiving and inspecting their content in memory is processing even
when none is retained. A masked description, street location, URL, stable source identifier,
content hash or fingerprint can still permit indirect identification and linkage. None is
declared anonymous. Sensitive data, children's data and incidental private content are not a
purpose of collection; a source that cannot exclude them fails the activation review.

## Operation inventory

Operation IDs are stable across revisions. Systems and recipients refer to the shared sections
below; each operation states its own purpose, categories, basis, retention and delivery status.

### ROP-01 — Acquisition and sanitization

- **Purpose:** obtain permitted property facts with provenance for reproducible market analysis;
  eliminate forbidden content before storage, parsing or downstream publication.
- **Subjects and data:** the subjects above may occur in incoming canonical fields, source text,
  URLs or vendor HTML/CSV. An authorized adapter would translate arbitrary payloads in memory to
  supported canonical JSON. Only the closed projection and safe provenance may leave this step.
- **Basis and necessity:** conditional legitimate interest for the minimum transient inspection
  needed to extract property facts; assessed in the paired document. Permission to reuse a source
  is a separate gate and is not a lawful-basis substitute. Synthetic facts contain no actual
  subjects and do not establish this basis for real acquisition.
- **Systems, recipients and access:** owner-operated worker and source adapter; the publisher
  receives the request and its network metadata. The owner can inspect sanitized results, never
  deliberately retain rejected payloads. Hosting recipients are unresolved for real operation.
- **Retention and rights:** forbidden content is discarded during the attempt, with no raw
  payload in logs, errors or quarantine. Allowed output follows ROP-02/03. Suppression must be
  checked after discovery of stable identity, before payload/image fetch and again before writes.
- **Security and status:** implemented closed JSON projection, contact-pattern/known-name masking,
  unsafe identifier/URL rejection and query/fragment removal have local evidence. Known-name
  masking is not arbitrary-prose name recognition. Real adapters and suppression enforcement
  remain activation gates; unsafe or unsupported content must fail closed.

### ROP-02 — Snapshot storage, reparse and expiry reconciliation

- **Purpose:** bounded parser correction, integrity checks, acquisition provenance and failure
  recovery, without another source request or invented collection history.
- **Subjects and data:** sanitized canonical bytes, source identity/URL, observation times,
  content hash, acquisition generation, encryption key identifier, parser revision, original
  fingerprints and correction operation/event identifiers. Residual linkage remains possible.
- **Basis and necessity:** conditional legitimate interest in correcting reliable property
  observations, with a bounded snapshot window. The assessment does not justify indefinite raw
  retention. Reparse must reapply privacy projection and preserve original evidence.
- **Systems, recipients and access:** worker, collection-owned PostgreSQL tables and S3-compatible
  storage; broker/audit receive sanitized events under ROP-06. No public raw-object access is
  authorized; owner commands are server-local until authentication is delivered.
- **Retention and rights:** every real acquisition expires exactly 30 days (720 hours) after its
  trusted collection timestamp, including reserved uploads whose business transaction fails.
  Retries/reparse do not renew expiry. Access and commits close at expiry; physical deletion can
  lag during an outage. Durable reconciliation includes deleted tombstones, advances one next
  candidate per attempt and preserves fair progress. Historical hashes/observations survive blob
  expiry; their separate retention is unresolved. Removal must erase applicable artifacts under
  ROP-05, including derivatives of corrections. Synthetic snapshots retain exact bytes without
  this 30-day limit.
- **Security and status:** local fixture evidence supports application-side AES-256-GCM,
  authenticated identity/hash, fixed expiry, late-write/restart reconciliation and atomic v2
  correction outbox. Missing key configuration refuses real reads/writes; there is no fallback
  key. Multi-key rotation is a future reviewed contract. The actual reparse CLI accepts owned
  synthetic sources only; real-category checks use injected local fixtures, not real collection.

### ROP-03 — Derived listings, history, matching and market figures

- **Purpose:** normalize property facts, distinguish listings from properties, explain probable
  matches and compute deterministic asking-price/history/place figures.
- **Subjects and data:** only allowlisted derived facts, masked text, permitted fingerprints,
  provenance, retained snapshot hash and match evidence. Location and history can link a property
  to an occupant or seller despite the absence of direct identifiers.
- **Basis and necessity:** conditional legitimate interest in reliable market comparison; no
  profiling of people, contact enrichment or assertion that disappearance proves a sale. Each
  future public exposure and matching feature needs source-specific balancing evidence.
- **Systems, recipients and access:** planned `properties` and `market` schemas, versioned API and
  web readers. Public readers would be independent recipients of displayed facts and source links.
  Description display is denied unless separately permitted, including excerpts and version
  comparisons; otherwise only change/time and a source link may be returned.
- **Retention and rights:** normalized history is not covered by snapshot expiry. Its necessity,
  concrete retention/review period and deletion propagation into matches, figures and caches must
  be documented and tested before corresponding real use. Durable removal overrides ordinary
  history preservation. No indefinite personal-history permission follows from this record.
- **Security and status:** these business consumers and public display controls are planned, not
  established by lifecycle/reparse tests. Explainable backend rules, calibrated synthetic match
  labels and listing-text permissions are required safeguards before delivery.

### ROP-04 — Conditional image acquisition and fingerprinting

- **Purpose:** provide limited deterministic evidence that listings depict the same property,
  where structured facts alone are insufficient.
- **Subjects and data:** photographs can transiently show occupants, faces, belongings or sensitive
  clues; retained fingerprints may link repeated images. No person/face recognition is permitted.
- **Basis and necessity:** a separate conditional legitimate-interest assessment of each source
  must show why an image-free alternative is insufficient. Publisher image permission and lawful
  basis are independent requirements; neither general collection nor text permission grants it.
- **Systems, recipients and access:** worker image adapter/algorithm, publisher and hosting
  recipients; each image request counts against the source rate. Downstream receives fingerprints
  only through ROP-03/06, without image URLs or photographs added to the allowlist.
- **Retention and rights:** exactly one deterministic fingerprint per fetched photograph; discard
  the image immediately after in-memory computation, without file, cache or log persistence.
  Fingerprint retention and removal follow ROP-03/05 and must be resolved before real use.
- **Security and status:** D-089 in ADR 0015 selects versioned horizontal dHash64, Sharp 0.35.5,
  and the first three distinct photograph URLs in source order, processed sequentially within
  5 MiB/16-million-pixel input bounds. Hamming similarity applies only to matching algorithm tags;
  repeated hashes retain one result per photograph. Current permission is checked before every
  attempt, including after admission waits; pages and photographs share source admission state.
  The local real-service campaign in collection story 2.9 proves these controls, denial,
  no-photo-storage and acquisition-free reparse; its
  [plan](../../_bmad-output/initiative-real-estate-intelligence/epic-collection/story-image-fingerprints-at-collection-plan.md)
  records the actual evidence and automatic-telemetry privacy regression. Real source acquisition
  remains disabled; no source-specific necessity or permission follows from D-089.

### ROP-05 — Rights handling, removal and suppression

- **Purpose:** respond to rights requests, erase listing artifacts and prevent reacquisition.
- **Subjects and data:** requesting person and affected listing; minimum request correspondence,
  verification evidence, stable source identity, suppression state and audit outcome. Identity
  documents and extra contacts are not automatically justified or allowed in collection storage.
- **Basis and necessity:** conditional legitimate interest for durable exclusion; the owner must
  identify any applicable rights-handling legal obligation and segregate only the minimum
  correspondence needed to fulfil it. This record invents no blanket legal basis for collecting
  requester documents or indefinite retention.
- **Systems, recipients and access:** planned owner removal command, collection suppression store,
  downstream consumers and separate rights channel. Correspondence is restricted to the owner and
  any specifically reviewed processor, never public listing data or event payloads.
- **Retention and rights:** record suppression first, then delete listing data, snapshots and
  fingerprints and propagate deletion. Preserve only suppression and minimum justified audit
  evidence needed to keep the listing out. Define correspondence/audit review periods before
  real requests; suppression duration must cover continuing reacquisition risk with periodic
  necessity review. Redelivery, reparse and restored backups must not recreate suppressed data.
- **Security and status:** collection story 2.10 and the public-notice story remain pending.
  No working public contact or exercised removal guarantee is claimed. The future channel must
  cover confirmation/access, correction, objection and applicable deletion/anonymization/blocking
  requests, with proportionate verification and a documented response/escalation process.

### ROP-06 — Events, audit, operational logs and telemetry

- **Purpose:** reliable delivery, replay protection, accountable owner operations and detection of
  faults; not behavioural advertising or user-text analytics.
- **Subjects and data:** sanitized parsed/correction events and provenance; operational identifiers,
  categorical failures, times, counts and audit outcomes. Future HTTP network metadata and rights
  audit can identify people. Event identifiers and hashes can link records even without names.
- **Basis and necessity:** conditional legitimate interest in reliability and security, limited
  to metadata necessary for that purpose. A specific legal obligation may justify an identified
  audit item only after the owner records it; operational convenience does not grant blanket
  retention of personal content.
- **Systems, recipients and access:** PostgreSQL outbox/inbox/audit, RabbitMQ delivery/dead-letter
  queues, worker/API logs and OpenTelemetry instrumentation. Owner access is local; any external
  collector/dashboard, hosting processor or public event API needs a recipient review first.
- **Retention and rights:** published outbox rows: seven days; consumed inbox markers: thirty
  days, with the unpublished-event protection of
  [ADR 0017](../../specs/adrs/0017-dead-lettering-and-delivery-retention.md). These are delivery
  windows, not rules for audit, dead letters, operational logs, traces, normalized history or
  backups. Their concrete periods, deletion and incident holds remain unresolved release gates.
  Erasure must consider payload copies and dead letters as well as database/object artifacts.
- **Security and status:** local outbox/inbox, audit and categorical collection telemetry have
  implemented evidence. Logs/traces must exclude payloads, SQL, prompts, responses, credentials
  and connection strings. External exporters, production access and all retention domains above
  are not proven by local tests.

## Systems, sharing and transfers

The architecture separates collection/worker, API, PostgreSQL, RabbitMQ and S3-compatible storage;
the frontend consumes versioned contracts. Nine bounded contexts own their schemas. This topology
is a design inventory, not a list of appointed processors or operating production hosts.

Current evidence concerns owner-controlled local fixtures. No hosting supplier, telemetry supplier,
contract, country, backup region or international-transfer mechanism is verified for real data in
this record. Before any corresponding real operation, the owner must record the supplier's legal
identity and role, operation/data received, purpose, access, region/subprocessors, contract and
deletion/backup commitments, and applicable transfer evidence. Unknown destinations remain gates.

The separate AI service has no database, broker or object-storage credentials. Ingestion uses no
model. No collected personal content is authorized for a provider by this inventory.

The public Ask feature does send visitor-supplied text to a model provider
([ADR 0029](../../specs/adrs/0029-direct-anthropic-provider-for-ask.md), which supersedes
[ADR 0014](../../specs/adrs/0014-zero-data-retention-for-user-text-routes.md)):

- **Recipient:** Anthropic, through its Messages API, called directly by the AI service with the
  owner's API key. No intermediary gateway and no second model provider is used.
- **What is sent:** for intent classification, the text of the visitor's question and fixed
  instructions; for the explanation, fixed instructions and the figures computed for that answer
  (asking price, area and price per square metre), without the question. Thread history, run
  identifiers, grants, cookies and visitor identity are not sent.
- **Terms and retention:** requests are made under Anthropic's standard commercial API terms. The
  product performs no zero-data-retention verification and makes no claim about the provider's
  retention period. Earlier records that required verified Zero Data Retention before transmission
  no longer describe this route.
- **Safeguards:** the public notice states the transmission and asks visitors not to include
  personal data; the question is free text, so personal data a visitor types anyway is transmitted
  as written. Logs and traces exclude prompts, responses and credentials.
- **Still unverified:** the provider's legal identity and role, processing region, subprocessors,
  contract, deletion commitments and any international-transfer mechanism are not recorded here.
  The owner must record them; this inventory does not establish a legal basis or the adequacy of
  the recipient.

## Access, security and restoration obligations

The owner is responsible for least privilege, transport security, storage/database/broker
permissions, encryption-key provisioning, incident handling and restricted operational access.
Server-local commands precede authentication; no unauthenticated HTTP operator surface is
authorized. A successful local test is not evidence of production ACLs, backups or key custody.

Real snapshot deadlines and tombstones must be preserved through restoration. Define backup
scope, expiry, encryption, access, restore filtering and verification before real use. Restoring
an older database or object store can revive expired or suppressed content: reconcile expiry,
reapply the authoritative suppression set and complete removal propagation before releasing reads,
jobs or publication. No claim that every backup expires in 30 days is made. If a supplier cannot
honour these constraints, the corresponding processing stays disabled.

## Activation evidence and reassessment

The owner is accountable for every gate. The implementing story provides test evidence; neither
its completion nor this record alone enables a source.

| Gate                        | Required evidence and responsible delivery                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controller and transparency | Owner-supplied public identity/contact, bilingual notice linked from every public screen; epic-web privacy-notice story.                                                                 |
| Source-specific permission  | Current allowing ToS/robots/licence review, written Caixa/ITBI answer where applicable, safe access and configured rate in source register; collection 2.4/2.6.                          |
| Purpose and minimization    | Owner's source-specific reassessment of ROP-01/03, representative permitted-field/provenance review, rejection of sensitive or unrecognized content, and no broader field set.           |
| Snapshot lifecycle          | Key custody and deployed expiry/reconciliation verification, including orphan/late-write/restart behaviour; collection 2.7. Existing proof is local.                                     |
| Images and text exposure    | Separate dated evidence for each permission, evaluated algorithm/count/photo disposal when needed, and API text-denial tests; collection 2.9 and properties delivery.                    |
| Rights and removal          | Suppression before fetch and before writes, deletion across artifacts/consumers/caches/delivery copies, reparse/redelivery/restart and backup tests; collection 2.10.                    |
| Recipients and transfers    | Owner-verified processor roles, contracts, regions, subprocessors, sharing limits and applicable transfer evidence before transmission.                                                  |
| Non-snapshot retention      | Concrete periods and necessity review for normalized history, fingerprints, audit, rights correspondence, logs/traces, dead letters and backups; owner and corresponding implementation. |
| Public reliability          | Owner-approved matching/linkage balancing, correction/dispute handling and minimum-count aggregates before corresponding real public exposure.                                           |

Reassess both versioned records before a real source, field, purpose, retention, supplier, transfer,
image capability, AI route or public exposure changes; after an incident, rights complaint, weak
sanitization result or changed permission; and during the owner's periodic necessity review.
Until verified source-specific evidence closes the relevant gates, real processing remains
disabled. A changed allowlist or lifecycle requires a superseding ADR, not a silent inventory edit.

## Evidence map

- [ADR 0018](../../specs/adrs/0018-snapshot-encryption-and-acquisition-retention.md) and
  [ADR 0019](../../specs/adrs/0019-expired-snapshot-reconciliation.md): fixed acquisition expiry,
  authentication, key refusal and fair durable cleanup; physical deletion can lag.
- [Source-register migration](../../migrations/4002_collection_expand_source_register.sql) and
  [registration rules](../../packages/domain/src/collection/source-registration.ts): persisted
  evidence, distinct permissions and enablement eligibility; no real source enabled here.
- [Canonical sanitizer](../../packages/infrastructure/src/collection/canonical-snapshot-sanitizer.ts)
  and [closed projection](../../packages/domain/src/collection/snapshot-privacy.ts): actual field
  ceiling, provenance handling and limited known-name recognition.
- [Lifecycle migration](../../migrations/4006_collection_add_snapshot_lifecycle.sql) and
  [reparse migration](../../migrations/4007_collection_add_snapshot_reparse.sql): immutable
  acquisition/hash history, expiry guards and durable original fingerprints.
- [Collection 2.7 evidence](../../_bmad-output/initiative-real-estate-intelligence/epic-collection/story-sanitized-encrypted-snapshots-with-expiry-plan.md)
  and [collection 2.8 evidence](../../_bmad-output/initiative-real-estate-intelligence/epic-collection/story-reparse-from-stored-snapshots-plan.md):
  isolated local lifecycle/correction verification, not suppression, photo acquisition, public
  notice, normalization or production proof.
