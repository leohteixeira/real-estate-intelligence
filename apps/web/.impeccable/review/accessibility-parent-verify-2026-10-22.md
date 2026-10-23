# Accessibility — parent verification in progress

Story 6.12 / D-070 remains **in progress**, not accepted. The original implementation handoff,
all failed campaign bytes and native attempts remain preserved. This document does not turn
historical partial runs into a complete campaign.

## Historical diagnostic identity and owned interruption

The integral command is:

```bash
pnpm exec vitest run --config vitest.integration.config.ts \
  integration/web-accessibility.integration.test.ts --bail 1
```

It started with `accessibility-discovery-2026-10-22T16-57-39-214Z-edf00d2f` and records:

- Source: `6ec86e4b216996a29009ae496d9ffcdd87cbf5193e93063790861b94a3311c17`.
- Backend: `10215ae490646588bd6a35340aa7c512304f9bbc475a486687e1460fed6a350b`.
- Executor: `114a31cd5a036ac6c4f20d0642ad462ac2a06e7985b1c8a1460b826a45d724cb`.

This invocation is diagnostic, not final acceptance: it was deliberately interrupted before
the D-072 product correction. Six partitions completed, with 174 matrix cells and 192 approved
attempts, including setup/boundaries rather than 192 distinct user scenarios. The seventh,
`accessibility-recovery-pt-BR-390-2026-10-22T17-14-09-763Z-0a49e75d`, was interrupted during
preparation. Native Vitest terminated with exit 143; its normal release/final SQL proof and
final manifest are unavailable. No business failure or replacement approval is inferred.

The exact owned project `rei-web-accessibility-c7e2fcb6-60cf-42b7-a770-96f6c22c2310` was removed
at `2026-10-22T17:14:56.523Z`. The label-only foreign-volume comparison initially failed because
an anonymous migrations image volume had no project label. Docker volume mount/unmount events
independently associate `d1654735a0c08b0f05bb6e00bd6b5281016462d8be875bf0c62b0e503457d3b9`
with the owned migrations container `31cb77088c48` at `/var/lib/postgresql`; after reconciling
that ownership, all foreign containers, volumes and networks remained present. The original
comparison and explicit correction are retained in `accessibility-interruption-2026-10-22.json`.
Only disposable fixture resources were removed; campaign files remain intact.

Maintenance commit `ca05515f5f70313dbdbe5b586bafcfbce995fa74` changed Git retention metadata
during this invocation, not its evaluated source/backend/executor inputs. It does not accept
6.12, and historical metadata must not be presented as a single final release approval.

All 38 execution partitions must complete successfully under the next frozen identity. There are six
semantic scenarios, not 38 new user journeys or hundreds of inflated scenarios. Root gates,
coverage and browser campaigns run serially. Final visual acceptance is not claimed yet.

## Current verification

### Latest whole invocation — render/read disagreement, not acceptance

Native session 72519 terminated with exit 1 after 1,217.55s: Discovery, Search,
keyboard and Details passed; Ask PT failed and 33 partitions did not execute.
The failed attempt is `A11Y-004-29-ask-failed-pt-BR-960`, preserved under
`campaigns/accessibility-ask-pt-BR-2026-10-23T01-48-38-643Z-f2e2ba89`.
Its rail-brand measurement hit the preceding skip link. Before the same-stop capture,
the brand had a white 3px outline with 0px offset; afterward it had the intended yellow
outline with 2px offset. The opened image shows the yellow ring and no skip-link obstruction.
Neither an internal browser cause nor a third product CSS defect is established.
Two isolated actual-CSS probes observed 66 brand stops without reproducing the discrepancy.

D-076 replaces the fixed two-RAF heuristic with one unconditional native 1px screenshot
before each focus measurement. Bytes are discarded; caret and animations remain unchanged,
with no mask, style injection, focus/scroll repair or retry until passing. The original
failure remains failed. Regression session 28670 failed before repair (zero captures versus
ten required); session 84660 passed afterward, 1/1 selected in 2.58s (1.37s test time).
The regression checks exact capture options/order and retains a genuinely obscured negative
control. The three browser/evidence/fault helper files passed 18/18 in session 74053,
exit 0, 45.72s. The authored-reference test passed 1/1 in session 89487, exit 0, 29.59s.
Session 40820 then passed the shared capture helper 3/3 and the exact root lint,
strict typecheck (including integration), all 2,706 unit tests and all production builds,
exit 0. Post-build rehash found all 187 source and 1,028 backend files unchanged;
only the two intended executor files differ. The 37-file executor is now
`4e4578502efd4461555fc47a4f2a751e6bfa4c4911fc514b27ff0a59dea1f8fe`.
No product CSS or instrumented application code changed, so retain existing detector,
coverage and authored-world evidence; current full-campaign evidence is still required.

Focused Ask PT production diagnosis passed in native session 37574, exit 0, 366.75s
(364.91s test time); 37 other partitions were filtered. Its campaign is
`campaigns/accessibility-ask-pt-BR-2026-10-23T02-01-00-037Z-79f4b527`.
The formerly failed brand stop has complete Tab/Shift+Tab inventories, native visible
focus, the yellow 3px/2px outline and an unobscured hit in both directions. Source,
backend and executor hashes match the verified candidate. Final SQL is unchanged;
teardown records owned resources removed and foreign resources preserved. This diagnostic
does not replace the pending complete invocation or establish story acceptance.

The failed invocation's source/backend/executor identities, terminal output and ten live
image observations are retained in `accessibility-parent-language-terminal-2026-10-23T0151.json`,
SHA-256 `6b8449117b4fefa77b1766eb1b2312bf14f4aab417185cb3e7efef7b0fae9669`.
Its 20 associated normal captures remain historical diagnostics, not acceptance.

### Previous whole invocation — clipped language-focus geometry, not acceptance

Native session 61368 terminated with exit 1 at `2026-10-23T01:14:22.847Z`
after 6,811.63s: 21 partitions passed, `variants-en-390` failed, and 16 did not
execute. Its immutable directory is
`campaigns/accessibility-variants-en-390-2026-10-23T01-11-01-048Z-6da3af91`.
Listing 991's footer Portuguese control recorded a 0px outline offset clipped by
the language group during forward Tab; the same-stop screenshot and later measurement
show the intended -5px inset. The browser's internal cause remains unproven. The
original failure is preserved, not reclassified as a pass.

