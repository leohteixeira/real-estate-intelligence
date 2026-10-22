# Final verification receipt

## Final D-064 Listing artifact

Command:
`pnpm exec vitest run --config vitest.integration.config.ts integration/web-listing.integration.test.ts`.
Session72307 exited0, duration122.15s (test121.16s). The seven semantic cases all completed. This
run is `listing-2026-10-22T08-31-04-848Z-ae910bf5`; prior runs remain separate.

Audit:
`python /home/vscode/.codex/skills/agents-evaluator-e2e/scripts/audit_campaign.py apps/web/.impeccable/review/campaigns/listing-2026-10-22T08-31-04-848Z-ae910bf5`
exited0: catalog7, attempts7, approved7, not_executed0, executorErrors0, conclusive7,
countsTrusted=true, errors[]. This is structural integrity, not parent visual approval.

Recorded base commit `be21042c84fab22bae0f120ec241e243e6aa37ea`, dirty=true.
[Artifact readback](../artifact-readback.json) records:

- Listing source: `1fae37a273fabe7a6c2d6c7ab628cb55d1b0d499404d3cae6c268a61e42fe4ae`.
- Local web artifact: `b53fde38e0265849c82537e22fa701e8cd18e71bbfccd329d7a9fd96d0a0564e`.
- Actual served runtime artifact:
  `339decf909fa03b9d18713294991163fcefc458127dd5766e1dd3d2c9334c033`.
- Owned web image: `sha256:711a770bfdff456d14625e8c3c885c3cab725b68c8c457324dd6e4b7af700f7d`.
- Backend artifact: `57642c89461a138a2d51a2cc83876f1a271a524ac41b9fff9c0616b6476d1e37`.

Host and container artifacts are recorded separately, not claimed identical. Actual served assets:
CityScene-ByB4Osqn.js (`a015d876122d1b799ea0eef6a14bf7027c82835e68870645d2187faf7dccc7cf`),
index-CN5W-GF-.js (`c01bccf1d6b4628e327aeb0b58d1f524a2a7a6c73c9a0099c6e6e41245980779`),
index-DDzKhezc.css (`de3eafa7f32ddb3c2c33a66e243be0edb452f2bbcd516c191f986d11bb9294e8`).

Evidence SHA256: artifact-readback.json
`211315a3bef721ac23518873dcadbc790068bc0df61dca85c15750d9e6112571`; surfaces.json
`84a4e3870922258f60cf99749b746669f54649f97b77386fdce0a30433bd3ba5`; reference PNG
`9d76fb85b4e78a8f1084a06a27138746cf5402a89dd4d9b09d6d1afef5e0185d`. The original
[surfaces manifest](../surfaces.json) owns individual capture hashes.

Scenario006 evidence includes full/top/facts/events/description, interaction and accessibility JSON
at `evidence/LISTING-006-6/listing-104-{390,960,1440}-{pt-BR,en}*`. All six `-complete-times.png`
and `.json` files record keyboard Enter opening of the native disclosure and eight exact
independently parsed API instants/visible UTC texts; open axe checks pass, then click closes it
before the ordinary captures. Scenario007 includes
`evidence/LISTING-007-7/listing-reference-390x1782.png`. Scenario004 clock receipt proves an
exact31,000ms browser advance and one stale-error route hit.

Canonical104 attributes/asking-price effective instant and first collection both
equal2025-10-01T12:00:00.000Z; description equals2026-03-01T12:00:00.000Z; last collection
equals2026-10-01T12:00:00.000Z. Browser checks prove all eight API-derived values, not distinct
attribute-versus-collection instants in this fixture. The separate localized unit fixtures cover
that distinctness without altering canonical data.

[Teardown](../teardown.json): exact project `rei-web-listing-eba77bc5-64cf-460a-96fd-79e28d599ed6`,
verified2026-10-22T08:33:06.002Z; owned containers, volumes and networks empty; foreign baseline
preserved.

## Sequential regressions

These were completed before D-064, whose product change is Listing-only. They are not claimed to
share the final Listing UI artifact. Every command below completed; no live owned test process
remains.

