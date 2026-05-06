/**
 * Tech-stack inference from diff file extensions.
 *
 * Given a list of file paths (from a MR diff or local scan), counts file
 * extensions and returns the dominant tech stack.
 *
 * This is used by dimensions.ts and knowledge.ts to select the correct
 * dimension set and knowledge base.
 */

export type TechStack = "java-backend" | "vue-frontend" | "mixed" | "unknown";

/** Extension → tech-stack category weight */
const EXT_CATEGORY: Record<string, "java" | "frontend" | "neutral"> = {
  // Java
  ".java": "java",
  ".kt": "java",
  ".gradle": "java",
  ".properties": "neutral", // could be Java or frontend
  ".xml": "neutral",       // Maven pom, Spring config, or generic

  // Frontend
  ".vue": "frontend",
  ".tsx": "frontend",
  ".jsx": "frontend",
  ".ts": "frontend",
  ".js": "frontend",
  ".svelte": "frontend",
  ".css": "frontend",
  ".scss": "frontend",
  ".less": "frontend",
  ".html": "frontend",
};

/**
 * Infer the dominant tech stack from a list of file paths.
 *
 * Rules:
 * - java ≥ 60% of categorized files → "java-backend"
 * - frontend ≥ 60% of categorized files → "vue-frontend"
 * - otherwise → "mixed" (if both present) or "unknown"
 */
export function inferTechStack(filePaths: string[]): TechStack {
  let javaCount = 0;
  let frontendCount = 0;

  for (const path of filePaths) {
    const ext = getExtension(path);
    const category = EXT_CATEGORY[ext];
    if (category === "java") javaCount++;
    else if (category === "frontend") frontendCount++;
  }

  const total = javaCount + frontendCount;
  if (total === 0) return "unknown";

  const javaRatio = javaCount / total;
  const frontendRatio = frontendCount / total;

  if (javaRatio >= 0.6) return "java-backend";
  if (frontendRatio >= 0.6) return "vue-frontend";
  if (javaCount > 0 && frontendCount > 0) return "mixed";

  // If only one side exists but < 60% (shouldn't happen since only 2 categories)
  if (javaCount > 0) return "java-backend";
  if (frontendCount > 0) return "vue-frontend";

  return "unknown";
}

function getExtension(path: string): string {
  const dotIdx = path.lastIndexOf(".");
  if (dotIdx === -1) return "";
  return path.slice(dotIdx).toLowerCase();
}