Reuse D-073's existing invariant: move the language button's existing -5px offset
from the focus-only selector to its base selector. No outline is added while unfocused;
focus colors, layout, traversal, waits and assertions remain unchanged. The real-CSS
native regression failed before repair (session 95407), passed afterward (48445),
and the complete browser-helper file passed 13/13 (24339, exit 0, 35.31s). It checks
header, rail and footer controls before/during/after forward and reverse traversal,
in PT/EN at 390/960px. Exact root session 90723 passed lint, strict typecheck
(including integration), all 2,706 unit tests and all production builds, exit 0.
Focused production session 67041 passed `variants-en-390`, exit 0 in 329.47s
(one executed partition, 37 filtered). Both Listing 991 states passed the unchanged
native keyboard assertions. This diagnostic result is not a full campaign pass.

The changed-file detector completed with exit 0; its only advisory is the unchanged
14px typography rule. Retain the earlier detector evidence for unchanged UI files.
The complete campaign, adaptation captures and finite finish handoffs remain required;
do not restart broad review or combine partial passes into acceptance. All 30 selected
normal captures were associated with session 61368's manifests: 26 actual PNGs match
already-opened bytes and four changed captures were opened. They are historical diagnostics.
The terminal receipt is `accessibility-parent-bootstrap-terminal-2026-10-23T0114.json`,
SHA-256 `c642268861437aefe69ea19c74005ab8b91bdacc2bcecfdc013e280882166d50`.

### Previous whole invocation — PostgreSQL bootstrap failure, not acceptance

Native session 44755 started at 22:13:22.425 UTC and terminated with exit 1 after
3,132.13s: 12 partitions passed, `retained-pt-BR-390` failed during Compose startup,
and 25 partitions did not execute. No browser assertion ran in the failed partition.
Its immutable directory is
`campaigns/accessibility-retained-pt-BR-390-2026-10-22T23-03-46-361Z-7e2b474c`.
The setup attempt preserves the executor error; teardown records owned resources removed
and foreign resources preserved. Prior completed partitions are diagnostic, not a full pass.

Bounded Docker events for that exact owned project establish PostgreSQL startup at
`1792710267125141838`ns, an unhealthy event at `1792710321431371166`ns (54.306s),
and a successful probe/healthy event at `1792710326547474234`ns (59.422s), while
cleanup was already beginning. The ten preceding probe exits were 2 (no response).
This demonstrates premature bootstrap failure, not an application or WCAG assertion defect.
The underlying reason for slow initialization is not established; no disk-full or OOM
cause is asserted, and no Docker pruning or manual resource deletion was performed.

The bounded correction adds PostgreSQL `start_period: 60s` in the existing Compose
healthcheck. The readiness command, five-second interval, three-second timeout and ten
consecutive failures remain unchanged; a successful early probe still releases dependants.
Native regression session 73087 failed before the correction because the grace period
was absent. After correction, the complete fixture helper suite passed 14/14 in session
56142 (exit 0). Focused browser session 23271 passed its selected partition in 406.16s
(exit 0, 37 other partitions filtered). Its campaign completed and the stack was torn
down at 23:15:02.449 UTC, with owned resources removed and foreign resources preserved.
This is diagnostic only. Exact root session 86404 subsequently passed lint, strict
typecheck (including integration), all unit suites and production builds, exit 0.
Inventory comparison against the prior whole invocation found only `compose.yaml` changed
in source and `integration/support/fixture.test.ts` in executor; compiled backend bytes
are identical. Preserve coverage for unchanged application bytes and the existing helper
and authored-reference results. A fresh complete 38-partition invocation remains required.
The corrected source inventory is
`5a13c8c3ae1d457718fa67b75dfef7916f7d68ef1cb2a9507ff1fcb43cb53c1e`;
the executor is `26e441058142cda6620ef1209d7f022c49f0fe5b79f291991613fe3c549765bc`.

All 30 selected normal-layout captures from session 44755 were opened and matched their
final manifests. They remain historical diagnostics now that the whole invocation failed.
Independent runtime observations cover both owned images in each of its 12 completed
partitions; append-only JSON receipts retain those observations before image removal.
No partial-pass union is permitted.

The single finite detector ran at 22:36 UTC, exit 0; its seven advisory findings were
read against unchanged baseline locations and establish no additional scoped defect.
Receipt: `accessibility-parent-detector-2026-10-22T2236.json`. No UI bytes changed in
the bootstrap correction, so the detector is not pending and will not be repeated.
Following the owner's engineering directive, cumulative independent audits run once
after a successful complete campaign, not again after every partial partition.

### Post-D-075 invocation — terminal interruption, not acceptance

The complete command started at 21:59:12.574 UTC in native session 61789 on canonical
commit `6a1b478626474eb934738ebc4eaa7ddd1893374b`, with the D-075 source/backend/executor
inventories below unchanged. Its native handle returned exit 143 at 22:09:11.068 UTC.
There was no native Vitest failure summary and the parent did not deliberately stop it;
the termination cause is unproven. Process and Docker readback confirmed no live native
campaign or owned container remained. This is a terminal interruption, not a verified wait
and not a successful campaign.

Completed partitions are `accessibility-discovery-2026-10-22T21-59-13-389Z-d1e05483`
and `accessibility-search-2026-10-22T22-07-23-059Z-c83f6d51`. Each has 18 matrix cells,
19 approved attempts including the boundary, one inconclusive setup pilot, final SQL,
manifest and owned/foreign teardown receipts. The other 36 partitions did not execute.
At 22:10:02 UTC, five independent audits passed across these partial results: exact matrix
coverage, actual oracle/receipt/privacy checks, 72 native keyboard walks with 3,268 steps,
8,546 contrast roles and all 48 preserved axe incomplete nodes. No partial-pass union or
full-story acceptance follows from those diagnostics.

