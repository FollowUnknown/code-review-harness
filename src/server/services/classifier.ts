import { GitLabDiff, RiskLevel, ReviewMode, ClassifiedFile, BatchInfo, ClassificationSummary } from "../../shared/types";

// ---- Internal Types ----

interface InternalClassified {
  diff: GitLabDiff;
  level: RiskLevel;
  reviewMode: ReviewMode;
  maxRelatedDepth: number;
  skipReason: string | null;
  riskFlags: string[];
}

// ---- Diff Line Counting ----

function countDiffLines(diff: string): number {
  return diff.split("\n").filter(
    (line) =>
      (line.startsWith("+") && !line.startsWith("+++")) ||
      (line.startsWith("-") && !line.startsWith("---"))
  ).length;
}

// ---- Risk Detection ----

function isCoreBusinessFile(path: string): boolean {
  const patterns = [
    /\/(payment|checkout|order|trade|transaction|wallet|billing)/i,
    /\/(auth|login|register|session|token|permission)/i,
    /\/(user|account|profile|member)/i,
  ];
  return patterns.some((p) => p.test(path));
}

function isNewComponent(diff: GitLabDiff): boolean {
  return diff.new_file && /\.(vue|tsx|jsx)$/.test(diff.new_path);
}

function checkRiskUpgrades(diff: GitLabDiff): string[] {
  const flags: string[] = [];
  const content = diff.diff;
  const path = diff.new_path;

  if (/(?:fetch|axios|request|http\.(?:get|post|put|delete|patch))\s*\(/.test(content) ||
    /(?:url|api|endpoint)\s*[:=]/.test(content)) {
    flags.push("REQUEST_URL_CHANGED");
  }

  if (/(?:export\s+(?:default\s+)?(?:function|class|const|interface|type)\s+\w+)|(?:module\.exports)/.test(content)) {
    flags.push("EXPORT_SIGNATURE_CHANGED");
  }

  if (/(?:enum\s+\w+|(?:export\s+)?const\s+\w+\s*=)/.test(content) &&
    /ENUM|CONST|MAP|CONFIG|STATUS|TYPE/.test(content.toUpperCase())) {
    flags.push("ENUM_CONSTANT_CHANGED");
  }

  if (/(?:beforeEach|afterEach|guard|permission|authorize|canAccess|hasRole)/.test(content)) {
    flags.push("ROUTE_GUARD_CHANGED");
  }

  if (/(?:process\.env|import\.meta\.env|VITE_)/.test(content)) {
    flags.push("ENV_VAR_CHANGED");
  }

  if (/(?:proxy|target)\s*[:=]/.test(content) && /(?:\.js|\.ts|config)/.test(path)) {
    flags.push("PROXY_TARGET_CHANGED");
  }

  if (/(?:feature[_-]?flag|ff_|toggle|switch|ENABLE_|DISABLE_)/i.test(content)) {
    flags.push("FEATURE_FLAG_CHANGED");
  }

  if (/(?:Authorization|Bearer|token|cookie|session|X-Auth)/i.test(content)) {
    flags.push("AUTH_HEADER_CHANGED");
  }

  if (/(?:interface\s+\w*(?:Params|Request|Response|Payload|Body)|type\s+\w*(?:Params|Request|Response|Payload|Body))/.test(content)) {
    flags.push("API_PARAMS_CHANGED");
  }

  if (/(?:default\s*[:=]|DEFAULT_)/.test(content)) {
    flags.push("DEFAULT_CONFIG_CHANGED");
  }

  if (isNewComponent(diff)) {
    flags.push("NEW_COMPONENT");
  }

  if (isCoreBusinessFile(path)) {
    flags.push("CORE_BUSINESS_FILE");
  }

  return flags;
}

// ---- Low-Risk Early Termination ----

function checkEarlyTermination(diff: GitLabDiff): string | null {
  const path = diff.new_path;

  if (/\.gitignore$/.test(path)) return "GITIGNORE";
  if (/\.md$/.test(path)) return "PURE_DOCUMENTATION";
  if (/proxy\.[jt]s$/.test(path)) return "PROXY_FILE";
  if (/(?:webpack|vite|rollup|babel|eslint|prettier|jest|vitest)\.config\./.test(path) ||
    /(?:tsconfig)\./.test(path)) return "BUILD_CONFIG";

  // Skip binary files by extension (images, fonts, etc.)
  if (/\.(png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot|mp4|mp3|zip|tar|gz)$/i.test(path)) return "BINARY_ASSET";

  // Skip empty diffs that couldn't be recovered (non-new files with no changes)
  if (!diff.diff.trim() && !diff.new_file) return "EMPTY_DIFF";

  const lineCount = countDiffLines(diff.diff);
  if (lineCount < 10) {
    const codeLines = diff.diff.split("\n").filter((line) => {
      if ((!line.startsWith("+") && !line.startsWith("-")) ||
        line.startsWith("+++") || line.startsWith("---")) return false;
      const content = line.slice(1).trim();
      return content.length > 0 && !/^[/*]/.test(content);
    });
    if (codeLines.length === 0) return "PURE_COMMENT_WHITESPACE";
  }

  return null;
}

// ---- Base Level Determination ----

function determineBaseLevel(diff: GitLabDiff): RiskLevel {
  const lineCount = countDiffLines(diff.diff);
  const path = diff.new_path;

  if (isNewComponent(diff) || isCoreBusinessFile(path) || lineCount > 120) return "S";
  if (
    lineCount > 50 ||
    /\.(service|controller|handler|middleware)\./.test(path) ||
    /\/(api|route|router)\//.test(path) ||
    /\/(auth|permission|security)\//i.test(path)
  ) return "A";
  if (lineCount >= 10) return "B";
  return "C";
}

// ---- Level Utilities ----

const LEVEL_ORDER: Record<RiskLevel, number> = { S: 0, A: 1, B: 2, C: 3 };

function highestLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_ORDER[a] <= LEVEL_ORDER[b] ? a : b;
}

function getReviewConfig(level: RiskLevel): { reviewMode: ReviewMode; maxRelatedDepth: number } {
  switch (level) {
    case "S": return { reviewMode: "standard", maxRelatedDepth: 2 };
    case "A": return { reviewMode: "standard", maxRelatedDepth: 1 };
    case "B": return { reviewMode: "diff_plus_self", maxRelatedDepth: 0 };
    case "C": return { reviewMode: "diff_only", maxRelatedDepth: 0 };
  }
}

// ---- Classify Single Diff ----

function classifyOne(diff: GitLabDiff): InternalClassified {
  const baseLevel = determineBaseLevel(diff);
  const riskFlags = checkRiskUpgrades(diff);
  const skipReason = checkEarlyTermination(diff);

  let level = baseLevel;
  if (riskFlags.length > 0) {
    if (baseLevel === "C") level = "B";
    else if (baseLevel === "B") level = "A";
    else if (baseLevel === "A" && riskFlags.some(
      (f) => ["ROUTE_GUARD_CHANGED", "AUTH_HEADER_CHANGED", "NEW_COMPONENT", "CORE_BUSINESS_FILE"].includes(f)
    )) level = "S";
  }

  const config = getReviewConfig(level);
  return { diff, level, ...config, skipReason, riskFlags };
}

// ---- Batch Creation ----

function getBatchSize(levels: RiskLevel[]): number {
  if (levels.some((l) => l === "S")) return 3;
  if (levels.some((l) => l === "A")) return 4;
  return 6;
}

function createBatches(items: InternalClassified[]): BatchInfo[] {
  const batches: BatchInfo[] = [];
  let current: InternalClassified[] = [];

  for (const item of items) {
    current.push(item);
    const size = getBatchSize(current.map((c) => c.level));

    if (current.length >= size) {
      const level = current.reduce<RiskLevel>(
        (max, c) => highestLevel(max, c.level), "C" as RiskLevel
      );
      batches.push({
        batchIndex: batches.length,
        level,
        files: current.map((c) => ({
          path: c.diff.new_path,
          level: c.level,
          reviewMode: c.reviewMode,
          riskFlags: c.riskFlags,
        })),
      });
      current = [];
    }
  }

  if (current.length > 0) {
    const level = current.reduce<RiskLevel>(
      (max, c) => highestLevel(max, c.level), "C" as RiskLevel
    );
    batches.push({
      batchIndex: batches.length,
      level,
      files: current.map((c) => ({
        path: c.diff.new_path,
        level: c.level,
        reviewMode: c.reviewMode,
        riskFlags: c.riskFlags,
      })),
    });
  }

  return batches;
}

// ---- Public API ----

export interface ClassifyResult {
  summary: ClassificationSummary;
  batchDiffs: GitLabDiff[][];
}

export function classify(diffs: GitLabDiff[]): ClassifyResult {
  const classified = diffs.map(classifyOne);
  const toReview = classified.filter((c) => !c.skipReason);
  const skipped = classified.filter((c) => c.skipReason);

  const byLevel: Record<RiskLevel, number> = { S: 0, A: 0, B: 0, C: 0 };
  toReview.forEach((c) => { byLevel[c.level]++; });

  const batches = createBatches(toReview);

  // Build per-batch diff arrays for the reviewer
  const batchDiffs = batches.map((batch) => {
    const paths = new Set(batch.files.map((f) => f.path));
    return toReview.filter((c) => paths.has(c.diff.new_path)).map((c) => c.diff);
  });

  return {
    summary: {
      stats: { total: diffs.length, byLevel, skipped: skipped.length },
      batches,
      skipped: skipped.map((c) => ({
        path: c.diff.new_path,
        level: c.level,
        reviewMode: c.reviewMode,
        riskFlags: c.riskFlags,
        skipReason: c.skipReason!,
      })),
    },
    batchDiffs,
  };
}
