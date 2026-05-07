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
  content?: string;
  hit_count?: number;
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
  source_branch?: string;
  target_branch?: string;
  author?: string;
  error_message?: string;
  reviewed_at?: string;
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

// ---- Review Job Types (v1.3.8) ----

export type ReviewJobStatus = "pending" | "running" | "completed" | "failed" | "aborted";

export interface ReviewJob {
  id: string;
  project: string;
  sourceBranch: string;
  targetBranch: string;
  excludedFilesJson: string | null;
  status: ReviewJobStatus;
  reviewId: string | null;
  currentStep: number;
  currentLabel: string | null;
  stepsJson: string | null;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
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

// ---- Harness Memory (v1.2.5) ----

export type MemoryLayer = "session" | "task" | "project";

export type ProjectMemoryType = "conventions" | "risks" | "best-practices";

export interface MemoryIndexEntry {
  id: string;
  layer: MemoryLayer;
  file: string;
  scope: string;
  createdAt: string;
  expiresAt: string;
  hitCount: number;
  lastHitAt: string;
  tags: string[];
}

export interface MemoryIndex {
  lastUpdated: string;
  entries: MemoryIndexEntry[];
}

export interface MemoryStats {
  totalEntries: number;
  byLayer: Record<MemoryLayer, number>;
  upgrades: {
    taskToProject: number;
    projectRenewed: number;
  };
  archived: Record<MemoryLayer, number>;
  lastMaintenance: string | null;
}

export interface SessionMemory {
  id: string;
  sessionDate: string;
  activeTasks: { taskId: string; description: string; priority: string }[];
  contextSnapshot: {
    currentContract: string | null;
    currentPhase: string | null;
    lastAction: string;
  };
  pendingDecisions: string[];
  createdAt: string;
  expiresAt: string;
}

export interface TaskMemory {
  id: string;
  contractId: string;
  scope: string;
  approach: string;
  risks: string[];
  decisions: { decision: string; rationale: string }[];
  reviewResult: "passed" | "failed";
  keyIssues: string[];
  repairPattern?: string;
  createdAt: string;
  expiresAt: string;
}

export interface ProjectMemory {
  id: string;
  projectName: string;
  type: ProjectMemoryType;
  content: string;
  sourceTaskIds: string[];
  confidence: number;
  createdAt: string;
  expiresAt: string;
  lastHitAt: string;
}

// ---- Local Scan (v1.3.0) ----

export interface LocalReviewRequest {
  project: string;
  sourceBranch: string;
  targetBranch: string;
  includeRelatedFiles?: boolean;   // default true
  relatedFileDepth?: number;       // 1 = direct deps only (default)
  excludedFiles?: string[];        // v1.3.5: files to skip
}

export interface DiffReviewRequest {
  project: string;
  diffText: string;
  fileName?: string;
  excludedFiles?: string[];        // v1.3.5: files to skip
}

export interface RepoMapping {
  id: number;
  project: string;
  localPath: string;
  createdAt: string;
}

export type FileCategory = "utility" | "business" | "entry" | "config";

export interface RelatedFile {
  path: string;
  category: FileCategory;
  relevance: number;               // 0-1, 用于排序
  reason: string;                  // 为什么关联（import/call/same-dir）
}

export interface ScanContext {
  diffs: GitLabDiff[];
  changedSymbols: string[];
  relatedFiles: Array<RelatedFile & { content?: string }>;
  totalTokens: number;
}

// ---- Diff Preview (v1.3.5) ----

export interface FilePreviewItem {
  path: string;
  newFile: boolean;
  deletedFile: boolean;
  renamedFile: boolean;
  diffChars: number;
  riskLevel: RiskLevel;
  fileCategory: FileCategory;
  symbols: string[];
}

export type GroupByMode = "fileType" | "directory" | "riskLevel";

export interface FileGroup {
  key: string;
  label: string;
  count: number;
  newCount: number;
  modifiedCount: number;
  suggestedSkip: boolean;
  files: FilePreviewItem[];
}

export interface DiffPreviewRequest {
  project?: string;
  diffText?: string;
  sourceBranch?: string;
  targetBranch?: string;
}

export interface DiffPreviewResponse {
  totalFiles: number;
  skipCount: number;
  groups: FileGroup[];
  batchEstimate: number;
  tokenEstimate: number;
  triggerThreshold: boolean;
}