| Command suffix after `pnpm exec vitest run --config vitest.integration.config.ts` | Session / exit | Duration | Evidence                                                          |
| --------------------------------------------------------------------------------- | -------------- | -------- | ----------------------------------------------------------------- |
| `integration/web-property.integration.test.ts`                                    | 9771 /0        | 73.36s   | `property-2026-10-22T08-16-26-986Z-0ca10621`; audit0,7/7 approved |
| `integration/web-search.integration.test.ts`                                      | 48772 /0       | 170.61s  | `search-2026-10-22T08-17-50-842Z-40648cb8`; audit0,8/8 approved   |
| `integration/web-place.integration.test.ts`                                       | 72793 /0       | 388.75s  | Legacy mutable captures, no immutable semantic ledger             |
| `integration/listing-provenance.integration.test.ts`                              | 79238 /0       | 38.38s   | Persisted integration assertions; no immutable semantic ledger    |

Property teardown.json verifies exact project
`rei-web-property-ec0b8688-5ba9-44a0-9e3e-223fa89c9d54` empty at08:17:39.250Z. Search campaign.json
records stackTornDownUtc08:20:39.448Z; independent exact-label Docker queries for
`rei-web-search-20b92c7f-923f-4682-97d5-29d092bd99a3` returned empty at08:20:55UTC. Places
exact-label queries for `rei-web-place-27a2b745-f994-44bf-8c44-dc6a84f0e856` returned empty
at08:27:22UTC. Provenance Docker destroy-event readback identified
`rei-listing-provenance-208161-0a615150`; exact-label queries returned empty at08:28:22UTC. Each
independent inspection used `docker ps -aq --filter label=com.docker.compose.project=PROJECT`,
`docker volume ls -q --filter label=com.docker.compose.project=PROJECT` and
`docker network ls -q --filter label=com.docker.compose.project=PROJECT`, all exit0. Search has no
teardown.json; none is invented here. Provenance emitted four sanitized api.unexpected_failure logs
and nevertheless passed all assertions.

## Interrupted and superseded evidence

Earlier combined Property/Search/Places/provenance command session32739 exited143 (SIGTERM) without
a completed assertion summary. Its origin is undetermined; neither agent reports sending a signal.
It is inconclusive, not a regression pass. Owned interrupted project
`rei-web-place-bb26d752-ac09-46ab-9d74-2ac9c87786c4` was cleaned with

```bash
env COMPOSE_DISABLE_ENV_FILE=1 COMPOSE_ENV_FILES= docker compose --file compose.yaml --project-name rei-web-place-bb26d752-ac09-46ab-9d74-2ac9c87786c4 --profile tools down --volumes --remove-orphans
```

(exit0). Exact-label container/volume/network queries were empty, exit0, at08:00:45UTC. The four
later sequential passes above replace no historical bytes.

Preserved Listing runs:

- `listing-2026-10-22T08-07-51-482Z-59f5f0fc`:64680 exit1;004 inconclusive (unused Condensed600
  assertion on404); linked executor diagnosis; exact cleanup08:09:09.838Z.
- `listing-2026-10-22T08-11-39-689Z-72a6ec2f`:3489 exit1;006 inconclusive (plate count before async
  settlement); linked executor diagnosis; exact cleanup08:13:33.598Z.
- `listing-2026-10-22T08-14-41-897Z-fa346fb5`:11486 exit0; audit0,7/7 approved; D-063-only,
  superseded by D-064 final evidence; exact cleanup08:16:11.657Z.
- `listing-2026-10-22T08-28-09-889Z-72fd0847`:78499 exit1;004 inconclusive,005–007 unexecuted;
  append-only
  [clock diagnosis](../../listing-2026-10-22T08-28-09-889Z-72fd0847/results/executor-diagnosis.md);
  exact cleanup08:29:24.568Z.

## Gates and remaining ownership

Final executor checks:

```bash
pnpm exec prettier --check integration/web-listing.integration.test.ts && pnpm run lint && pnpm run typecheck:integration && git diff --check
```

session96880 exit0. Parent reports final exact root chain58420 exit0 (lint, typecheck,2503 unit
tests, build), and full coverage93567 exit0. Those parent-owned full-chain commands/logs must be
taken from its actual outputs, not reconstructed here. Product was frozen before final Listing;
later root rebuild did not change product source. All changes during the final rerun were
executor-only clock synchronization plus evidence documentation.

Remaining parent work: immutable artifact/visual readback and bounded D-064 finish reviewer
adjudication, manual detector where still pending, final review/documenter/status reconciliation.
Human screen-reader speech, daylight focus and zoom remain explicitly unexecuted. No commits or
story-done update were made by this implementation agent.
