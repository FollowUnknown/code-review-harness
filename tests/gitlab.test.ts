import { describe, it, expect } from "vitest";
import { parseMRUrl } from "../src/server/services/gitlab.js";

describe("parseMRUrl", () => {
  it("parses a standard GitLab MR URL", () => {
    const result = parseMRUrl("https://gitlab.com/group/project/-/merge_requests/42");
    expect(result).toEqual({
      host: "https://gitlab.com",
      projectPath: "group/project",
      iid: 42,
    });
  });

  it("parses a self-hosted GitLab URL", () => {
    const result = parseMRUrl("https://git.example.com/my-org/my-repo/-/merge_requests/7");
    expect(result).toEqual({
      host: "https://git.example.com",
      projectPath: "my-org/my-repo",
      iid: 7,
    });
  });

  it("parses a URL with encoded path", () => {
    const result = parseMRUrl("https://gitlab.com/group/sub%2Fproject/-/merge_requests/1");
    expect(result.projectPath).toBe("group/sub/project");
    expect(result.iid).toBe(1);
  });

  it("throws for invalid URL", () => {
    expect(() => parseMRUrl("not-a-url")).toThrow("Invalid MR URL");
  });

  it("throws for URL without MR path", () => {
    expect(() => parseMRUrl("https://gitlab.com/group/project")).toThrow("Invalid MR URL");
  });

  it("parses HTTP URL", () => {
    const result = parseMRUrl("http://localhost/group/project/-/merge_requests/1");
    expect(result.host).toBe("http://localhost");
  });
});
