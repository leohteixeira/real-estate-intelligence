# ADR 0015 — Handling of collected data

- **Status:** accepted
- **Date:** 2026-10-10
- **Accepted by:** the agent on the owner's behalf, 2026-10-10

## Context

The product keeps listing history and provenance, reprocesses raw snapshots and compares listings
that may describe the same property. Those capabilities need collected data, but the product
contract also forbids storing personal data and photographs of natural persons. Source permissions
further determine whether photographs may be fetched for fingerprinting and whether masked listing
text may be displayed.

Without one binding decision, collectors, snapshot storage, normalized records, APIs and removal
flows could apply different field sets, retention periods or permission defaults. This ADR records
the contract's engineering reading. It is not legal advice and does not replace a legal review.

## Decision

### Closed allowlist for real listings

A real listing may persist only these fields:

- property type, asking price, area, bedrooms, bathrooms, parking spaces and features;
- the location as the source publishes it, without unit or complement;
- dates, the listing source and the source URL;
- the advertiser type (private or agency) and the agency name, which belongs to a legal entity;
- the description after phone numbers, e-mail addresses, CPF numbers and links are masked;
- image fingerprints computed during collection under the permission rules below.

The allowlist is closed: a field not listed above is rejected or dropped before persistence. The
name, phone number, e-mail address or individual CRECI number of a natural person is never stored,
and neither is a photograph. Adding a field requires a superseding ADR and an updated source and
privacy review.

### Accepted clarification — D-047, 2026-10-11

Accepted by the agent on the owner's behalf, 2026-10-11. This clarification enforces the existing
prohibition on raw images and address complements; it does not enable a source or choose the
perceptual algorithm of collection story 2.9.

The current canonical fingerprint boundary accepts `sha256:` plus 64 lowercase hexadecimal
digits, or prepared synthetic labels matching
`^(?:fixture|synthetic)(?:[-:][a-z0-9]{1,32}){1,8}$`. Arbitrary opaque strings and encoded media
are not fingerprint representations. The existing stub and historical dataset values, event
versions and intentional-empty correction behavior are preserved without rewriting evidence.
Synthetic labels are test evidence, not proof of an image permission or cryptographic computation;
real snapshot sanitization continues to accept only already-computed SHA-256 values. A future
perceptual representation requires an explicit compatibility/versioning decision in story 2.9.

Street text rejects explicit unit/complement labels after a comma or semicolon regardless of the
following value, and a rear (`fundos`) complement after a door number. Existing numeric/unit
guards remain. Ordinary street names such as `Rua dos Apartamentos`, `Avenida Bloco Novo` and
`Rua dos Fundos`, and a door number alone, remain valid. This bounded validation is not general
address recognition or an exhaustive anonymization guarantee.

### Accepted clarification — D-089, 2026-10-25

Accepted by the agent on the owner's behalf, 2026-10-25, for collection story 2.9.
This settles the representation and acquisition bounds reserved above; it adds no retained
field, source permission or real-source activation.

- Compute horizontal dHash64, represented as `dhash64-v1:` followed by 16 lowercase hexadecimal
  digits. Apply EXIF orientation, flatten transparency over white, convert to grayscale and resize
  to 9 by 8 pixels using Lanczos3. Compare each right pixel with its left neighbour using `>`;
  encode comparisons in row order with the first comparison as the most significant bit.
  Sharp 0.35.5 is pinned in infrastructure for JPEG, PNG and WebP decoding. This versioned pipeline
  does not claim byte-for-byte equivalence with another decoder's implementation.
- Select at most the first three distinct photograph URLs in source order. Process sequentially,
  in memory, with a 5 MiB compressed-input limit, a 16-million-pixel input limit and bounded native
  computation. Keep photograph URLs transient; store, cache and log neither them nor media bytes.
- Every photograph attempt shares the listing page's actual per-source rate, cooldown and
  resilience state. Recheck current independent image permission before each attempt, including
  after an admission wait. Denial produces zero photograph requests and empty fingerprint evidence.
- Produce one fingerprint per selected photograph fetched, preserving order and equal perceptual
  hashes. A selected photograph's failure fails observation preparation; a partial result is not
  published as a completed observation. Reparse uses original fingerprint evidence and never
  acquires photographs.
- Preserve strict acquisition v1 and correction v2 readers, historical SHA-256 values, prepared
  synthetic labels and dataset bytes. Use acquisition v3 when the new representation or empty
  evidence requires it, and correction v4 when perceptual evidence requires it. New versions
  preserve repeated perceptual hashes; do not silently broaden historical contracts.
