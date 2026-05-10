import type { ProjectScanResult, TechStack } from "../../shared/types";

/**
 * Group project scan results by tech stack.
 * Returns a Map keyed by TechStack, preserving insertion order.
 */
export function groupByTechStack(
  results: ProjectScanResult[]
): Map<TechStack, ProjectScanResult[]> {
  const groups = new Map<TechStack, ProjectScanResult[]>();
  for (const result of results) {
    const stack = result.techStack;
    const existing = groups.get(stack) ?? [];
    existing.push(result);
    groups.set(stack, existing);
  }
  return groups;
}