The independent core audit had passed Discovery at 22:07:30 UTC, including live image
configuration/root-filesystem inspection. Its later two-partition readback failed because
Discovery API image `sha256:fc273de65454d6843874e906ff052e06a1bf66c5f98a8ce18ace3b56edf5724f`
was absent. Bounded Docker image events confirm removal of that image and its web image
at 22:09:17 UTC; the initiator is not established. The inspected Testcontainers Compose
down path requests volumes and a stop deadline, not image removal. Do not hide the audit
failure or infer a complete runtime comparison for both partitions. No manual deletion
was performed. The next whole invocation must retain independent image-comparison receipts
while images still exist; its actual native terminal result remains mandatory.

The parent opened eight manifest-verified Discovery captures from this interrupted epoch
against the existing authored reference images. Those are now historical visual diagnostics,
not the fresh complete finish-review packet. No new interface defect or UI edit resulted.
The plan now uses epic-local ticket ID `12` so the native tracker joins its existing
in-progress plan rather than incorrectly treating it as unplanned. This does not accept it.

### D-075 — receipt privacy defect and deliberate interruption

The complete invocation begun at 21:19:25.553 UTC (native session 1675) was deliberately
terminated with exit 143 at 21:44:38.859 UTC before changing executor inputs. Six partitions
completed (Discovery, Search, keyboard, Details, Ask PT and Ask EN); recovery PT/390 was
interrupted. Its final SQL readback, ordinary cleanup receipt and final manifest are absent,
not retroactively inferred. These partial results do not accept the story.

Independent recursive JSON audit found the synthetic private local operand in 18 interaction
files: local-operands/interrupted/recorded-completed Ask in both locales at three widths.
The leaked fields are geometry target names, keyboard expected names and both direction-step
names. The fallback read textarea `textContent`, which also holds a controlled draft's value.
Network/console leak flags, screenshot masking and sanitized contrast text did not cover this
artifact path. This is an evidence-collector privacy defect, not proof of a public API write.
Original artifacts remain unchanged, including the diagnostic synthetic marker.

The interrupted project is `rei-web-accessibility-d6ce086f-79e5-474a-8324-4cdd4a3be0a7`.
Pre-interruption inventory independently associated its two PostgreSQL volumes (named data
and anonymous migrations mount) with its four exact containers. At 21:46:46.847 UTC all four
containers, both volumes and its network were absent, as was its session reaper. All foreign
container identifiers, volume names and network identifiers from that inventory remained
present. No manual deletion was performed. This establishes resource preservation, not the
missing final SQL proof or completion of the interrupted partition.

D-075 requires a native red/green regression, safe label-based control descriptions and a
privacy assertion before artifact writes. No UI, traversal, focus geometry, waits, contrast
floor or axe rule changes are planned. Complete gates and all 38 partitions must run again
under the corrected executor identity; none of these historical passes may be combined.

The focused native regression failed before repair (session 94879): its full measured
receipt contained the private editable marker. After repair, the privacy assertion passed;
session 67359 exposed an incorrect fixture expectation for a programmatic-only textarea's
genuine enclosing public label. Correcting that label expectation preserved the private-value
assertion. Focused session 4699 then passed, and the complete four-file helper batch passed
19/19 in 35.45s (session 39068). Both native directions and geometry retain labels without
clearing values; button/summary descriptors and structural identities remain intact.
The exact root gate subsequently passed in session 57468 (exit 0): lint, strict typecheck,
2,706 unit tests across eight workspaces and all production builds. Complete unchanged
coverage then passed in session 10903 (exit 0), independently retaining every package's
80% statements/lines/functions and 75% branch floors. The web suite passed 541/541 in both
runs, with two workers and unchanged five-second deadlines. No browser campaign overlapped.
Native discovery then passed (session 92396, exit 0): 161 registered tests, including
all 38 accessibility partitions and the new privacy regression. The fresh integral
invocation remains pending at this checkpoint.
The production source inventory remains 187 files at
`53b66bd4e13b83649dedaa14fd4b8cc02429af7c68c81e80fbc37bea7f158621`;
the compiled backend remains 1,028 files at
`10215ae490646588bd6a35340aa7c512304f9bbc475a486687e1460fed6a350b`.
The repaired 37-file executor is
`8ea1600d02fccc9ec988283f6f4cbafb19b97730f67b18aad1b182cd3d2ebd72`.
These byte inventories are not a substitute for runtime/served identity in the new campaign.
Exact resource inventories are preserved in the separate append-only
`accessibility-interruption-d075-2026-10-22.json` supplement.

### D-073 repair — fresh verification, not acceptance

The original failure remains immutable. Forty isolated native traversal cycles and a
focused production invocation of `recovery-en-390` did not reproduce the disagreement;
session 30242 passed its one selected partition in 223.47s, with 37 tests filtered.
That invocation preceded the product repair and is diagnostic only. It neither proves
a Chromium defect nor supplies a portion of the required new integral pass.

D-073 was recorded before changing product CSS. A deterministic actual-CSS regression
then failed before repair (session 87501, exit 1): the clipped Ask submit's offset was
`0px` outside focus instead of the required invariant `-5px`. The base rule now retains
the same inset as the existing focus rule, without adding an unfocused outline or
changing its focused color, thickness or geometry. This establishes the missing
invariant, not a deterministic reproduction of the original transient discrepancy.
Read-only CSS snapshots before/after a diagnostic screenshot preserve future evidence;
no traversal wait, contrast assertion, timeout or axe rule changed.

