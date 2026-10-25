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
