// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// ---- react-router-dom mock ----
const mockNavigate = vi.fn();
const mockParams: { id?: string } = {};

vi.mock("react-router-dom", () => ({
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
  Link: ({ children, to, className }: any) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

// ---- fetch mock ----
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// ---- localStorage mock ----
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

// ---- Test helpers ----
function makeMockRecord(overrides: Record<string, any> = {}) {
  return {
    id: "R-test-001",
    mr_url: "requirement://test-pl/feature..main",
    project: "test-pl",
    product_line_id: "test-pl",
    author: "tester",
    status: "reviewing",
    report_json: JSON.stringify({
      productLine: "测试产品线",
      sourceBranch: "feature",
      targetBranch: "main",
      totalProjects: 2,
      totalFiles: 5,
      totalIssues: 3,
      criticalCount: 1,
    }),
    classification_json: null,
    requirement_json: null,
    mr_meta_json: null,
    reviewed_commit_sha: null,
    passed: null,
    avg_score: null,
    issue_count: null,
    critical_count: 0,
    knowledge_dispositions_json: null,
    created_by: "user-1",
    created_at: "2026-05-13T00:00:00Z",
    updated_at: "2026-05-13T00:00:00Z",
    ...overrides,
  };
}

function makeMockSubReports() {
  return [
    {
      id: 1,
      review_id: "R-test-001",
      project: "proj-a",
      tech_stack: "java-backend",
      status: "completed",
      report_json: JSON.stringify({ issues: [], scores: [], summary: "" }),
      classification_json: null,
      score: 4.5,
      issue_count: 1,
      critical_count: 0,
      error_message: null,
      created_at: "2026-05-13T00:00:00Z",
      updated_at: "2026-05-13T00:00:00Z",
    },
    {
      id: 2,
      review_id: "R-test-001",
      project: "proj-b",
      tech_stack: "vue-frontend",
      status: "pending",
      report_json: null,
      classification_json: null,
      score: null,
      issue_count: null,
      critical_count: 0,
      error_message: null,
      created_at: "2026-05-13T00:00:00Z",
      updated_at: "2026-05-13T00:00:00Z",
    },
  ];
}

function makeMockCheckpoint(overrides: Record<string, any> = {}) {
  return {
    id: "cp-test-001",
    status: "reviewing",
    currentBatch: 0,
    totalBatches: 5,
    jobId: "job-test-001",
    ...overrides,
  };
}

function setupFetchMocks(
  record: Record<string, any>,
  subReports: any[],
  checkpoint: Record<string, any> | null,
) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/sub-reports")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(subReports),
      });
    }
    if (url.includes("/checkpoint")) {
      if (checkpoint) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(checkpoint),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
    }
    // default: review detail
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ record }),
    });
  });
}

// ---- Tests ----
describe("RequirementReviewDetailPage - pause button (G5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams.id = "R-test-001";
    localStorageMock.setItem("auth_token", "test-token");
  });

  it("显示暂停按钮 — 当 status=reviewing 且有 checkpoint", async () => {
    setupFetchMocks(makeMockRecord(), makeMockSubReports(), makeMockCheckpoint());

    const { RequirementReviewDetailPage } = await import(
      "../../../src/client/pages/RequirementReviewDetailPage"
    );
    render(<RequirementReviewDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("评审中")).toBeTruthy();
    });

    // 暂停按钮应当出现
    await waitFor(() => {
      expect(screen.getByText("暂停评审")).toBeTruthy();
    });

    // 不应显示恢复/放弃（那是 paused/interrupted 状态）
    expect(screen.queryByText("恢复评审")).toBeNull();
    expect(screen.queryByText("放弃评审")).toBeNull();
  });

  it("点击暂停按钮调用 pause API", async () => {
    setupFetchMocks(makeMockRecord(), makeMockSubReports(), makeMockCheckpoint());

    const { RequirementReviewDetailPage } = await import(
      "../../../src/client/pages/RequirementReviewDetailPage"
    );
    render(<RequirementReviewDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("暂停评审")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("暂停评审"));

    // 验证调用了 pause API
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/review/pause",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("job-test-001"),
      }),
    );
  });

  it("不显示暂停按钮 — 当 status=completed", async () => {
    setupFetchMocks(
      makeMockRecord({ status: "completed", avg_score: 4.2, issue_count: 3 }),
      makeMockSubReports(),
      null,
    );

    const { RequirementReviewDetailPage } = await import(
      "../../../src/client/pages/RequirementReviewDetailPage"
    );
    render(<RequirementReviewDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("项目")).toBeTruthy();
    });

    expect(screen.queryByText("暂停评审")).toBeNull();
    expect(screen.queryByText("恢复评审")).toBeNull();
    expect(screen.queryByText("放弃评审")).toBeNull();
  });

  it("不显示暂停按钮 — 当 status=paused（显示恢复/放弃）", async () => {
    setupFetchMocks(
      makeMockRecord({ status: "paused" }),
      makeMockSubReports(),
      makeMockCheckpoint(),
    );

    const { RequirementReviewDetailPage } = await import(
      "../../../src/client/pages/RequirementReviewDetailPage"
    );
    render(<RequirementReviewDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("已暂停")).toBeTruthy();
    });

    expect(screen.queryByText("暂停评审")).toBeNull();
    expect(screen.getByText("恢复评审")).toBeTruthy();
    expect(screen.getByText("放弃评审")).toBeTruthy();
  });
});
