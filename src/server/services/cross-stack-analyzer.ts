import type {
  TechStackGroupReport,
  SeverityLevel,
  ReviewIssue,
} from "../../shared/types";
import type { KnowledgeEntry } from "./knowledge";

// ---- Public Types ----

export interface CrossStackIssue {
  description: string;
  backendProject?: string;
  frontendProject?: string;
  severity: SeverityLevel;
}

// ---- Detection Helpers ----

const BACKEND_API_PATTERNS = [
  /Controller\.java$/i,
  /Facade\.java$/i,
  /\/dto\//i,
  /\/vo\//i,
  /\/api\//i,
];

const FRONTEND_API_PATTERNS = [
  /\/api\//i,
  /\/service\//i,
  /\/store\//i,
  /api\.(ts|js)$/i,
];

function isBackendAPIFile(file: string): boolean {
  return BACKEND_API_PATTERNS.some((p) => p.test(file));
}

function isFrontendAPIFile(file: string): boolean {
  return FRONTEND_API_PATTERNS.some((p) => p.test(file));
}

function extractAPIHints(issues: ReviewIssue[], pattern: RegExp): string[] {
  const hints: string[] = [];
  for (const issue of issues) {
    if (pattern.test(issue.file) || pattern.test(issue.message)) {
      hints.push(issue.file);
    }
  }
  return [...new Set(hints)];
}

function matchIntegrationKnowledge(
  files: string[],
  knowledge: KnowledgeEntry[]
): KnowledgeEntry[] {
  return knowledge.filter((entry) => {
    if (!entry.pattern) return false;
    return files.some((f) => f.includes(entry.pattern!));
  });
}

// ---- Main Detection Function ----

/**
 * Compare backend and frontend review reports and detect cross-stack issues.
 * Strategy:
 * 1. Collect backend issues involving API/DTO/Controller files
 * 2. Collect frontend issues involving API call files
 * 3. Cross-match with Layer 2 (integration) knowledge patterns
 * 4. Generate CrossStackIssue array
 */
export function detectCrossStackIssues(
  javaReport: TechStackGroupReport,
  vueReport: TechStackGroupReport,
  integrationKnowledge: KnowledgeEntry[]
): CrossStackIssue[] {
  const issues: CrossStackIssue[] = [];

  // Collect backend API files from issues
  const backendAPIFiles: string[] = [];
  for (const pr of javaReport.projectReports) {
    for (const issue of pr.report.issues) {
      if (isBackendAPIFile(issue.file)) {
        backendAPIFiles.push(issue.file);
      }
    }
  }

  // Collect frontend API files from issues
  const frontendAPIFiles: string[] = [];
  for (const pr of vueReport.projectReports) {
    for (const issue of pr.report.issues) {
      if (isFrontendAPIFile(issue.file)) {
        frontendAPIFiles.push(issue.file);
      }
    }
  }

  // Match against integration knowledge
  const backendMatched = matchIntegrationKnowledge(backendAPIFiles, integrationKnowledge);
  const frontendMatched = matchIntegrationKnowledge(frontendAPIFiles, integrationKnowledge);

  // Deduplicate matched knowledge
  const allMatched = new Map<string, KnowledgeEntry>();
  for (const entry of [...backendMatched, ...frontendMatched]) {
    allMatched.set(entry.id, entry);
  }

  // Generate cross-stack issues from matched integration knowledge
  for (const entry of allMatched.values()) {
    const backendProjects = javaReport.projectReports
      .filter((pr) => pr.report.issues.some((i) => isBackendAPIFile(i.file)))
      .map((pr) => pr.project);

    const frontendProjects = vueReport.projectReports
      .filter((pr) => pr.report.issues.some((i) => isFrontendAPIFile(i.file)))
      .map((pr) => pr.project);

    issues.push({
      description: `[集成检查] ${entry.title}: ${entry.content}`,
      backendProject: backendProjects[0],
      frontendProject: frontendProjects[0],
      severity: (entry.severity as SeverityLevel) || "MEDIUM",
    });
  }

  // Check for HIGH/CRITICAL backend API changes without corresponding frontend awareness
  for (const pr of javaReport.projectReports) {
    const criticalAPIIssues = pr.report.issues.filter(
      (i) => isBackendAPIFile(i.file) && (i.severity === "HIGH" || i.severity === "CRITICAL")
    );
    if (criticalAPIIssues.length > 0 && frontendAPIFiles.length > 0) {
      issues.push({
        description: `后端 ${pr.project} 存在 ${criticalAPIIssues.length} 个 API 相关的严重问题，请确认前端调用方是否受影响`,
        backendProject: pr.project,
        frontendProject: frontendAPIFiles.length > 0 ? vueReport.projectReports[0]?.project : undefined,
        severity: "HIGH",
      });
    }
  }

  return issues;
}
