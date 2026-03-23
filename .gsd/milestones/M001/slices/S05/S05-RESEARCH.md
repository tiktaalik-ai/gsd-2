# S05: Warm/cold callers + flag files + pre-M002 migration — Research

**Date:** 2026-03-23
**Status:** Ready for planning

## Summary

S05 migrates the remaining ~13 non-hot-path files from module-level `parseRoadmap()`/`parsePlan()` imports to DB queries with lazy parser fallback, migrates REPLAN.md and REPLAN-TRIGGER.md flag-file detection in `deriveStateFromDb()` to DB table/column queries, and extends `migrateHierarchyToDb()` to populate v8 planning columns from parsed ROADMAP/PLAN data.

The work is mechanical — S04 established the `isDbAvailable()` + lazy `createRequire` fallback pattern in 4 hot-path files. S05 applies the identical pattern to 13 warm/cold callers. The flag-file migration is small: only REPLAN.md and REPLAN-TRIGGER.md need DB migration in `deriveStateFromDb()` — CONTINUE.md and CONTEXT-DRAFT.md are deferred to M002 per locked decision D003. ASSESSMENT.md is not used as a phase-detection flag file at all.

The riskiest sub-task is `auto-prompts.ts` (7 parser calls across 1649 lines, providing context injection for all planning prompts) and the `migrateHierarchyToDb()` extension (must populate v8 columns without breaking existing recovery tests).

## Recommendation

Apply the established S04 migration pattern uniformly. Group files by risk:

1. **First: flag-file migration** — Add `replan_triggered_at` column to slices (schema v10), update `deriveStateFromDb()` to query `replan_history` table and `replan_triggered_at` column instead of disk. This is the architecturally novel work — prove it first.
2. **Second: `migrateHierarchyToDb()` + `gsd recover`** — Extend to populate v8 columns. The parsed `Roadmap` already has `vision`, `successCriteria`, `boundaryMap`. The parsed `SlicePlan` has `goal`. The parsed `TaskPlanEntry` has `files` and `verify`. Best-effort population per D004.
3. **Third: warm/cold caller migration** — Batch the 13 files using the S04 pattern. Some files (like `markdown-renderer.ts` validation) intentionally read disk to compare with DB — those keep parser calls but move to lazy imports.

**Scope constraint (D003):** CONTINUE.md and CONTEXT-DRAFT.md migration is locked for M002. R011 lists them but D003 (non-revisable) explicitly defers both to M002 with specific schema changes (continue_state JSON column, draft_content column). S05 should NOT create those columns or migrate those flag files. The roadmap description is aspirational; D003 is authoritative.

## Implementation Landscape

### Key Files

**Flag-file migration targets in `state.ts`:**
- `src/resources/extensions/gsd/state.ts` (1367 lines) — `deriveStateFromDb()` has 3 flag-file checks to migrate:
  - Line ~642: `resolveSliceFile(... "REPLAN")` → query `replan_history` table for the slice (S03 created `getReplanHistory(db, mid, sid)`)
  - Line ~659: `resolveSliceFile(... "REPLAN-TRIGGER")` → check `replan_triggered_at` column on slice row (new column, schema v10)
  - Line ~679: `resolveSliceFile(... "CONTINUE")` — **DO NOT TOUCH** per D003
- The `_deriveStateImpl()` function (filesystem-based fallback at line ~700+) also has matching flag checks at lines ~1266, ~1309, ~1344 — these stay as-is since they're the disk-based fallback path

**Schema:**
- `src/resources/extensions/gsd/gsd-db.ts` — Add `replan_triggered_at TEXT` column to slices table (schema v10 migration). Add to `SliceRow` interface. Add to CREATE TABLE DDL.

**Migration extension:**
- `src/resources/extensions/gsd/md-importer.ts` — `migrateHierarchyToDb()` at line 508: extend the `insertMilestone()` call to pass `planning: { vision, successCriteria, boundaryMapMarkdown }` from the already-parsed `roadmap`. Extend `insertSlice()` calls to pass `planning: { goal }` from parsed plan. Extend `insertTask()` calls to pass `files` and `verify` from `TaskPlanEntry`.
- `src/resources/extensions/gsd/commands-maintenance.ts` — `handleRecover()` at line ~463: no code changes needed if `migrateHierarchyToDb()` itself is extended.