The browser/evidence helper suites subsequently passed 12/12 (session 50686, exit 0,
22.02s), including before/during/after traversal and both native directions. Exact root
session 68485 then passed lint/typecheck but failed two AppShell tests at their unchanged
5,000ms deadlines; 539/541 web tests passed, and build was not reached. The isolated
AppShell file passed 16/16 in 6.00s (session 31708), while the identical complete web suite
passed 541/541 in 48.61s with two workers (session 7036). Aggregate test duration fell
from 150.89s to 61.53s. No assertion mismatch or OOM event was observed. D-074 records
the decision, before its configuration edit, to bound ordinary web Vitest workers to two,
matching existing coverage resource control without changing isolation or any deadline.
The exact complete root gate subsequently passed (session 62821, exit 0), including
lint, strict typechecking, all 2,706 unit tests and every production build. Web passed
541/541 with ordinary two-worker execution. Complete eight-workspace V8 coverage then
passed serially (session 81822, exit 0), preserving all 80%/75% floors. The four native
helper files passed 18/18 in 30.13s (session 54611, exit 0), including the D-073 regression.
These complete gates replace neither the failed historical results nor the browser matrix.
Discovery, a fresh complete 38-partition invocation and the finite finish handoffs
remain required. The source and executor bytes have changed; all preceding identities
and the 30 opened production captures below are historical, not current acceptance.

### Canonical invocation — failed after nine passing partitions

Session 43578 terminated with native exit 1 after 2,095.14s. Nine partitions passed;
`recovery-en-390` failed during `A11Y-003-11-place-recovered-en-390-default`, leaving
28 native partitions unexecuted under `--bail 1`. Its original reverse traversal records
the Place question's Continue button with a white outline, offset `0px`, white candidate
ground, ratio 1:1 and clipping by `ask__box`. Forward traversal records the intended
`-5px` inset and enamel-600 ground. The same-stop diagnostic screenshot shows that
intended inset; this difference requires diagnosis, not a retroactive pass or a blind
rerun. The failure and original artifacts remain unchanged in
`campaigns/accessibility-recovery-en-390-2026-10-22T20-53-13-647Z-4bbeb724/`.
Its owned fixture `rei-web-accessibility-1350faa7-47a6-4420-ae6f-62439a73aa3f`
closed at 20:54:50.458 UTC with owned removal and foreign preservation both true.
The checkpoints below describe earlier observations of this now-terminal invocation;
none is final acceptance. The subsequent diagnostic and narrowly scoped D-073 repair
are recorded above; the internal cause of the transient disagreement remains unproven.

The required complete command started at 20:19:49 UTC (native session 43578), after
the exact root, complete eight-package coverage and native discovery gates. The first
partition is `accessibility-discovery-2026-10-22T20-19-57-343Z-e420fe7e`.
All completed partitions currently record the same canonical commit:
`9e7f539012544d8a1f91317c309fe6de6aa83f96`. Its frozen identities are:

- Source: `bbc3cb94cef6fb9ad841569db77cb7358ad3785e97b4619a0692ec574455b450`.
- Backend: `10215ae490646588bd6a35340aa7c512304f9bbc475a486687e1460fed6a350b`.
- Executor: `d91209036f3b53081ddb93110009ce68b5c82a880c42cb931c6e5f6540be077b`.

The first independent checkpoint covers Discovery, Search and keyboard only: 516 final
manifest entries rehashed, 36 matrix cells, six explicit navigation journeys, 45 approved
attempts including boundaries, and three explicitly inconclusive setup pilots. Every
matrix cell matches an actual approved attempt. All 107 runtime records and three served
assets agree; disposable image identifiers are not asserted equal. SQL before/after
arrays agree, outside/forbidden requests are empty, diagnosticLeak is false, and each
completed partition records owned removal and foreign preservation. No integrity issue
or axe violation was found. Details and the remaining partitions are still pending;
the process was polled live, not inferred running from a ledger or lock file.

These partitions contain 8,546 role observations: 8,282 computed at or above their
unrounded applicable threshold and 264 manual Landing observations. All 48 original axe
incomplete nodes independently match their own same-artifact role records: 22 navigation
overlap, 20 desktop gradient, two mobile partial-obscuration and four rail Privacy
equal-ratio observations. No original axe result is rewritten. The manual observations
all have opacity 1, no blending, the actual protected gradient, and a maximum copy edge
of 0.4749837239583333 of the viewport, before its 48% stop. Against the conservative
brightest-white-underlay bound `[36,66,122]`, white, enamel-100 and enamel-200 yield
9.83455647892868:1, 8.055043010052392:1 and 6.626625953219919:1 respectively.
This is composition/geometry evidence, not a substituted opaque canvas ancestor.

The parent has opened eight fresh Discovery captures and five fresh Search/Filters
captures from this invocation, validating their named populated states. These are part
of the already-planned second and final bounded inspection round, not a new browser
campaign. All remaining required captures, the final incomplete/disabled census, the
single detector and fresh finish handoffs remain required. No historical partial passes
are combined with this invocation, and the story remains unaccepted.

The five-partition checkpoint additionally includes Details and Ask PT. Independent
audit rehashed 1,241 manifest entries and reconciled 120 matrix cells, six navigation
journeys, six Property source-anchor journeys, 137 approved attempts including boundaries,
and five inconclusive setup pilots. The 23,317 roles comprise 23,053 numerical observations
at or above their thresholds and the same 264 manual scrim observations. All 58 original
incomplete nodes match their own roles; the ten added Listing timeline observations use
the separately positioned marker column and readable dates/identifiers in the opened
complete Listing capture. Their minimum computed ratio is 8.185032348759592:1, against
4.5:1. SQL, network, runtime/served bytes, commit identity and owned/foreign cleanup still
agree, with no violation or integrity issue. The parent has now opened 23 fresh production
captures, including all seven required Details and three Ask PT confirmation captures.
Ask EN and the remaining 32 partitions are pending; no native integral exit is claimed.

At the seven-partition checkpoint, Ask EN and recovery PT/390 also completed. Independent
readback rehashed 2,048 final manifest entries and reconciled 213 matrix cells with 232
approved attempts, seven explicitly inconclusive setup pilots and seven closed fault
lifecycles. The catalog still declares exactly six semantic scenarios and 38 native test
partitions; all completed matrix cells match their own scenario and approved attempt, and
each completed partition has its actual approved boundary attempt. The remaining 31
partitions were not counted as passed. Session 43578 was live at this checkpoint;
its subsequent terminal failure is recorded above.

