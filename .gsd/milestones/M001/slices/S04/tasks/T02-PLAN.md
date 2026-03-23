---
estimated_steps: 5
estimated_files: 2
skills_used: []
---

# T02: Migrate dispatch-guard.ts to DB queries and update tests

**Slice:** S04 — Hot-path caller migration + cross-validation tests
**Milestone:** M001

## Description

Replace `parseRoadmapSlices()` in `dispatch-guard.ts` with `getMilestoneSlices()` from `gsd-db.ts`. The function `getPriorSliceCompletionBlocker()` currently reads ROADMAP.md from disk and parses it — change it to query DB state. Update all 8 test cases in `dispatch-guard.test.ts` to seed DB via `insertMilestone`/`insertSlice` instead of writing markdown files. Add an `isDbAvailable()` gate with disk-parse fallback so the function works during pre-migration bootstrapping.

## Steps

1. In `dispatch-guard.ts`, add imports: `import { isDbAvailable, getMilestoneSlices } from "./gsd-db.js"`. Keep `findMilestoneIds` import from `./guided-flow.js` (milestone queue order is disk-based).
2. Replace the body of the milestone-iteration loop:
   - When `isDbAvailable()`: call `getMilestoneSlices(mid)` to get `SliceRow[]`. Map each row: `done = (row.status === 'complete')`, `id = row.id`, `depends = row.depends` (already `string[]`). Use the same slice-dispatch logic (dependency check or positional fallback).
   - When `!isDbAvailable()`: keep the existing `readRoadmapFromDisk()` + `parseRoadmapSlices()` path as fallback.
3. Remove the `readFileSync` import if it's no longer used outside the fallback. Keep `readdirSync` if still needed. Remove `parseRoadmapSlices` import from `./roadmap-slices.js` — move it inside the fallback branch or use a lazy import to avoid importing the parser when DB is available.
4. Update `dispatch-guard.test.ts`:
   - Add imports: `openDatabase`, `closeDatabase`, `insertMilestone`, `insertSlice` from `../gsd-db.ts`.
   - In each test: create a temp dir, call `openDatabase(join(repo, '.gsd', 'gsd.db'))` to seed DB state. Call `insertMilestone()` and `insertSlice()` with appropriate `status` values (`'complete'` for done slices, `'pending'` for undone ones). Set `depends` arrays on slices that declare dependencies.
   - Remove `writeFileSync` calls that created ROADMAP markdown files.
   - Add `closeDatabase()` in `finally` blocks before `rmSync`.
   - For the milestone-SUMMARY skip test: still write a SUMMARY file on disk (dispatch-guard checks `resolveMilestoneFile(base, mid, "SUMMARY")` to skip completed milestones).
   - For the PARKED skip test: still write PARKED file on disk.
5. Run the test suite and confirm all 8 tests pass.

## Must-Haves

- [ ] `dispatch-guard.ts` calls `getMilestoneSlices()` instead of `parseRoadmapSlices()` when DB is available
- [ ] Fallback to disk parsing when `!isDbAvailable()`
- [ ] All 8 existing tests pass with DB seeding
- [ ] Zero `parseRoadmapSlices` import at module level in dispatch-guard.ts

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/dispatch-guard.test.ts`
- `rg 'parseRoadmapSlices' src/resources/extensions/gsd/dispatch-guard.ts` returns no matches (or only in fallback block)

## Inputs

- `src/resources/extensions/gsd/dispatch-guard.ts` — current 106-line file using `parseRoadmapSlices`
- `src/resources/extensions/gsd/tests/dispatch-guard.test.ts` — current 187-line test file with 8 test cases writing ROADMAP markdown
- `src/resources/extensions/gsd/gsd-db.ts` — `getMilestoneSlices()`, `isDbAvailable()`, `insertMilestone()`, `insertSlice()`, `openDatabase()`, `closeDatabase()`

## Expected Output

- `src/resources/extensions/gsd/dispatch-guard.ts` — migrated to DB queries with disk fallback
- `src/resources/extensions/gsd/tests/dispatch-guard.test.ts` — updated to seed DB state

## Observability Impact

- **Signal change**: `getPriorSliceCompletionBlocker()` now reads slice status from `slices` table via `getMilestoneSlices()` when DB is open, instead of parsing ROADMAP.md from disk. The returned blocker string is unchanged — callers see no difference.
- **Inspection**: To verify DB path is active, check that `isDbAvailable()` returns `true` before calling `getPriorSliceCompletionBlocker()`. Inspect the `slices` table (`SELECT id, status, depends FROM slices WHERE milestone_id = ?`) to see exactly what the guard evaluates.
- **Fallback visibility**: When DB is unavailable, the guard falls back to disk parsing via `lazyParseRoadmapSlices()`. No stderr warning is emitted from this function (the `isDbAvailable()` check is silent), but downstream callers can detect fallback by checking `isDbAvailable()` before dispatch.
- **Failure state**: If `getMilestoneSlices()` returns an empty array for a milestone that has slices on disk, the guard silently skips that milestone (same as when no ROADMAP file exists). This is safe — it means no blocking, not false blocking.