**Warm/cold callers to migrate (S04 pattern: `isDbAvailable()` gate + lazy `createRequire` fallback):**
- `src/resources/extensions/gsd/doctor.ts` — 3 `parseRoadmap` calls + 1 `parsePlan` call. Replace with `getMilestoneSlices()` / `getSliceTasks()`.
- `src/resources/extensions/gsd/doctor-checks.ts` — 2 `parseRoadmap` calls. Replace with `getMilestoneSlices()`.
- `src/resources/extensions/gsd/visualizer-data.ts` — 1 `parseRoadmap` + 1 `parsePlan`. Replace with DB queries.
- `src/resources/extensions/gsd/workspace-index.ts` — 2 `parseRoadmap` + 1 `parsePlan`. Replace with DB queries.
- `src/resources/extensions/gsd/dashboard-overlay.ts` — 1 `parseRoadmap` + 1 `parsePlan`. Replace with DB queries.
- `src/resources/extensions/gsd/auto-dashboard.ts` — 1 `parseRoadmap` + 1 `parsePlan`. Replace with DB queries.
- `src/resources/extensions/gsd/guided-flow.ts` — 2 `parseRoadmap`. Replace with `getMilestoneSlices()`.
- `src/resources/extensions/gsd/reactive-graph.ts` — 1 `parsePlan`. Replace with `getSliceTasks()`.
- `src/resources/extensions/gsd/auto-direct-dispatch.ts` — 2 `parseRoadmap`. Replace with `getMilestoneSlices()`.
- `src/resources/extensions/gsd/auto-worktree.ts` — 1 `parseRoadmap`. Replace with `getMilestoneSlices()`.
- `src/resources/extensions/gsd/auto-recovery.ts` — 1 `parsePlan` (line 370, plan-slice task-plan-file check) + 1 `parseRoadmap` (line 407, already in `!isDbAvailable()` fallback). The `parsePlan` call can use `getSliceTasks()`.
- `src/resources/extensions/gsd/auto-prompts.ts` — 5 `parseRoadmap` + 1 `parsePlan`. All use roadmap slices for prompt context injection. Replace with `getMilestoneSlices()` / `getSliceTasks()`.
- `src/resources/extensions/gsd/markdown-renderer.ts` — 2 `parseRoadmap` + 2 `parsePlan` in staleness validation. These **intentionally** compare disk content to DB state. They should keep the parser calls but move from module-level import to lazy `createRequire`.

**Not in scope (by design):**
- `src/resources/extensions/gsd/md-importer.ts` — Keeps parser imports; it IS the parser-to-DB migration tool.
- `src/resources/extensions/gsd/files.ts` — Parser definitions themselves. Removed in S06.
- `github-sync.ts` — Listed in R010 but does not exist in the codebase. Stale reference.

### Build Order

1. **Schema v10 + flag-file DB migration** — Add `replan_triggered_at` column. Update `deriveStateFromDb()` to use DB queries for REPLAN and REPLAN-TRIGGER detection. Write triage-resolution to set the column. Test: write a derive-state test that seeds DB with replan_history/replan_triggered_at and confirms phase detection without disk files.

2. **`migrateHierarchyToDb()` v8 column population + `gsd recover` upgrade** — Extend migration to pass planning data. Test: extend `gsd-recover.test.ts` to assert v8 columns are populated (vision, successCriteria, goal, files, verify).

3. **Warm/cold caller batch migration** — Apply the isDbAvailable + createRequire pattern to all 13 files. This is mechanical. Test: run all existing test suites for these files to confirm no regressions. No new tests needed — existing tests cover the behavior; the migration just changes the data source.

4. **Integration verification** — Run the full test suite. Grep for remaining module-level `parseRoadmap`/`parsePlan` imports in non-test, non-`md-importer`, non-`files.ts` files. Only lazy fallback references should remain.

