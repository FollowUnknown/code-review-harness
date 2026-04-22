export const REVIEW_DIMENSIONS = [
  "Contract 完成度",
  "测试覆盖率",
  "TDD 合规",
  "函数长度",
  "文件长度",
  "嵌套深度",
  "输入验证",
  "密钥管理",
] as const;

export const PASS_THRESHOLD = {
  minAllScores: 3,
  minSecurityScore: 4,
  maxCriticalIssues: 0,
  maxHighIssues: 2,
} as const;
