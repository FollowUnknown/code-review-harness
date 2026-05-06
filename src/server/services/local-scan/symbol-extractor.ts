import type { FileCategory } from "../../../shared/types";

export function extractChangedSymbols(diffText: string): string[] {
  const symbols = new Set<string>();

  // Only look at changed lines (starting with + or -)
  const changedLines = diffText.split("\n").filter((l) => l.startsWith("+") || l.startsWith("-"));

  const frontendPatterns = [
    // function declarations
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    // const/let/var declarations
    /(?:export\s+)?(?:const|let|var)\s+(\w+)/g,
    // interface/type declarations
    /(?:export\s+)?(?:interface|type)\s+(\w+)/g,
    // class declarations
    /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/g,
  ];

  const javaPatterns = [
    // Java class/interface/enum declarations
    /(?:public\s+|private\s+|protected\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+(\w+)/g,
    // Java method declarations
    /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/g,
    // Spring annotations (extract as context)
    /@(\w+(?:Service|Repository|Component|Controller|Autowired|Resource|Inject|Bean|Configuration|Value|Override))/g,
  ];

  for (const line of changedLines) {
    for (const pattern of [...frontendPatterns, ...javaPatterns]) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match) {
        symbols.add(match[1]);
      }
    }
  }

  return [...symbols];
}

export function classifyFile(filePath: string): FileCategory {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();

  // Config files
  if (
    normalized.endsWith(".json") ||
    normalized.endsWith(".yml") ||
    normalized.endsWith(".yaml") ||
    normalized.endsWith(".gitignore") ||
    normalized.endsWith(".env") ||
    normalized.endsWith(".config.") ||
    normalized.includes("tsconfig") ||
    normalized.includes(".eslintrc") ||
    normalized.includes(".prettierrc") ||
    // Java config
    normalized.endsWith("pom.xml") ||
    normalized.endsWith("build.gradle") ||
    normalized.endsWith("application.yml") ||
    normalized.endsWith("application.properties") ||
    normalized.endsWith("application-local.yml") ||
    normalized.endsWith("application-dev.yml")
  ) {
    return "config";
  }

  // Entry points
  if (
    normalized.endsWith("index.ts") ||
    normalized.endsWith("index.js") ||
    normalized.endsWith("app.ts") ||
    normalized.endsWith("app.js") ||
    normalized.endsWith("main.ts") ||
    normalized.endsWith("main.js") ||
    normalized.includes("/routes/") ||
    normalized.includes("/router/") ||
    // Java entry points
    normalized.endsWith("application.java") ||
    normalized.endsWith("main.java")
  ) {
    return "entry";
  }

  // Utility files
  if (
    normalized.includes("/utils/") ||
    normalized.includes("/helpers/") ||
    normalized.includes("/lib/") ||
    normalized.startsWith("lib/") ||
    normalized.includes("/common/") ||
    normalized.includes("/shared/") ||
    normalized.includes("/util/")
  ) {
    return "utility";
  }

  // Everything else is business logic
  return "business";
}
