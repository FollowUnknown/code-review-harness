// ---- GitLab Types ----

export interface GitLabMRMeta {
  projectId: number;
  iid: number;
  title: string;
  author: { name: string; avatar_url: string };
  source_branch: string;
  target_branch: string;
  created_at: string;
  changes_count: string;
}

export interface GitLabDiff {
  old_path: string;
  new_path: string;
  new_file: boolean;
  deleted_file: boolean;
  renamed_file: boolean;
  diff: string;
}

// ---- Classification Types ----

export type RiskLevel = "S" | "A" | "B" | "C";
export type ReviewMode = "standard" | "diff_plus_self" | "diff_only";

export interface ClassifiedFile {
  path: string;
  level: RiskLevel;
  reviewMode: ReviewMode;
  riskFlags: string[];
  skipReason?: string;
}

export interface BatchInfo {
  batchIndex: number;
  level: RiskLevel;
  files: ClassifiedFile[];
}

export interface ClassificationSummary {
  stats: {
    total: number;
    byLevel: Record<RiskLevel, number>;
    skipped: number;
  };
  batches: BatchInfo[];
  skipped: ClassifiedFile[];
}

// ---- Review Types ----

export type SeverityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface ReviewIssue {
  severity: SeverityLevel;
  message: string;
  file: string;
  line?: number;
  suggestion?: string;
}

export interface ReviewScore {
  dimension: string;
  score: number; // 1-5
  comment: string;
}

export interface ReviewReport {
  contractTitle: string;
  timestamp: string;
  passed: boolean;
  scores: ReviewScore[];
  issues: ReviewIssue[];
  summary: string;
}

// ---- API Request/Response ----

export interface ReviewRequest {
  mrUrl: string;
  gitlabHost?: string;
  gitlabToken?: string;
  lanhuUrl?: string;
}

export interface ReviewProgress {
  status: "fetching" | "reviewing" | "done" | "error";
  message: string;
  progress?: number;
}

export interface RequirementSummary {
  type: string;
  module: string;
  features: string[];
  conflicts: string[];
  source: "lanhu" | "mr_inference";
  lanhuSummary?: string;
}

export interface ReviewResponse {
  mr: GitLabMRMeta;
  diffs: GitLabDiff[];
  report: ReviewReport;
  classification?: ClassificationSummary;
  requirement?: RequirementSummary;
}
