// Re-export prompt builders from their original locations
// These functions remain in requirement.ts and knowledge.ts since they
// are also used outside the LLM module. This file provides a unified
// import point for the llm module.

export { buildRequirementPrompt } from "../../services/requirement";
export { buildKnowledgePrompt } from "../../services/knowledge";