- Hamming distance is 0–64 and similarity is `1 - distance / 64` for matching algorithm tags only.
  Mixed representations do not establish perceptual similarity. Matching weights and thresholds
  remain the responsibility of properties stories 3.6 and 3.7.

Implementation and verification evidence belongs to the existing
[story plan](../../_bmad-output/initiative-real-estate-intelligence/epic-collection/story-image-fingerprints-at-collection-plan.md).
This decision alone does not establish that the controls have passed their verification gates.

### Photographs and listing text

For each real source, the source register records two independent permissions. Both default to
denied and become allowed only when the source review establishes the permission and records its
evidence and review date:

- **Fetch images.** When allowed, the collector may select photographs to fetch. For each photograph
  selected for fetching, it computes exactly one deterministic fingerprint in memory and
  immediately discards the photograph after computation. The image request consumes the source's
  rate limit. The D-089 clarification above chooses the algorithm, similarity measure and bounded
  photograph count.
- **Display listing text.** When allowed, the API may return the masked description and compare its
  masked versions. When denied, the API returns only that the description changed and when, plus a
  link to the source. The masked description may remain stored for parsing and entity resolution,
  but no excerpt may be displayed, including a source sentence for an interpreted attribute.

These permissions do not enable a real source or change any existing source-review outcome.
Collection from a real source remains disabled unless its terms of use, robots policy and licence
allow it.

### Raw snapshots and synthetic fixtures

- A real-source payload is sanitized before persistence: forbidden contact fields are removed and
  phone numbers, e-mail addresses, CPF numbers and links are masked in text.
- A sanitized real-source snapshot is encrypted at rest and deleted 30 days after collection.
  Reprocessing is available only inside that window. After deletion, normalized data retains the
  snapshot's content hash so its provenance remains auditable.
- Synthetic fixtures are identified separately from real-source snapshots. They contain no
  personal data, may be retained beyond 30 days and may carry prepared fingerprints without
  photographs. Their permissions may allow both image evidence and listing text for deterministic
  tests, but those permissions do not transfer to a real source.

### Removal and suppression

A removal request first records a suppression against the listing's stable source identity. The
system then deletes the listing's stored data, real-source snapshots and image fingerprints while
preserving the suppression entry and the minimum audit evidence required to enforce it. As soon as
discovery yields a candidate's stable source identity, collection checks suppression before fetching
the listing payload or any image. It checks again before persisting a payload or producing any
downstream artifact, so a later run, redelivery or reprocessing operation cannot recreate the
listing or its artifacts.

### Accepted clarification — D-091, 2026-10-25

Accepted by the agent on the owner's behalf, 2026-10-25, for collection story 2.10.
The owner invokes removal with the stable source/listing identity through the worker command.
Suppression commits before external deletion, remains permanent if deletion fails or the command
is interrupted, and uses the same suppression/event identity when resumed. Completion means that
owned object deletion and Collection/platform/audit erasure have succeeded; it is not a scheduled
retry or a claim that an incomplete attempt erased content.

Only the source/listing identity, suppression/event IDs and timestamps, minimal historical run
listing identities, and necessary immutable object cleanup metadata remain. Run counters,
checkpoints and completed manifest evidence retain their historical meaning without keeping a
snapshot URL, parsed payload or image fingerprints for the removed observation. Platform and
audit erase matching `collection.snapshot.parsed` copies through their owning capabilities.
Audit's append-only rule has one narrow exception: an owner-authorized deletion of these collected
copies for the matching permanently erased identity. Other audit deletion and all mutation remain
forbidden. Inbox markers and the minimal suppression event remain; audit's own identity tombstone
and current Collection authority reject delayed parsed delivery even after inbox pruning.

New real reservations carry the explicit listing identity before upload. Suppression makes them
unavailable immediately, without extending or shortening the original 30-day expiry. Existing
retention reconciles suppressed real generations and durable synthetic cleanup tombstones so a
cancelled late PUT cannot restore access. Globally addressed synthetic objects survive while an
unsuppressed listing owns them; object ownership and deletion are serialized. Historical real
orphans without an observation cannot be attributed from their one-way acquisition hash and keep
the existing expiry/reconciliation bound.

Collection suppression also prevents new downstream facts through current parsed-event authority.
Erasure of pre-existing Properties and Market derived records belongs to stories 3.12 and 4.8;
this Collection command does not claim those capabilities. Implementation and verification evidence
belongs to the existing [story plan](../../_bmad-output/initiative-real-estate-intelligence/epic-collection/story-removal-request-and-suppression-list-plan.md).

