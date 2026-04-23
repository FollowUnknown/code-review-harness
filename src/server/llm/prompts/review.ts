import { getDb } from "../../db";
import { ReviewPromptContext, buildDefaultReviewPrompt, DEFAULT_REVIEW_USER_PROMPT } from "./defaults";

interface PromptTemplate {
  name: string;
  category: string;
  system_template: string;
  user_template: string | null;
  variables: string | null;
}

function loadTemplate(name: string): PromptTemplate | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT name, category, system_template, user_template, variables FROM prompt_templates WHERE name = ?"
  ).get(name) as PromptTemplate | undefined;
  return row || null;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export function getReviewPrompt(ctx: ReviewPromptContext): string {
  const tmpl = loadTemplate("review");
  if (!tmpl) {
    return buildDefaultReviewPrompt(ctx);
  }

  const vars: Record<string, string> = {
    dimensions: ctx.dimensions.map((d, i) => `${i + 1}. ${d}`).join("\n"),
    batchIndex: String(ctx.batchIndex + 1),
    totalBatches: String(ctx.totalBatches),
    riskLevel: ctx.riskLevel,
  };

  let prompt = renderTemplate(tmpl.system_template, vars);
  if (ctx.requirement) prompt += ctx.requirement;
  if (ctx.knowledge) prompt += ctx.knowledge;
  return prompt;
}

export function getReviewUserPrompt(): string {
  return DEFAULT_REVIEW_USER_PROMPT;
}

// Prompt template CRUD for the management API
export function listPromptTemplates(): Array<{
  name: string; category: string; description: string | null;
  variables: string | null; isDefault: boolean; version: number;
}> {
  const db = getDb();
  const rows = db.prepare(
    "SELECT name, category, description, variables, is_default, version FROM prompt_templates ORDER BY category, name"
  ).all() as Array<{
    name: string; category: string; description: string | null;
    variables: string | null; is_default: number; version: number;
  }>;
  return rows.map((r) => ({
    name: r.name,
    category: r.category,
    description: r.description,
    variables: r.variables,
    isDefault: r.is_default === 1,
    version: r.version,
  }));
}

export function getPromptTemplate(name: string): {
  name: string; category: string; description: string | null;
  systemTemplate: string; userTemplate: string | null;
  variables: string | null; version: number;
} | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT name, category, description, system_template, user_template, variables, version FROM prompt_templates WHERE name = ?"
  ).get(name) as {
    name: string; category: string; description: string | null;
    system_template: string; user_template: string | null;
    variables: string | null; version: number;
  } | undefined;
  if (!row) return null;
  return {
    name: row.name,
    category: row.category,
    description: row.description,
    systemTemplate: row.system_template,
    userTemplate: row.user_template,
    variables: row.variables,
    version: row.version,
  };
}

export function updatePromptTemplate(name: string, patch: {
  systemTemplate?: string;
  userTemplate?: string;
  description?: string;
}): boolean {
  const db = getDb();
  const existing = db.prepare("SELECT name FROM prompt_templates WHERE name = ?").get(name);
  if (!existing) return false;

  const sets: string[] = [];
  const values: string[] = [];
  if (patch.systemTemplate !== undefined) { sets.push("system_template = ?"); values.push(patch.systemTemplate); }
  if (patch.userTemplate !== undefined) { sets.push("user_template = ?"); values.push(patch.userTemplate); }
  if (patch.description !== undefined) { sets.push("description = ?"); values.push(patch.description); }
  sets.push("version = version + 1");
  sets.push("updated_at = datetime('now')");

  values.push(name);
  db.prepare(`UPDATE prompt_templates SET ${sets.join(", ")} WHERE name = ?`).run(...values);
  return true;
}

export function resetPromptTemplate(name: string): boolean {
  const db = getDb();
  // Re-insert the seed default (INSERT OR REPLACE resets to code default content)
  const row = db.prepare("SELECT id FROM prompt_templates WHERE name = ?").get(name) as { id: string } | undefined;
  if (!row) return false;

  // For review template, rebuild the default; for others, just reset to empty
  let systemTemplate = "";
  if (name === "review") {
    systemTemplate = buildDefaultReviewPrompt({
      dimensions: ["placeholder"],
      batchIndex: 0,
      totalBatches: 1,
      riskLevel: "C",
    }).split("\n\n当前评审批次")[0]; // Strip batch-specific suffix
  }

  db.prepare(
    `UPDATE prompt_templates SET system_template = ?, user_template = NULL, version = 1, updated_at = datetime('now') WHERE name = ?`
  ).run(systemTemplate, name);
  return true;
}
