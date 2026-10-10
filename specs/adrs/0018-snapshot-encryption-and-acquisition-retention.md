# ADR 0018 — Snapshot encryption and acquisition-scoped retention

- **Status:** accepted
- **Date:** 2026-10-10
- **Extends:** ADRs 0013 and 0015

## Context

The synthetic pipeline hashes exact JSON bytes and globally deduplicates immutable objects.
Real snapshots instead need sanitization, encryption and deletion thirty days after collection.
Deleting historical hash rows would break replay and provenance, while extending a shared object's
expiry on every observation would permit indefinite retention. Uploads happen before the business
transaction and therefore may have no committed observation.

Decision: D-014 records this choice (agent, on the owner's behalf, 2026-10-10).

## Decision

- Project the canonical JSON document onto the ADR 0015 allowlist before any snapshot persistence
  and before calling the parser. Drop contact/person/individual-CRECI, unit/complement and photo
  fields; mask contact patterns, links and known contact names in permitted text. Sanitize or
  reject unsafe provenance too. Arbitrary source HTML/CSV is not a supported snapshot format;
  source adapters must translate it in memory to the supported canonical JSON shape first.
- Use application-side AES-256-GCM, a random nonce for each attempted new ciphertext, a full
  authentication tag and a versioned envelope. Authenticate the object identity, plaintext hash,
  media type and key identifier as additional data. Decryption must authenticate and verify the
  sanitized plaintext hash, not merely trust object metadata.
- Compute the content hash from deterministic sanitized bytes. Keep it visible in the object key,
  with a separate opaque acquisition scope derived from its stable idempotency identity. Repeated
  attempts of the same acquisition converge on an authenticated immutable winner; a different
  acquisition has an independent generation and expiry. Never deduplicate real and synthetic
  storage into the same plaintext/ciphertext object.
- Persist a generation reservation before upload, with a trusted collection timestamp and fixed
  expiry exactly thirty days later. Retries do not extend it. Reservations cover uploads whose
  later parsing or business transaction fails. Synchronize generation writes, access, observation
  commits and cleanup so expiry cannot resurrect an object or leave a falsely available reference.
- Keep historical content hashes and observations independently of physical object availability.
  Append a collection-schema migration that preserves existing synthetic identities and immutable
  historical metadata. Expiry removes the real blob, not run counts, manifests or replay history.
- Run a bounded, non-overlapping retention job in the actual worker, starting immediately and
  during its lifecycle, with cancellation and graceful shutdown. Deletion is idempotent and
  recovery covers a crash before or after deletion. Read access fails closed at the expiry boundary
  even if a storage outage delays physical cleanup. Every object-store operation remains
  one-attempt in the adapter with caller-owned resilience, deadlines and categorical telemetry.
- Configure an explicit 32-byte encryption key and key identifier. No checked-in or ephemeral
  fallback key is allowed. Missing configuration preserves synthetic operation but refuses real
  storage/read. Persist the envelope's key identifier for validation; changing the configured
  identifier does not silently decrypt an old generation with another key. Rotation with several
  simultaneously readable keys is a later operational extension, not an implicit fallback.
- Preserve synthetic exact bytes, hash keys and unlimited retention. Prove the real-data path with
  a local isolated fixture only. No real adapter, source enablement, privacy-policy exception,
  production deployment or VPS access is introduced.

## Consequences

Encryption is portable across S3-compatible vendors and an object-store configuration mistake
cannot cause plaintext real snapshots. The application now owns key provisioning and generation
metadata. Distinct real acquisitions may temporarily store the same sanitized content more than
once; this is accepted to give each acquisition an independent hard retention window.

Known structured contact names can be removed deterministically; the sanitizer does not claim to
recognize every person's name in arbitrary prose. Unrecognized document shapes fail closed rather
than being stored as opaque raw bytes. This remains an engineering reading, not a legal opinion.

Physical deletion is asynchronous and may lag during an outage, but access never extends past the
deadline. Durable cleanup retries remain required until deletion succeeds. Synthetic fixtures are
not a permission to collect a real source.

## Reassessment trigger

Add a reviewed multi-key rotation contract before rotating a live key with unexpired generations.
Reassess canonical source formats and sanitizer rules when a real source receives written
authorization, without weakening the no-personal-data invariant.