The 37,420 recorded roles comprise 37,151 computed observations meeting their applicable
threshold, the same 264 manual Landing observations, and five actual native-disabled
buttons. Those exemptions are Filters Apply during an invalid range or failed preview,
Filters counting during its held preview, and Ask Follow during its held catalogue read;
they do not exempt an enabled control. All 58 original incomplete nodes still match their
own captured roles, with zero axe violations or integrity discrepancies. SQL, network,
runtime/served bytes and canonical commit identity agree; the owned/foreign cleanup receipts
remain true/true. Recovery PT/390 closed at 20:45:54.653 UTC.

The parent has now opened all 30 planned normal-layout production captures, including two
Ask EN and five recovery PT/390 captures. Every opened file's current bytes independently
match its completed partition's final manifest. The invalid-range capture shows its inline
message and disabled Apply, the refused Search capture shows two separate retry actions,
and Place keeps readable monthly evidence while its median read is refused. Input-value
masking remains deliberate. Adaptation captures, the final census, the single detector and
fresh finish reviewer/documenter are still pending; this remains a partial checkpoint.

### Integral outcome and hierarchy-preparation correction

The invocation begun at 17:20:33 UTC finished with native exit 1 after 8,545.88s:
34 partitions passed, `context-en-960` failed, and the remaining three were not executed.
Its completed-partition counts below are diagnostic checkpoints, not final acceptance.
Do not combine those partial passes with a later executor version.

The failed run is `accessibility-context-en-960-2026-10-22T19-41-19-219Z-4f56238e`.
After real manual recovery of the two independent root reads, the one-second equality poll
at the audit boundary observed no shell links while descendant reads were still pending.
The original environment records only the first `/places/brazil/children` requests at that
point; final readback records subsequent state/city/zone reads. Removing a root-read error
is not the same event as publishing the entire validated hierarchy. Its original failed
attempt and final populated Filters screenshot remain unchanged. SQL before/after arrays
agree, outside/forbidden requests are empty, diagnosticLeak is false, and owned/foreign
teardown is true/true at `2026-10-22T19:42:57.481Z`.

An isolated native Chromium DOM-lifecycle regression reproduced the original equality
failure before correction (session 78604, exit 1). It publishes descendants 1,500ms after
root recovery, independently of any business DTO. The extracted preparation helper now
awaits publication of the expected number of actual links/options using the existing page
readiness bound, then retains the exact independently admitted identities/order assertion.
It neither changes production behavior nor increases an assertion/global timeout, retries
an action, repairs focus/scroll, or treats an incomplete read as recovered. The regression
also checks independently delayed Filters publication and rejects wrong identities/order.
The four native helper files subsequently passed 17/17 in 33.95s (session 27913).
A focused diagnostic invocation (session 36011) began at 19:46:21 UTC, selecting only
context-en-960, context-en-1440 and the two adaptation partitions. All four passed with
native exit 0 in 1,140.01s; the remaining 34 tests were filtered, not executed. The focused
invocation records unchanged source/backend and executor
`d91209036f3b53081ddb93110009ce68b5c82a880c42cb931c6e5f6540be077b`.
It cannot substitute for a new complete 38-partition invocation. Root gates, discovery and
coverage will be repeated serially before that invocation. No evaluated inputs change
during an active browser run.

Independent focused audit rehashed 1,274 final manifest entries and reconciled 118 cells,
122 approved attempts (including boundaries) and four explicitly inconclusive setup pilots.
The 22,096 rendered role observations are computed and meet their respective thresholds.
There are zero axe violations; the 64 preserved incomplete nodes match their own same-file
role records, not substitute text elsewhere. Their reasons are 44 timeline pseudo-content,
12 overlap and eight partial-obscuration observations. The latter include actual `#plan`
copy at native zoom, rather than assuming all Landing copy belongs to `#city`; the captured
opaque enamel-900 ground yields 12.828565:1 for body copy and 15.662642:1 for headings.
The Pause button's recorded white/enamel-800 ratio is 13.234101:1. Original incomplete
results remain unchanged; final full-invocation visual/manual adjudication is still owed.
All source/backend/executor inventories, 107 runtime records and three served assets
agree, SQL before/after arrays are equal, outside/forbidden requests are absent,
diagnosticLeak is false, and owned/foreign teardown is true/true in every focused partition.
Current-byte readback independently rehashed all 187 source, 1,028 backend and 37 executor
files against these identities. No union with the old 34 passes is acceptance.

The subsequent exact root gate passed again with all 2,706 unit tests (session 37173).
Coverage then failed six web tests at their unchanged 5,000ms deadline (session 72992):
two AppShell, two SearchResults, one PropertyDetails and one PlaceOverview test. There
was no assertion mismatch or out-of-memory event. A directed resource-control experiment
ran all 541 web tests with identical V8 coverage, include/exclude rules and thresholds,
changing only worker concurrency to two (session 94018): all passed in 78.13s, with
unchanged 96.34/90.93/97.00/97.57 statement/branch/function/line coverage. Aggregate test
CPU-duration decreased from 248.69s to 104.12s despite longer overall wall time, consistent
with instrumented-worker contention rather than a required larger per-test deadline.
The coverage script now bounds workers to two while retaining suite isolation and all
tests, assertions, deadlines and coverage floors. This script is not evaluated product
code. The exact root gate subsequently passed with all 2,706 unit tests (session 94713,
exit 0), followed serially by complete eight-package coverage (session 49784, exit 0).
The web coverage run passed all 541 tests in 56.57s with unchanged
96.34/90.93/97.00/97.57 percentages; no test deadline or coverage floor changed.
Native integration discovery then passed (session 76954, exit 0), listing all 38
accessibility partitions. The fresh full browser invocation is recorded above; this
paragraph retains the preceding gate chronology rather than claiming its completion.
No failed run is relabelled passed or silently retried.

The owner explicitly requested commits of the staged work before final story acceptance.
Those commits checkpoint implementation, tests and verification records; they do not
mark the story done. A later complete invocation must record the resulting canonical
commit identity, rather than reuse the focused diagnostic commit metadata.

The parent staged and read all 6,851 lines of the updated unified diff at
`/tmp/rei-accessibility-verify-2026-10-22T2012.diff`, including the new hierarchy regression,
coverage resource control and all three Markdown handoff/review files.
Current-byte readback after the exact gates independently matched all 187 source,
1,028 backend and 37 executor files to the focused diagnostic identities above.
As before, independently audited maintenance
raw-artifact index removals are excluded, not application changes. Subsequent documentation
updates still require their own staged-diff readback.

