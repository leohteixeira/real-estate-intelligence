# Generated Evidence Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove generated browser evidence from Git tracking without deleting local evidence
or rewriting history.

**Architecture:** Keep Markdown review reports and all design configuration versioned.
Ignore raw outputs only beneath `apps/web/.impeccable/review/`; remove their exact indexed
paths with `git rm --cached`, leaving source, tests, fixtures and local evidence untouched.

**Tech Stack:** Git, repository `.gitignore`, Markdown, existing pnpm formatting and Git hooks.

---

## Task 1: Establish the retention boundary

**Files:** Modify `.gitignore`; create `docs/testing/artifacts.md`.

- [x] Confirm integration references to `.impeccable/review/` produce outputs rather than
      consume committed fixtures.
- [x] Add these exact ignore rules:

  ```gitignore
  /apps/web/.impeccable/review/**
  !/apps/web/.impeccable/review/**/
  !/apps/web/.impeccable/review/**/*.md
  ```

- [x] Document local retention, Markdown reports, reproducible generation, and the distinction
      between review output and design/source fixtures.
- [x] Check positive and negative paths with `git check-ignore --no-index --stdin`, including
      nested campaign files, Markdown reports, `.impeccable/design.json`, surface briefs
      and source files.

## Task 2: Remove generated files from the index only

**Files:** Exact non-Markdown indexed paths below `apps/web/.impeccable/review/`.

- [x] Calculate a sorted path/content SHA-256 inventory before removal.
- [x] Resolve non-Markdown indexed paths with `git ls-files -z`, pass only those paths to
      `git rm --cached --pathspec-from-file=- --pathspec-file-nul`, and preserve every local file.
- [x] Recompute the original inventory and require identical counts, bytes and hashes.
      Confirm no non-Markdown review files remain indexed and all Markdown reports/design
      configuration remain indexed.

## Task 3: Commit the isolated maintenance change

**Files:** `.gitignore`, this plan, `docs/testing/artifacts.md`, and exact previously committed
generated paths.

- [x] Format/lint the new Markdown and inspect the actual diff. Do not include the unfinished
      accessibility implementation, tests, plan or reports.
- [x] Use the auto-commit workflow for one logical commit:
      `chore: keep generated browser evidence out of git`.
- [x] Verify the commit, remaining status and local evidence inventory. Existing artifacts
      remain in prior commits; no history rewrite or disk deletion occurs.

Completed in `ca05515f5f70313dbdbe5b586bafcfbce995fa74`; the remaining 29 changes belong to
the unfinished accessibility implementation. Markdown and secret hooks passed; no push occurred.
