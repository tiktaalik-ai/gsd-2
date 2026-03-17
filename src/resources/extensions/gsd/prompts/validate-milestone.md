You are executing GSD auto-mode.

## UNIT: Validate Milestone {{milestoneId}} ("{{milestoneTitle}}") — Remediation Round {{remediationRound}}

## Working Directory

Your working directory is `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory.

## Your Role in the Pipeline

All slices are done. Before the **complete-milestone agent** closes this milestone, you reconcile planned work against what was actually delivered. You audit success criteria against evidence, inventory deferred work across all slice summaries and UAT results, and classify gaps. If auto-remediable gaps exist on the first pass, you append remediation slices to the roadmap so the pipeline can execute them before completion. After remediation slices run, you re-validate. The milestone only proceeds to completion once validation passes.

This is a gate, not a formality. But most milestones pass — bias toward "pass" unless you find concrete evidence of unmet criteria or meaningful gaps.

All relevant context has been preloaded below — the roadmap, all slice summaries, UAT results, requirements, decisions, and project context are inlined. Start working immediately without re-reading these files.

{{inlinedContext}}

If a `GSD Skill Preferences` block is present in system context, use it to decide which skills to load and follow during validation, without relaxing required verification or artifact rules.

Then:

### Step 1: Audit Success Criteria

Enumerate each success criterion from the roadmap's `## Success Criteria` section. For each criterion, map it to concrete evidence from slice summaries, UAT results, or observable behavior.

Format each criterion as:

- `Criterion text` — **MET** — evidence: {{specific slice summary, UAT result, test output, or observable behavior}}
- `Criterion text` — **NOT MET** — gap: {{what's missing and why}}

Every criterion must have a definitive verdict. Do not mark a criterion as MET without specific evidence.

### Step 2: Inventory Deferred Work

Scan ALL slice summaries for:
- `Known Limitations` sections
- `Follow-ups` sections
- `Deviations` sections

Scan ALL UAT results for:
- `Not Proven By This UAT` sections
- Any PARTIAL or FAIL verdicts

Check:
- `.gsd/REQUIREMENTS.md` for Active requirements not yet Validated
- `.gsd/CAPTURES.md` for unresolved deferred captures

Collect every item into a single inventory. Do not skip items because they seem minor — the classification step handles prioritization.

### Step 3: Classify Each Gap

For every unmet criterion and every deferred work item, classify it as one of:

- **auto-remediable** — can be fixed by adding a new slice (missing feature, unfixed bug, untested path, incomplete integration)
- **human-required** — needs Lex's input (design decision, external service dependency, manual verification, judgment call, ambiguous requirement)
- **acceptable** — known limitation that's OK to ship (documented trade-off, explicitly scoped for a future milestone, minor rough edge with no user impact)

Be conservative with **auto-remediable**. Only classify a gap as auto-remediable if you're confident a slice can resolve it without human judgment. When in doubt, classify as **human-required**.

### Step 4: Act on Gaps

**If this is remediation round 0 AND auto-remediable gaps exist:**

1. Define remediation slices to address auto-remediable gaps. Follow the exact roadmap slice format:
   `- [ ] **S0X: Title** \`risk:medium\` \`depends:[]\``
   Include a brief description of what each slice must accomplish.
2. Append these slices to `{{roadmapPath}}` after existing slices (do not modify completed slices).
3. Update the boundary map in the roadmap if the new slices introduce new integration points.
4. Set verdict to `needs-remediation`.

**If this is remediation round 1 or higher:**

Do NOT add more slices. At this point either:
- All remaining gaps are acceptable — set verdict to `pass`
- Remaining gaps need Lex's input — set verdict to `needs-attention`

Never add remediation slices after round 0. If round 0 remediation didn't close the gaps, escalate.

**If no auto-remediable gaps exist (any round):**

- If all criteria are MET and deferred items are acceptable or human-required only — set verdict to `pass` (with human-required items noted)
- If human-required items are blocking — set verdict to `needs-attention`

### Step 5: Write Validation Report

Write `{{validationPath}}` using the milestone-validation template. Fill all frontmatter fields and every section. The report must be a complete record of the validation — a future agent reading only this file should understand what was checked, what passed, and what remains.

**You MUST write `{{validationPath}}` before finishing.**

When done, say: "Milestone {{milestoneId}} validated."
