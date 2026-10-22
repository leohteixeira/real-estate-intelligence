# Browser evidence retention

Generated browser evidence stays locally under `apps/web/.impeccable/review/` and is not
versioned. This includes screenshots, JSON/JSONL diagnostics and ledgers, rendered authored
references, generated BDD files, runtime inventories and compressed capture bundles.

Markdown review reports remain versioned, including campaign `results/*.md` summaries. Reports
must distinguish historical failures, interrupted runs and final acceptance, identify evaluated
versions, and provide reproduction commands. Links to raw evidence refer to local run output;
the linked files are not guaranteed to exist in a fresh clone.

## Regenerate evidence

Use the relevant commands in [the integration guide](integration.md). Campaigns create their own
unique run directories, fixtures and infrastructure. They do not require committed historical
screenshots or ledgers as test inputs. Retain failed attempts locally rather than overwriting them.
Do not force-add raw output to Git.

This policy does not ignore the whole `.impeccable` directory: design sidecars, surface briefs and
configuration outside `review/` remain eligible for versioning. Source fixtures, authored design
files and intentional visual-regression goldens outside `review/` also remain versioned.

## Existing artifacts

The 2026-10-22 maintenance change removes generated files from the Git index only. Local files
remain intact and previously committed versions remain available in history. It does not shrink
existing Git history, delete campaign data, rewrite commits or upload evidence externally.

If another environment needs a raw evidence bundle, arrange its transfer explicitly; no remote
artifact storage or publication is configured by this policy.

The index-only removal preserved 12,699 local files totaling 1,257,317,562 bytes. A sorted
path/content SHA-256 inventory was identical before and after removal:
`a97bfca73928268216c4c021243d49a012929390018dfb15ada164d3d64db5b4`.
All 76 indexed Markdown review reports and unrelated index entries were preserved.
