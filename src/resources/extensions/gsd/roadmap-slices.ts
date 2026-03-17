import type { RoadmapSliceEntry, RiskLevel } from "./types.js";

/**
 * Expand dependency shorthand into individual slice IDs.
 *
 * Handles two common LLM-generated patterns that the roadmap parser
 * previously treated as single literal IDs (silently blocking slices):
 *
 *   "S01-S04"  → ["S01", "S02", "S03", "S04"]  (range syntax)
 *   "S01..S04" → ["S01", "S02", "S03", "S04"]  (dot-range syntax)
 *
 * Plain IDs ("S01", "S02") and empty strings pass through unchanged.
 */
export function expandDependencies(deps: string[]): string[] {
  const result: string[] = [];
  for (const dep of deps) {
    const trimmed = dep.trim();
    if (!trimmed) continue;

    // Match range syntax: S01-S04 or S01..S04 (case-insensitive prefix)
    const rangeMatch = trimmed.match(/^([A-Za-z]+)(\d+)(?:-|\.\.)+([A-Za-z]+)(\d+)$/);
    if (rangeMatch) {
      const prefixA = rangeMatch[1]!.toUpperCase();
      const startNum = parseInt(rangeMatch[2]!, 10);
      const prefixB = rangeMatch[3]!.toUpperCase();
      const endNum = parseInt(rangeMatch[4]!, 10);

      // Only expand when both prefixes match and range is valid
      if (prefixA === prefixB && startNum <= endNum) {
        const width = rangeMatch[2]!.length; // preserve zero-padding (S01 not S1)
        for (let i = startNum; i <= endNum; i++) {
          result.push(`${prefixA}${String(i).padStart(width, "0")}`);
        }
        continue;
      }
    }

    result.push(trimmed);
  }
  return result;
}

function extractSlicesSection(content: string): string {
  const headingMatch = /^## Slices\s*$/m.exec(content);
  if (!headingMatch || headingMatch.index == null) return "";

  const start = headingMatch.index + headingMatch[0].length;
  const rest = content.slice(start).replace(/^\r?\n/, "");
  const nextHeading = /^##\s+/m.exec(rest);
  return (nextHeading ? rest.slice(0, nextHeading.index) : rest).trimEnd();
}

export function parseRoadmapSlices(content: string): RoadmapSliceEntry[] {
  const slicesSection = extractSlicesSection(content);
  const slices: RoadmapSliceEntry[] = [];
  if (!slicesSection) return slices;

  const checkboxItems = slicesSection.split("\n");
  let currentSlice: RoadmapSliceEntry | null = null;

  for (const line of checkboxItems) {
    const cbMatch = line.match(/^\s*-\s+\[([ xX])\]\s+\*\*([\w.]+):\s+(.+?)\*\*\s*(.*)/);
    if (cbMatch) {
      if (currentSlice) slices.push(currentSlice);

      const done = cbMatch[1].toLowerCase() === "x";
      const id = cbMatch[2]!;
      const title = cbMatch[3]!;
      const rest = cbMatch[4] ?? "";

      const riskMatch = rest.match(/`risk:(\w+)`/);
      const risk = (riskMatch ? riskMatch[1] : "low") as RiskLevel;

      const depsMatch = rest.match(/`depends:\[([^\]]*)\]`/);
      const depends = depsMatch && depsMatch[1]!.trim()
        ? expandDependencies(depsMatch[1]!.split(",").map(s => s.trim()))
        : [];

      currentSlice = { id, title, risk, depends, done, demo: "" };
      continue;
    }

    if (currentSlice && line.trim().startsWith(">")) {
      currentSlice.demo = line.trim().replace(/^>\s*/, "").replace(/^After this:\s*/i, "");
    }
  }

  if (currentSlice) slices.push(currentSlice);
  return slices;
}
