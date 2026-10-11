import { describe, expect, it, vi } from "vitest";
import { createGitHubClient } from "./github";

const timestamp = "2026-09-21T00:00:00Z";

function jsonResponse(body: unknown, headers?: HeadersInit, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

describe("GitHub REST client", () => {
  it("follows every commit pagination link and sends the configured API version", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      const page = Number(url.searchParams.get("page") ?? 1);
      const headers = new Headers(init?.headers);
      expect(headers.get("X-GitHub-Api-Version")).toBe("2026-03-10");
      expect(headers.get("Authorization")).toBe("Bearer test-token");
      const link = page < 31
        ? `<https://api.github.com/repos/teacher/project/commits?since=${encodeURIComponent(timestamp)}&until=${encodeURIComponent(timestamp)}&per_page=100&page=${page + 1}>; rel="next"`
        : undefined;
      return jsonResponse([{ sha: `commit-${page}` }], link ? { Link: link } : undefined);
    });
    const client = createGitHubClient({ token: "test-token", fetcher });

    const commits = await client.listCommits("teacher", "project", timestamp, timestamp);

    expect(commits).toHaveLength(31);
    expect(fetcher).toHaveBeenCalledTimes(31);
  });

  it("counts changed files across pages and reuses cached commit details", async () => {
    const cache = new Map<string, { additions: number | null; deletions: number | null; changedFiles: number | null }>();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      if (url.searchParams.get("page") === "2") {
        return jsonResponse({ files: [{ filename: "extra.ts" }, { filename: "readme.md" }] });
      }
      return jsonResponse({
        stats: { additions: 8, deletions: 3, total: 11 },
        files: Array.from({ length: 300 }, (_, index) => ({ filename: `file-${index}.ts` })),
      }, { Link: "<https://api.github.com/repos/teacher/project/commits/sha?page=2>; rel=\"next\"" });
    });
    const client = createGitHubClient({
      fetcher,
      cache: {
        async get(sha) { return cache.get(sha) ?? null; },
        async set(sha, details) { cache.set(sha, details); },
      },
    });

    expect(await client.getCommitDetails("teacher", "project", "sha")).toEqual({ additions: 8, deletions: 3, changedFiles: 302 });
    expect(await client.getCommitDetails("teacher", "project", "sha")).toEqual({ additions: 8, deletions: 3, changedFiles: 302 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retries transient rate limits using Retry-After", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: "You have exceeded a secondary rate limit." }, { "Retry-After": "1" }, 403))
      .mockResolvedValueOnce(jsonResponse([]));
    const client = createGitHubClient({ fetcher, sleep });

    expect(await client.listCommits("teacher", "project", timestamp, timestamp)).toEqual([]);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps the commit record when its details endpoint fails", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      if (url.pathname === "/repos/teacher/project") return jsonResponse({ private: false });
      if (url.pathname.endsWith("/commits")) {
        return jsonResponse([{ sha: "missing-stats", author: { login: "ada" }, commit: { author: { date: timestamp } } }]);
      }
      return jsonResponse({ message: "Not Found" }, undefined, 404);
    });
    const client = createGitHubClient({ fetcher });

    const result = await client.collectCommits("teacher", "project", timestamp, timestamp);

    expect(result.commits).toHaveLength(1);
    expect(result.commits[0].githubUsername).toBe("ada");
    expect(result.commits[0].stats).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("refuses private repositories even when a configured token can read them", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ private: true }));
    const client = createGitHubClient({ token: "token-with-private-access", fetcher });

    await expect(client.collectCommits("teacher", "private-project", timestamp, timestamp))
      .rejects.toThrow("is not public and cannot be scanned");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
