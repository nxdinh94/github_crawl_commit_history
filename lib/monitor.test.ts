import { describe, expect, it } from "vitest";
import { aggregateCommits, getPreviousWeekRange } from "./monitor";

describe("aggregateCommits", () => {
  it("combines commits from multiple contributors and retains roster members with no commits", () => {
    const result = aggregateCommits([
      { githubUsername: "Ada", date: "2026-09-22T10:00:00Z", stats: { additions: 8, deletions: 2, changedFiles: 1 } },
      { githubUsername: "ada", date: "2026-09-23T10:00:00Z", stats: { additions: 7, deletions: 1, changedFiles: 2 } },
      { githubUsername: "Lin", date: "2026-09-24T10:00:00Z", stats: { additions: 20, deletions: 0, changedFiles: 3 } },
    ], ["Ada", "Lin", "Noah"], 20);

    expect(result).toEqual([
      { githubUsername: "Ada", commitCount: 2, latestCommitAt: "2026-09-23T10:00:00Z", additions: 15, deletions: 3, changedFiles: 3, status: "shallow" },
      { githubUsername: "Lin", commitCount: 1, latestCommitAt: "2026-09-24T10:00:00Z", additions: 20, deletions: 0, changedFiles: 3, status: "ok" },
      { githubUsername: "Noah", commitCount: 0, latestCommitAt: null, additions: null, deletions: null, changedFiles: null, status: "no_commit" },
    ]);
  });

  it("marks line statistics unavailable when any commit lacks them", () => {
    const [result] = aggregateCommits([
      { githubUsername: "Ada", date: "2026-09-22T10:00:00Z", stats: { additions: 5, deletions: 0, changedFiles: 1 } },
      { githubUsername: "Ada", date: "2026-09-23T10:00:00Z", stats: null },
    ], [], 10);

    expect(result.status).toBe("unavailable");
    expect(result.commitCount).toBe(2);
    expect(result.changedFiles).toBeNull();
  });
});

describe("getPreviousWeekRange", () => {
  it("returns the previous Monday through Sunday in the configured timezone", () => {
    expect(getPreviousWeekRange(new Date("2026-09-29T05:00:00Z"), "Asia/Bangkok")).toEqual({
      weekStart: "2026-09-20T17:00:00.000Z",
      weekEnd: "2026-09-27T16:59:59.000Z",
    });
  });
});