### Accepted clarification — D-095, 2026-10-25

Properties consumes the existing authenticated `collection.listing.suppressed` through a committed
inbox/transaction/outbox effect. Collection's public authority locks the stable source identity and
confirms the canonical suppression/event identity and timestamp before Properties takes its identity
and resolution locks. Properties erases incoming facts/dispositions, immutable original lineage,
current/acquisition/history/effect rows, either-side matching comparisons and minimum evidence
containing the erased listing on either side. Shared source progress remains. Platform erases
matching retained Properties publications, including group publications, through its owning port.
The audit exception in D-091 is unchanged.

If the erased original Property ID anchors surviving membership, replace that group ID with the
smallest surviving immutable original Property UUID before deleting the erased original. Keep the
survivors together while their substantive matching evidence is unchanged; normal future matching
changes can resolve them again. Preserve each survivor's own lineage, rights and unaffected minimum
history. Erasure does not fabricate reversible absence or a price movement.

The additive, closed version-one `properties.listing.suppressed` contract carries only the canonical
cause/suppression/source identity, nullable removed listing/original property IDs and causal counters,
and affected previous/resulting property IDs with strictly advancing revision counters. Each group
change contains exactly `previousPropertyId`, nullable `propertyId`, `previousRevision` and
`revision`. It carries no listing snapshots, minimum, values or provenance. Committed chronology
can advance before resolution; HTTP remains the current-state/minimum authority. A final member
yields a null resulting property. A pending/unknown identity yields no group changes. Minimal
suppression notifications are excluded from derived-publication erasure, preserving consecutive
notifications before relay and after receipt-based replay without replacement or recovery events.
Only stable identity, cause/suppression IDs and nullable removed internal IDs remain in a permanent
Properties receipt, independent of inbox/outbox retention. Confirmed suppressed parsed delivery is
acknowledged as ignored; unconfirmed input fails closed. Prepared detail fallback also consults
current suppression authority.

Already delivered broker copies are outside local retained-copy erasure. Market's separate derived
erasure remains story 4.8. Evidence and limits belong to the existing
[Properties story plan](../../_bmad-output/initiative-real-estate-intelligence/epic-properties/story-erasure-of-a-suppressed-listing-plan.md).

### Accepted clarification — D-099, 2026-10-26

Market participates in permanent suppression through the existing authenticated Collection cause
and the unchanged minimal Properties notification. Each delivery authenticates the canonical cause
before taking the Market writer lock; owner receipts, physical content erasure, survivor minima,
redirects and inbox effects are atomic. Collection-first delivery cannot discard the later
Properties group transition. A failed transaction leaves no receipt or acknowledged effect.

Delete current references before immutable evidence. Erase legacy and causal envelopes containing
the removed listing, including copied group snapshots, while preserving independently materialized
survivor state/history and source completion watermarks. Retain only stable identity/cause receipts
and JSONB-normalized SHA-256 event and causal-key fingerprints for permanent replay/conflict
protection. A guarded transaction-local identity plus the matching authenticated receipt permits
only matching content deletion; unrelated deletion and every immutable update remain rejected.

Retain original causal assignment IDs/revisions. Translate effective membership afterward through
permanent erased-anchor redirects. Only a transition away from the erased original anchor (including
null) creates a redirect; removing an ordinary member does not redirect its surviving group. Resolve
chains in minima and snapshot history reads, irrespective of notification order. Null ends an old
association without tombstoning a survivor. Strict-validate future mixed envelopes before screening
an erased member, then project their survivors without retaining the copied erased payload.

The existing [Market story plan](../../_bmad-output/initiative-real-estate-intelligence/epic-market/story-erasure-of-the-facts-of-a-suppressed-listing-plan.md)
records exact verification and limits. Broker delivery already outside owned retained storage cannot
be physically recalled; permanent screening prevents its rematerialization. No production erasure
is established by disposable synthetic fixture evidence.

## Consequences

Collectors and parsers must share one sanitizer and one closed allowlist, and storage must support
encrypted real-source snapshots, expiry and deletion. Source adapters must consult the register
before image requests, APIs must enforce the listing-text permission and every collection path must
consult suppression before fetching and again before persistence. These controls reduce retained
data and display rights by default, at the cost of additional source metadata, lifecycle jobs and
audit tests.

## Reassessment trigger

Reassess this decision after a legal review changes the engineering reading, when a source grants
or withdraws a permission, or when a product capability proposes another persisted field. A source
permission change updates the source register; a change to the allowlist, retention period, image
lifecycle or suppression semantics requires a superseding ADR.