### Verification Approach

```bash
# 1. New tests pass
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/<new-flag-file-test>.ts
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/gsd-recover.test.ts

# 2. No module-level parseRoadmap/parsePlan imports remain in migrated files
# (excluding md-importer.ts, files.ts, tests/*, and lazy createRequire references)
grep -rn 'import.*parseRoadmap\|import.*parsePlan' src/resources/extensions/gsd/*.ts | grep -v '/tests/' | grep -v 'md-importer' | grep -v 'files.ts'
# Expected: only lazy createRequire references or markdown-renderer.ts lazy import

# 3. Regression suites
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/doctor.test.ts
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/auto-recovery.test.ts
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/workspace-index.test.ts
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/visualizer-data.test.ts
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/reactive-graph.test.ts
# ... and all other existing test files for migrated callers
```

## Constraints

- **D003 (locked, non-revisable):** CONTINUE.md and CONTEXT-DRAFT.md migration deferred to M002. Do not create `continue_state` or `draft_content` columns.
- **D004 (locked):** Recovery accepts fidelity loss for tool-only fields (risks, requirementCoverage, proofLevel). `migrateHierarchyToDb()` populates what parsers can extract; tool-only fields stay empty.
- **D007 (from S04):** Use lazy `createRequire` with `.ts/.js` extension fallback, not `dynamic import()`. Keep callers synchronous.
- **Schema v10:** Must add `replan_triggered_at` column to both the migration block AND the initial CREATE TABLE DDL (lesson from S04/T01 — fresh databases skip migrations).
- **`SliceRow` interface:** Must be updated with `replan_triggered_at` field.
- **`markdown-renderer.ts` validation:** Parser calls are intentional (comparing disk vs DB). Migration = move import from module-level to lazy `createRequire`, not replace parser usage.

## Common Pitfalls

- **Forgetting initial DDL update** — Schema v10 migration adds `replan_triggered_at` to existing DBs, but fresh databases use CREATE TABLE. Both must include the column (learned in S04/T01).
- **REPLAN detection semantics** — `deriveStateFromDb()` checks REPLAN.md existence to determine if a replan *has already been done* (loop protection). The DB equivalent is checking if `replan_history` has entries for that (milestone, slice) pair. Don't confuse "needs replan" (blocker_discovered) with "replan completed" (replan_history exists).
- **REPLAN-TRIGGER writer lives in `triage-resolution.ts`** — When adding `replan_triggered_at` column, `triage-resolution.ts` must also be updated to write the column instead of (or in addition to) creating the disk file. The disk file write may need to remain during transition for the `_deriveStateImpl()` fallback path.
- **auto-prompts.ts async context** — All functions in `auto-prompts.ts` are already async, so DB queries (which are synchronous) work without issues. But `loadFile` calls that provide roadmap content for parsing are async — the replacement path using DB is simpler (synchronous `getMilestoneSlices()`).
- **`TaskRow.files` is already parsed** — Per KNOWLEDGE.md, `rowToTask()` handles JSON.parse. Don't double-parse when reading from DB.
- **`parsePlan().filesLikelyTouched` aggregation** — Some callers use this field. The DB equivalent requires iterating `getSliceTasks(mid, sid)` and collecting `.files` arrays. This is straightforward but not a single column lookup.

## Open Risks

- **Test coverage gaps for warm/cold callers** — Some callers (like `auto-dashboard.ts`, `dashboard-overlay.ts`, `guided-flow.ts`) may have tests that don't exercise the parser paths being changed. If tests pass without actually covering the migrated code, regressions could hide. Run existing tests and check coverage qualitatively.
- **R011 vs D003 scope tension** — R011 lists CONTINUE.md and CONTEXT-DRAFT.md migration. D003 defers them. The planner should mark R011 as partially advanced (REPLAN + REPLAN-TRIGGER migrated) and note the remaining flag files are deferred. R011's status should not be set to "validated" until M002 completes the rest.
