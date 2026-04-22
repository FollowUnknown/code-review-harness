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
}

export interface ReviewProgress {
  status: "fetching" | "reviewing" | "done" | "error";
  message: string;
  progress?: number;
}

export interface ReviewResponse {
  mr: GitLabMRMeta;
  diffs: GitLabDiff[];
  report: ReviewReport;
}
