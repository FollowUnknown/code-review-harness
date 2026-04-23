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
  head_sha?: string;
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

// ---- Review Record (DB storage) ----

export type ReviewStatus = "completed" | "draft";

export interface ReviewRecord {
  id: string;
  mr_url: string;
  project: string | null;
  author: string | null;
  status: ReviewStatus;
  report_json: string;
  classification_json: string | null;
  requirement_json: string | null;
  mr_meta_json: string | null;
  reviewed_commit_sha: string | null;
  passed: boolean | null;
  avg_score: number | null;
  issue_count: number | null;
  critical_count: number;
  knowledge_dispositions_json: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewListItem {
  id: string;
  mr_url: string;
  project: string | null;
  author: string | null;
  status: ReviewStatus;
  passed: boolean | null;
  avg_score: number | null;
  issue_count: number | null;
  critical_count: number;
  created_by: string | null;
  created_at: string;
}

export interface ReviewFilter {
  project?: string;
  createdBy?: string;
  status?: ReviewStatus;
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---- LLM Log ----

export interface LLMLog {
  id: string;
  review_id: string;
  batch_index: number;
  risk_level: RiskLevel | null;
  system_prompt: string;
  user_message: string;
  response_text: string;
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  provider: string | null;
  model: string | null;
  created_at: string;
}

// ---- API Request/Response ----

export type LLMProvider = "anthropic" | "deepseek";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ReviewRequest {
  mrUrl: string;
  gitlabHost?: string;
  gitlabToken?: string;
  lanhuUrl?: string;
}

export interface ContinueReviewRequest {
  mode: "full" | "incremental";
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

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ReviewResponse {
  reviewId?: string;
  mr: GitLabMRMeta;
  diffs: GitLabDiff[];
  report: ReviewReport;
  classification?: ClassificationSummary;
  requirement?: RequirementSummary;
  tokenUsage?: TokenUsage;
  batchDetails?: Array<{ files: number; tokens: TokenUsage }>;
  knowledgeUsed?: KnowledgeEntrySummary[];
  knowledgeProduced?: KnowledgeEntrySummary[];
  knowledgeDispositions?: KnowledgeDisposition[];
}

export interface KnowledgeEntrySummary {
  id: string;
  type: string;
  title: string;
  severity: string | null;
  status: string;
  project: string;
}

// ---- Review Plan Types ----

export type PlanStatus = "open" | "reviewing" | "archived";
export type PlanItemStatus = "pending" | "reviewing" | "completed" | "failed";

export interface ReviewPlan {
  id: string;
  title: string;
  description: string | null;
  status: PlanStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewPlanItem {
  id: string;
  plan_id: string;
  mr_url: string;
  review_id: string | null;
  status: PlanItemStatus;
  position: number;
  created_at: string;
}

export interface ReviewPlanDetail extends ReviewPlan {
  items: ReviewPlanItem[];
}

export interface PlanListItem {
  id: string;
  title: string;
  status: PlanStatus;
  item_count: number;
  created_by: string;
  created_at: string;
}

export interface PlanSummary {
  totalMRs: number;
  completedMRs: number;
  passedMRs: number;
  failedMRs: number;
  avgScore: number | null;
  totalIssues: number;
  issuesBySeverity: Record<SeverityLevel, number>;
  items: Array<{
    mrUrl: string;
    score: number | null;
    passed: boolean | null;
    issueCount: number;
  }>;
}

export interface PlanFilter {
  status?: PlanStatus;
  page: number;
  pageSize: number;
}

// ---- Auth Types ----

export type UserRole = "admin" | "member";

export interface User {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// ---- Knowledge Disposition (Coverage Gate) ----

export type IssueDisposition = "AP" | "EXP" | "RULE" | "MERGE" | "SKIP";

export interface KnowledgeDisposition {
  issueIndex: number;
  disposition: IssueDisposition;
  knowledgeId?: string;
  skipReason?: string;
  autoSuggested: boolean;
}

// ---- Dimension Set ----

export interface DimensionSet {
  id: string;
  name: string;
  project: string | null;
  dimensions: string[];
  focus_areas: string[] | null;
  is_default: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}
