---
id: T02
parent: S04
milestone: M001
key_files:
  - src/resources/extensions/gsd/dispatch-guard.ts
  - src/resources/extensions/gsd/tests/dispatch-guard.test.ts
  - .gsd/milestones/M001/slices/S04/tasks/T02-PLAN.md
key_decisions:
  - Used createRequire with try .ts/.js fallback for lazy parser loading instead of dynamic import() — keeps getPriorSliceCompletionBlocker synchronous, avoiding cascading async changes to loop-deps.ts, phases.ts, and all test mocks
  - Kept minimal ROADMAP stub files on disk in tests because findMilestoneIds() reads milestone directories from disk for queue ordering — DB migration of milestone discovery is out of scope for this task
duration: ""
verification_result: passed
completed_at: 2026-03-23T17:03:27.608Z
blocker_discovered: false
---

# T02: Migrate dispatch-guard.ts to DB queries with isDbAvailable() gate and lazy disk-parse fallback

**Migrate dispatch-guard.ts to DB queries with isDbAvailable() gate and lazy disk-parse fallback**

## What Happened

Migrated `getPriorSliceCompletionBlocker()` in `dispatch-guard.ts` from parsing ROADMAP.md files via `parseRoadmapSlices()` to querying the `slices` table via `getMilestoneSlices()` from `gsd-db.ts`.

**dispatch-guard.ts changes:**
- Replaced module-level `parseRoadmapSlices` import with `isDbAvailable()` + `getMilestoneSlices()` from `gsd-db.js`
- Added `isDbAvailable()` gate: when DB is open, maps `SliceRow[]` to normalised `{id, done, depends}` objects; when DB is unavailable, falls back to disk parsing via a lazy `createRequire`-based loader
- The lazy loader (`lazyParseRoadmapSlices`) uses `createRequire(import.meta.url)` and tries `.ts` first (strip-types dev), then `.js` (compiled production) — avoids module-level import of the parser
- Removed unused `readdirSync` and `milestonesDir` imports; kept `readFileSync` for the disk fallback path
- Function signature and return type unchanged — no cascading changes to callers

**dispatch-guard.test.ts changes:**
- All 8 test cases now seed state via `openDatabase()` + `insertMilestone()` + `insertSlice()` instead of writing ROADMAP markdown files
- Added `setupRepo()` / `teardownRepo()` helpers for consistent DB lifecycle (open before test, close in finally)
- Milestone directory + minimal ROADMAP stub still written for `findMilestoneIds()` which reads disk for milestone discovery
- SUMMARY file still written on disk for the SUMMARY-skip test (dispatch-guard checks `resolveMilestoneFile`)

**Integration tests:** The `integration-mixed-milestones.test.ts` suite (54 sub-tests) passes — these tests don't seed DB, so they exercise the disk-parse fallback path, confirming both code paths work.

## Verification

1. `dispatch-guard.test.ts` — all 8 tests pass with DB seeding
2. `integration-mixed-milestones.test.ts` — all 54 sub-tests pass (exercises fallback path)
3. `schema-v9-sequence.test.ts` — all 7 tests pass (T01 regression)
4. `grep parseRoadmapSlices dispatch-guard.ts` — only matches in lazy fallback block (lines 17,19), zero module-level imports
5. Diagnostic: `getMilestoneSlices('NONEXISTENT')` returns `[]` (no crash on missing milestone)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/dispatch-guard.test.ts` | 0 | ✅ pass | 614ms |
| 2 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` | 0 | ✅ pass | 749ms |
| 3 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/schema-v9-sequence.test.ts` | 0 | ✅ pass | 137ms |
| 4 | `grep -c parseRoadmapSlices dispatch-guard.ts (module-level imports)` | 0 | ✅ pass — only in lazy fallback block | 5ms |
| 5 | `node --import resolve-ts.mjs -e 'getMilestoneSlices(NONEXISTENT)' diagnostic` | 0 | ✅ pass — returns [] | 200ms |


## Deviations

The task plan suggested removing `readFileSync` import if no longer needed outside fallback — it's still needed for the `readRoadmapFromDisk()` fallback function, so it was kept. The `readdirSync` import and `milestonesDir` import were removed as they were unused. The lazy import approach uses `createRequire` with try/catch for .ts/.js extension resolution instead of a dynamic `import()`, keeping the function synchronous and avoiding cascading async changes to the call chain.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/dispatch-guard.ts`
- `src/resources/extensions/gsd/tests/dispatch-guard.test.ts`
- `.gsd/milestones/M001/slices/S04/tasks/T02-PLAN.md`