### Previously completed root gates and partial execution checkpoints

The exact root `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build`
completed successfully (native session 5316, exit 0), with **2,706 unit tests** across eight
packages. Vite's existing large-chunk advisory remains a warning, not a suppressed check.
`pnpm run test:coverage` then passed unchanged floors in all eight packages (session 38258,
exit 0). Statement/branch/function/line percentages respectively are:

| Package        | Statements | Branches | Functions | Lines |
| -------------- | ---------: | -------: | --------: | ----: |
| contracts      |      91.03 |    90.88 |     93.23 | 92.71 |
| domain         |      95.40 |    90.47 |    100.00 | 96.05 |
| ai             |      94.18 |    88.74 |     91.90 | 96.30 |
| web            |      96.34 |    90.93 |     97.00 | 97.57 |
| application    |      91.84 |    86.89 |     98.59 | 93.31 |
| infrastructure |      81.42 |    75.66 |     88.72 | 83.46 |
| api            |      94.26 |    85.01 |     97.61 | 95.44 |
| worker         |      94.42 |    84.77 |     91.52 | 95.66 |

Native integration discovery completed with exit 0 (session 37884) and enumerated all
38 accessibility partitions. The historical integral invocation was session 7047, started
after coverage; collection-only discovery briefly overlapped its initial provisioning, not
a second browser/root/coverage execution. No source, executor or compiled-backend edits
were made while it ran. Its first completed partition records the historical identity:

- Commit: `ca05515f5f70313dbdbe5b586bafcfbce995fa74` (uncommitted 6.12 inputs inventoried below).
- Source: `bbc3cb94cef6fb9ad841569db77cb7358ad3785e97b4619a0692ec574455b450`.
- Backend: `10215ae490646588bd6a35340aa7c512304f9bbc475a486687e1460fed6a350b`.
- Executor: `68962f9428c409a00a12e8764a5b0a26ac9a4e4734727ace1313aa9a57554341`.

Discovery completed with 18 passing matrix cells, no failed attempts, unchanged SQL and
owned/foreign teardown true/true at `2026-10-22T17:24:45.488Z`. This is one completed partition,
not the required 38-partition acceptance. The later executor correction requires a fresh
complete invocation rather than reusing these partial passes.

The parent staged and read all 6,159 lines of the unified implementation/test/documentation
diff against baseline `0d9fcdcb579cc78683a64d7aed3d93c219794473`, generated at
`/tmp/rei-accessibility-verify-2026-10-22T1723.diff`. Its 32 paths include untracked additions.
The 6,583 index-only removals of generated non-Markdown review artifacts were excluded from
this readable diff: they belong to separately verified maintenance commit `ca05515`, contain
no application implementation and have an independent before/after on-disk inventory proof.
The original baseline is preserved; no source change or historical evidence was discarded.
This report's later verification notes remain subject to the final staged documentation diff.

At the five-partition checkpoint, Discovery, Search, keyboard, Details and Ask PT completed
with 120 matrix cells plus the six explicit keyboard journeys and six source-anchor journeys.
All 1,241 final manifest entries were independently rehashed. Every partition matches the
frozen source/backend/executor identity, reports unchanged SQL, no outside/forbidden requests,
no diagnostic leak and owned/foreign teardown true/true. Ask EN and the remaining 32 partitions
are still pending; this checkpoint is not final acceptance.

The subsequent seven-partition checkpoint also includes Ask EN and mobile PT recovery:
213 cells, 232 approved attempts (including boundaries), seven explicitly inconclusive setup
pilots and 2,048 independently rehashed manifest entries. Every matrix cell has a matching
approved native attempt; every attempt's named evidence is manifested. The exact 107 runtime
file records and three HTTP-served JS/CSS asset records agree across all seven partitions.
Image identifiers differ across disposable builds, so equal image identifiers are not claimed;
the recorded executable bytes, source/backend/executor inventories and commit identity agree.
Each SQL before/after array was independently compared, not just its `unchanged` boolean.
No unexplained attempt, artifact mismatch, boundary failure or numerical contrast failure was
found. The remaining 31 partitions and final native exit status are still required.

At the twenty-five-partition checkpoint, both Ask locales, all six recovery, retained and
canonical-variant partitions, and PT390 independent subreads also completed. The audit
rehashed 7,746 manifest entries and reconciled 833 cells, 870 approved attempts (including
boundaries) and 25 explicitly inconclusive setup pilots. The 162,742 role observations
comprise 162,436 computed observations, 264 manual scrim observations and 42 native-disabled
exemptions. All 160 axe incomplete nodes match their own captured role evidence; no violation
or unmatched incomplete node was found. Original incomplete results remain unchanged.
All 107 runtime records and three served assets still agree. The only original strict-audit
flags are the two explicitly reconciled Git labels described below, not executable differences.
The remaining thirteen partitions and native invocation exit status remain required.

## Executor corrections and observed checks

The first parent integral attempt failed at desktop locale preparation (`85c481a1`): it selected
an intentionally hidden mobile footer. The second passed Discovery, Search and keyboard but
failed during Listing preparation (`d5efedda`): Listing has its own real mobile locale entry.
The actual responsive CSS now has a regression for ordinary, Property and Listing shells, both
locales, and widths 320/390/720/960/1440; preparation still requires one genuinely visible control.
Neither correction changes product visibility or uses forced interaction.

A subsequent helper batch strictly rejected a one-pixel displaced top capture after native
Control+End. Preparation now observes 150ms of genuine scroll quiet in addition to three frames
within the original 2000ms bound, then performs one instant top reset. Exact zero-scroll
readback remains mandatory. Keyboard traversal evidence precedes this separate framing step;
no traversal focus/scroll repair, clock patch, CSS patch or corrective-reset retry is added.

