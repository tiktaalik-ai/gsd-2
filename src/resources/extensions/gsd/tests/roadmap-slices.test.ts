import { parseRoadmap } from "../files.ts";
import { parseRoadmapSlices, expandDependencies } from "../roadmap-slices.ts";
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, report } = createTestContext();
const content = `# M003: Current

**Vision:** Build the thing.

## Slices
- [x] **S01: First Slice** \`risk:low\` \`depends:[]\`
  > After this: First demo works.
- [ ] **S02: Second Slice** \`risk:medium\` \`depends:[S01]\`
- [x] **S03: Third Slice** \`depends:[S01, S02]\`
  > After this: Third demo works.

## Boundary Map
### S01 → S02
Produces:
  foo.ts
`;

console.log("\n=== parseRoadmapSlices ===");
const slices = parseRoadmapSlices(content);
assertEq(slices.length, 3, "slice count");
assertEq(slices[0]?.id, "S01", "first id");
assertEq(slices[0]?.done, true, "first done");
assertEq(slices[0]?.demo, "First demo works.", "first demo");
assertEq(slices[1]?.depends, ["S01"], "second depends");
assertEq(slices[1]?.risk, "medium", "second risk");
assertEq(slices[2]?.risk, "low", "missing risk defaults to low");
assertEq(slices[2]?.depends, ["S01", "S02"], "third depends");

console.log("\n=== parseRoadmap integration ===");
const roadmap = parseRoadmap(content);
assertEq(roadmap.slices, slices, "parseRoadmap uses extracted slice parser");
assertEq(roadmap.title, "M003: Current", "roadmap title preserved");
assertEq(roadmap.vision, "Build the thing.", "roadmap vision preserved");
assertTrue(roadmap.boundaryMap.length === 1, "boundary map still parsed");

// ─── expandDependencies unit tests ─────────────────────────────────────

console.log("\n=== expandDependencies: plain IDs pass through ===");
assertEq(expandDependencies([]), [], "empty list");
assertEq(expandDependencies(["S01"]), ["S01"], "single plain ID");
assertEq(expandDependencies(["S01", "S03"]), ["S01", "S03"], "multiple plain IDs");

console.log("\n=== expandDependencies: dash range expansion ===");
assertEq(expandDependencies(["S01-S04"]), ["S01", "S02", "S03", "S04"], "S01-S04 expands correctly");
assertEq(expandDependencies(["S01-S01"]), ["S01"], "single-element range");
assertEq(expandDependencies(["S03-S05"]), ["S03", "S04", "S05"], "mid-range expansion");

console.log("\n=== expandDependencies: dot-range expansion ===");
assertEq(expandDependencies(["S01..S03"]), ["S01", "S02", "S03"], "S01..S03 dot range");

console.log("\n=== expandDependencies: zero-padding preserved ===");
assertEq(expandDependencies(["S01-S03"]), ["S01", "S02", "S03"], "zero-padded IDs preserved");

console.log("\n=== expandDependencies: mixed list ===");
assertEq(expandDependencies(["S01-S03", "S05"]), ["S01", "S02", "S03", "S05"], "range + plain mixed");

console.log("\n=== expandDependencies: invalid range passes through unchanged ===");
assertEq(expandDependencies(["S04-S01"]), ["S04-S01"], "reversed range not expanded (start > end)");
assertEq(expandDependencies(["S01-T04"]), ["S01-T04"], "mismatched prefix not expanded");

// ─── parseRoadmapSlices: range syntax in depends ─────────────────────

console.log("\n=== parseRoadmapSlices: range syntax in depends expanded ===");
{
  const rangeContent = `# M016: Test\n\n## Slices\n- [x] **S01: A** \`risk:low\` \`depends:[]\`\n- [x] **S02: B** \`risk:low\` \`depends:[]\`\n- [x] **S03: C** \`risk:low\` \`depends:[]\`\n- [x] **S04: D** \`risk:low\` \`depends:[]\`\n- [ ] **S05: E** \`risk:low\` \`depends:[S01-S04]\`\n  > After this: all done\n`;
  const rangeSlices = parseRoadmapSlices(rangeContent);
  assertEq(rangeSlices.length, 5, "5 slices parsed");
  assertEq(rangeSlices[4]?.depends, ["S01", "S02", "S03", "S04"], "S01-S04 range expanded to individual IDs");
}

console.log("\n=== parseRoadmapSlices: comma-separated depends still works ===");
{
  const commaContent = `# M001: Test\n\n## Slices\n- [ ] **S05: E** \`risk:low\` \`depends:[S01,S02,S03,S04]\`\n  > After this: done\n`;
  const commaSlices = parseRoadmapSlices(commaContent);
  assertEq(commaSlices[0]?.depends, ["S01", "S02", "S03", "S04"], "comma-separated depends unchanged");
}

report();
