import { GitLabDiff, GitLabMRMeta } from "../../shared/types";
import { isLanhuAvailable, fetchPages, fetchAIAnalysis } from "./lanhu";

// ---- Types ----

export type RequirementType = "feat" | "fix" | "refactor" | "chore" | "docs" | "style" | "test" | "unknown";

export interface RequirementUnderstanding {
  type: RequirementType;
  module: string;
  features: string[];
  conflicts: string[];
  source: "lanhu" | "mr_inference";
  lanhuSummary?: string;
}

// ---- MR-Based Inference ----

function inferTypeFromTitle(title: string): RequirementType {
  const lower = title.toLowerCase();
  if (/^(feat|feature|add|new)\b/i.test(lower)) return "feat";
  if (/^(fix|bug|patch|hotfix)\b/i.test(lower)) return "fix";
  if (/^(refactor|clean|restructure|rewrite)\b/i.test(lower)) return "refactor";
  if (/^(chore|build|ci|deps)\b/i.test(lower)) return "chore";
  if (/^(doc|docs)\b/i.test(lower)) return "docs";
  if (/^(style|format|lint)\b/i.test(lower)) return "style";
  if (/^(test|spec)\b/i.test(lower)) return "test";
  return "unknown";
}

function inferModuleFromPaths(paths: string[]): string {
  // Extract business module from file paths
  const modulePatterns = [
    /src\/pages\/([^/]+)/,
    /src\/views\/([^/]+)/,
    /src\/modules\/([^/]+)/,
    /src\/features\/([^/]+)/,
    /src\/components\/([^/]+)/,
    /src\/(api|services|utils|config)\/([^/]+)/,
  ];

  const modules = new Set<string>();
  for (const path of paths) {
    for (const pattern of modulePatterns) {
      const match = path.match(pattern);
      if (match) {
        modules.add(match[1]);
        break;
      }
    }
  }

  if (modules.size === 0) return "unknown";
  if (modules.size === 1) return [...modules][0];
  return [...modules].join(", ");
}

function inferFeaturesFromDiffs(diffs: GitLabDiff[]): string[] {
  const features: string[] = [];

  for (const diff of diffs) {
    const content = diff.diff;
    const path = diff.new_path;

    if (diff.new_file) {
      features.push(`新增文件: ${path}`);
      continue;
    }

    if (diff.deleted_file) {
      features.push(`删除文件: ${path}`);
      continue;
    }

    // Detect new functions/methods
    const funcMatches = content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g);
    for (const m of funcMatches) {
      features.push(`新增函数: ${m[1]} (${path})`);
    }

    // Detect new React/Vue components
    const componentMatches = content.matchAll(/(?:export\s+default\s+)?(?:function|const)\s+([A-Z]\w+)/g);
    for (const m of componentMatches) {
      features.push(`组件变更: ${m[1]} (${path})`);
    }

    // Detect new API calls
    const apiMatches = content.matchAll(/(?:fetch|axios|request)\s*\(\s*['"`]([^'"`]+)/g);
    for (const m of apiMatches) {
      features.push(`API 调用: ${m[1]} (${path})`);
    }
  }

  return features.slice(0, 20); // Cap at 20 features
}

// ---- Main Entry Point ----

export async function understandRequirement(
  mr: GitLabMRMeta,
  diffs: GitLabDiff[],
  lanhuUrl?: string
): Promise<RequirementUnderstanding> {
  // If Lanhu URL provided and Lanhu is available, fetch design context
  if (lanhuUrl) {
    const available = await isLanhuAvailable();
    if (available) {
      try {
        // Extract file ID from Lanhu URL
        const fileIdMatch = lanhuUrl.match(/file\/([^/?&]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          const pages = await fetchPages(fileId);
          if (pages.length > 0) {
            const analysis = await fetchAIAnalysis(fileId, pages[0].id);
            return {
              type: "feat", // Lanhu implies feature work
              module: inferModuleFromPaths(diffs.map((d) => d.new_path)),
              features: analysis.components || [],
              conflicts: [],
              source: "lanhu",
              lanhuSummary: analysis.summary,
            };
          }
        }
      } catch {
        // Fall through to MR inference
      }
    }
  }

  // Fallback: infer from MR metadata
  const type = inferTypeFromTitle(mr.title);
  const module = inferModuleFromPaths(diffs.map((d) => d.new_path));
  const features = inferFeaturesFromDiffs(diffs);
  const conflicts = detectConflicts(mr, diffs);

  return {
    type,
    module,
    features,
    conflicts,
    source: "mr_inference",
  };
}

function detectConflicts(mr: GitLabMRMeta, diffs: GitLabDiff[]): string[] {
  const conflicts: string[] = [];

  // Check for title vs diff mismatch
  const type = inferTypeFromTitle(mr.title);
  if (type === "docs" && diffs.some((d) => /\.(ts|js|vue|tsx|jsx)$/.test(d.new_path))) {
    conflicts.push("标题标记为文档变更但包含代码文件修改");
  }

  if (type === "fix" && diffs.some((d) => d.new_file && /\.(vue|tsx|jsx)$/.test(d.new_path))) {
    conflicts.push("标题标记为修复但包含新组件文件");
  }

  return conflicts;
}

// ---- Build Requirement Prompt ----

export function buildRequirementPrompt(req: RequirementUnderstanding): string {
  const typeLabels: Record<RequirementType, string> = {
    feat: "新功能",
    fix: "修复",
    refactor: "重构",
    chore: "杂项",
    docs: "文档",
    style: "样式",
    test: "测试",
    unknown: "未知",
  };

  let prompt = `\n\n## 需求背景\n变更类型: ${typeLabels[req.type]}\n业务模块: ${req.module}`;

  if (req.lanhuSummary) {
    prompt += `\n设计稿摘要: ${req.lanhuSummary}`;
  }

  if (req.features.length > 0) {
    prompt += `\n功能点:\n${req.features.map((f) => `- ${f}`).join("\n")}`;
  }

  if (req.conflicts.length > 0) {
    prompt += `\n待确认:\n${req.conflicts.map((c) => `- ${c}`).join("\n")}`;
  }

  prompt += "\n\n请基于以上需求背景进行评审，判断代码变更是否正确实现了需求。";
  return prompt;
}