After these earlier corrections the four helper files passed **15/15** in **20.34s**, and selected
ESLint plus strict integration TypeScript passed. The separate authored-reference test had
already passed **1/1** in **11.87s**. Its fifteen references are not business behavior evidence.
Full diagnostics are in `accessibility-parent-verify-diagnostics.json`.

D-072 adds a native real-CSS regression for opaque stop-navigation paint and a conservative
desktop scrim bound at 390/960/1440/2560. After correcting an initial fixture-field mismatch,
the unchanged product failed 34 assertions in native session 18138: visible names lacked
an opaque ground, and the strong gradient ended before the copy at 960/1440. One minimal
product batch makes the existing enamel-900 navigation ground persistent and extends the
90%-opaque scrim stop from 34% to 48%, beyond the copy's maximum 47.5vw right edge.
The bounded brightest-white-underlay calculation verifies the actual heading/lead/provenance
colors at 4.5:1, conservatively stronger than the large-heading threshold. The four helper
files then passed **16/16 in 20.59s** (session 77688). This isolated geometry/paint test is
not a fabricated production journey and does not replace final canvas/incomplete adjudication.

## Bounded parent visual round

The first bounded round is complete, with the D-072 repair batch applied before round two.
The parent opened all thirty files in
`accessibility-authored-2026-10-22T16-40-22-004Z-bc13ec26/`: full and top pairs for Components,
States, Main, PlaceEN, DesktopPlace, Search, Filters, Property, DesktopProperty, Listing, Ask,
AskConfirm, DesktopAsk, LandingMobile and LandingDesktop. Each file shows its named artboard,
its expected top and populated content, with no blank or black missing-render region.
Long Landing full-page images establish the overall section sequence; their full-size top
captures, rather than thumbnails alone, establish first-viewport readability and composition.
Reference pages deliberately retain authored text and states, not substituted production DTOs.
The absent support script and hosted-font replacement are disclosed in the reference metadata.

Representative production captures from Place, Landing, Search/Filters, Property/Listing and
Ask confirmation were opened in that first round. Fresh confirmation captures will constitute
the second and final parent inspection round. Input
and textarea pixels are deliberately masked by Playwright's magenta privacy mask. A mask is not
a loading failure or a claimed visual match of private operands. Focus receipts and public
labels remain unmasked. Every screenshot eventually passed as required to the fresh finish
reviewer must first be opened and validated by the parent.

No second context invocation, detector or finish reviewer has run for this story. One final
detector and the fresh five-section finish-review/documentation handoffs remain required.

The first round confirmed a real Landing contrast defect at 960px: white Cidade text over
flat building pixels `[119,135,188]` is approximately **3.514:1**; enamel-200 Zona text over
`[84,106,176]` is approximately **3.481:1**. Both use 15px/600 text and require 4.5:1.
Read-only PNG decoding and the role geometry support the visual observation; this is not
an opaque-ancestor contrast approval or a claim that antialiased glyph pixels are backgrounds.
D-072 authorizes one minimal batch for persistent stop-navigation ground and a copy-covering
desktop scrim. Search/Filters, Property/Listing and an open Ask confirmation capture show their
named populated content, readable public labels and deliberate private-input masks; no further
material correction was identified in those representative first-round captures.

## Manual accessibility boundary

Opaque computed text, essential field boundaries and focus pairs have numerical assertions at
the applicable WCAG threshold; alpha, gradient, SVG-stroke, shadow and sibling canvas/scrim
composition remain explicit manual triage. An opaque ancestor must not be substituted for
the effective canvas background. Every final axe incomplete finding must be adjudicated or
reported unresolved; zero violations alone cannot approve an incomplete observation.

Historical adaptation evidence includes clipped one-pixel screen-reader labels and visible
current-stop labels over the Landing scene. Their state, selector and geometry are preserved;
they are not twenty-five numerical contrast passes. The new integral evidence and the finite
visual review must resolve the actual visible states before story acceptance. Browser evidence
does not certify physical touch, screen-reader pronunciation or complete WCAG conformance.

### Historical Discovery paint analysis (partial campaign, not final acceptance)

The completed `17-20-33-107Z-0e665509` partition contains 6,504 role observations across
18 cells: 6,240 opaque numerical observations and 264 explicitly manual observations.
All 264 manual observations concern desktop copy/focus over the sibling scene and scrim.
Their recorded rightmost edge is at most 47.4984% of the viewport, before the actual
48% gradient stop; every recorded opacity is 1. The strong scrim is at least 90% opaque
enamel-800 (`11,44,107`) over that entire region. A white underlying pixel therefore bounds
the brightest composited sRGB ground conservatively at `[36,66,122]` (channels rounded up).
The actual foreground colors have ratios **9.834556:1** (white), **8.055043:1** (enamel-100)
and **6.626625:1** (enamel-200) against that bound. All exceed their recorded thresholds;
this proof uses paint composition and geometry, not the opaque ancestor as a fake canvas ground.
The native D-072 regression independently verifies the actual CSS stops and paint assumptions.

The partition also preserves 45 axe incomplete nodes. Desktop gradient nodes use the bound
above. Stop-name overlap findings are checked against the now-permanent opaque enamel-900
navigation ground and the native visible-label contrast regression. The two mobile heading
overlap findings have an opaque copy ground and independent computed-role contrast; the opened
PT390 capture shows the heading in that ground, not over the scene. One Place EN960 Privacy
link produces axe `equalRatio` despite recorded white text on enamel-800. Its full-page capture
(`A11Y-001-10-place-default-en-960-final.png`) shows readable white underlined text, actual CSS
sets `color: var(--surface)`, and both native directions record visible, unobscured focus.
The automated incomplete result is retained as such, with these independent observations rather
than rewriting it into an axe pass. The remaining partitions still need a complete final census.

The completed Details partition adds ten Listing `pseudoContent` observations and one rail
Privacy `equalRatio` observation. The former concern event dates and the source's listing
identifier in open evidence. Actual role records put event dates at 8.185032:1 on phone
porcelain and 8.861531:1 on desktop white; identifiers are at 15.813391:1 and 17.120380:1,
respectively. The timeline pseudos occupy the separate 20px marker column and 1px line at
left 9.5px, while text begins after the 12px grid gap. The opened complete Listing capture
shows the markers beside, not beneath, those readable text runs. The independent geometry,
opaque paint and capture adjudicate these observations without changing the original axe
incomplete results. Rail Privacy observations retain the same independent CSS/role/focus
boundary described above. Ask PT and Search have no incomplete findings in this checkpoint.

