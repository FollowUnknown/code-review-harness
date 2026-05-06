import { describe, it, expect } from "vitest";
import { inferTechStack } from "../src/server/services/techstack";

describe("inferTechStack", () => {
  it("detects java-backend from .java files", () => {
    expect(inferTechStack([
      "src/main/java/com/example/Foo.java",
      "src/main/java/com/example/Bar.java",
      "src/main/java/com/example/Baz.java",
    ])).toBe("java-backend");
  });

  it("detects vue-frontend from .vue/.ts files", () => {
    expect(inferTechStack([
      "src/views/Home.vue",
      "src/components/Table.vue",
      "src/api/user.ts",
    ])).toBe("vue-frontend");
  });

  it("detects mixed when both stacks present at ~50/50", () => {
    expect(inferTechStack([
      "src/main/java/Foo.java",
      "src/main/java/Bar.java",
      "src/views/Home.vue",
      "src/api/user.ts",
    ])).toBe("mixed");
  });

  it("returns unknown for no categorized files", () => {
    expect(inferTechStack(["README.md", "LICENSE", ".gitignore"])).toBe("unknown");
  });

  it("returns java-backend at 60% threshold", () => {
    // 3 java, 2 vue = 60% java
    expect(inferTechStack([
      "a.java", "b.java", "c.java", "d.vue", "e.vue",
    ])).toBe("java-backend");
  });

  it("returns mixed below 60% threshold", () => {
    expect(inferTechStack(["a.java", "b.vue"])).toBe("mixed");
  });

  it("handles empty array", () => {
    expect(inferTechStack([])).toBe("unknown");
  });

  it("handles .kt as java", () => {
    expect(inferTechStack(["Foo.kt", "Bar.kt", "Baz.kt"])).toBe("java-backend");
  });
});
