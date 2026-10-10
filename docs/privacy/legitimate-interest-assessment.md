# Legitimate-interest assessment

- **Version:** 1
- **Status:** accepted as an engineering baseline; real processing remains disabled
- **Date:** 2026-10-10
- **Accepted by:** the agent on the owner's behalf, 2026-10-10, under D-019
- **Scope:** CAP-28, local synthetic operations and the conditional real-data design

This explanation assesses the design in the [record of processing operations](record-of-processing-operations.md).
Its stable IDs ROP-01 through ROP-06 identify each operation. Delegated acceptance under D-019
accepts these documents, not real-source activation, a personal/legal signature, a publisher
licence or the adequacy of an unidentified processor. The controller remains the owner, a natural
person. Public identity/contact and operational evidence must be supplied before real processing.

The assessment follows purpose, necessity and balancing with safeguards, drawing on the
[ANPD legitimate-interest guide](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf/@@display-file/file).
Legitimate interest does not supply a sensitive-data basis. The
[LGPD](https://planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm) treats
identifiability and the rights of affected people as relevant even when data is public; masking
or hashing is not an automatic finding of anonymization. The product must keep a reasoned,
proportionate and revisable account of its processing. This is an engineering interpretation,
not legal advice, a RIPD, an ANPD approval or a compliance certificate. Small-size-controller
eligibility and any relaxation remain unverified assumptions.

## Purpose: which interests are being served

The owner's concrete interest is a São Paulo property-market intelligence product: explain asking
prices per square metre, changes and listed time, avoid double-counting the same property across
listings, and expose the evidence behind figures. Users benefit from reproducible comparisons
rather than unsupported claims of sale price or ownership. Reliable collection, bounded correction
and security support this purpose; they are not independent permission to retain everything.

ROP-01 obtains only permitted facts. ROP-02 supports time-limited correction and provenance.
ROP-03 derives deterministic history, matching and place figures. ROP-04 proposes optional image
evidence only where necessary and separately permitted. ROP-05 supports rights and continuing
exclusion. ROP-06 enables accountable, reliable operation. None aims to contact sellers, identify
occupants, infer a person's wealth or sensitive characteristics, train a model on collected
content, or sell personal profiles. A new such purpose requires reassessment and cannot inherit
this conclusion.

The current synthetic dataset satisfies engineering development and demonstration without real
subjects. Local real-shaped privacy fixtures prove selected controls, not the legitimacy of
receiving an actual publisher's content. There is no present necessity to activate a real source
to finish these documents or the synthetic MVP.

## Necessity: less intrusive alternatives

Synthetic fixtures are the preferred development/test input and the MVP's sole permitted source.
They cannot establish actual market conditions. That limitation can justify examining an
authorized real feed later, but does not make every available portal necessary or permissible.
Publisher-provided or licensed structured feeds, including a feed stripped of private content
before delivery, are preferable to receiving and sanitizing mixed public pages. Their exact
coverage, licence and minimization must be assessed for each source.

For ROP-01, use structured property facts without contacts, person names, individual CRECI, units
or complements. Reject an unsupported shape instead of keeping opaque raw HTML/CSV. Some memory
inspection is necessary to discard forbidden content, but inspect only the permitted acquisition,
avoid payload logging/caching and discard rejected content. An adapter that cannot produce safe
canonical bytes cannot proceed. The allowlist is a ceiling, not a requirement to fetch every field.

For ROP-02, retaining only parsed facts prevents later independent parser correction. A bounded
sanitized snapshot is a proportionate design alternative to indefinite raw storage, subject to
source permission and proven minimization. The fixed 30-day acquisition window covers failed
uploads too; another observation, retry or correction cannot reset it. Historical hashes can
support integrity after expiry, but retained identifiers/hashes still need a defined purpose and
review period. They are not a harmless substitute for deleted personal content by definition.

For ROP-03, structured facts alone may support matching and price analysis. Omit descriptions
where unnecessary; absence of display permission forbids excerpts and comparisons, even if masked
text remains permitted for internal parsing/matching. Public aggregation with enough contributing
records is less exposing than unit-level observations; ITBI is restricted to future place figures
and never property linkage. Each normalized-history period and public field needs evidence of
necessity. Snapshot expiry cannot justify unlimited derived history.

For ROP-04, first test an image-free match against labelled fixtures and the proposed source.
If it adequately serves the purpose, do not fetch photos. If not, document why a limited image
selection is needed, its count, algorithm and residual linkage. Source permission must cover
fetching; each request consumes the rate allowance. Compute one deterministic fingerprint per
fetched photograph in memory and discard the photograph immediately. No need for face/person
recognition, retained photos or image URLs has been demonstrated; none is authorized.

ROP-05 needs a stable source identity to keep a removed listing out. Prefer minimum suppression
and outcome evidence over preserving the removed listing or collecting identity documents. Rights
correspondence belongs in a separately restricted workflow with proportionate verification and
documented retention. ROP-06 can use categorical failures, durations/counts and delivery identity
instead of text, SQL or payload dumps. The seven-day outbox and thirty-day inbox limits concern
delivery only; other logs, audit, dead letters and backups still need concrete periods.

## Balancing: expectations and foreseeable effects

A person advertising a property may expect people to see the listing at its original publisher.
They do not necessarily expect an independent service to join it with other listings, archive
changes, correlate images, infer a property identity or retain a link after withdrawal. Owners
and occupants may not have published the advertisement themselves. Agency names are allowed only
as legal-entity names; an apparent agency field can still contain a sole trader's personal name.
Publisher permission does not settle these expectations or the interests of incidental subjects.

Combining street/location, times, property features, source URLs, description fragments and
fingerprints can identify a home or seller. Removing unit/complement and contact patterns reduces
that risk but does not remove it. A source URL path or stable identifier may embed a person's name
or continue linking to their original profile. Current sanitizer checks reject unsafe provenance
and strip query/fragment components, yet names not available as labelled contact fields can evade
known-name masking. Arbitrary-prose name recognition is not proven. Representative source review
must demonstrate that the proposed retained content meets the no-personal-data contract; otherwise
drop the text/field, reject the candidate or keep the source disabled. Do not silently expand the
allowlist or declare the remainder anonymous.

Descriptions and photographs can incidentally disclose religion, health, children's presence or
intimate details. Photo disposal does not undo receipt in memory, and image fingerprints can link
the same room or person across publishers. Such content is outside this purpose. A source that
cannot avoid that exposure is unsuitable for the proposed operation; no sensitive-data basis is
inferred from this assessment. Image permission alone cannot close that risk.

Wrong or biased matches can join two homes' histories, misstate a seller's asking-price changes or
distort regional figures. Synthetic calibration supports reproducibility, not demonstrated accuracy
on a future source. Deterministic evidence, visible uncertainty, keeping uncertain listings
separate and a correction/dispute process are necessary before real public use. Missing coverage
or biased source selection must not be presented as a complete market. Removal is not proof of
sale, asking price is not a transaction price, and no personal assessment is made from either.

Keeping an old description or replaying an outdated parser can restore information a person asked
to remove. ROP-05 must establish suppression before erasure and check it before fetching and
again before persistence/publication. Reparse, corrections, events, caches and derived matches
must observe the same exclusion. Expired snapshots remain unreadable and uncommittable even if
storage is down; reconciliation handles a late write and must continue fairly after restart.

An older backup can reintroduce expired or suppressed artifacts. Restoration must preserve
acquisition timestamps, apply the authoritative suppression set, reconcile object expiry and
propagate erasure before reads or jobs resume. Backup retention and restore behaviour have no
implemented evidence in this record. Public source links and public outputs may be copied by
independent recipients, making complete recall impossible; limit exposure before publication and
describe that practical limitation in the future notice and request handling.

## Safeguards and their evidence limits

The [operation inventory](record-of-processing-operations.md#operation-inventory) records exact
retention, recipients, rights and security responsibilities. This matrix connects each balancing
requirement to the binding decision and the current evidence, without treating policy as delivery.

| Operation                | Safeguard and binding source                                                                                       | Evidence or condition still required                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ROP-01                   | Closed allowlist, prohibited contacts/person names/photos, default-denied permissions; ADR 0015.                   | Canonical projection and unsafe-provenance rejection are tested locally; each real adapter and source-specific residual-text review remain gated.          |
| ROP-02                   | Authenticated encryption with no fallback key, trusted fixed 30-day acquisition expiry; ADR 0018.                  | Local lifecycle evidence exists; deployed key custody, storage permissions and independent retention/backup obligations remain unresolved.                 |
| ROP-02                   | Ongoing tombstone reconciliation, fair incremental selection, expiry-safe access/commit; ADR 0019.                 | Local late-write, deadline and restart evidence exists; production cadence, capacity and operational monitoring require proof.                             |
| ROP-02/03                | Reparse preserves original provenance/fingerprints and corrects without new acquisition; D-018 and collection 2.8. | Actual CLI evidence is synthetic; real-category expiry/privacy checks use local injected fixtures. Downstream correction/history behaviour is future work. |
| ROP-03                   | Distinct listing/property, explainable matches and separate asking/transaction figures; product spec.              | Normalization, public-text permission enforcement, calibration and dispute/removal propagation must be delivered before real exposure.                     |
| ROP-04                   | Independent image permission, in-memory computation and immediate photo disposal; ADR 0015.                        | Collection 2.9 must settle algorithm/count/measure and prove rate, no-photo-storage and no-image behaviour. Synthetic prepared hashes are not that proof.  |
| ROP-05                   | Suppression first; pre-fetch and pre-write exclusion plus erasure; ADR 0015.                                       | Collection 2.10, rights channel, correspondence periods and backup/consumer removal evidence remain pending.                                               |
| ROP-06                   | Bounded outbox/inbox delivery retention and metadata-only observability; ADR 0017.                                 | Local evidence covers delivery/collection telemetry; audit/dead-letter/log/trace/backup periods and external processors need review.                       |
| Any external model route | No model ingestion in MVP; isolated AI and pre-transmission verified ZDR for user text; ADR 0014.                  | No collection-text transmission is authorized here. Future provider/basis/region review is separate from ZDR route verification.                           |

The owner must supply public identity/contact and a bilingual, discoverable notice, exercise the
rights workflow, and verify recipients, contracts, regions and applicable transfer evidence.
Future hosting, telemetry exporters, AI providers and public readers are not approved recipients
merely because the architecture depicts them. Supplier or transmission changes require a new
inventory review; ZDR does not supply collection's lawful basis or eliminate transient processing.

## Conditional conclusion and stop conditions

Version 1 accepts a scoped engineering baseline for CAP-28 and supports continuing local synthetic
development. It does not conclude that a real source may presently be collected. The purposes are
specific, but necessity and balancing for an actual source cannot be established from synthetic
data or incomplete processor/rights evidence. The owner's source-specific decision must resolve
the [activation evidence gates](record-of-processing-operations.md#activation-evidence-and-reassessment)
before the corresponding operation is enabled.

At minimum, keep real processing disabled where source permission is missing, the controller or
contact cannot be published, a destination/contract/region is unknown, operational retention is
undefined, or suppression/notice/public-display controls lack evidence. Treat collection, image
fetching and description display as separate approvals. Caixa and ITBI still require written
publisher answers; no portal permission follows from this assessment. GeoSampa remains V2
reference geography with no MVP ingestion.

Stop the affected source or operation if unsafe personal content survives minimization, sensitive
or children's content cannot be excluded, suppression can be bypassed, expiry access opens, a
restore can revive erased data, a supplier changes the reviewed destination/retention, or source
permission is withdrawn. A login wall, CAPTCHA or block is an access refusal, never a reason to
work around it. Escalate to the owner for evidence-based correction or source rejection; a changed
field/lifecycle needs the superseding ADR required by the existing decisions.

Residual risks remain indirect identification, missed prose names, retained link/hash correlation,
in-memory photo exposure, erroneous/bias-driven matches, irreversible public copying, delayed
physical deletion and restored backups. Some controls are policies awaiting implementation.
They are explicit limits of the conditional conclusion, not risks waived by delegated acceptance.
The owner must version and reassess both records before changes to source, purpose, data,
retention, supplier, transfer or public exposure, and after an incident or rights complaint.