The first PT mobile recovery partition records five `exempt-disabled` text observations:
the unavailable prepared-Ask action while its catalogue loads, and the Filters apply action
while the preview loads, is refused/malformed, or the entered range is invalid. Each record
has native `disabled: true`; none is silently counted as a numerical contrast pass. The
remaining 6,709 role observations are computed, and this partition has no axe incomplete
finding or violation. The parent opened the invalid-range region/full-page captures and
Search/Place refused-read captures; public error text and native retry controls are populated
and readable, with private operand pixels deliberately masked. The unusually tall open Place
capture establishes the complete evidence sequence; its separate top capture establishes
readable error/provenance content at the first viewport.

An independent same-artifact reconciliation at nineteen completed partitions matched all
112 incomplete nodes to their own captured role evidence. The match uses the native tag,
the collector's declared 100-character direct-text limit and the actual structural branch:
timeline date/identifier, rail Privacy link, City copy or stop-navigation label. It does not
substitute a duplicate date elsewhere in the document or an identically worded footer.
The added March/August variant dates use the same separated timeline marker column and
opaque paint, with a minimum 8.185032:1 ratio. The timeline identifier matches are 17.120380:1;
all four rail Privacy matches are white on enamel-800 at 13.234101:1. The current/other
stop labels are 15.662642:1 and 10.553650:1 on their actual enamel-900 navigation ground.
The four lead-text matches remain manual scrim observations; their truncated evidence text
is not a missing paragraph or an excuse to infer opaque canvas paint. This is a checkpoint,
not the final all-partition incomplete census.

### Historical matrix execution checkpoint (not fresh-invocation acceptance)

The source paths below identify real registered checks, not substitute acceptance. The final
audit must also reconcile the actual passing attempts and native invocation exit status.

| Intent row     | Executed check location                                                                                          | Current status                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Public screens | `integration/web-accessibility.integration.test.ts:1296`, `:1520`; shared full-page audit `:488`                 | Discovery/Search/Details and both Ask locales passed; adaptation pending                                  |
| Evidence       | Default/open audits `:469`, `:1337`, `:1529`; explicit source/document-anchor journeys `:1445`                   | Normal, canonical variants, recovery and retained passed; remaining auxiliary states pending              |
| Reads          | Genuine fault/recovery families `:936`, `:1036`, `:1603`, `:1751`; fault cleanup helpers                         | Helpers and all recovery/retained passed; PT390 subreads passed; other subreads/context pending           |
| Search         | Native route/filter/history/chip journey `:1344`; empty/invalid/range `:1603`; range-association unit regression | Six keyboard variants, invalid/empty/range, cursor recovery and unit regression passed; hierarchy pending |
| Ask            | Seven snapshots, local private operands, interrupted/recorded continuation `:1520`                               | Both locales and all three normal widths passed; adaptation pending                                       |
| Responsive     | Independent 320px and native settings-selector/DPR/width/font assertions `:2011`                                 | Integral adaptation pending                                                                               |
| Motion         | Normal pause/resume, preference changes and no-WebGL `:2047`; Landing unit/native geometry regressions           | Unit/helpers passed; integral adaptation pending                                                          |
| Contrast       | Each full-page audit `:488`; role tests and D-072 real-CSS helper regression                                     | Twenty-five partitions and helpers passed; final numerical/manual census pending                          |
| Boundaries     | Unavailable/component-only catalogue, every-partition version/SQL/network/cleanup `:2111`                        | Twenty-five partitions independently audited; full 38-partition reconciliation pending                    |

Contrast thresholds are applied without rounding borderline values, using specified foreground
and effective background rather than antialiased glyph-edge pixels. See
[W3C: Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
The separate 320-CSS-pixel checks establish the reflow observation; native 200% enlargement is
additional evidence, not a substitute for 320px. See
[W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
The center-hit, visible-outline and clipping checks are declared product checks, not a claim
to have certified every focus criterion. See
[W3C: Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).

## Remaining acceptance work

### Concurrent instruction-only commit reconciliation

At 18:24:59 UTC, the owner committed `f792723a7f45aa3608897bbf6481b4944960b195`
(`chore: make AGENTS.md the only agent instruction file`) while the integral invocation
was running. The parent inspected the complete delta from `ca05515`: only the workspace
instruction reference in `AGENTS.md` changes, and its duplicated 103-line `CLAUDE.md` is
removed. The current workspace and repository `AGENTS.md` instructions were read; this
owner change is preserved, not included as an accessibility implementation or reverted.

The first seventeen partitions record `ca05515f5f70313dbdbe5b586bafcfbce995fa74`;
the eighteenth and subsequent partitions record `f792723a7f45aa3608897bbf6481b4944960b195`.
The original version records remain unmodified. This is explicitly **not one Git commit**:
the initial strict audit correctly reported the changed commit identifier. Source, backend
and executor inventory hashes, all 107 runtime-file records and all three served asset
records remain identical across those partitions. The plan freezes these evaluated inputs;
it does not require an unchanged documentation-only Git label. Final verification must
continue checking every content hash and restrict the metadata exception to these two
inspected commits. Any other commit or evaluated-input difference remains a failure.

- Complete and independently audit the fresh 38-partition invocation, identity, all final
  manifests, SQL/network boundaries and owned/foreign cleanup.
- Preserve the completed exact root lint/typecheck/test/build, unchanged coverage and native
  integration discovery results; repeat affected checks if evaluated inputs change.
- Map every immutable intent-matrix row to an actually executed passing check.
- Finish the bounded visual round(s) and explicit manual-paint/incomplete disposition;
  preserve the completed detector receipt and obtain the fresh finish reviewer and documenter outcomes.
- Complete the already-active BMAD review step, logical auto-commits and tracker acceptance.
- Continue with the actual next unblocked non-VPS story; leave owner-locked VPS work untouched.
